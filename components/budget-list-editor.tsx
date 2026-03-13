'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, ImageUp, Loader2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
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

export function BudgetListEditor({ items, onChange }: BudgetListEditorProps) {
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

      // Build toast with validation info
      const parts = [`已新增 ${newItems.length} 筆設備資料`]
      if (validation?.expectedTotal && !validation?.totalMatch) {
        const diff = Math.abs(validation.computedSum - validation.expectedTotal)
        parts.push(`⚠️ 合計差額 ${diff.toLocaleString('zh-TW')}，請逐筆確認`)
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
    <div className="rounded-md border">
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
              點擊「新增」手動輸入設備，或點擊「AI 解析」上傳截圖自動填入
            </div>
          )}
        </div>
      )}
    </div>
  )
}
