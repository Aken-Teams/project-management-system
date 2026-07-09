import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { todayUtc } from '@/lib/date-utils'
import { isSameUser } from '@/lib/user-match'

// ─── GET /api/sidebar-badges — 側邊欄徽章數字（改為 DB 真實數據，取代 localStorage 假資料 #13）
//   pendingApprovals：使用者身為該專案 S(審核者) 的待審核延期申請數
//   atRiskTasks：指派給使用者、未完成且已逾期的任務數
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const userEmail = request.nextUrl.searchParams.get('userEmail')

    let user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } })
      : null
    if (!user && userEmail) {
      user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true, name: true, email: true } })
    }
    if (!user) return NextResponse.json({ pendingApprovals: 0, atRiskTasks: 0 })

    // 待審核延期：使用者為 S 的專案裡，status='pending' 的延期申請數
    const sMemberships = await prisma.projectTeamMember.findMany({
      where: { userId: user.id, role: 'S' },
      select: { projectId: true },
    })
    const sProjectIds = sMemberships.map(m => m.projectId)
    const pendingApprovals = sProjectIds.length
      ? await prisma.delayRequest.count({ where: { projectId: { in: sProjectIds }, status: 'pending' } })
      : 0

    // 逾期任務：使用者所屬專案中、指派給他、未完成且 endDate < 今天
    const memberships = await prisma.projectTeamMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    })
    const projectIds = memberships.map(m => m.projectId)
    let atRiskTasks = 0
    if (projectIds.length) {
      const overdue = await prisma.task.findMany({
        where: { projectId: { in: projectIds }, completedAt: null, endDate: { lt: todayUtc() } },
        select: { assignee: true },
      })
      atRiskTasks = overdue.filter(t => isSameUser(t.assignee, user)).length
    }

    return NextResponse.json({ pendingApprovals, atRiskTasks })
  } catch (error) {
    console.error('sidebar-badges error:', error)
    return NextResponse.json({ pendingApprovals: 0, atRiskTasks: 0 })
  }
}
