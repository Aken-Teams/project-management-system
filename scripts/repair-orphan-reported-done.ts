/**
 * 收拾「回報完成了，卻一筆報告都沒有」的孤兒任務。
 *
 * 成因：執行者回報完成 → 報告被駁回 → 執行者把報告刪掉。
 * 駁回紀錄掛在 log 上，log 一刪就沒了，但 task.reportedDoneAt 還在，
 * 於是任務重新回到當責的待辦，畫面顯示「執行者未填寫報告即回報完成」，
 * 當責打開卻沒有任何東西可審。
 *
 * DELETE 那條路徑已修（刪除時會一併取消回報完成），這支只處理修好之前留下的舊資料。
 *
 * 用法：
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/repair-orphan-reported-done.ts          # dry-run
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/repair-orphan-reported-done.ts --apply  # 實際寫入
 */
import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')

async function main() {
  const tasks = await prisma.task.findMany({
    where: { reportedDoneAt: { not: null }, reviewedAt: null, completedAt: null },
    select: {
      id: true, title: true, assignee: true, reportedDoneAt: true, reportedDoneBy: true,
      project: { select: { id: true, name: true } },
    },
  })

  const orphans: typeof tasks = []
  for (const t of tasks) {
    // reportOnly=true 是當責在撰寫台寫的補充，不算執行者的報告
    const left = await prisma.taskLog.count({ where: { taskId: t.id, reportOnly: false } })
    if (left === 0) orphans.push(t)
  }

  console.log(`回報完成但未確認的任務：${tasks.length} 筆`)
  console.log(`其中「一筆報告都沒有」的孤兒：${orphans.length} 筆\n`)

  const byProject = new Map<string, typeof tasks>()
  for (const t of orphans) {
    const a = byProject.get(t.project.name) ?? []
    a.push(t); byProject.set(t.project.name, a)
  }
  for (const [name, ts] of byProject) {
    console.log(`【${name}】${ts.length} 筆`)
    for (const t of ts) {
      const days = Math.floor((Date.now() - t.reportedDoneAt!.getTime()) / 86400000)
      console.log(`  ${t.title} | 負責人=${t.assignee || '(未指派)'} | 回報=${t.reportedDoneBy || '?'} ${t.reportedDoneAt!.toISOString().slice(0, 10)} (已掛 ${days} 天)`)
    }
  }

  if (!APPLY) {
    console.log('\n[dry-run] 未寫入。加 --apply 才會清除這些任務的 reportedDoneAt / reportedDoneBy。')
    console.log('          清除後任務回到「執行中」，執行者要重新填報告並再按一次「回報完成」。')
  } else {
    for (const t of orphans) {
      await prisma.task.update({ where: { id: t.id }, data: { reportedDoneAt: null, reportedDoneBy: null } })
      await prisma.taskReviewEvent.create({
        data: { taskId: t.id, projectId: t.project.id, type: 'reported_cleared', actor: t.reportedDoneBy || '', note: '報告已刪除，回報完成一併取消（資料修復）' },
      }).catch(() => {})
    }
    console.log(`\n[applied] 已清除 ${orphans.length} 筆。`)
  }
  await prisma.$disconnect()
}
main()
