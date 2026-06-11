import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

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
    const allowedImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
    const isImage = allowedImageExts.includes(ext)

    const uuid = randomUUID()
    const filename = `${uuid}${ext}`
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')

    await mkdir(uploadsDir, { recursive: true })

    const bytes = await file.arrayBuffer()
    await writeFile(path.join(uploadsDir, filename), Buffer.from(bytes))

    return NextResponse.json({
      url: `/uploads/${filename}`,
      name: file.name,
      type: isImage ? 'image' : 'file',
    }, { status: 201 })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: '上傳失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/upload?url=/uploads/xxx — 刪除實體上傳檔案 ──
export async function DELETE(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url')
    if (!url || !url.startsWith('/uploads/')) {
      return NextResponse.json({ error: '無效的檔案路徑' }, { status: 400 })
    }
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    // basename 去掉任何路徑跳脫；再確認解析後仍在 uploads 目錄內
    const filePath = path.join(uploadsDir, path.basename(url))
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      return NextResponse.json({ error: '無效的檔案路徑' }, { status: 400 })
    }
    try {
      await unlink(filePath)
    } catch {
      // 檔案不存在就當作已刪除，不報錯
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete upload error:', error)
    return NextResponse.json({ error: '刪除檔案失敗' }, { status: 500 })
  }
}
