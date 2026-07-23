import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { safeJsonParse } from '@/lib/utils'

// 里程碑階段總覽的顯示設定（mode 分開/合併 + 隱藏的里程碑）。
//   存在 SystemSetting，key = phase_overview:<projectId>，全域共用（大家看報告時一致）。
//   只有「該專案的當責 A」或 pm / admin 能寫入。

const keyOf = (projectId: string) => `phase_overview:${projectId}`
const DEFAULT_CONFIG = { mode: 'separate' as 'separate' | 'merge', hidden: [] as string[] }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await prisma.systemSetting.findUnique({ where: { key: keyOf(id) } })
  const cfg = row ? safeJsonParse<typeof DEFAULT_CONFIG>(row.value, DEFAULT_CONFIG) : DEFAULT_CONFIG
  return NextResponse.json({
    mode: cfg.mode === 'merge' ? 'merge' : 'separate',
    hidden: Array.isArray(cfg.hidden) ? cfg.hidden.filter((x): x is string => typeof x === 'string') : [],
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const email = request.headers.get('x-user-email')?.toLowerCase()
  if (!email) return NextResponse.json({ error: '未提供身分' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
  if (!user) return NextResponse.json({ error: '找不到使用者' }, { status: 403 })

  // 授權：pm / admin，或該專案的當責 A
  let allowed = user.role === 'pm' || user.role === 'admin'
  if (!allowed) {
    const a = await prisma.projectTeamMember.findFirst({ where: { projectId: id, userId: user.id, role: 'A' }, select: { id: true } })
    allowed = !!a
  }
  if (!allowed) return NextResponse.json({ error: '只有該專案的當責 (A) 或管理者能調整' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const mode = body.mode === 'merge' ? 'merge' : 'separate'
  const hidden = Array.isArray(body.hidden) ? body.hidden.filter((x: unknown): x is string => typeof x === 'string') : []
  const value = JSON.stringify({ mode, hidden })

  await prisma.systemSetting.upsert({
    where: { key: keyOf(id) },
    update: { value },
    create: { key: keyOf(id), value },
  })
  return NextResponse.json({ success: true })
}
