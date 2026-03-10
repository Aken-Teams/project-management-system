'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, ImageUp, Loader2 } from 'lucide-react'
import { useState } from 'react'
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
  if (val == null) return ''
  return val.toLocaleString('zh-TW')
}

function parseNumber(val: string): number | null {
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

export function BudgetListEditor({ items, onChange }: BudgetListEditorProps) {
  const { toast } = useToast()
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const update = (index: number, field: keyof BudgetItem, value: string | number | null) => {
    const next = items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    onChange(next)
  }

  const addRow = () => {
    onChange([...items, emptyItem()])
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
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
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
        description: `已新增 ${newItems.length} 筆設備資料，請檢查並修正`,
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
  const actualTotal = items.reduce((sum, i) => sum + (i.actualCost ?? 0), 0)
  const hasActual = items.some(i => i.actualCost != null)

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {items.length > 0 ? `共 ${items.length} 筆設備` : '尚未新增設備'}
        </span>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <ImageUp className="h-3.5 w-3.5 mr-1.5" />
            )}
            {parsing ? 'AI 解析中...' : '圖片解析 (AI)'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            新增設備
          </Button>
        </div>
      </div>

      {/* Table */}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-max w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-16">站別</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-24">廠商</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground min-w-[160px]">設備機型/名稱</th>
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
                    <Input
                      value={item.station}
                      onChange={e => update(i, 'station', e.target.value)}
                      className="h-7 text-xs px-1.5 w-14"
                      placeholder="DW"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={item.vendor}
                      onChange={e => update(i, 'vendor', e.target.value)}
                      className="h-7 text-xs px-1.5 w-22"
                      placeholder="廠商"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={item.equipment}
                      onChange={e => update(i, 'equipment', e.target.value)}
                      className="h-7 text-xs px-1.5 min-w-[150px]"
                      placeholder="設備名稱"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={e => update(i, 'quantity', parseInt(e.target.value) || 1)}
                      className="h-7 text-xs px-1.5 w-12 text-center"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={item.purchaseType}
                      onChange={e => update(i, 'purchaseType', e.target.value)}
                      className="h-7 text-xs px-1.5 w-18"
                      placeholder="新購"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      value={item.estimatedCost ?? ''}
                      onChange={e => update(i, 'estimatedCost', parseNumber(e.target.value))}
                      className="h-7 text-xs px-1.5 w-30 text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      value={item.actualCost ?? ''}
                      onChange={e => update(i, 'actualCost', parseNumber(e.target.value))}
                      className="h-7 text-xs px-1.5 w-30 text-right"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary row */}
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td colSpan={5} className="px-2 py-1.5 text-right text-xs text-muted-foreground">
                  合計
                </td>
                <td className="px-2 py-1.5 text-right text-xs">
                  {estimatedTotal > 0 ? formatNT(estimatedTotal) : '—'}
                </td>
                <td className="px-2 py-1.5 text-right text-xs">
                  {hasActual ? formatNT(actualTotal) : '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground border rounded-md border-dashed">
          尚無設備清單。點擊「新增設備」手動輸入，或上傳截圖讓 AI 自動解析。
        </div>
      )}
    </div>
  )
}
