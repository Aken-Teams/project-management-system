'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, ImageUp, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export interface BudgetItem {
  id?: string
  station: string
  vendor: string
  equipment: string
  quantity: number
  purchaseType: string
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

export function BudgetListEditor({ items, onChange }: BudgetListEditorProps) {
  const { toast } = useToast()
  const [parsing, setParsing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const update = (index: number, field: keyof BudgetItem, value: string | number | null) => {
    onChange(items.map((item, i) => i === index ? { ...item, [field]: value } : item))
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

      const { items: parsed } = await res.json()
      if (!Array.isArray(parsed) || parsed.length === 0) {
        toast({ title: '未能從圖片中解析到設備資料', variant: 'destructive' })
        return
      }

      const newItems: BudgetItem[] = parsed.map((p: Partial<BudgetItem>) => ({
        station: p.station ?? '',
        vendor: p.vendor ?? '',
        equipment: p.equipment ?? '',
        quantity: typeof p.quantity === 'number' ? p.quantity : 1,
        purchaseType: p.purchaseType ?? '新購',
        estimatedCost: typeof p.estimatedCost === 'number' ? p.estimatedCost : null,
        actualCost: null,
      }))

      onChange([...items, ...newItems])
      toast({
        title: `AI 解析完成`,
        description: `已新增 ${newItems.length} 筆設備資料，請確認並修正`,
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

  return (
    <div className="rounded-md border">
      {/* ─── Header (always visible) — shows total here, not in table footer ─── */}
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
                    <th className="px-2 py-1.5 text-center font-medium text-muted-foreground w-12">組數</th>
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-20">選購方式</th>
                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-32">預估費用 (NT$)</th>
                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-32">實際費用 (NT$)</th>
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, i) => (
                    <tr key={i} className="hover:bg-muted/30">
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
                          className="h-7 text-xs px-1.5 w-12 text-center" />
                      </td>
                      <td className="px-1 py-1">
                        <Input value={item.purchaseType} onChange={e => update(i, 'purchaseType', e.target.value)}
                          className="h-7 text-xs px-1.5 w-16" placeholder="新購" />
                      </td>
                      <td className="px-1 py-1">
                        <Input type="number" min={0} value={item.estimatedCost ?? ''}
                          onChange={e => update(i, 'estimatedCost', parseNumber(e.target.value))}
                          className="h-7 text-xs px-1.5 w-28 text-right" placeholder="0" />
                      </td>
                      <td className="px-1 py-1">
                        <Input type="number" min={0} value={item.actualCost ?? ''}
                          onChange={e => update(i, 'actualCost', parseNumber(e.target.value))}
                          className="h-7 text-xs px-1.5 w-28 text-right" placeholder="—" />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <Button type="button" variant="ghost" size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* No tfoot — total is shown in the header above to avoid duplication */}
              </table>
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
