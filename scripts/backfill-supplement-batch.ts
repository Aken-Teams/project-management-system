/**
 * 回填補充的批次識別。
 *
 * 批次欄位是後來才加的，既有補充全是 null，會被當成同一批。
 * 以「同一任務 × 同一作者 × 建立時間（到分鐘）」視為同一次送出——
 * 一次送出的多筆是同一個 request 寫進去的，時間必然落在同一分鐘。
 *
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/backfill-supplement-batch.ts          # dry-run
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/backfill-supplement-batch.ts --apply
 */
import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')

async function main() {
  const logs = await prisma.taskLog.findMany({
    // null＝還沒回填；bf- 開頭＝先前這支腳本填的（可安全重算，不會碰到 API 產生的真實批次）
    where: { postDoneSupplement: true, OR: [{ supplementBatch: null }, { supplementBatch: { startsWith: 'bf-' } }] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, taskId: true, authorId: true, createdAt: true, logDate: true, content: true,
      task: { select: { title: true } }, author: { select: { name: true } } },
  })
  if (logs.length === 0) { console.log('沒有需要回填的補充'); await prisma.$disconnect(); return }

  const batches = new Map<string, typeof logs>()
  for (const l of logs) {
    const minute = l.createdAt.toISOString().slice(0, 16)
    const key = `${l.taskId}|${l.authorId}|${minute}`
    const a = batches.get(key); if (a) a.push(l); else batches.set(key, [l])
  }

  console.log(`待回填 ${logs.length} 筆，歸成 ${batches.size} 批：\n`)
  for (const [key, g] of batches) {
    const [, , minute] = key.split('|')
    console.log(`  ${g[0].task.title} / ${g[0].author.name} / 送出於 ${minute.replace('T', ' ')} → ${g.length} 筆`)
    for (const l of g) console.log(`      ${l.logDate.toISOString().slice(0, 10)}  ${l.content.slice(0, 20)}`)
  }

  if (!APPLY) { console.log('\n[dry-run] 未寫入。加 --apply 才會回填。'); await prisma.$disconnect(); return }

  let n = 0
  for (const [key, g] of batches) {
    // 批次 id 必須把「分鐘」編進去。先前用 base64(整個 key) 再截前 20 字元，
    //   而 taskId 開頭在同一任務內完全相同，分鐘根本沒進到截斷後的字串，
    //   於是同一任務的每一批都拿到同一個 id（實際踩過，三筆併成一批）。
    const [taskId, authorId, minute] = key.split('|')
    const batchId = `bf-${taskId.slice(-6)}${authorId.slice(-4)}-${minute.replace(/[-:T]/g, '')}`
    for (const l of g) { await prisma.taskLog.update({ where: { id: l.id }, data: { supplementBatch: batchId } }); n++ }
  }
  console.log(`\n[applied] 已回填 ${n} 筆 / ${batches.size} 批。`)
  await prisma.$disconnect()
}
main()
