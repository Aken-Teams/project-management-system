/**
 * 修復「已審核通過但沒生效」的任務（舊流程殘留）
 * ──────────────────────────────────────────────────────────────
 * 背景：2026-07 流程改版前，A 按下「審核通過」只寫了 TaskReviewEvent(type='confirmed')，
 *       沒有一併寫入 Task.reviewedAt / completedAt。改版後（客戶決策：A 審核通過＝確認
 *       任務 100% 完成）才由 tasks/[taskId] PUT 的 reviewedDone + markComplete 一次寫齊。
 *
 * 症狀：這些任務 reportedDoneAt 有值、reviewedAt 與 completedAt 都是 null →
 *       永遠留在 A 的「待你確認」清單裡（實測有卡 42 天以上的）。
 *
 * 修法：以最後一次 confirmed 事件為準，補寫成現行語意：
 *       reviewedAt/reviewedBy = 該事件時間/操作人
 *       status=done, progress=100, completedAt/completedBy, completedWeekOf(該事件那週的週一)
 *       接著同步受影響里程碑的狀態與進度。
 *
 * 只處理「最後一個審視事件就是 confirmed」的任務——若之後還有 rejected / cancelled，
 * 代表當時是刻意退回的，不該被這支腳本擅自標成完成。
 *
 * 用法：
 *   npx tsx scripts/repair-stale-confirmed-tasks.ts          # 只列出，不寫入（預設）
 *   npx tsx scripts/repair-stale-confirmed-tasks.ts --apply  # 實際寫入
 */
import 'dotenv/config'
import { writeFile } from 'fs/promises'
import { prisma } from '../lib/db'
import { syncMilestoneStatus } from '../lib/sync-milestone-status'

const APPLY = process.argv.includes('--apply')

/** 該日期所屬填報週的週一（YYYY-MM-DD, UTC） */
function mondayOf(d: Date): string {
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff)).toISOString().slice(0, 10)
}

async function main() {
  console.log(APPLY ? '模式：實際寫入 (--apply)\n' : '模式：試跑，不會寫入任何資料（要寫入請加 --apply）\n')

  // 所有審視事件，依任務分組後取最後一筆
  const events = await prisma.taskReviewEvent.findMany({
    orderBy: { createdAt: 'asc' },
    select: { taskId: true, type: true, actor: true, createdAt: true },
  })
  const lastEvent = new Map<string, { type: string; actor: string; createdAt: Date }>()
  for (const e of events) lastEvent.set(e.taskId, { type: e.type, actor: e.actor, createdAt: e.createdAt })

  const candidateIds = [...lastEvent.entries()]
    .filter(([, e]) => e.type === 'confirmed')
    .map(([taskId]) => taskId)

  if (candidateIds.length === 0) {
    console.log('沒有任何以 confirmed 結尾的任務。')
    return
  }

  const tasks = await prisma.task.findMany({
    where: { id: { in: candidateIds }, reviewedAt: null, completedAt: null, reportedDoneAt: { not: null } },
    select: {
      id: true, title: true, projectId: true, milestoneId: true,
      status: true, progress: true, assignee: true,
      project: { select: { name: true } },
    },
  })

  if (tasks.length === 0) {
    console.log('沒有需要修復的任務——所有「審核通過」的任務狀態都是一致的。')
    return
  }

  console.log(`找到 ${tasks.length} 筆「有審核通過事件、但 reviewedAt 與 completedAt 都是 null」的任務：\n`)
  console.table(tasks.map(t => {
    const e = lastEvent.get(t.id)!
    return {
      專案: t.project.name.slice(0, 20),
      任務: t.title.slice(0, 24),
      負責人: t.assignee,
      目前狀態: `${t.status} / ${t.progress}%`,
      審核通過人: e.actor || '(未記錄)',
      審核通過時間: e.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      將補完成週: mondayOf(e.createdAt),
    }
  }))

  if (!APPLY) {
    console.log('\n試跑結束。確認上表無誤後，執行：')
    console.log('  npx tsx scripts/repair-stale-confirmed-tasks.ts --apply')
    return
  }

  // 寫入前先把原狀態存成備份檔，萬一語意判斷有誤可以照著還原
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `scripts/_backup-stale-confirmed-${stamp}.json`
  const backup = tasks.map(t => ({
    id: t.id, title: t.title, projectName: t.project.name,
    before: { status: t.status, progress: t.progress, reviewedAt: null, completedAt: null },
  }))
  await writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf-8')
  console.log(`
原狀態已備份到 ${backupPath}
`)

  const touchedMilestones = new Set<string>()
  let ok = 0
  for (const t of tasks) {
    const e = lastEvent.get(t.id)!
    try {
      await prisma.task.update({
        where: { id: t.id },
        data: {
          reviewedAt: e.createdAt,
          reviewedBy: e.actor || null,
          status: 'done',
          progress: 100,
          completedAt: e.createdAt,
          completedBy: e.actor || null,
          completedWeekOf: mondayOf(e.createdAt),
        },
      })
      touchedMilestones.add(`${t.milestoneId}|${t.projectId}`)
      ok++
      console.log(`  ✔ ${t.project.name} / ${t.title}`)
    } catch (err) {
      console.error(`  ✘ ${t.project.name} / ${t.title} —`, err)
    }
  }

  console.log(`\n已修復 ${ok} / ${tasks.length} 筆。同步受影響的里程碑…`)
  for (const key of touchedMilestones) {
    const [milestoneId, projectId] = key.split('|')
    try {
      await syncMilestoneStatus(milestoneId, projectId)
      console.log(`  ✔ 里程碑 ${milestoneId} 已同步`)
    } catch (err) {
      console.error(`  ✘ 里程碑 ${milestoneId} 同步失敗 —`, err)
    }
  }
  console.log('\n完成。請到「我的任務」重新整理確認。')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
