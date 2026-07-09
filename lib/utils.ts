import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 安全解析 DB 的 JSON 字串欄位（attachments / nextPlans 等）。
 * 壞資料時回 fallback 並 warn，避免單筆壞資料讓整支 API 500。(#14)
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn('safeJsonParse: 略過壞掉的 JSON 欄位')
    return fallback
  }
}
