import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isSameUser } from '@/lib/user-match'

// ─── GET /api/sidebar-badges — 側邊欄徽章數字（改為 DB 真實數據，取代 localStorage 假資料 #13）
//   pendingApprovals：使用者身為該專案 S(審核者) 的待審核延期申請數
//   myTasksTotal：「我的任務」頁各頁籤數字的總和（我的任務週報 + 審查報告 + 角色頁籤 S/A/P/C/I）
//     —— 與頁面頁籤一致並加總，最直覺；先前只算單一數字對不上頁面。
const ROLE_TABS = new Set(['S', 'A', 'P', 'C', 'I'])

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
    if (!user) return NextResponse.json({ pendingApprovals: 0, myTasksTotal: 0 })

    // 待審核延期：使用者為 S 的專案裡，status='pending' 的延期申請數
    const sMemberships = await prisma.projectTeamMember.findMany({
      where: { userId: user.id, role: 'S' },
      select: { projectId: true },
    })
    const sProjectIds = sMemberships.map(m => m.projectId)
    const pendingApprovals = sProjectIds.length
      ? await prisma.delayRequest.count({ where: { projectId: { in: sProjectIds }, status: 'pending' } })
      : 0

    // ── 「我的任務」總數 = 我的任務週報 + 角色頁籤(S/A/P/C/I) + 審查報告 ──
    const memberships = await prisma.projectTeamMember.findMany({
      where: { userId: user.id },
      select: { projectId: true, role: true },
    })
    const projectIds = [...new Set(memberships.map(m => m.projectId))]

    // 1) 我的任務週報：我有被指派任務的專案數
    let myReport = 0
    if (projectIds.length) {
      const assigned = await prisma.task.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, assignee: true },
      })
      const set = new Set<string>()
      for (const t of assigned) if (isSameUser(t.assignee, user)) set.add(t.projectId)
      myReport = set.size
    }

    // 2) 角色頁籤：我在該專案的角色 ∈ {S,A,P,C,I} 的專案數（與頁面 userRolesMap 角色頁籤一致）
    const roleProjects = new Set(memberships.filter(m => ROLE_TABS.has(m.role)).map(m => m.projectId)).size

    // 3) 審查報告：我督導的「待審報告群組數」(project:author:task:week，含待審筆、未完成)
    const supervised = await prisma.projectTeamMember.findMany({
      where: { OR: [{ reportReviewerEmail: user.email }, { reportReviewerName: user.name }] },
      select: { projectId: true, userId: true },
    })
    let reviewPending = 0
    if (supervised.length) {
      const pairs = supervised.map(s => ({ projectId: s.projectId, authorId: s.userId }))
      const pendingLogs = await prisma.taskLog.findMany({
        where: { publishedAt: null, reviewerRejectedAt: null, OR: pairs },
        select: { projectId: true, authorId: true, taskId: true, weekOf: true, task: { select: { completedAt: true } } },
      })
      const groups = new Set<string>()
      for (const l of pendingLogs) {
        if (l.task?.completedAt) continue
        groups.add(`${l.projectId}:${l.authorId}:${l.taskId}:${l.weekOf ?? '_'}`)
      }
      reviewPending = groups.size
    }

    const myTasksTotal = myReport + roleProjects + reviewPending

    return NextResponse.json({ pendingApprovals, myTasksTotal })
  } catch (error) {
    console.error('sidebar-badges error:', error)
    return NextResponse.json({ pendingApprovals: 0, myTasksTotal: 0 })
  }
}
