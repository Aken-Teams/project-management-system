/**
 * 稽核／修復：任務已確認完成，但底下的執行者報告從未被發布。
 *
 * 背景
 *   「確認完成」與「核准報告」原本是兩件分開的事，而任務一旦完成就離開審核佇列
 *   （畫面顯示「流程已走完，無待辦」）。於是那些報告再也沒有任何路徑能被核准，
 *   內容與附件都在，卻永遠停在「未進紀錄」，更新紀錄那一格就是空的。
 *   程式面已於 tasks/[taskId] 路由修掉（確認完成＝一併發布），這支處理既有資料。
 *
 * 只動真的看不見的那批
 *   isReportVisible() 對 2026-07-12 前建檔的舊資料有寬限：沒有 publishedAt 也照常顯示。
 *   那批補發布不會改變任何畫面，只會把匯入資料的建檔痕跡洗掉，所以一律跳過。
 *
 * 三種不補
 *   reportOnly          當責自己在撰寫台寫的，草稿不該被腳本推上線
 *   postDoneSupplement  完成後補充有自己的兩段式審核，由主管→當責收尾
 *   reviewerRejectedAt  已被駁回的，補發布等於讓駁回失效
 *
 * 用法
 *   npx tsx --env-file=.env scripts/audit-stranded-logs.ts          # dry-run（預設）
 *   npx tsx --env-file=.env scripts/audit-stranded-logs.ts --apply  # 實際寫入
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'
import { REPORT_LEGACY_CUTOFF, isReportVisible } from '@/lib/report-cutoff'

const APPLY = process.argv.includes('--apply')
const CUTOFF = new Date(REPORT_LEGACY_CUTOFF)
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : '-')

async function main() {
  const candidates = await prisma.taskLog.findMany({
    where: {
      reportOnly: false,
      postDoneSupplement: false,
      publishedAt: null,
      reviewerRejectedAt: null,
      createdAt: { gte: CUTOFF },          // 7/12 前的靠寬限本來就看得見，不動
      task: { completedAt: { not: null } },
    },
    select: {
      id: true, logDate: true, content: true, createdAt: true, weekOf: true,
      task: { select: { title: true, completedAt: true, completedBy: true, assignee: true } },
      project: { select: { projectCode: true, name: true } },
    },
    orderBy: [{ projectId: 'asc' }, { logDate: 'asc' }],
  })

  // 保險：再用共用判定確認一次「現在確實看不見」，避免 where 與 isReportVisible 哪天走鐘
  const stranded = candidates.filter(l => !isReportVisible(l as { publishedAt?: null; createdAt: Date }))
  const skipped = candidates.length - stranded.length

  console.log(`界線：${REPORT_LEGACY_CUTOFF}（之前建檔的有寬限，不處理）`)
  console.log(`符合條件：${candidates.length} 筆；其中確認看不見的：${stranded.length} 筆${skipped ? `（${skipped} 筆經共用判定仍可見，跳過）` : ''}\n`)

  if (stranded.length === 0) { console.log('沒有需要補的資料。'); return }

  const byProject = new Map<string, typeof stranded>()
  for (const l of stranded) {
    const k = `${l.project.projectCode}  ${l.project.name}`
    const arr = byProject.get(k) ?? []
    arr.push(l)
    byProject.set(k, arr)
  }
  for (const [proj, logs] of byProject) {
    console.log(`■ ${proj}　(${logs.length} 筆)`)
    for (const l of logs) {
      const att = l.content.length
      console.log(`    ${d(l.logDate)}  ${l.task.title.slice(0, 30).padEnd(32)} 完成於 ${d(l.task.completedAt)} by ${l.task.completedBy ?? '-'}`)
      console.log(`              建檔 ${d(l.createdAt)}  週 ${l.weekOf ?? '-'}  內容(${att}字)：${l.content.replace(/\s+/g, ' ').slice(0, 44)}`)
    }
    console.log('')
  }

  if (!APPLY) {
    console.log(`── DRY RUN ──  要實際寫入請加 --apply`)
    console.log(`將把以上 ${stranded.length} 筆的 publishedAt 設為現在、publishedBy 設為「系統補發布（確認完成）」。`)
    console.log('不會動到：任務狀態、完成日、進度、里程碑，以及任何已發布或已駁回的紀錄。')
    return
  }

  // 先存一份還原用的快照再寫。欄位只有兩個，要倒回去就是把它們設回 null。
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(__dirname, `_backup-stranded-logs-${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify({
    takenAt: new Date().toISOString(),
    note: '補發布前的原值。還原：把這些 id 的 publishedAt / publishedBy 設回 null。',
    rows: stranded.map(l => ({
      id: l.id, publishedAt: null, publishedBy: null,
      projectCode: l.project.projectCode, taskTitle: l.task.title,
      logDate: d(l.logDate), content: l.content,
    })),
  }, null, 2), 'utf-8')
  console.log(`備份已寫入：${backupPath}`)

  const now = new Date()
  const res = await prisma.taskLog.updateMany({
    where: { id: { in: stranded.map(l => l.id) } },
    data: { publishedAt: now, publishedBy: '系統補發布（確認完成）' },
  })
  console.log(`已補發布 ${res.count} 筆。`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
