import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMilestoneTemplates } from '@/lib/milestone-templates'

type RouteContext = { params: Promise<{ projectType: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { projectType } = await params
  const feKey = projectType.replace(/_/g, '-')
  const templates = await getMilestoneTemplates(feKey, prisma)

  return NextResponse.json({ templates })
}
