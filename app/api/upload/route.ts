import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, unlink, rmdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

// 允許的副檔名：excel / ppt / word / txt / md / pdf / 圖片 / 壓縮檔
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
const ALLOWED_EXTS = new Set<string>([
  ...IMAGE_EXTS,
  '.xls', '.xlsx', '.csv',            // excel
  '.ppt', '.pptx',                    // ppt
  '.doc', '.docx',                    // word
  '.txt', '.md',                      // 純文字 / markdown
  '.pdf',                             // pdf
  '.zip', '.rar', '.7z',              // 壓縮檔
])
const ALLOWED_HINT = 'Excel/PPT/Word、txt、md、pdf、圖片、壓縮檔(zip/rar/7z)'

// 檔名清理：只去掉檔案系統/路徑危險字元，盡量維持原檔名（保留中文、空白、括號等）
function sanitizeName(name: string, ext: string) {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 180)
  return cleaned || `file${ext}`
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '未提供檔案' }, { status: 400 })
    }

    const maxSize = 20 * 1024 * 1024 // 20 MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: '檔案大小超過 20 MB 限制' }, { status: 400 })
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json({ error: `不支援的檔案格式（${ext || '無副檔名'}）。可上傳：${ALLOWED_HINT}` }, { status: 400 })
    }
    const isImage = IMAGE_EXTS.includes(ext)

    // 每筆上傳獨立資料夾（避免同名衝突），檔案保留「原始檔名」→ 下載時即為原檔名
    const uuid = randomUUID()
    const safeName = sanitizeName(file.name, ext)
    const dir = path.join(process.cwd(), 'public', 'uploads', uuid)
    await mkdir(dir, { recursive: true })

    const bytes = await file.arrayBuffer()
    await writeFile(path.join(dir, safeName), Buffer.from(bytes))

    return NextResponse.json({
      url: `/uploads/${uuid}/${encodeURIComponent(safeName)}`,
      name: file.name,
      type: isImage ? 'image' : 'file',
    }, { status: 201 })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: '上傳失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/upload?url=/uploads/xxx — 刪除實體上傳檔案（含新版子資料夾與舊版扁平結構）──
export async function DELETE(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url')
    if (!url || !url.startsWith('/uploads/')) {
      return NextResponse.json({ error: '無效的檔案路徑' }, { status: 400 })
    }
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    // 還原相對路徑（可能是 uuid/檔名 或 舊版 uuid.ext），並防止路徑跳脫
    const rel = decodeURIComponent(url.slice('/uploads/'.length))
    const filePath = path.join(uploadsDir, rel)
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      return NextResponse.json({ error: '無效的檔案路徑' }, { status: 400 })
    }
    try {
      await unlink(filePath)
    } catch {
      // 檔案不存在就當作已刪除
    }
    // 新版：檔案在專屬子資料夾內，刪檔後把空資料夾也清掉
    const parent = path.dirname(filePath)
    if (parent !== uploadsDir) {
      try { await rmdir(parent) } catch { /* 非空或不存在則略過 */ }
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete upload error:', error)
    return NextResponse.json({ error: '刪除檔案失敗' }, { status: 500 })
  }
}
