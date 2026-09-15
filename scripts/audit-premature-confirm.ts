/**
 * 稽核「主管還沒審完，當責就確認完成」的任務。
 *
 * 舊版 gating 問的是「這個任務有沒有任何一筆報告核准過」，
 * 於是同一任務早先核准過一次之後，後來被駁回的報告就擋不住當責。
 * 結果：任務被確認完成 → 不在「待完成」清單 → 那筆駁回再也改不到。
 *
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/audit-premature-confirm.ts          # dry-run
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/audit-premature-confirm.ts --apply  # 撤銷確認
 */
import { prisma } from '@/lib/db'
import { isReportVisible } from '@/lib/report-cutoff'

const APPLY = process.argv.includes('--apply')
const f = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—')

async function main() {
  const projs = await prisma.project.findMany({ select: { id: true, projectCode: true, name: true } })
  const hits: { proj: string; taskId: string; title: string; path: string; assignee: string | null
    confirmedAt: Date | null; confirmedBy: string | null; msName: string | null
    bad: { weekOf: string | null; logDate: Date; state: string; note: string | null }[] }[] = []

  for (const p of projs) {
    const tasks = await prisma.task.findMany({
      where: { projectId: p.id, OR: [{ reviewedAt: { not: null } }, { completedAt: { not: null } }] },
      select: { id: true, title: true, assignee: true, parentId: true,
        reviewedAt: true, reviewedBy: true, completedAt: true, completedBy: true,
        milestone: { select: { name: true } } },
    })
    if (tasks.length === 0) continue
    const all = await prisma.task.findMany({ where: { projectId: p.id }, select: { id: true, title: true, parentId: true } })
    const byId = new Map(all.map(t => [t.id, t]))
    const logs = await prisma.taskLog.findMany({
      where: { projectId: p.id, taskId: { in: tasks.map(t => t.id) } },
      select: { taskId: true, weekOf: true, logDate: true, createdAt: true, publishedAt: true,
        reviewerRejectedAt: true, reviewerNote: true, reportOnly: true, postDoneSupplement: true, authorId: true },
    })
    const members = await prisma.projectTeamMember.findMany({
      where: { projectId: p.id }, select: { userId: true, reportReviewerName: true, reportReviewerEmail: true } })
    const hasRev = new Set(members.filter(m => m.reportReviewerName || m.reportReviewerEmail).map(m => m.userId))

    for (const t of tasks) {
      const ls = logs.filter(l => l.taskId === t.id && !l.reportOnly && !l.postDoneSupplement)
      if (!ls.some(l => hasRev.has(l.authorId))) continue      // 該作者沒有主管 → 本來就由當責代審
      const bad = ls.filter(l => !isReportVisible(l))
      if (bad.length === 0) continue
      const anc: string[] = []
      let cur = t.parentId ? byId.get(t.parentId) : undefined
      while (cur) { anc.unshift(cur.title); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
      hits.push({
        proj: `${p.projectCode} ${p.name}`, taskId: t.id, title: t.title, assignee: t.assignee,
        path: anc.join(' › '), msName: t.milestone?.name ?? null,
        confirmedAt: t.reviewedAt ?? t.completedAt, confirmedBy: t.reviewedBy ?? t.completedBy,
        bad: bad.map(l => ({ weekOf: l.weekOf, logDate: l.logDate,
          state: l.reviewerRejectedAt ? '已駁回' : '待主管審', note: l.reviewerNote })),
      })
    }
  }

  console.log(`受影響任務：${hits.length} 個\n`)
  const byProj = new Map<string, typeof hits>()
  for (const h of hits) { const a = byProj.get(h.proj) ?? []; a.push(h); byProj.set(h.proj, a) }
  for (const [proj, list] of byProj) {
    console.log(`【${proj}】${list.length} 個`)
    for (const h of list) {
      console.log(`  ${h.msName ? h.msName + ' › ' : ''}${h.path ? h.path + ' › ' : ''}${h.title}   ${h.assignee ?? ''}`)
      console.log(`     確認完成：${f(h.confirmedAt)} by ${h.confirmedBy ?? '—'}`)
      for (const b of h.bad) console.log(`     ⚠ ${b.state}　週別 ${b.weekOf ?? '—'}　紀錄日 ${f(b.logDate)}${b.note ? `　「${b.note.slice(0, 26)}」` : ''}`)
    }
    console.log()
  }

  if (!APPLY) {
    console.log('[dry-run] 未寫入。加 --apply 會清除這些任務的 reviewedAt／completedAt／status，')
    console.log('          任務退回「待你處理」，執行者的回報保留；甘特、完成區、里程碑進度會一併退回。')
  } else {
    for (const h of hits) {
      await prisma.task.update({ where: { id: h.taskId },
        data: { reviewedAt: null, reviewedBy: null, completedAt: null, completedBy: null, status: 'in_progress' } })
      await prisma.taskReviewEvent.create({ data: { taskId: h.taskId, projectId: (await prisma.task.findUnique({ where: { id: h.taskId }, select: { projectId: true } }))!.projectId,
        type: 'confirm_revoked', actor: h.confirmedBy ?? '', note: '主管尚未審核通過，確認完成已撤銷（資料修正）' } }).catch(() => {})
    }
    console.log(`[applied] 已撤銷 ${hits.length} 個任務的完成確認。`)
  }
  await prisma.$disconnect()
}
main()
