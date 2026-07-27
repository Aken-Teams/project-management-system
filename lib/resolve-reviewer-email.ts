import { prisma } from '@/lib/db'

const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API

// 由「報告審核主管」的顯示名稱解析出 email：
//   1) 先查本地 users（完全比對姓名）——最可靠（顯示名第一段常是帳號、但 email 不一定同帳號，例：「YvesWu 吳育富」的 email 是 ccwu@…）。
//   2) 查不到再退回 AD：顯示名格式常為「帳號 中文名」，取第一段當帳號向 AD 取 mail。
// 用於儲存團隊時，若前端只帶了名字（AD 搜尋結果沒有 email）就在 server 端補齊 email。
export async function resolveReviewerEmail(name?: string | null): Promise<string | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null

  const local = await prisma.user.findFirst({
    where: { name: trimmed },
    select: { email: true },
  })
  if (local?.email) return local.email

  if (AD_URL && AD_API) {
    const username = trimmed.split(/\s+/)[0]
    try {
      const res = await fetch(`${AD_URL}/ldap/api/v1/users/${encodeURIComponent(username)}`, {
        headers: { 'X-API-Key': AD_API },
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.success && data.user?.mail) return String(data.user.mail)
      }
    } catch {
      /* AD 不可用時忽略 */
    }
  }
  return null
}

// 給定「名字＋（可能空的）email」，回傳補齊後的 email（名字有值但 email 空 → 解析）。
export async function ensureReviewerEmail(name?: string | null, email?: string | null): Promise<string | null> {
  const n = name?.trim()
  const e = email?.trim()
  if (!n) return null
  if (e) return e
  return resolveReviewerEmail(n)
}
