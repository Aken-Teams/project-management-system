/**
 * 回填完成日（第二階段）：改用「工作紀錄上填的日期」。
 *
 * 背景
 *   第一階段把 completedAt 從「A 按下確認那天」改成「R 按下回報那天」，
 *   但客戶的現場實況是——他們沒辦法當週寫報告，幾乎都是事後補資料。
 *   實測 333 筆執行者工作紀錄裡有 51% 是補填的（平均補 83 天、最多 280 天）。
 *   所以「7 月按下完成、紀錄日寫 3/31」的意思是
 *   「我 3/31 就做完了，只是 7 月才補這筆資料」，按鈕日只是輸入時間。
 *
 * 判準（與 tasks/[taskId] 路由一致）：這次回報有沒有跟著送出新的紀錄
 *   ① 按下回報時一起填的紀錄 → 取其中最晚的 logDate
 *      例：7/24 補填一筆 3/31 的紀錄並按下回報 → 完成日 3/31
 *   ② 什麼都沒寫、只按按鈕 → 按鈕當天就是完成日，不動
 *      例：3/31 那筆是 6/25 填的，7/24 直接按送出 → 完成日 7/24
 *   「一起送出」＝紀錄建檔時間落在按下回報前 24 小時內
 *
 * 排除
 *   reportOnly（當責撰寫台的補充）、postDoneSupplement（完成後補充，本來就不改完成日）
 *
 * 用法
 *   npx tsx --env-file=.env scripts/backfill-completed-at-from-worklog.ts
 *   npx tsx --env-file=.env scripts/backfill-completed-at-from-worklog.ts --apply
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')
const DAY = 86400000
const d0 = (x: Date) => new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()))
const f = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : '-')
const dd = (a: Date, b: Date) => Math.round((d0(a).getTime() - d0(b).getTime()) / DAY)

async function main() {
  const tasks = await prisma.task.findMany({
    where: { completedAt: { not: null } },
    select: {
      id: true, title: true, endDate: true, completedAt: true, reportedDoneAt: true,
      milestone: { select: { name: true } },
      project: { select: { projectCode: true, name: true } },
    },
    orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }],
  })

  const SUBMIT_WINDOW_MS = 24 * 60 * 60 * 1000
  const logs = await prisma.taskLog.findMany({
    where: { taskId: { in: tasks.map(t => t.id) }, reportOnly: false, postDoneSupplement: false },
    select: { taskId: true, logDate: true, createdAt: true },
  })
  const byTask = new Map<string, { logDate: Date; createdAt: Date }[]>()
  for (const l of logs) byTask.set(l.taskId, [...(byTask.get(l.taskId) ?? []), l])

  const move: { t: typeof tasks[number]; to: Date }[] = []
  let noSubmit = 0, already = 0
  for (const t of tasks) {
    const declaredAt = t.reportedDoneAt ?? t.completedAt!
    // 只採計「跟著這次回報一起送出」的紀錄：建檔時間落在按下回報前 24 小時內。
    //   舊紀錄是上次就交過的東西，不能拿來當這次的完成宣告。
    const submitted = (byTask.get(t.id) ?? []).filter(l =>
      l.createdAt <= declaredAt
      && l.createdAt.getTime() >= declaredAt.getTime() - SUBMIT_WINDOW_MS
      && d0(l.logDate) <= d0(declaredAt))
    if (submitted.length === 0) { noSubmit++; continue }
    const to = submitted.reduce((a, b) => (a.logDate > b.logDate ? a : b)).logDate
    if (d0(to).getTime() === d0(t.completedAt!).getTime()) { already++; continue }
    move.push({ t, to })
  }

  console.log(`已完成任務：${tasks.length} 筆`)
  console.log(`  回報時有一起送出紀錄、完成日要改：${move.length} 筆`)
  console.log(`  已經一致、不用動：${already} 筆`)
  console.log(`  回報時沒有一起送出紀錄 → 維持按鈕日：${noSubmit} 筆`)
  console.log('')

  if (move.length) {
    const changed = move.filter(({ t, to }) =>
      Math.max(0, dd(t.completedAt!, t.endDate)) !== Math.max(0, dd(to, t.endDate)))
    console.log(`── 其中遲交天數會變的 ${changed.length} 筆（依變化幅度排序）──`)
    const sorted = [...changed].sort((a, b) => {
      const da = dd(a.t.completedAt!, a.to), db = dd(b.t.completedAt!, b.to)
      return db - da
    })
    for (const { t, to } of sorted.slice(0, 25)) {
      const now = Math.max(0, dd(t.completedAt!, t.endDate))
      const next = Math.max(0, dd(to, t.endDate))
      console.log(`   ${t.project.projectCode} ${(t.milestone?.name ?? '-').slice(0, 10).padEnd(12)} ${t.title.slice(0, 22).padEnd(24)} ${f(t.completedAt)} → ${f(to)}　遲 ${now} → ${next}${next === 0 ? '（變準時）' : ''}`)
    }
    if (sorted.length > 25) console.log(`   …另外 ${sorted.length - 25} 筆`)
    console.log('')
  }

  if (!APPLY) {
    console.log('── DRY RUN ──  要實際寫入請加 --apply')
    console.log(`將把 ${move.length} 筆的 completedAt 改成「回報時一起送出的紀錄」裡最晚的日期。`)
    console.log('不動：reportedDoneAt（何時按下回報）、reviewedAt/reviewedBy（審核紀錄）、completedWeekOf。')
    return
  }
  if (move.length === 0) { console.log('沒有要寫入的資料。'); return }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(__dirname, `_backup-completed-at-worklog-${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify({
    takenAt: new Date().toISOString(),
    note: '改動前的 completedAt 原值。還原：把這些 id 的 completedAt 寫回。',
    rows: move.map(({ t, to }) => ({
      id: t.id, projectCode: t.project.projectCode, title: t.title,
      completedAt: t.completedAt!.toISOString(), newCompletedAt: to.toISOString(),
    })),
  }, null, 2), 'utf-8')
  console.log(`備份已寫入：${backupPath}`)

  for (const { t, to } of move) {
    await prisma.task.update({ where: { id: t.id }, data: { completedAt: to } })
  }
  console.log(`已更新 ${move.length} 筆。里程碑實際完成日取底下任務最晚的完成日，下次讀取自動重算。`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
