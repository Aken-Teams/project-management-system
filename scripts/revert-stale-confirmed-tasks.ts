/**
 * 還原 repair-stale-confirmed-tasks.ts 的寫入
 * ──────────────────────────────────────────────────────────────
 * 讀取修復時產生的備份 JSON，把任務狀態改回原狀（並清掉 reviewedAt / completedAt），
 * 再同步受影響里程碑。任務會重新回到 A 的「待你確認」清單。
 *
 * 用法：
 *   npx tsx scripts/revert-stale-confirmed-tasks.ts <備份檔路徑>            # 試跑
 *   npx tsx scripts/revert-stale-confirmed-tasks.ts <備份檔路徑> --apply    # 實際還原
 */
import 'dotenv/config'
import { readFile } from 'fs/promises'
import { prisma } from '../lib/db'
import { syncMilestoneStatus } from '../lib/sync-milestone-status'

const APPLY = process.argv.includes('--apply')
const backupPath = process.argv[2]

type BackupRow = {
  id: string; title: string; projectName: string
  before: { status: string; progress: number }
}

async function main() {
  if (!backupPath || backupPath.startsWith('--')) {
    console.error('請指定備份檔，例如：')
    console.error('  npx tsx scripts/revert-stale-confirmed-tasks.ts scripts/_backup-stale-confirmed-<時間戳>.json')
    process.exit(1)
  }
  console.log(APPLY ? '模式：實際還原 (--apply)\n' : '模式：試跑，不會寫入（要還原請加 --apply）\n')

  const rows: BackupRow[] = JSON.parse(await readFile(backupPath, 'utf-8'))
  const ids = rows.map(r => r.id)
  const current = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, status: true, progress: true, milestoneId: true, projectId: true },
  })
  const curById = new Map(current.map(t => [t.id, t]))

  console.table(rows.map(r => {
    const c = curById.get(r.id)
    return {
      專案: r.projectName.slice(0, 18),
      任務: r.title.slice(0, 20),
      目前: c ? `${c.status} / ${c.progress}%` : '(查無此任務)',
      還原成: `${r.before.status} / ${r.before.progress}%`,
    }
  }))

  if (!APPLY) {
    console.log('\n試跑結束。要實際還原請加 --apply')
    return
  }

  const touched = new Set<string>()
  let ok = 0
  for (const r of rows) {
    const c = curById.get(r.id)
    if (!c) { console.warn(`  ⚠ 查無任務 ${r.title}，略過`); continue }
    try {
      await prisma.task.update({
        where: { id: r.id },
        data: {
          status: r.before.status as never,
          progress: r.before.progress,
          reviewedAt: null, reviewedBy: null,
          completedAt: null, completedBy: null, completedWeekOf: null,
        },
      })
      touched.add(`${c.milestoneId}|${c.projectId}`)
      ok++
      console.log(`  ✔ ${r.projectName} / ${r.title}`)
    } catch (err) {
      console.error(`  ✘ ${r.projectName} / ${r.title} —`, err)
    }
  }

  console.log(`\n已還原 ${ok} / ${rows.length} 筆。同步里程碑…`)
  for (const key of touched) {
    const [milestoneId, projectId] = key.split('|')
    try { await syncMilestoneStatus(milestoneId, projectId); console.log(`  ✔ 里程碑 ${milestoneId}`) }
    catch (err) { console.error(`  ✘ 里程碑 ${milestoneId} —`, err) }
  }
  console.log('\n還原完成。這些任務會重新出現在 A 的「待你確認」。')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
