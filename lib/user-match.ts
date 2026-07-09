/**
 * 身分容錯比對 —— 解決「task.assignee / log.author 存顯示名稱字串」與 user 身分比對脆弱的問題。
 *
 * 背景：指派值(assignee)實務上存「顯示名稱」(可能是 "帳號 姓名"、也可能只有姓名或 email)，
 * 過去到處用 `assignee === user.name` 嚴格比對，只要格式差一點就靜默失配。
 * 這裡集中成一個容錯比對，涵蓋常見不一致：空白、大小寫、email、AD 帳號前綴、姓名為末段。
 */

export interface UserLike {
  name?: string | null
  email?: string | null
}

/** 正規化：去頭尾空白、多空白收斂成一個、轉小寫 */
export function normalizeName(s: string | null | undefined): string {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * 指派/作者字串 `who` 是否指向使用者 `user`？容錯多種格式：
 *  1. 正規化後與 user.name 相等
 *  2. 與 user.email 相等
 *  3. AD 帳號前綴：who 以「email 帳號 」開頭，或 who 本身就是 email 帳號
 *  4. 姓名為末段：who = "帳號 姓名"，而 user.name = "姓名"
 */
export function isSameUser(who: string | null | undefined, user: UserLike | null | undefined): boolean {
  if (!who || !user) return false
  const a = normalizeName(who)
  if (!a) return false

  const name = normalizeName(user.name)
  const email = (user.email || '').trim().toLowerCase()
  const local = email.includes('@') ? email.split('@')[0] : ''

  if (name && a === name) return true
  if (email && a === email) return true
  if (local) {
    const nlocal = normalizeName(local)
    if (a === nlocal || a.startsWith(nlocal + ' ')) return true
  }
  if (name && (a.endsWith(' ' + name) || name.endsWith(' ' + a))) return true
  return false
}

/** 從候選使用者清單中，找出與指派字串 `who` 相符的第一位（找不到回 null） */
export function findMatchingUser<T extends UserLike>(who: string | null | undefined, users: T[]): T | null {
  if (!who) return null
  return users.find(u => isSameUser(who, u)) || null
}
