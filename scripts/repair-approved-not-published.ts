/**
 * 補寫「主管已核准、但 publishedAt 沒寫入」的報告
 * ──────────────────────────────────────────────────────────────
 * 症狀：TaskLog 上有 type='report_approved' 的審視事件（代表主管確實按過核准），
 *       但該筆 log 的 publishedAt 仍是 null → 沒進更新紀錄，且流程圖會一直顯示待審。
 *
 * 判定必須用 updatedAt（最後一次編輯／重送）而非 createdAt（建列時間）：
 *   報告被駁回後 R 會就地改內容重送，甚至改填報週。若用 createdAt 比對，會把
 *   「舊週的核准」誤算成「新週這筆也被核准過」——實測踩過這個坑（a.切割站：
 *   8/6 核准的是 08-03 那週，8/19 重送的 08-17 那週其實從沒被審過）。
 *
 * 修法：以該報告最後一次送出之後的 report_approved 事件為準，補寫 publishedAt / publishedBy。
 *       不動任何審視事件、不改任務狀態。
 *
 * 不處理：7/12 前建檔的舊資料（那些靠 isReportVisible 的寬限本來就看得到，
 *         沒有人審過，不該假造成「已核准」）。
 *
 * 用法：
 *   npx tsx scripts/repair-approved-not-published.ts          # 試跑
 *   npx tsx scripts/repair-approved-not-published.ts --apply  # 實際寫入
 */
import 'dotenv/config'
import { writeFile } from 'fs/promises'
import { prisma } from '../lib/db'

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(APPLY ? '模式：實際寫入 (--apply)\n' : '模式：試跑，不寫入（要寫入請加 --apply）\n')

  const pending = await prisma.taskLog.findMany({
    where: { publishedAt: null, reviewerRejectedAt: null },
    select: {
      id: true, taskId: true, projectId: true, weekOf: true, createdAt: true, updatedAt: true,
      author: { select: { name: true } },
      task: { select: { title: true } },
      project: { select: { name: true } },
    },
  })
  const taskIds = [...new Set(pending.map(l => l.taskId))]
  const approved = await prisma.taskReviewEvent.findMany({
    where: { taskId: { in: taskIds }, type: 'report_approved' },
    select: { taskId: true, actor: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const byTask = new Map<string, { actor: string; createdAt: Date }[]>()
  for (const e of approved) {
    const arr = byTask.get(e.taskId) ?? []
    arr.push(e); byTask.set(e.taskId, arr)
  }

  const targets = pending
    .map(l => {
      // 5 秒緩衝：核准當下也會 touch updatedAt，避免自己把自己排除掉
      const ev = (byTask.get(l.taskId) ?? []).find(e => e.createdAt.getTime() >= l.updatedAt.getTime() - 5000)
      return ev ? { log: l, ev } : null
    })
    .filter((x): x is { log: typeof pending[number]; ev: { actor: string; createdAt: Date } } => !!x)

  if (targets.length === 0) {
    console.log('沒有需要補寫的報告。')
    return
  }

  console.log(`找到 ${targets.length} 筆「有主管核准事件、但 publishedAt 為 null」的報告：\n`)
  console.table(targets.map(({ log, ev }) => ({
    專案: log.project.name.slice(0, 18),
    任務: log.task.title.slice(0, 20),
    填寫人: log.author.name.slice(0, 14),
    填報週: log.weekOf ?? '(無)',
    報告建檔: log.createdAt.toISOString().slice(0, 10),
    最後送出: log.updatedAt.toISOString().slice(0, 10),
    核准人: ev.actor,
    核准時間: ev.createdAt.toISOString().slice(0, 16).replace('T', ' '),
  })))

  if (!APPLY) {
    console.log('\n試跑結束。要寫入請執行：')
    console.log('  npx tsx scripts/repair-approved-not-published.ts --apply')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `scripts/_backup-approved-not-published-${stamp}.json`
  await writeFile(backupPath, JSON.stringify(
    targets.map(({ log }) => ({ id: log.id, taskTitle: log.task.title, before: { publishedAt: null, publishedBy: null } })),
    null, 2), 'utf-8')
  console.log(`\n原狀態已備份到 ${backupPath}\n`)

  let ok = 0
  for (const { log, ev } of targets) {
    try {
      await prisma.taskLog.update({
        where: { id: log.id },
        data: { publishedAt: ev.createdAt, publishedBy: ev.actor || null },
      })
      ok++
      console.log(`  ✔ ${log.project.name} / ${log.task.title}（${log.author.name}）`)
    } catch (err) {
      console.error(`  ✘ ${log.task.title} —`, err)
    }
  }
  console.log(`\n已補寫 ${ok} / ${targets.length} 筆。這些報告現在會出現在更新紀錄，也不再顯示為待審。`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
