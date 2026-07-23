import { NextRequest } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js production 只 serve「build 當下就存在於 public/ 的檔」，部署後才上傳的檔會 404。
// 這支 catch-all 在 request 時直接從磁碟讀 public/uploads 底下的檔案來 serve，
// 讓「執行時上傳」的附件在 production 也打得開（dev 走靜態、prod 才會走到這裡）。

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.zip': 'application/zip', '.rar': 'application/vnd.rar', '.7z': 'application/x-7z-compressed',
}
// 圖片/PDF/文字在瀏覽器內開啟；其餘（office/壓縮檔）觸發下載
const INLINE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.pdf', '.txt', '.md'])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await params
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')

  // catch-all 參數已由 Next 解碼；防止路徑跳脫（../）
  const rel = (segs || []).join('/')
  let filePath = path.join(uploadsDir, rel)
  if (!filePath.startsWith(uploadsDir + path.sep)) {
    return new Response('Bad request', { status: 400 })
  }

  // 舊資料 URL 可能是二次編碼（DB 存 encodeURIComponent 後的字串）→ 找不到時再解碼一次重試
  let exists = await isFile(filePath)
  if (!exists) {
    try {
      const decoded = path.join(uploadsDir, decodeURIComponent(rel))
      if (decoded.startsWith(uploadsDir + path.sep) && await isFile(decoded)) {
        filePath = decoded
        exists = true
      }
    } catch { /* decode 失敗就維持原路徑 */ }
  }
  if (!exists) return new Response('Not found', { status: 404 })

  const buf = await readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const ctype = CONTENT_TYPES[ext] || 'application/octet-stream'
  const disposition = INLINE_EXTS.has(ext) ? 'inline' : 'attachment'
  const filename = path.basename(filePath)

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': ctype,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}
