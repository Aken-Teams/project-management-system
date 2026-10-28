/**
 * 從 AD 補齊職稱（User.jobTitle / ProjectTeamMember.jobTitle）。
 *
 * 背景
 *   AD 的組織樹 member 本來就有 title 欄位，但 /api/ad-users/search 把 jobTitle 寫死成空字串，
 *   所以用「搜尋選人」加進來的成員一律沒有職稱，團隊成員表那一欄永遠是「—」。
 *   路由已修（會帶 title），這支把既有資料補回來。
 *
 * 比對方式（AD displayName 形如「AbbyFang 方淑瑩」，DB 的 name 多半同格式）
 *   ① 全名正規化後相等
 *   ② AD 帳號前綴（displayName 第一段）對上 DB 的 email 帳號或 name 第一段
 *   ③ 中文姓名（displayName 最後一段）相等
 *   三種都對不到就列為未匹配，不動它。
 *
 * 寫入策略
 *   預設只補「目前是空的」。AD 有值但系統已有不同值 → 只列出不覆蓋
 *   （可能是人工調整過的），要一併覆蓋請加 --overwrite。
 *
 * 用法
 *   npx tsx --env-file=.env scripts/backfill-job-titles.ts
 *   npx tsx --env-file=.env scripts/backfill-job-titles.ts --apply
 *   npx tsx --env-file=.env scripts/backfill-job-titles.ts --apply --overwrite
 *   npx tsx --env-file=.env scripts/backfill-job-titles.ts --apply --fuzzy      # 連寬鬆比對的也套用
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')
const OVERWRITE = process.argv.includes('--overwrite')
// 全名以外的比對（帳號／中文姓名）容易誤配——例如測試帳號 alice@example.com 的
//   帳號前綴「alice」會對到 AD 裡某個 Alice。預設只套用全名命中的，其餘僅列出待人工確認。
const FUZZY = process.argv.includes('--fuzzy')
const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API

type Node = { name?: string; members?: { username: string; displayName: string; title?: string | null }[]; children?: Node[] }
type AD = { username: string; displayName: string; title: string; dept: string }

const norm = (s: string | null | undefined) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase()

async function fetchAD(): Promise<AD[]> {
  if (!AD_URL || !AD_API) throw new Error('缺少 AD_URL / AD_API')
  const res = await fetch(`${AD_URL}/ldap/api/v1/organizations/tree?domain=PANJIT`, { headers: { 'X-API-Key': AD_API } })
  if (!res.ok) throw new Error(`AD API ${res.status}`)
  const data = await res.json() as { tree?: Node }
  const out: AD[] = []
  const walk = (n?: Node, dept = '') => {
    if (!n) return
    const d = n.name || dept
    for (const m of n.members ?? []) out.push({ username: m.username, displayName: m.displayName, title: m.title || '', dept: d })
    for (const c of n.children ?? []) walk(c, d)
  }
  walk(data.tree)
  return out
}

async function main() {
  const ad = await fetchAD()
  const withTitle = ad.filter(a => a.title)
  console.log(`AD 取得 ${ad.length} 人，其中 ${withTitle.length} 人有職稱\n`)

  // 三組索引，依序嘗試
  const byFull = new Map<string, AD>()
  const acctAll = new Map<string, AD[]>()
  const cjkAll = new Map<string, AD[]>()
  for (const a of ad) {
    const full = norm(a.displayName)
    if (full && !byFull.has(full)) byFull.set(full, a)
    const parts = a.displayName.trim().split(/\s+/)
    if (parts.length > 1) {
      const push = (m: Map<string, AD[]>, k: string) => { if (k) m.set(k, [...(m.get(k) ?? []), a]) }
      push(acctAll, norm(parts[0]))
      push(cjkAll, norm(parts[parts.length - 1]))
    }
  }
  // 一個鍵對到多個 AD 人員就是歧義，寧可不配也不要配錯
  const uniq = (m: Map<string, AD[]>) =>
    new Map([...m].filter(([, v]) => v.length === 1).map(([k, v]) => [k, v[0]]))
  const byAccount = uniq(acctAll)
  const byCjk = uniq(cjkAll)

  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, jobTitle: true, organization: true } })

  type Row = { id: string; name: string; from: string; to: string; via: string; adName: string }
  const fill: Row[] = []
  const review: Row[] = []
  const conflict: { name: string; db: string; ad: string }[] = []
  const unmatched: string[] = []
  const noTitle: string[] = []

  for (const u of users) {
    const parts = (u.name || '').trim().split(/\s+/)
    const local = (u.email || '').includes('@') ? u.email.split('@')[0] : ''
    let hit = byFull.get(norm(u.name))
    let via = '全名'
    if (!hit && local) { hit = byAccount.get(norm(local)); via = '帳號' }
    if (!hit && parts.length > 1) { hit = byAccount.get(norm(parts[0])); via = '帳號' }
    if (!hit && parts.length > 1) { hit = byCjk.get(norm(parts[parts.length - 1])); via = '中文姓名' }
    if (!hit) { unmatched.push(`${u.name} <${u.email}>`); continue }
    if (!hit.title) { noTitle.push(`${u.name} → AD「${hit.displayName}」無職稱`); continue }
    const row: Row = { id: u.id, name: u.name, from: u.jobTitle || '（空）', to: hit.title, via, adName: hit.displayName }
    const target = (via === '全名' || FUZZY) ? fill : review
    if (!u.jobTitle) target.push(row)
    else if (u.jobTitle !== hit.title) {
      conflict.push({ name: u.name, db: u.jobTitle, ad: hit.title })
      if (OVERWRITE) target.push(row)
    }
  }

  console.log(`DB 使用者 ${users.length} 人`)
  console.log(`  AD 有值但與系統不同：${conflict.length}${OVERWRITE ? '（--overwrite：一併覆蓋）' : '（不覆蓋）'}`)
  console.log(`  AD 比對得到但本人無職稱：${noTitle.length}`)
  console.log(`  完全比對不到：${unmatched.length}\n`)

  console.log(`  可補職稱(全名命中)：${fill.length}`)
  console.log(`  需人工確認(帳號／中文姓名命中)：${review.length}${FUZZY ? '（--fuzzy：一併套用）' : ''}`)
  if (fill.length) {
    console.log('')
    console.log('── 將補上 ──')
    for (const f of fill) console.log(`   ${f.name.padEnd(22)} ${f.from} → ${f.to}   [AD:${f.adName}]`)
    console.log('')
  }
  if (review.length) {
    console.log('── 需人工確認：比對方式較寬鬆，請核對是不是同一個人 ──')
    for (const f of review) console.log(`   ${f.name.padEnd(22)} ${f.from} → ${f.to}   [比對:${f.via}  AD:${f.adName}]`)
    console.log('')
  }
  if (conflict.length) {
    console.log('── 系統已有值且與 AD 不同（預設不動）──')
    for (const c of conflict) console.log(`   ${c.name.padEnd(22)} 系統「${c.db}」  AD「${c.ad}」`)
    console.log('')
  }
  if (unmatched.length) {
    console.log('── 比對不到（不動）──')
    for (const n of unmatched) console.log(`   ${n}`)
    console.log('')
  }

  if (!APPLY) {
    console.log('── DRY RUN ──  要實際寫入請加 --apply')
    console.log('會更新 User.jobTitle，並把同一個人在各專案的 ProjectTeamMember.jobTitle 一併補上。')
    return
  }
  if (fill.length === 0) { console.log('沒有要寫入的資料。'); return }

  // 還原用快照
  const tms = await prisma.projectTeamMember.findMany({
    where: { userId: { in: fill.map(f => f.id) } },
    select: { id: true, userId: true, jobTitle: true },
  })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(__dirname, `_backup-job-titles-${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify({
    takenAt: new Date().toISOString(),
    note: '補職稱前的原值。還原：把 users / teamMembers 的 jobTitle 寫回。',
    users: fill.map(f => ({ id: f.id, name: f.name, jobTitle: f.from === '（空）' ? '' : f.from })),
    teamMembers: tms,
  }, null, 2), 'utf-8')
  console.log(`備份已寫入：${backupPath}`)

  let uCount = 0, tCount = 0
  for (const f of fill) {
    await prisma.user.update({ where: { id: f.id }, data: { jobTitle: f.to } })
    uCount++
    // 團隊成員那一份是顯示用的複本，沒補的話畫面還是「—」
    const r = await prisma.projectTeamMember.updateMany({
      where: { userId: f.id, ...(OVERWRITE ? {} : { jobTitle: '' }) },
      data: { jobTitle: f.to },
    })
    tCount += r.count
  }
  console.log(`已更新 User ${uCount} 筆、ProjectTeamMember ${tCount} 筆。`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
