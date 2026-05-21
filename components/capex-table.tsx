'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, Save, X, ChevronDown, ChevronRight, Package, DollarSign, CalendarDays, CreditCard, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import type { RoiParams } from '@/components/roi-section'

// ─── Types ───

export interface CapexItemData {
  id?: string
  budgetItemId?: string | null
  equipmentCategory: string
  station: string
  supplier: string
  issueDate: string | null
  poNumber: string
  partNumber: string
  masterSummary: string
  partDescription: string
  unit: string
  currency: string
  quantity: number
  originalPrice: number | null
  twdPrice: number | null
  orderAmount: number | null
  deliveryDate: string | null
  bpmAcceptanceDate: string | null
  depositPct: number | null
  deliveryPct: number | null
  acceptancePct: number | null
  depositAmount: number | null
  depositPayDate: string | null
  deliveryAmount: number | null
  deliveryPayDate: string | null
  acceptanceAmount: number | null
  acceptancePayDate: string | null
  paymentStatus: string
}

interface BudgetItemRef {
  id?: string
  station: string
  vendor: string
  equipment: string
  quantity: number
  unitPrice: number | null
  estimatedCost: number | null
  actualCost: number | null
}

interface CapexTableProps {
  projectId: string
  items: CapexItemData[]
  budgetItems: BudgetItemRef[]
  roiParams: RoiParams | null
  budget: number
  readOnly: boolean
  canEditRoi?: boolean
  onSaved: (items: CapexItemData[]) => void
  onRoiParamsSaved?: (params: RoiParams) => void
}

const EQUIPMENT_CATEGORIES = ['固定資產_設備', '固定資產_模具', '固定資產_工程', '雜項_消耗品']
const CURRENCIES = ['TWD', 'JPY', 'USD', 'RMB']
const PAYMENT_STATUSES = ['未付款', '部分付款', '已付清']

function emptyItem(budgetItemId?: string | null): CapexItemData {
  return {
    budgetItemId: budgetItemId ?? null,
    equipmentCategory: '', station: '', supplier: '',
    issueDate: null, poNumber: '', partNumber: '',
    masterSummary: '', partDescription: '', unit: '', currency: 'TWD',
    quantity: 1, originalPrice: null, twdPrice: null, orderAmount: null,
    deliveryDate: null, bpmAcceptanceDate: null,
    depositPct: null, deliveryPct: null, acceptancePct: null,
    depositAmount: null, depositPayDate: null,
    deliveryAmount: null, deliveryPayDate: null,
    acceptanceAmount: null, acceptancePayDate: null,
    paymentStatus: '',
  }
}

const fmtNT = (n: number | null) => n != null ? `NT$ ${Math.round(n).toLocaleString('zh-TW')}` : '-'
const fmtPct = (v: number | null) => v != null ? `${Math.round(v * 100)}%` : '-'

// ─── Main Component ───

export function CapexTable({ projectId, items: initialItems, budgetItems, roiParams, budget, readOnly, canEditRoi, onSaved, onRoiParamsSaved }: CapexTableProps) {
  const [items, setItems] = useState<CapexItemData[]>(initialItems)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedBudgetItems, setExpandedBudgetItems] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  // ROI params editing
  const [editingRoi, setEditingRoi] = useState(false)
  const [roiDraft, setRoiDraft] = useState<RoiParams>({
    grossMargin: roiParams?.grossMargin ?? null,
    avgPrice: roiParams?.avgPrice ?? null,
    capacity: roiParams?.capacity ?? null,
  })
  const [savingRoi, setSavingRoi] = useState(false)

  const handleSaveRoi = useCallback(async () => {
    setSavingRoi(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roiGrossMargin: roiDraft.grossMargin,
          roiAvgPrice: roiDraft.avgPrice,
          roiCapacity: roiDraft.capacity,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      onRoiParamsSaved?.(roiDraft)
      setEditingRoi(false)
      toast({ title: '儲存成功', description: 'ROI 參數已更新' })
    } catch {
      toast({ title: '儲存失敗', description: '請稍後再試', variant: 'destructive' })
    } finally {
      setSavingRoi(false)
    }
  }, [projectId, roiDraft, onRoiParamsSaved, toast])

  const toggleExpand = useCallback((key: string) => {
    setExpandedBudgetItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleChange = useCallback((index: number, field: keyof CapexItemData, value: unknown) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      const updated = { ...item, [field]: value }
      if (field === 'twdPrice' || field === 'quantity') {
        const price = field === 'twdPrice' ? (value as number) : item.twdPrice
        const qty = field === 'quantity' ? (value as number) : item.quantity
        if (price != null && qty > 0) updated.orderAmount = price * qty
      }
      if (field === 'depositPct' || field === 'deliveryPct' || field === 'acceptancePct' || field === 'orderAmount') {
        const amt = field === 'orderAmount' ? (value as number) : updated.orderAmount
        if (amt != null) {
          if (updated.depositPct != null) updated.depositAmount = amt * updated.depositPct
          if (updated.deliveryPct != null) updated.deliveryAmount = amt * updated.deliveryPct
          if (updated.acceptancePct != null) updated.acceptanceAmount = amt * updated.acceptancePct
        }
      }
      return updated
    }))
  }, [])

  const handleAdd = useCallback((budgetItemId?: string | null) => {
    setItems(prev => [...prev, emptyItem(budgetItemId)])
    if (budgetItemId) {
      setExpandedBudgetItems(prev => new Set([...prev, budgetItemId]))
    } else {
      setExpandedBudgetItems(prev => new Set([...prev, '_unlinked']))
    }
  }, [])

  const handleRemove = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/capex`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) throw new Error('save failed')
      const saved = await res.json()
      setItems(saved)
      onSaved(saved)
      setEditing(false)
      toast({ title: '儲存成功', description: 'CAPEX 資料已更新' })
    } catch {
      toast({ title: '儲存失敗', description: '請稍後再試', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [projectId, items, onSaved, toast])

  const handleCancel = useCallback(() => {
    setItems(initialItems)
    setEditing(false)
  }, [initialItems])

  // Group capex items by budgetItemId
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { indices: number[] }>()
    items.forEach((item, idx) => {
      const key = item.budgetItemId || '_unlinked'
      const existing = groups.get(key) || { indices: [] }
      existing.indices.push(idx)
      groups.set(key, existing)
    })
    return groups
  }, [items])

  const capexTotalByBudget = useMemo(() => {
    const totals = new Map<string, number>()
    items.forEach(item => {
      const key = item.budgetItemId || '_unlinked'
      totals.set(key, (totals.get(key) || 0) + (item.orderAmount ?? 0))
    })
    return totals
  }, [items])

  const grandTotal = useMemo(() => items.reduce((s, i) => s + (i.orderAmount ?? 0), 0), [items])
  const estimatedTotal = useMemo(() => budgetItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0), [budgetItems])

  // ROI calculation
  const { monthlyProfit, paybackMonths } = useMemo(() => {
    const { grossMargin, avgPrice, capacity } = roiParams ?? {}
    const mp = avgPrice != null && capacity != null && grossMargin != null
      ? avgPrice * capacity * (grossMargin / 100) : null
    const pb = mp != null && mp > 0 && budget > 0 ? budget / mp : null
    return { monthlyProfit: mp, paybackMonths: pb }
  }, [roiParams, budget])

  const isEditing = editing && !readOnly

  return (
    <div className="space-y-4">
      {/* ── ROI Summary ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              投資預估 (PM 填寫)
              {canEditRoi && !editingRoi && (
                <button
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setRoiDraft({
                      grossMargin: roiParams?.grossMargin ?? null,
                      avgPrice: roiParams?.avgPrice ?? null,
                      capacity: roiParams?.capacity ?? null,
                    })
                    setEditingRoi(true)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editingRoi && canEditRoi ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">毛利率 (%)</div>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      placeholder="例: 25"
                      value={roiDraft.grossMargin ?? ''}
                      onChange={e => setRoiDraft(p => ({ ...p, grossMargin: e.target.value === '' ? null : Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">平均售價 (NTD/K)</div>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      placeholder="例: 150"
                      value={roiDraft.avgPrice ?? ''}
                      onChange={e => setRoiDraft(p => ({ ...p, avgPrice: e.target.value === '' ? null : Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Capacity (K/M)</div>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      placeholder="例: 1000"
                      value={roiDraft.capacity ?? ''}
                      onChange={e => setRoiDraft(p => ({ ...p, capacity: e.target.value === '' ? null : Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingRoi(false)} disabled={savingRoi}>
                    <X className="h-3.5 w-3.5 mr-1" /> 取消
                  </Button>
                  <Button size="sm" onClick={handleSaveRoi} disabled={savingRoi}>
                    <Save className="h-3.5 w-3.5 mr-1" /> {savingRoi ? '儲存中...' : '儲存'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">毛利率</div>
                  <div className="font-medium">{roiParams?.grossMargin != null ? `${roiParams.grossMargin}%` : '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">平均售價</div>
                  <div className="font-medium">{roiParams?.avgPrice != null ? `${roiParams.avgPrice} NTD/K` : '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Capacity</div>
                  <div className="font-medium">{roiParams?.capacity != null ? `${roiParams.capacity} K/M` : '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">月獲利額</div>
                  <div className="font-medium">{monthlyProfit != null ? fmtNT(monthlyProfit) : '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">資本支出預估</div>
                  <div className="font-medium">{budget > 0 ? fmtNT(budget) : '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">回報期</div>
                  <div className="font-medium text-red-600">{paybackMonths != null ? `${paybackMonths.toFixed(1)} 個月` : '-'}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              採購實際彙總
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-muted-foreground">預估總金額</div>
                <div className="font-medium">{fmtNT(estimatedTotal)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">實際採購總額</div>
                <div className="font-bold text-lg">{fmtNT(grandTotal)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-muted-foreground">差異</div>
                {estimatedTotal > 0 && grandTotal > 0 ? (
                  <div className={`font-medium ${grandTotal <= estimatedTotal ? 'text-green-600' : 'text-red-600'}`}>
                    {grandTotal <= estimatedTotal ? '節省' : '超支'} {fmtNT(Math.abs(grandTotal - estimatedTotal))}
                    <span className="text-xs ml-1">({Math.round((grandTotal / estimatedTotal) * 100)}%)</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground">-</div>
                )}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">共 {items.length} 筆採購明細</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Action bar ── */}
      {!readOnly && (
        <div className="flex justify-end gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> 取消
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? '儲存中...' : '儲存'}
              </Button>
            </>
          ) : (
            <Button size="default" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1.5" /> 編輯採購明細
            </Button>
          )}
        </div>
      )}

      {/* ── Budget items + CAPEX grouped ── */}
      <div className="space-y-3">
        {budgetItems.map((bi, biIdx) => {
          const biId = bi.id || `_bi_${biIdx}`
          const capexIndices = groupedItems.get(biId)?.indices || []
          const capexTotal = capexTotalByBudget.get(biId) ?? 0
          const isExpanded = expandedBudgetItems.has(biId)

          return (
            <Card key={biId} className="overflow-hidden">
              {/* Budget item header — PM's estimate */}
              <button
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => toggleExpand(biId)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {[bi.station, bi.vendor, bi.equipment].filter(Boolean).join(' / ') || `設備項目 ${biIdx + 1}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    預估 {fmtNT(bi.estimatedCost)} · 數量 {bi.quantity}
                    {bi.unitPrice != null && <> · 單價 {fmtNT(bi.unitPrice)}</>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {capexIndices.length > 0 ? (
                    <div>
                      <div className="text-sm font-medium">{fmtNT(capexTotal)}</div>
                      <div className="text-xs text-muted-foreground">{capexIndices.length} 筆明細</div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs">尚無明細</Badge>
                  )}
                </div>
              </button>

              {/* CAPEX detail rows */}
              {isExpanded && (
                <div className="border-t bg-muted/20">
                  {capexIndices.length === 0 && !isEditing && (
                    <div className="text-center text-muted-foreground text-sm py-6">
                      尚未填寫採購明細
                    </div>
                  )}
                  {capexIndices.map(idx => (
                    <CapexItemRow
                      key={idx}
                      item={items[idx]}
                      index={idx}
                      editing={isEditing}
                      onChange={handleChange}
                      onRemove={handleRemove}
                    />
                  ))}
                  {isEditing && (
                    <div className="px-4 py-2">
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleAdd(bi.id)}>
                        <Plus className="h-3 w-3 mr-1" /> 新增明細
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}

        {/* Unlinked CAPEX items */}
        {(() => {
          const unlinkedIndices = groupedItems.get('_unlinked')?.indices || []
          const hasUnlinked = unlinkedIndices.length > 0 || isEditing
          if (!hasUnlinked) return null
          const isExpanded = expandedBudgetItems.has('_unlinked')

          return (
            <Card className="overflow-hidden border-dashed">
              <button
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/50"
                onClick={() => toggleExpand('_unlinked')}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div className="flex-1">
                  <div className="font-medium text-sm">其他採購項目（未連結預估項目）</div>
                  <div className="text-xs text-muted-foreground">{unlinkedIndices.length} 筆</div>
                </div>
                {unlinkedIndices.length > 0 && (
                  <div className="text-sm font-medium">{fmtNT(capexTotalByBudget.get('_unlinked') ?? 0)}</div>
                )}
              </button>
              {isExpanded && (
                <div className="border-t bg-muted/20">
                  {unlinkedIndices.map(idx => (
                    <CapexItemRow
                      key={idx}
                      item={items[idx]}
                      index={idx}
                      editing={isEditing}
                      onChange={handleChange}
                      onRemove={handleRemove}
                    />
                  ))}
                  {isEditing && (
                    <div className="px-4 py-2">
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleAdd(null)}>
                        <Plus className="h-3 w-3 mr-1" /> 新增明細
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Single CAPEX item row (compact card layout) ───

function CapexItemRow({ item, index, editing, onChange, onRemove }: {
  item: CapexItemData
  index: number
  editing: boolean
  onChange: (index: number, field: keyof CapexItemData, value: unknown) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="border-b last:border-b-0 px-4 py-3">
      {editing ? (
        <CapexItemForm item={item} index={index} onChange={onChange} onRemove={onRemove} />
      ) : (
        <CapexItemDisplay item={item} />
      )}
    </div>
  )
}

// ─── Read-only display ───

function DisplayCell({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground leading-tight">{label}</div>
      <div className="text-sm font-medium truncate whitespace-nowrap">{value}</div>
    </div>
  )
}

const hasPayment = (item: CapexItemData) =>
  item.depositPct != null || item.deliveryPct != null || item.acceptancePct != null

function CapexItemDisplay({ item }: { item: CapexItemData }) {
  return (
    <div className="space-y-2.5">
      {/* Header: description + amount */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {item.equipmentCategory && (
              <Badge variant="outline" className="text-[11px] py-0 h-5">{item.equipmentCategory.replace('固定資產_', '')}</Badge>
            )}
            {item.paymentStatus && <PaymentBadge status={item.paymentStatus} />}
            {item.supplier && <span className="text-xs font-semibold text-foreground">{item.supplier}</span>}
          </div>
          {item.partDescription && (
            <div className="text-sm mt-1 leading-snug">{item.partDescription}</div>
          )}
        </div>
        <div className="text-right shrink-0 pl-2">
          <div className="text-sm font-bold tabular-nums">{fmtNT(item.orderAmount)}</div>
          {item.quantity > 0 && item.twdPrice != null && (
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {item.quantity} {item.unit || '組'} × {fmtNT(item.twdPrice)}
            </div>
          )}
        </div>
      </div>

      {/* Info grid — row 1: basic */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-5 gap-y-1.5">
        <DisplayCell label="採購單號" value={item.poNumber} />
        <DisplayCell label="料號" value={item.partNumber} />
        <DisplayCell label="站別" value={item.station} />
        {item.currency !== 'TWD' && item.originalPrice != null && (
          <DisplayCell label={`原幣 (${item.currency})`} value={item.originalPrice.toLocaleString()} />
        )}
        {item.masterSummary && (
          <div className="md:col-span-2 min-w-0">
            <div className="text-xs text-muted-foreground leading-tight">主檔摘要</div>
            <div className="text-sm font-medium">{item.masterSummary}</div>
          </div>
        )}
      </div>

      {/* Info grid — row 2: dates */}
      {(item.issueDate || item.deliveryDate || item.bpmAcceptanceDate) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-5 gap-y-1.5">
          <DisplayCell label="開立日期" value={item.issueDate} />
          <DisplayCell label="設備入廠日" value={item.deliveryDate} />
          <DisplayCell label="BPM 驗收" value={item.bpmAcceptanceDate} />
        </div>
      )}

      {/* Payment schedule table */}
      {hasPayment(item) && (
        <div className="rounded border overflow-hidden text-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left px-3 py-1.5 font-medium w-24">付款期</th>
                <th className="text-right px-3 py-1.5 font-medium w-20">比例</th>
                <th className="text-right px-3 py-1.5 font-medium">金額</th>
                <th className="text-left px-3 py-1.5 font-medium w-28">付款日</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {item.depositPct != null && (
                <tr>
                  <td className="px-3 py-1.5">訂金款</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtPct(item.depositPct)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNT(item.depositAmount)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{item.depositPayDate ?? '-'}</td>
                </tr>
              )}
              {item.deliveryPct != null && (
                <tr>
                  <td className="px-3 py-1.5">交機款</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtPct(item.deliveryPct)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNT(item.deliveryAmount)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{item.deliveryPayDate ?? '-'}</td>
                </tr>
              )}
              {item.acceptancePct != null && (
                <tr>
                  <td className="px-3 py-1.5">驗收款</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtPct(item.acceptancePct)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNT(item.acceptanceAmount)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{item.acceptancePayDate ?? '-'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Edit form (compact grid) ───

function CapexItemForm({ item, index, onChange, onRemove }: {
  item: CapexItemData
  index: number
  onChange: (index: number, field: keyof CapexItemData, value: unknown) => void
  onRemove: (index: number) => void
}) {
  const ch = (field: keyof CapexItemData) => (value: unknown) => onChange(index, field, value)
  const chInput = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) => onChange(index, field, e.target.value)
  const chNum = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(index, field, v === '' ? null : parseFloat(v))
  }
  const chInt = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(index, field, v === '' ? 0 : parseInt(v))
  }
  const chPct = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(index, field, v === '' ? null : parseInt(v) / 100)
  }
  const chDate = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(index, field, e.target.value || null)
  }

  return (
    <div className="space-y-3">
      {/* Header + Delete */}
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-muted-foreground">明細 #{index + 1}</span>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive">
              <Trash2 className="h-3 w-3 mr-1" /> 刪除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認刪除此明細？</AlertDialogTitle>
              <AlertDialogDescription>
                {item.partDescription || item.poNumber
                  ? `即將刪除「${item.partDescription || item.poNumber}」，此操作在儲存後無法復原。`
                  : '即將刪除此採購明細，此操作在儲存後無法復原。'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRemove(index)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                確認刪除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Section 1: Basic */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Field label="設備類別">
          <Select value={item.equipmentCategory || '_empty'} onValueChange={v => ch('equipmentCategory')(v === '_empty' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="選擇" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_empty" className="text-xs">-</SelectItem>
              {EQUIPMENT_CATEGORIES.map(c => (
                <SelectItem key={c} value={c} className="text-xs">{c.replace('固定資產_', '')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="供應商">
          <Input className="h-8 text-xs" value={item.supplier} onChange={chInput('supplier')} />
        </Field>
        <Field label="採購單號 (PO)">
          <Input className="h-8 text-xs" value={item.poNumber} onChange={chInput('poNumber')} />
        </Field>
        <Field label="料號">
          <Input className="h-8 text-xs" value={item.partNumber} onChange={chInput('partNumber')} />
        </Field>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Field label="主檔摘要">
          <Input className="h-8 text-xs" value={item.masterSummary} onChange={chInput('masterSummary')} />
        </Field>
        <Field label="料號摘要" className="md:col-span-2">
          <Input className="h-8 text-xs" value={item.partDescription} onChange={chInput('partDescription')} />
        </Field>
        <Field label="站別">
          <Input className="h-8 text-xs" value={item.station} onChange={chInput('station')} />
        </Field>
      </div>

      <Separator />

      {/* Section 2: Amount */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Field label="單位">
          <Input className="h-8 text-xs" value={item.unit} onChange={chInput('unit')} placeholder="SET" />
        </Field>
        <Field label="幣別">
          <Select value={item.currency} onValueChange={v => ch('currency')(v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="數量">
          <Input className="h-8 text-xs text-right" type="number" value={item.quantity || ''} onChange={chInt('quantity')} />
        </Field>
        <Field label="原幣議價">
          <Input className="h-8 text-xs text-right" type="number" value={item.originalPrice ?? ''} onChange={chNum('originalPrice')} />
        </Field>
        <Field label="台幣議價">
          <Input className="h-8 text-xs text-right" type="number" value={item.twdPrice ?? ''} onChange={chNum('twdPrice')} />
        </Field>
        <Field label="訂單金額">
          <div className="h-8 flex items-center text-xs font-semibold text-right justify-end px-2 bg-muted/50 rounded-md">
            {fmtNT(item.orderAmount)}
          </div>
        </Field>
      </div>

      <Separator />

      {/* Section 3: Dates */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Field label="開立日期">
          <Input className="h-8 text-xs" type="date" value={item.issueDate ?? ''} onChange={chDate('issueDate')} />
        </Field>
        <Field label="設備入廠日">
          <Input className="h-8 text-xs" type="date" value={item.deliveryDate ?? ''} onChange={chDate('deliveryDate')} />
        </Field>
        <Field label="BPM 固資驗收">
          <Input className="h-8 text-xs" type="date" value={item.bpmAcceptanceDate ?? ''} onChange={chDate('bpmAcceptanceDate')} />
        </Field>
      </div>

      <Separator />

      {/* Section 4: Payment schedule */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2 p-2 bg-muted/30 rounded-md">
          <div className="text-xs font-medium">訂金</div>
          <div className="grid grid-cols-2 gap-1">
            <Field label="%">
              <Input className="h-7 text-xs text-right" type="number" min={0} max={100}
                value={item.depositPct != null ? Math.round(item.depositPct * 100) : ''} onChange={chPct('depositPct')} />
            </Field>
            <Field label="金額">
              <div className="h-7 flex items-center text-xs text-right justify-end px-1 bg-background rounded">{fmtNT(item.depositAmount)}</div>
            </Field>
          </div>
          <Field label="付款日">
            <Input className="h-7 text-xs" type="date" value={item.depositPayDate ?? ''} onChange={chDate('depositPayDate')} />
          </Field>
        </div>
        <div className="space-y-2 p-2 bg-muted/30 rounded-md">
          <div className="text-xs font-medium">交機/完工</div>
          <div className="grid grid-cols-2 gap-1">
            <Field label="%">
              <Input className="h-7 text-xs text-right" type="number" min={0} max={100}
                value={item.deliveryPct != null ? Math.round(item.deliveryPct * 100) : ''} onChange={chPct('deliveryPct')} />
            </Field>
            <Field label="金額">
              <div className="h-7 flex items-center text-xs text-right justify-end px-1 bg-background rounded">{fmtNT(item.deliveryAmount)}</div>
            </Field>
          </div>
          <Field label="付款日">
            <Input className="h-7 text-xs" type="date" value={item.deliveryPayDate ?? ''} onChange={chDate('deliveryPayDate')} />
          </Field>
        </div>
        <div className="space-y-2 p-2 bg-muted/30 rounded-md">
          <div className="text-xs font-medium">驗收</div>
          <div className="grid grid-cols-2 gap-1">
            <Field label="%">
              <Input className="h-7 text-xs text-right" type="number" min={0} max={100}
                value={item.acceptancePct != null ? Math.round(item.acceptancePct * 100) : ''} onChange={chPct('acceptancePct')} />
            </Field>
            <Field label="金額">
              <div className="h-7 flex items-center text-xs text-right justify-end px-1 bg-background rounded">{fmtNT(item.acceptanceAmount)}</div>
            </Field>
          </div>
          <Field label="付款日">
            <Input className="h-7 text-xs" type="date" value={item.acceptancePayDate ?? ''} onChange={chDate('acceptancePayDate')} />
          </Field>
        </div>
      </div>

      {/* Payment status */}
      <div className="w-40">
        <Field label="付款狀態">
          <Select value={item.paymentStatus || '_empty'} onValueChange={v => ch('paymentStatus')(v === '_empty' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_empty" className="text-xs">-</SelectItem>
              {PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  )
}

// ─── Helpers ───

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-0.5 block">{label}</Label>
      {children}
    </div>
  )
}

function PaymentBadge({ status }: { status: string }) {
  if (!status) return null
  const variant = status === '已付清' ? 'default' : status === '部分付款' ? 'secondary' : 'outline'
  return <Badge variant={variant} className="text-xs">{status}</Badge>
}
