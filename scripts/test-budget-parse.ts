/**
 * Test script: Evaluate OpenAI Vision model accuracy on budget table images
 *
 * Usage: npx tsx scripts/test-budget-parse.ts
 */
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
if (!OPENAI_API_KEY) {
  console.error('❌ No OpenAI API key found in .env')
  process.exit(1)
}

// ─── Ground truth ────────────────────────────────────────
interface GroundTruthItem {
  station: string
  vendor: string | null
  equipment: string
  quantity: number
  purchaseType: string | null
  unitPrice: number | null
  estimatedCost: number | null
}

interface TestCase {
  file: string
  label: string
  total: number
  items: GroundTruthItem[]
}

const TEST_CASES: TestCase[] = [
  {
    file: 'public/1773379621151.jpg',
    label: 'SOD-123FL HD Pro',
    total: 66010875,
    items: [
      { station: 'DW', vendor: '新益昌', equipment: '焊接一貫機-擺臂式', quantity: 1, purchaseType: '新購', unitPrice: 20880000, estimatedCost: 20880000 },
      { station: 'DW', vendor: '光路', equipment: 'L/F 模具', quantity: 1, purchaseType: '新購', unitPrice: null, estimatedCost: null },
      { station: 'DW', vendor: '光路', equipment: 'CLIP 模具', quantity: 1, purchaseType: '新購', unitPrice: null, estimatedCost: null },
      { station: 'DW', vendor: null, equipment: '焊接彈匣', quantity: 100, purchaseType: '新購', unitPrice: 2210, estimatedCost: 221000 },
      { station: 'MD', vendor: '華天', equipment: 'HTM-6045Q', quantity: 1, purchaseType: '新購', unitPrice: 1700000, estimatedCost: 1700000 },
      { station: 'MD', vendor: '耐科', equipment: '耐科一拖4', quantity: 1, purchaseType: '新購', unitPrice: 17240000, estimatedCost: 17240000 },
      { station: 'MD', vendor: '耐科', equipment: '耐科模具', quantity: 1, purchaseType: '新購', unitPrice: 1097000, estimatedCost: 1097000 },
      { station: 'MD', vendor: null, equipment: '成型彈匣', quantity: 300, purchaseType: '新購', unitPrice: 2210, estimatedCost: 663000 },
      { station: 'DG', vendor: '加進', equipment: '雷射去膠機', quantity: 1, purchaseType: '新購', unitPrice: 8700000, estimatedCost: 8700000 },
      { station: 'MK', vendor: '加進', equipment: '雙頭機台', quantity: 1, purchaseType: '新購', unitPrice: 7000000, estimatedCost: 7000000 },
      { station: 'TF', vendor: '浦員', equipment: '高速切筋成型系統+模具', quantity: 1, purchaseType: '新購', unitPrice: 8509875, estimatedCost: 8509875 },
      { station: 'TMTT', vendor: null, equipment: 'Handler', quantity: 2, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'TMTT', vendor: null, equipment: 'Tester', quantity: 2, purchaseType: '現有', unitPrice: null, estimatedCost: null },
    ],
  },
  {
    file: 'public/1773379745507.jpg',
    label: 'DFN2020B-3L with SWF',
    total: 12438750,
    items: [
      { station: 'DB', vendor: 'ASM', equipment: 'AD832i', quantity: 2, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'DB', vendor: null, equipment: '腳架開模', quantity: 1, purchaseType: '新購', unitPrice: 95400, estimatedCost: 95400 },
      { station: 'DB', vendor: null, equipment: '治具', quantity: 2, purchaseType: '新購', unitPrice: 30000, estimatedCost: 60000 },
      { station: 'DB', vendor: null, equipment: '焊接強匣', quantity: 50, purchaseType: '新購', unitPrice: 1000, estimatedCost: 50000 },
      { station: 'WB', vendor: 'E&R/銳昇', equipment: 'Plasmax800C/Batch', quantity: 0.1, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'WB', vendor: 'K&S', equipment: 'ConnX Elite (1.5mil x 2條)(鈀金鋼)(emitter 端)', quantity: 2, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'WB', vendor: 'K&S', equipment: 'ConnX Elite (1.0mil x 1條)(鈀金鋼)(Base 端)', quantity: 1, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'WB', vendor: null, equipment: '治具', quantity: 3, purchaseType: '新購', unitPrice: 30000, estimatedCost: 90000 },
      { station: 'MD', vendor: 'ASM', equipment: '自動成型機Auto Mold', quantity: 0.2, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'MD', vendor: null, equipment: '成型模具', quantity: 1, purchaseType: '新購', unitPrice: 2000000, estimatedCost: 2000000 },
      { station: 'MD', vendor: null, equipment: '紙腳架模具', quantity: 1, purchaseType: '新購', unitPrice: 40000, estimatedCost: 40000 },
      { station: 'MD', vendor: null, equipment: 'Molding斷背膠治具', quantity: 1, purchaseType: '新購', unitPrice: 100000, estimatedCost: 100000 },
      { station: 'MD', vendor: null, equipment: '成型強匣', quantity: 50, purchaseType: '新購', unitPrice: 2273, estimatedCost: 113650 },
      { station: 'PL', vendor: 'ALLMerit/奧美特', equipment: 'AMT-9.04', quantity: 0.1, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'PKG SAW', vendor: 'DISCO', equipment: 'DAD3350', quantity: 1, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'PKG SAW', vendor: null, equipment: 'LF裁切機', quantity: 1, purchaseType: '新購', unitPrice: 2000000, estimatedCost: 2000000 },
      { station: 'TMTT', vendor: '深科達', equipment: 'SKD', quantity: 1, purchaseType: '新購', unitPrice: 2909700, estimatedCost: 2909700 },
      { station: 'TMTT', vendor: '冠龍', equipment: '測試機', quantity: 1, purchaseType: '新購', unitPrice: 4980000, estimatedCost: 4980000 },
    ],
  },
  {
    file: 'public/1773379754620.jpg',
    label: 'DFN2020B-3L without SWF',
    total: 12438750,
    items: [
      { station: 'DB', vendor: 'ASM', equipment: 'AD832i', quantity: 2, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'DB', vendor: null, equipment: '腳架開模', quantity: 1, purchaseType: '新購', unitPrice: 95400, estimatedCost: 95400 },
      { station: 'DB', vendor: null, equipment: '治具', quantity: 2, purchaseType: '新購', unitPrice: 30000, estimatedCost: 60000 },
      { station: 'DB', vendor: null, equipment: '焊接強匣', quantity: 50, purchaseType: '新購', unitPrice: 1000, estimatedCost: 50000 },
      { station: 'WB', vendor: 'E&R/銳昇', equipment: 'Plasmax800C/Batch', quantity: 0.1, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'WB', vendor: 'K&S', equipment: 'ConnX Elite (1.5mil x 2條)(鈀金鋼)(emitter 端)', quantity: 2, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'WB', vendor: 'K&S', equipment: 'ConnX Elite (1.5mil x 1條)(鈀金鋼)(base)', quantity: 1, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'WB', vendor: null, equipment: '治具', quantity: 3, purchaseType: '新購', unitPrice: 30000, estimatedCost: 90000 },
      { station: 'MD', vendor: 'ASM', equipment: '自動成型機Auto Mold', quantity: 0.2, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'MD', vendor: null, equipment: '成型模具', quantity: 1, purchaseType: '新購', unitPrice: 2000000, estimatedCost: 2000000 },
      { station: 'MD', vendor: null, equipment: '紙腳架模具', quantity: 1, purchaseType: '新購', unitPrice: 40000, estimatedCost: 40000 },
      { station: 'MD', vendor: null, equipment: 'Molding斷背膠治具', quantity: 1, purchaseType: '新購', unitPrice: 100000, estimatedCost: 100000 },
      { station: 'MD', vendor: null, equipment: '成型強匣', quantity: 50, purchaseType: '新購', unitPrice: 2273, estimatedCost: 113650 },
      { station: 'PL', vendor: 'ALLMerit/奧美特', equipment: 'AMT-9.04', quantity: 0.1, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'PKG SAW', vendor: 'DISCO', equipment: 'DAD3350', quantity: 1, purchaseType: '現有', unitPrice: null, estimatedCost: null },
      { station: 'PKG SAW', vendor: null, equipment: 'LF裁切機', quantity: 1, purchaseType: '新購', unitPrice: 2000000, estimatedCost: 2000000 },
      { station: 'TMTT', vendor: '深科達', equipment: 'SKD', quantity: 1, purchaseType: '新購', unitPrice: 2909700, estimatedCost: 2909700 },
      { station: 'TMTT', vendor: '冠龍', equipment: '測試機', quantity: 1, purchaseType: '新購', unitPrice: 4980000, estimatedCost: 4980000 },
    ],
  },
]

// ─── OpenAI call ─────────────────────────────────────────
async function callOpenAI(
  messages: Array<{ role: string; content: string | Array<{ type: string; [k: string]: unknown }> }>,
  maxTokens = 6000,
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      temperature: 0,
      messages,
      max_completion_tokens: maxTokens,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${errText}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ─── Same prompts as route.ts ────────────────────────────
const pass1System = `你是一個精確的表格 OCR 轉錄員。你的任務是將圖片中的設備投資預算表格逐行轉錄。

重要：你必須先仔細看表頭行，從左到右數每一欄的標題，記住欄位順序和總數。
常見欄位順序（約 9-10 欄）：
  1.站別 | 2.廠牌/廠商 | 3.設備機型/名稱 | 4.組數 | 5.產能K/D | 6.產能K/M | 7.選購方式 | 8.預估單價 | 9.預估費用 | 10.備註

⚠️ 表頭中可能寫「產能(K/D)」「產能(K/M)」或類似文字，這些是產能欄位，數值通常是幾百到幾萬的小數字。
⚠️ 「預估單價」和「預估費用」的金額通常有千分位逗號，數值常在數十萬到數千萬之間（如 1,500,000 / 2,909,700）。

關鍵規則：
1. 每一個物理行（每一筆設備）都必須轉錄，不可跳過或合併。
2. 「站別」欄（最左邊）通常有合併儲存格（例如 DB 跨多行），請為每行重複填入站別。
3. ⚠️ 除了「站別」以外，所有欄位如果該儲存格是空白的，就寫「空白」。絕對不可以從上一行或下一行搬移數值。
4. 文字必須逐字照抄圖片原文。
5. 數字照抄（保留原本的逗號格式，例如 2,909,700）。`

const pass1User = `請先看表頭，從左到右列出所有欄位名稱。然後逐行轉錄。

步驟一：先數一下表格有幾個資料行（不含表頭和合計行），輸出「資料行數: N」

步驟二：對每一筆設備（每一個物理行），用以下格式輸出所有欄位：

---
行 N:
欄1(站別): XXX
欄2(廠商): XXX 或 空白
欄3(設備): XXX
欄4(組數): XXX
欄5(產能K/D): XXX 或 空白
欄6(產能K/M): XXX 或 空白
欄7(選購方式): 新購/現有/移撥/空白
欄8(預估單價): XXX 或 空白 或 -
欄9(預估費用): XXX 或 空白 或 -
---

步驟三：輸出合計行的預估費用總金額：
合計: XXX

步驟四：自我檢查 — 列出所有設備名稱（步驟二的欄3），確認總數等於步驟一的數量。

規則：
- 先輸出一行「表頭欄位：」列出你看到的表頭（從左到右），確認欄位對應
- 如果實際表頭的欄位名稱或順序不同，請依實際表頭調整欄位名稱，但保持上述格式結構
- 忽略表頭行本身（只轉錄資料行）
- 忽略小計/合計/TOTAL/瓶頸/平衡率等匯總行（但步驟三要輸出合計金額）
- 站別合併儲存格：為每行重複填入
- 廠商空白就寫「空白」，不要從上一行複製
- 每個儲存格空白就寫「空白」，不要猜測或從其他行搬移
- 只輸出上述格式，不要其他說明`

const pass2System = `你是一個資料格式轉換專家。你的任務是將逐行轉錄的設備資料轉換為 JSON。

規則：
1. 每一個「行 N:」區塊對應 JSON items 中的一個物件
2. 「空白」和「-」和欄位名稱本身（如「廠商」「站別」等）都轉為 null
3. 數字去掉千分位逗號，只填純數字
4. quantity 支持小數（如 0.1、0.2、16.25）
5. 如果 unitPrice 和 estimatedCost 都是 null，保持 null，不要填 0
6. ⚠️ 忽略「產能K/D」和「產能K/M」欄位，這些不需要輸出到 JSON
7. ⚠️ vendor 欄位：如果值是「空白」或就是「廠商」二字，設為 null
8. 如果最後有「合計」數字，把合計金額放在 total 欄位`

// ─── Comparison ──────────────────────────────────────────
function compareItem(actual: GroundTruthItem, expected: GroundTruthItem, idx: number): string[] {
  const errors: string[] = []
  const row = `第${idx + 1}筆`

  if (actual.quantity !== expected.quantity)
    errors.push(`${row} 組數: AI=${actual.quantity} 正確=${expected.quantity}`)

  if (actual.unitPrice !== expected.unitPrice)
    errors.push(`${row} 單價: AI=${actual.unitPrice} 正確=${expected.unitPrice}`)

  if (actual.estimatedCost !== expected.estimatedCost)
    errors.push(`${row} 費用: AI=${actual.estimatedCost} 正確=${expected.estimatedCost}`)

  if (actual.purchaseType !== expected.purchaseType && expected.purchaseType !== null)
    errors.push(`${row} 選購: AI=${actual.purchaseType} 正確=${expected.purchaseType}`)

  return errors
}

// ─── Main ────────────────────────────────────────────────
async function runTest(tc: TestCase) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`📋 Testing: ${tc.label} (${tc.file})`)
  console.log(`   Expected: ${tc.items.length} items, total=${tc.total.toLocaleString()}`)
  console.log(`${'═'.repeat(60)}`)

  // Read image
  const imgPath = path.resolve(__dirname, '..', tc.file)
  const imgBuf = fs.readFileSync(imgPath)
  const base64 = imgBuf.toString('base64')
  const imageUrl = `data:image/jpeg;base64,${base64}`

  // Pass 1
  console.log('\n🔍 Pass 1: Vision → Text transcription...')
  const t1 = Date.now()
  const transcription = await callOpenAI([
    { role: 'system', content: pass1System },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        { type: 'text', text: pass1User },
      ],
    },
  ], 6000)
  console.log(`   ⏱ ${((Date.now() - t1) / 1000).toFixed(1)}s`)

  // Count rows in transcription
  const rowMatches = transcription.match(/行 \d+:/g)
  console.log(`   Pass 1 extracted: ${rowMatches?.length ?? 0} rows`)

  // Extract total from transcription
  const totalMatch = transcription.match(/合計[：:]\s*([\d,]+)/)
  if (totalMatch) {
    console.log(`   Pass 1 total: ${totalMatch[1]}`)
  }

  // Print raw transcription (abbreviated)
  console.log('\n   --- Pass 1 Raw Output (first 2000 chars) ---')
  console.log(transcription.substring(0, 2000))
  if (transcription.length > 2000) console.log('   ... (truncated)')
  console.log('   --- End ---\n')

  // Pass 2
  console.log('🔄 Pass 2: Text → JSON...')
  const t2 = Date.now()
  const pass2User = `以下是從設備投資預算表格逐行轉錄的資料（包含所有欄位）：

${transcription}

請轉換為以下 JSON 格式（不要 markdown 代碼塊，只要純 JSON）。
注意：不要包含產能K/D和產能K/M的資料，只需要以下欄位：

{
  "total": 12345678,
  "items": [
    {
      "station": "站別",
      "vendor": "廠商名稱或null",
      "equipment": "設備名稱",
      "quantity": 1,
      "purchaseType": "新購或現有或null",
      "unitPrice": null,
      "estimatedCost": null
    }
  ]
}

只回傳 JSON，不要任何說明文字。`

  const pass2Content = await callOpenAI([
    { role: 'system', content: pass2System },
    { role: 'user', content: pass2User },
  ])
  console.log(`   ⏱ ${((Date.now() - t2) / 1000).toFixed(1)}s`)

  const jsonMatch = pass2Content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.log('   ❌ Failed to parse JSON from Pass 2')
    return
  }

  const parsed = JSON.parse(jsonMatch[0])
  const items: GroundTruthItem[] = parsed.items ?? []
  const aiTotal: number | null = parsed.total ?? null

  // Programmatic auto-correction (same as route.ts)
  for (const item of items) {
    if (item.unitPrice == null || item.estimatedCost == null) continue
    if (item.unitPrice === 0 && item.estimatedCost === 0) continue
    const computed = item.unitPrice * item.quantity
    if (Math.abs(computed - item.estimatedCost) < 1) continue
    if (item.unitPrice > 0 && item.estimatedCost > 0) {
      const impliedQty = item.estimatedCost / item.unitPrice
      if (Number.isInteger(impliedQty) || Math.abs(impliedQty - Math.round(impliedQty * 10) / 10) < 0.01) {
        item.quantity = Math.round(impliedQty * 10) / 10
      } else {
        item.estimatedCost = item.unitPrice * item.quantity
      }
    }
  }

  // Clean vendor
  for (const item of items) {
    if (typeof item.vendor === 'string') {
      const v = (item.vendor as string).trim()
      if (['廠商', '廠牌', '空白', '-', ''].includes(v)) {
        item.vendor = null
      }
    }
  }

  // ── Results ──
  const computedSum = items.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
  console.log(`\n📊 Results:`)
  console.log(`   Items: AI=${items.length} Expected=${tc.items.length} ${items.length === tc.items.length ? '✅' : '❌'}`)
  console.log(`   AI Total: ${aiTotal?.toLocaleString() ?? 'N/A'}`)
  console.log(`   Computed Sum: ${computedSum.toLocaleString()}`)
  console.log(`   Expected Total: ${tc.total.toLocaleString()}`)
  console.log(`   Total Match: ${Math.abs(computedSum - tc.total) < 1 ? '✅' : `❌ (差額 ${Math.abs(computedSum - tc.total).toLocaleString()})`}`)

  // Per-item comparison
  console.log(`\n📝 Per-item comparison:`)
  const maxLen = Math.max(items.length, tc.items.length)
  let totalErrors = 0
  let totalChecked = 0

  for (let i = 0; i < maxLen; i++) {
    const ai = items[i]
    const gt = tc.items[i]

    if (!gt) {
      console.log(`   ❌ 第${i + 1}筆: AI 多出 [${ai.station}] ${ai.equipment}`)
      totalErrors++
      continue
    }
    if (!ai) {
      console.log(`   ❌ 第${i + 1}筆: AI 漏掉 [${gt.station}] ${gt.equipment}`)
      totalErrors++
      continue
    }

    totalChecked++
    const errors = compareItem(ai, gt, i)
    if (errors.length > 0) {
      totalErrors += errors.length
      console.log(`   ⚠️  [${ai.station}] ${ai.equipment}`)
      errors.forEach(e => console.log(`      ${e}`))
    } else {
      console.log(`   ✅ [${ai.station}] ${ai.equipment}`)
    }
  }

  // Summary
  const totalFields = totalChecked * 4 // qty, unitPrice, estimatedCost, purchaseType
  const accuracy = totalFields > 0 ? ((totalFields - totalErrors) / totalFields * 100).toFixed(1) : 'N/A'
  console.log(`\n📈 Summary: ${totalErrors} errors in ${totalFields} fields (${accuracy}% accuracy)`)

  return { label: tc.label, itemCount: items.length, expectedItemCount: tc.items.length, computedSum, expectedTotal: tc.total, errors: totalErrors, accuracy }
}

async function main() {
  console.log('🚀 Budget Image Parse Accuracy Test')
  console.log(`   Model: gpt-4o-2024-11-20`)
  console.log(`   Images: ${TEST_CASES.length}`)

  const results = []
  for (const tc of TEST_CASES) {
    try {
      const r = await runTest(tc)
      if (r) results.push(r)
    } catch (e) {
      console.error(`❌ Test failed for ${tc.label}:`, e)
    }
  }

  // Final summary
  console.log(`\n${'═'.repeat(60)}`)
  console.log('📊 FINAL SUMMARY')
  console.log(`${'═'.repeat(60)}`)
  for (const r of results) {
    const itemOk = r.itemCount === r.expectedItemCount ? '✅' : '❌'
    const totalOk = Math.abs(r.computedSum - r.expectedTotal) < 1 ? '✅' : '❌'
    console.log(`  ${r.label}: Items ${itemOk} (${r.itemCount}/${r.expectedItemCount}) | Total ${totalOk} (${r.computedSum.toLocaleString()} / ${r.expectedTotal.toLocaleString()}) | Accuracy ${r.accuracy}%`)
  }
}

main().catch(console.error)
