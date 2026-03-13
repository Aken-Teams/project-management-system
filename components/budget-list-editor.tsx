'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, ImageUp, Loader2, ChevronDown, ChevronRight, AlertTriangle, ClipboardPaste } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export interface BudgetItem {
  id?: string
  station: string
  vendor: string
  equipment: string
  quantity: number
  purchaseType: string
  unitPrice: number | null
  estimatedCost: number | null
  actualCost: number | null
}

interface BudgetListEditorProps {
  items: BudgetItem[]
  onChange: (items: BudgetItem[]) => void
  /** Called when AI parsing extracts a total from the image's 合計 row */
  onAITotal?: (total: number) => void
}

function emptyItem(): BudgetItem {
  return {
    station: '',
    vendor: '',
    equipment: '',
    quantity: 1,
    purchaseType: '新購',
    unitPrice: null,
    estimatedCost: null,
    actualCost: null,
  }
}

function formatNT(val: number | null | undefined): string {
  if (val == null || val === 0) return '0'
  return val.toLocaleString('zh-TW')
}

function parseNumber(val: string): number | null {
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

/** Returns true if unitPrice × quantity does NOT equal estimatedCost (when both are set) */
export function hasCostMismatch(item: BudgetItem): boolean {
  if (item.unitPrice == null || item.estimatedCost == null) return false
  const expected = item.unitPrice * item.quantity
  return Math.abs(expected - item.estimatedCost) > 0.5
}

/** Returns error messages for a list of items (for parent submit validation) */
export function validateBudgetItems(items: BudgetItem[]): string[] {
  const errors: string[] = []
  items.forEach((item, i) => {
    if (hasCostMismatch(item)) {
      errors.push(
        `第 ${i + 1} 筆（${item.equipment || '未命名'}）：單價 × 組數 (${formatNT(item.unitPrice)} × ${item.quantity} = ${formatNT((item.unitPrice ?? 0) * item.quantity)}) 不等於預估費用 (${formatNT(item.estimatedCost)})`
      )
    }
  })
  return errors
}

/** Header keywords used to detect and skip header rows */
const HEADER_KEYWORDS = ['站別', '設備', '機型', '單價', '費用', '廠商', '廠牌', '組數', '選購']
/** Summary row keywords to detect totals */
const SUMMARY_KEYWORDS = ['合計', '小計', 'total', 'TOTAL', '瓶頸', '平衡率']

function cleanCell(val: string): string {
  return val.trim().replace(/^["']|["']$/g, '')
}

function isHeaderRow(cols: string[]): boolean {
  const text = cols.join('')
  return HEADER_KEYWORDS.filter(k => text.includes(k)).length >= 2
}

function isSummaryRow(cols: string[]): boolean {
  const text = cols.join('').toLowerCase()
  return SUMMARY_KEYWORDS.some(k => text.toLowerCase().includes(k.toLowerCase()))
}

/** Known field types for header-based column detection */
type FieldType = 'station' | 'vendor' | 'equipment' | 'quantity' | 'skip' | 'purchaseType' | 'unitPrice' | 'estimatedCost'

const HEADER_PATTERNS: [RegExp, FieldType][] = [
  [/站別/, 'station'],
  [/廠商|廠牌/, 'vendor'],
  [/設備|機型|名稱/, 'equipment'],
  [/組數|數量/, 'quantity'],
  [/產能|K\/D|K\/M|瓶頸/, 'skip'],
  [/選購|購買|方式/, 'purchaseType'],
  [/單價/, 'unitPrice'],
  [/預估費用|費用|金額/, 'estimatedCost'],
  [/備註/, 'skip'],
]

function detectColumnMapping(headerCols: string[]): FieldType[] | null {
  const mapping: FieldType[] = []
  let matched = 0
  for (const col of headerCols) {
    const text = col.trim()
    let found: FieldType = 'skip'
    for (const [pattern, field] of HEADER_PATTERNS) {
      if (pattern.test(text)) { found = field; matched++; break }
    }
    mapping.push(found)
  }
  return matched >= 3 ? mapping : null
}

/** Fallback column mapping when no header row is present */
function fallbackMapping(colCount: number): FieldType[] {
  if (colCount >= 10) return ['station', 'vendor', 'equipment', 'quantity', 'skip', 'skip', 'purchaseType', 'unitPrice', 'estimatedCost', 'skip']
  if (colCount === 9) return ['station', 'vendor', 'equipment', 'quantity', 'skip', 'skip', 'purchaseType', 'unitPrice', 'estimatedCost']
  if (colCount === 8) return ['station', 'vendor', 'equipment', 'quantity', 'skip', 'purchaseType', 'unitPrice', 'estimatedCost']
  if (colCount === 7) return ['station', 'vendor', 'equipment', 'quantity', 'purchaseType', 'unitPrice', 'estimatedCost']
  if (colCount === 6) return ['station', 'vendor', 'equipment', 'quantity', 'unitPrice', 'estimatedCost']
  return ['equipment', 'quantity', 'unitPrice', 'estimatedCost', 'skip']
}

function rowToItem(cols: string[], mapping: FieldType[]): BudgetItem {
  let station = '', vendor = '', equipment = '', quantity = 1
  let purchaseType = '', unitPrice: number | null = null, estimatedCost: number | null = null

  for (let i = 0; i < mapping.length && i < cols.length; i++) {
    const val = cols[i] ?? ''
    switch (mapping[i]) {
      case 'station': station = val; break
      case 'vendor': vendor = val; break
      case 'equipment': equipment = val; break
      case 'quantity': quantity = parseFloat(val.replace(/,/g, '')) || 1; break
      case 'purchaseType': purchaseType = val; break
      case 'unitPrice': unitPrice = parseNumber(val); break
      case 'estimatedCost': estimatedCost = parseNumber(val); break
    }
  }

  // Clean vendor
  if (['廠商', '廠牌', '空白', '-', ''].includes(vendor.trim())) vendor = ''
  // Clean purchaseType
  if (['空白', '-'].includes(purchaseType.trim())) purchaseType = ''
  // Auto-calc estimatedCost if missing
  if (estimatedCost == null && unitPrice != null) estimatedCost = unitPrice * quantity

  return { station, vendor, equipment, quantity, purchaseType, unitPrice, estimatedCost, actualCost: null }
}

function parseTsvToBudgetItems(text: string): { items: BudgetItem[]; total: number | null } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { items: [], total: null }

  let total: number | null = null
  let mapping: FieldType[] | null = null
  const dataRows: string[][] = []

  for (const line of lines) {
    const cols = line.split('\t').map(cleanCell)
    // Try to detect header row and build column mapping
    if (!mapping && isHeaderRow(cols)) {
      mapping = detectColumnMapping(cols)
      continue
    }
    if (isSummaryRow(cols)) {
      for (let j = cols.length - 1; j >= 0; j--) {
        const n = parseNumber(cols[j])
        if (n != null && n > 0) { total = n; break }
      }
      continue
    }
    dataRows.push(cols)
  }

  // If no header was found, use fallback based on column count
  if (!mapping && dataRows.length > 0) {
    mapping = fallbackMapping(dataRows[0].length)
  }
  if (!mapping) return { items: [], total }

  const items = dataRows.map(cols => rowToItem(cols, mapping!))

  // Filter out empty rows (no equipment name)
  return { items: items.filter(i => i.equipment.trim()), total }
}

export function BudgetListEditor({ items, onChange, onAITotal }: BudgetListEditorProps) {
  const { toast } = useToast()
  const [parsing, setParsing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const update = (index: number, field: keyof BudgetItem, value: string | number | null) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item
      const next = { ...item, [field]: value }
      // Auto-calc estimatedCost when unitPrice or quantity changes
      if (field === 'unitPrice' || field === 'quantity') {
        const price = field === 'unitPrice' ? (value as number | null) : next.unitPrice
        const qty = field === 'quantity' ? (value as number) : next.quantity
        next.estimatedCost = price != null ? price * qty : next.estimatedCost
      }
      return next
    })
    onChange(updated)
  }

  const addRow = () => {
    onChange([...items, emptyItem()])
    setExpanded(true)
  }

  const removeRow = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')
    // Only intercept multi-cell paste (contains tabs = Excel/spreadsheet data)
    if (!text.includes('\t')) return
    e.preventDefault()

    const { items: newItems, total } = parseTsvToBudgetItems(text)
    if (newItems.length === 0) {
      toast({ title: '無法解析貼上內容', description: '請確認是從 Excel 複製的表格資料', variant: 'destructive' })
      return
    }

    onChange([...items, ...newItems])
    setExpanded(true)

    if (total != null && total > 0 && onAITotal) {
      onAITotal(total)
    }

    const sum = newItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
    toast({
      title: `已貼上 ${newItems.length} 筆設備資料`,
      description: `預估合計 NT$ ${sum.toLocaleString('zh-TW')}${total != null ? `，表格合計 NT$ ${total.toLocaleString('zh-TW')}` : ''}。請確認並修正`,
    })
  }

  const handlePasteButton = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.includes('\t')) {
        toast({ title: '剪貼簿中沒有表格資料', description: '請先從 Excel 複製設備清單', variant: 'destructive' })
        return
      }
      const { items: newItems, total } = parseTsvToBudgetItems(text)
      if (newItems.length === 0) {
        toast({ title: '無法解析貼上內容', variant: 'destructive' })
        return
      }
      onChange([...items, ...newItems])
      setExpanded(true)
      if (total != null && total > 0 && onAITotal) onAITotal(total)
      const sum = newItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
      toast({
        title: `已貼上 ${newItems.length} 筆設備資料`,
        description: `預估合計 NT$ ${sum.toLocaleString('zh-TW')}。請確認並修正`,
      })
    } catch {
      toast({ title: '無法讀取剪貼簿', description: '請改用 Ctrl+V 貼上', variant: 'destructive' })
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ title: '請選擇圖片檔案', variant: 'destructive' })
      return
    }

    setParsing(true)
    setExpanded(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/parse-budget-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'AI 解析失敗')
      }

      const data = await res.json()
      const parsedItems = data.items
      const aiTotal: number | null = typeof data.total === 'number' ? data.total : null
      const validation = data._validation
      if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
        toast({ title: '未能從圖片中解析到設備資料', variant: 'destructive' })
        return
      }

      const newItems: BudgetItem[] = parsedItems.map((p: Partial<BudgetItem>) => {
        const unitPrice = typeof p.unitPrice === 'number' ? p.unitPrice : null
        const qty = typeof p.quantity === 'number' ? p.quantity : 1
        const estimatedCost =
          typeof p.estimatedCost === 'number'
            ? p.estimatedCost
            : unitPrice != null
            ? unitPrice * qty
            : null
        // Clean up vendor: if it's a column header or placeholder, treat as empty
        const rawVendor = typeof p.vendor === 'string' ? p.vendor.trim() : ''
        const vendor = ['廠商', '廠牌', '空白', '-'].includes(rawVendor) ? '' : rawVendor
        // Clean up purchaseType
        const rawPurchaseType = typeof p.purchaseType === 'string' ? p.purchaseType.trim() : ''
        const purchaseType = ['空白', '-'].includes(rawPurchaseType) ? '' : (rawPurchaseType || '新購')
        return {
          station: p.station ?? '',
          vendor,
          equipment: p.equipment ?? '',
          quantity: qty,
          purchaseType,
          unitPrice,
          estimatedCost,
          actualCost: null,
        }
      })

      onChange([...items, ...newItems])

      // Set AI total as the budget (from the 合計 row — highly accurate)
      if (aiTotal != null && aiTotal > 0 && onAITotal) {
        onAITotal(aiTotal)
      }

      // Build toast with validation info
      const itemsSum = newItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
      const parts = [`已新增 ${newItems.length} 筆設備資料`]
      if (aiTotal != null && Math.abs(itemsSum - aiTotal) >= 1) {
        const diff = aiTotal - itemsSum
        parts.push(`⚠️ 清單加總與圖片合計差 ${diff.toLocaleString('zh-TW')}，請確認是否有遺漏`)
      }
      parts.push('請確認並修正')
      toast({
        title: `AI 解析完成`,
        description: parts.join('。'),
        ...(validation && !validation.totalMatch ? { variant: 'destructive' as const } : {}),
      })
    } catch (err) {
      toast({
        title: '解析失敗',
        description: err instanceof Error ? err.message : '請稍後再試',
        variant: 'destructive',
      })
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const estimatedTotal = items.reduce((sum, i) => sum + (i.estimatedCost ?? 0), 0)
  const hasItems = items.length > 0
  const mismatchCount = items.filter(hasCostMismatch).length

  return (
    <div className="rounded-md border" onPaste={handlePaste}>
      {/* ─── Header (always visible) ─── */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2 text-sm">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          }
          {hasItems ? (
            <>
              <span className="font-medium">設備清單（{items.length} 筆）</span>
              <span className="text-muted-foreground text-xs">
                預估合計：<span className="font-semibold text-foreground">NT$ {formatNT(estimatedTotal)}</span>
              </span>
              {mismatchCount > 0 && (
                <span className="flex items-center gap-0.5 text-amber-600 text-xs">
                  <AlertTriangle className="h-3 w-3" />{mismatchCount} 筆費用不符
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground text-xs">點擊展開 / 新增設備清單</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <Button
            type="button" variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => fileInputRef.current?.click()} disabled={parsing}
          >
            {parsing
              ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
              : <ImageUp className="h-3 w-3 mr-1" />
            }
            {parsing ? 'AI 解析中...' : 'AI 解析'}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={handlePasteButton}>
            <ClipboardPaste className="h-3 w-3 mr-1" />貼上
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addRow}>
            <Plus className="h-3 w-3 mr-1" />新增
          </Button>
          {hasItems && (
            confirmClear ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-destructive">確定清空？</span>
                <Button
                  type="button" variant="destructive" size="sm" className="h-7 text-xs px-2"
                  onClick={() => { onChange([]); setConfirmClear(false) }}
                >
                  確定
                </Button>
                <Button
                  type="button" variant="ghost" size="sm" className="h-7 text-xs px-2"
                  onClick={() => setConfirmClear(false)}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" />清空
              </Button>
            )
          )}
        </div>
      </div>

      {/* ─── Expanded table ─── */}
      {expanded && (
        <div className="border-t">
          {hasItems ? (
            <div className="overflow-x-auto">
              <table className="min-w-max w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-14">站別</th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-24">廠商</th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground min-w-[150px]">設備機型/名稱</th>
                    <th className="px-2 py-1.5 text-center font-medium text-muted-foreground w-20">組數</th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20">選購方式</th>
                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-32">預估單價 (NT$)</th>
                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-36">預估費用 (NT$)</th>
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, i) => {
                    const mismatch = hasCostMismatch(item)
                    return (
                      <tr key={i} className={mismatch ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-muted/30'}>
                        <td className="px-1 py-1">
                          <Input value={item.station} onChange={e => update(i, 'station', e.target.value)}
                            className="h-7 text-xs px-1.5 w-12" placeholder="DW" />
                        </td>
                        <td className="px-1 py-1">
                          <Input value={item.vendor} onChange={e => update(i, 'vendor', e.target.value)}
                            className="h-7 text-xs px-1.5 w-22" placeholder="廠商" />
                        </td>
                        <td className="px-1 py-1">
                          <Input value={item.equipment} onChange={e => update(i, 'equipment', e.target.value)}
                            className="h-7 text-xs px-1.5 min-w-[140px]" placeholder="設備名稱" />
                        </td>
                        <td className="px-1 py-1">
                          <Input type="number" min={1} value={item.quantity}
                            onChange={e => update(i, 'quantity', parseInt(e.target.value) || 1)}
                            className="h-7 text-xs px-1.5 w-16 text-center" />
                        </td>
                        <td className="px-1 py-1">
                          <Input value={item.purchaseType} onChange={e => update(i, 'purchaseType', e.target.value)}
                            className="h-7 text-xs px-1.5 w-16" placeholder="新購" />
                        </td>
                        <td className="px-1 py-1">
                          <Input type="number" min={0} value={item.unitPrice ?? ''}
                            onChange={e => update(i, 'unitPrice', parseNumber(e.target.value))}
                            className="h-7 text-xs px-1.5 w-28 text-right" placeholder="0" />
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center gap-1">
                            <Input type="number" min={0} value={item.estimatedCost ?? ''}
                              onChange={e => update(i, 'estimatedCost', parseNumber(e.target.value))}
                              className={`h-7 text-xs px-1.5 w-28 text-right ${mismatch ? 'border-amber-400 focus-visible:ring-amber-400' : ''}`}
                              placeholder="0" />
                            {mismatch && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" title={`應為 ${formatNT((item.unitPrice ?? 0) * item.quantity)}`} />
                            )}
                          </div>
                        </td>
                        <td className="px-1 py-1 text-center">
                          <Button type="button" variant="ghost" size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {/* Mismatch summary */}
              {mismatchCount > 0 && (
                <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-t flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    橘色標示列的「預估費用」與「單價 × 組數」不符，請確認後修正再儲存。
                    點擊預估費用欄直接輸入正確金額，或修正單價使其自動計算。
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground">
              點擊「新增」手動輸入、「AI 解析」上傳截圖、或從 Excel 複製後「貼上」/ Ctrl+V
            </div>
          )}
        </div>
      )}
    </div>
  )
}
