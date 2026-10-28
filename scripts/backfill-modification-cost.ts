/**
 * 回填改機費用：把「預估費用 − 單價 × 組數」的正差額搬進 modificationCost。
 *
 * 背景
 *   共用機台分攤到本專案時，總價不是單純的「單價 × 組數」，IE 會另外把改機成本
 *   攤進來（Excel 的寫法例如 =G*(F+0.05/3)，意思是改機約機台價 5%、3 個專案分攤）。
 *   系統先前沒有這個欄位，那些列只能以「對不起來」的狀態留著，圖片解析還曾經
 *   把它們「自動修正」掉，害合計少了 789,800。欄位補上了，這支把差額歸位。
 *
 * 只動正差額
 *   費用 > 單價 × 組數  → 差額視為改機費，回填
 *   費用 < 單價 × 組數  → 不是改機費能解釋的，可能是打錯，列出來給人看，不動
 *
 * 用法
 *   npx tsx --env-file=.env scripts/backfill-modification-cost.ts
 *   npx tsx --env-file=.env scripts/backfill-modification-cost.ts --apply
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/db'

const APPLY = process.argv.includes('--apply')
const nt = (n: number | null | undefined) => (n ?? 0).toLocaleString('zh-TW')

async function main() {
  const items = await prisma.projectBudgetItem.findMany({
    where: { unitPrice: { not: null }, estimatedCost: { not: null } },
    select: {
      id: true, station: true, equipment: true, quantity: true,
      unitPrice: true, estimatedCost: true, modificationCost: true, purchaseType: true,
      project: { select: { projectCode: true, name: true } },
    },
    orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }],
  })

  const fill: typeof items = []
  const negative: typeof items = []
  for (const i of items) {
    if (i.modificationCost != null && i.modificationCost !== 0) continue  // 已經有值就不動
    const diff = (i.estimatedCost ?? 0) - (i.unitPrice ?? 0) * i.quantity
    if (diff > 0.5) fill.push(i)
    else if (diff < -0.5) negative.push(i)
  }

  console.log(`設備清單共 ${items.length} 筆（單價與費用都有值的）`)
  console.log(`  費用高於單價×組數 → 回填改機費用：${fill.length} 筆`)
  console.log(`  費用低於單價×組數 → 改機費解釋不了，不動：${negative.length} 筆\n`)

  if (fill.length) {
    console.log('── 將回填 ──')
    for (const i of fill) {
      const base = (i.unitPrice ?? 0) * i.quantity
      const diff = (i.estimatedCost ?? 0) - base
      console.log(`   ${i.project.projectCode}  ${i.station}/${i.equipment.slice(0, 22)} [${i.purchaseType}]`)
      console.log(`      ${nt(i.unitPrice)} × ${i.quantity} = ${nt(base)}　改機 ${nt(diff)}　合計 ${nt(i.estimatedCost)}`)
    }
    console.log('')
  }
  if (negative.length) {
    console.log('── 費用比單價×組數還少，請人工確認（不動）──')
    for (const i of negative) {
      const base = (i.unitPrice ?? 0) * i.quantity
      console.log(`   ${i.project.projectCode}  ${i.station}/${i.equipment.slice(0, 22)}：${nt(i.unitPrice)} × ${i.quantity} = ${nt(base)}，但費用只有 ${nt(i.estimatedCost)}`)
    }
    console.log('')
  }

  if (!APPLY) {
    console.log('── DRY RUN ──  要實際寫入請加 --apply')
    console.log('只會寫 modificationCost / modificationNote，不動單價、組數、預估費用，合計不變。')
    return
  }
  if (fill.length === 0) { console.log('沒有要寫入的資料。'); return }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(__dirname, `_backup-modification-cost-${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify({
    takenAt: new Date().toISOString(),
    note: '回填前的原值（都是 null）。還原：把這些 id 的 modificationCost 設回 null、modificationNote 設回空字串。',
    rows: fill.map(i => ({ id: i.id, projectCode: i.project.projectCode, equipment: i.equipment, modificationCost: null, modificationNote: '' })),
  }, null, 2), 'utf-8')
  console.log(`備份已寫入：${backupPath}`)

  let n = 0
  for (const i of fill) {
    const diff = (i.estimatedCost ?? 0) - (i.unitPrice ?? 0) * i.quantity
    await prisma.projectBudgetItem.update({
      where: { id: i.id },
      data: {
        modificationCost: Math.round(diff * 100) / 100,
        modificationNote: '由既有金額推算（預估費用 − 單價 × 組數）',
      },
    })
    n++
  }
  console.log(`已回填 ${n} 筆。預估費用未更動，各專案合計不變。`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
