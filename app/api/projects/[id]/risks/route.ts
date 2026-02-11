import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { RiskImpact, RiskProbability } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/risks — Add risk to project ────

interface AddRiskBody {
  title: string
  description?: string
  impact?: string
  probability?: string
  mitigation?: string
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: AddRiskBody = await request.json()

    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    if (!body.title?.trim()) {
      return NextResponse.json({ error: '風險標題為必填' }, { status: 400 })
    }

    const risk = await prisma.risk.create({
      data: {
        projectId: id,
        title: body.title.trim(),
        description: body.description?.trim() || '',
        impact: (body.impact || 'medium') as RiskImpact,
        probability: (body.probability || 'medium') as RiskProbability,
        mitigation: body.mitigation?.trim() || '',
        status: 'open',
      },
    })

    return NextResponse.json({
      id: risk.id,
      projectId: id,
      title: risk.title,
      description: risk.description,
      impact: risk.impact,
      probability: risk.probability,
      mitigation: risk.mitigation,
      status: risk.status,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to add risk:', error)
    return NextResponse.json({ error: '新增風險失敗' }, { status: 500 })
  }
}
