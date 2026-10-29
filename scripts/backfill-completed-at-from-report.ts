/**
 * 回填完成日：把 completedAt 從「A 按下確認那天」改成「R 回報完成那天」。
 *
 * 背景
 *   原本 markComplete 寫的是 new Date()，等於把審核排隊的時間算進專案績效。
 *   實測平均卡 5 天、最長 41 天；114 筆遲交裡有 74 筆的天數是這樣灌出來的，
 *   最誇張一筆多算 40 天——專案看起來 delay，實際上是 on time。
 *   程式面已改（tasks/[taskId] 路由），這支處理既有資料。
 *
 * 取哪一次回報
 *   reportedDoneAt 每次重新回報都會覆寫、被駁回會清空，所以欄位值天生就是
 *   「最後一次回報」——被駁回那次不算數，符合客戶決策（2026-10-29）。
 *
 * 不動的情況
 *   沒有 reportedDoneAt（A 直接標完成，沒經過 R 回報）→ 無從得知事實日期，保持原樣
 *   reportedDoneAt 晚於 completedAt（資料異常）→ 往後改會憑空加重遲交，列出來不動
 *
 * 連帶影響（都是預期中的）
 *   遲交天數縮短、甘特圖階段長條往前移、里程碑實際完成日變早。
 *   里程碑完成日取底下任務最晚的 completedAt，會自動跟著重算，不需另外處理。
 *
 * 用法
 *   npx tsx --env-file=.env scripts/backfill-completed-at-from-report.ts
 *   npx tsx --env-file=.env scripts/backfill-completed-at-from-report.ts --apply
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')
const DAY = 86400000
const d0 = (x: Date) => new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()))
const f = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : '-')
const days = (a: Date, b: Date) => Math.round((d0(a).getTime() - d0(b).getTime()) / DAY)

async function main() {
  const tasks = await prisma.task.findMany({
    where: { completedAt: { not: null }, reportedDoneAt: { not: null } },
    select: {
      id: true, title: true, endDate: true, completedAt: true, reportedDoneAt: true,
      project: { select: { projectCode: true } },
    },
    orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }],
  })

  const move: typeof tasks = []
  const backwards: typeof tasks = []
  const same: typeof tasks = []
  for (const t of tasks) {
    const d = days(t.completedAt!, t.reportedDoneAt!)
    if (d > 0) move.push(t)
    else if (d < 0) backwards.push(t)
    else same.push(t)
  }

  console.log(`已完成且有回報紀錄：${tasks.length} 筆`)
  console.log(`  完成日往前移（A 確認晚於 R 回報）：${move.length} 筆`)
  console.log(`  已經一致、不用動：${same.length} 筆`)
  console.log(`  回報日反而晚於完成日（異常，不動）：${backwards.length} 筆\n`)

  if (move.length) {
    // 只列出遲交天數會變的，其他的只是日期往前，不影響判定
    const lateChanged = move.filter(t => {
      const now = days(t.completedAt!, t.endDate)
      const next = days(t.reportedDoneAt!, t.endDate)
      return now > 0 && now !== Math.max(0, next)
    })
    console.log(`── 其中遲交天數會改變的 ${lateChanged.length} 筆 ──`)
    for (const t of lateChanged.slice(0, 20)) {
      const now = days(t.completedAt!, t.endDate)
      const next = Math.max(0, days(t.reportedDoneAt!, t.endDate))
      console.log(`   ${t.project.projectCode} ${t.title.slice(0, 24).padEnd(26)} ${f(t.completedAt)} → ${f(t.reportedDoneAt)}　遲 ${now} → ${next} 天${next === 0 ? '（變成準時）' : ''}`)
    }
    if (lateChanged.length > 20) console.log(`   …另外 ${lateChanged.length - 20} 筆`)
    console.log('')
  }
  if (backwards.length) {
    console.log('── 回報日晚於完成日，不動 ──')
    for (const t of backwards.slice(0, 10)) {
      console.log(`   ${t.project.projectCode} ${t.title.slice(0, 24)}：完成 ${f(t.completedAt)}、回報 ${f(t.reportedDoneAt)}`)
    }
    console.log('')
  }

  if (!APPLY) {
    console.log('── DRY RUN ──  要實際寫入請加 --apply')
    console.log(`將把 ${move.length} 筆的 completedAt 改成各自的 reportedDoneAt。`)
    console.log('不動：completedBy（誰確認的）、reviewedAt/reviewedBy（審核紀錄）、completedWeekOf（更新紀錄分組週）。')
    return
  }
  if (move.length === 0) { console.log('沒有要寫入的資料。'); return }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(__dirname, `_backup-completed-at-${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify({
    takenAt: new Date().toISOString(),
    note: '改動前的 completedAt 原值。還原：把這些 id 的 completedAt 寫回 completedAt 欄位。',
    rows: move.map(t => ({
      id: t.id, projectCode: t.project.projectCode, title: t.title,
      completedAt: t.completedAt!.toISOString(),
      newCompletedAt: t.reportedDoneAt!.toISOString(),
    })),
  }, null, 2), 'utf-8')
  console.log(`備份已寫入：${backupPath}`)

  let n = 0
  for (const t of move) {
    await prisma.task.update({ where: { id: t.id }, data: { completedAt: t.reportedDoneAt } })
    n++
  }
  console.log(`已更新 ${n} 筆。里程碑的實際完成日取底下任務最晚的完成日，下次讀取時會自動跟著重算。`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
