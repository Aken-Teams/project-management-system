import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
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
