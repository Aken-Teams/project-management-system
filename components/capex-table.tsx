'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Package, DollarSign, CreditCard, Pencil, Save, X, TrendingDown, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { CapexItemDialog } from '@/components/capex-item-dialog'
import type { RoiParams } from '@/components/roi-section'

// ─── Exported Types ───

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

export interface BudgetItemRef {
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

const fmtNT = (n: number | null) => n != null ? `NT$ ${Math.round(n).toLocaleString('zh-TW')}` : '-'
const fmtPct = (v: number | null) => v != null ? `${Math.round(v * 100)}%` : '-'

// ─── Main Component ───

export function CapexTable({ projectId, items: initialItems, budgetItems, roiParams, budget, readOnly, canEditRoi, onSaved, onRoiParamsSaved }: CapexTableProps) {
  const [items, setItems] = useState<CapexItemData[]>(initialItems)
  const [expandedBudgetItems, setExpandedBudgetItems] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogItem, setDialogItem] = useState<CapexItemData | null>(null)
  const [dialogDefaultBudgetId, setDialogDefaultBudgetId] = useState<string | null>(null)

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

  // Refetch items from API
  const refetch = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/capex`)
    if (res.ok) {
      const data = await res.json()
      setItems(data)
      onSaved(data)
    }
  }, [projectId, onSaved])

  // Dialog handlers
  const openAddDialog = useCallback((budgetItemId?: string | null) => {
    setDialogItem(null)
    setDialogDefaultBudgetId(budgetItemId ?? null)
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((item: CapexItemData) => {
    setDialogItem(item)
    setDialogDefaultBudgetId(null)
    setDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async (item: CapexItemData) => {
    if (!item.id) return
    try {
      const res = await fetch(`/api/projects/${projectId}/capex/${item.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast({ title: '刪除成功' })
      await refetch()
    } catch {
      toast({ title: '刪除失敗', variant: 'destructive' })
    }
  }, [projectId, refetch, toast])

  const toggleExpand = useCallback((key: string) => {
    setExpandedBudgetItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Computed values
  const groupedItems = useMemo(() => {
    const groups = new Map<string, CapexItemData[]>()
    items.forEach(item => {
      const key = item.budgetItemId || '_unlinked'
      const list = groups.get(key) || []
      list.push(item)
      groups.set(key, list)
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

  const capexCountByBudget = useMemo(() => {
    const counts = new Map<string, number>()
    groupedItems.forEach((list, key) => counts.set(key, list.length))
    return counts
  }, [groupedItems])

  const grandTotal = useMemo(() => items.reduce((s, i) => s + (i.orderAmount ?? 0), 0), [items])
  const estimatedTotal = useMemo(() => budgetItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0), [budgetItems])

  // ROI
  const { monthlyProfit, paybackMonths } = useMemo(() => {
    const { grossMargin, avgPrice, capacity } = roiParams ?? {}
    const mp = avgPrice != null && capacity != null && grossMargin != null
      ? avgPrice * capacity * (grossMargin / 100) : null
    const pb = mp != null && mp > 0 && budget > 0 ? budget / mp : null
    return { monthlyProfit: mp, paybackMonths: pb }
  }, [roiParams, budget])

  const diff = estimatedTotal > 0 && grandTotal > 0 ? grandTotal - estimatedTotal : null
  const diffPct = estimatedTotal > 0 && grandTotal > 0 ? Math.round((grandTotal / estimatedTotal) * 100) : null

  return (
    <div className="space-y-5">
      {/* ── Summary Card (sticky) ── */}
      <Card className="sticky top-0 md:top-0 z-10 shadow-md bg-card">
        <CardContent className="pt-5 pb-5">
          {/* Top row: three big numbers */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="text-center p-3 bg-muted/40 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">預估支出</div>
              <div className="text-lg font-bold tabular-nums">{estimatedTotal > 0 ? fmtNT(estimatedTotal) : '-'}</div>
            </div>
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-xs text-muted-foreground mb-1">實際採購</div>
              <div className="text-xl font-bold tabular-nums">{grandTotal > 0 ? fmtNT(grandTotal) : '-'}</div>
              <div className="text-[11px] text-muted-foreground">{items.length} 筆明細</div>
            </div>
            <div className={`text-center p-3 rounded-lg ${diff != null ? (diff <= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30') : 'bg-muted/40'}`}>
              <div className="text-xs text-muted-foreground mb-1">差異</div>
              {diff != null ? (
                <>
                  <div className={`text-lg font-bold tabular-nums flex items-center justify-center gap-1 ${diff <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {diff <= 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                    {fmtNT(Math.abs(diff))}
                  </div>
                  <div className={`text-[11px] ${diff <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {diff <= 0 ? '節省' : '超支'} ({diffPct}%)
                  </div>
                </>
              ) : (
                <div className="text-lg font-bold text-muted-foreground">-</div>
              )}
            </div>
          </div>

          {/* Bottom row: ROI params in a single line */}
          <div className="flex items-center justify-between border-t pt-4">
            {editingRoi && canEditRoi ? (
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">毛利率 (%)</div>
                    <Input className="h-8 text-sm" type="number" placeholder="例: 25"
                      value={roiDraft.grossMargin ?? ''}
                      onChange={e => setRoiDraft(p => ({ ...p, grossMargin: e.target.value === '' ? null : Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">平均售價 (NTD/K)</div>
                    <Input className="h-8 text-sm" type="number" placeholder="例: 150"
                      value={roiDraft.avgPrice ?? ''}
                      onChange={e => setRoiDraft(p => ({ ...p, avgPrice: e.target.value === '' ? null : Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Capacity (K/M)</div>
                    <Input className="h-8 text-sm" type="number" placeholder="例: 1000"
                      value={roiDraft.capacity ?? ''}
                      onChange={e => setRoiDraft(p => ({ ...p, capacity: e.target.value === '' ? null : Number(e.target.value) }))} />
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
              <>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>毛利率 <strong className="text-foreground">{roiParams?.grossMargin != null ? `${roiParams.grossMargin}%` : '-'}</strong></span>
                  <span>售價 <strong className="text-foreground">{roiParams?.avgPrice != null ? `${roiParams.avgPrice.toLocaleString()} NTD/K` : '-'}</strong></span>
                  <span>產能 <strong className="text-foreground">{roiParams?.capacity != null ? `${roiParams.capacity.toLocaleString()} K/M` : '-'}</strong></span>
                  <span>月獲利 <strong className="text-foreground">{monthlyProfit != null ? fmtNT(monthlyProfit) : '-'}</strong></span>
                  <span>回報期 <strong className={paybackMonths != null ? 'text-red-600' : 'text-foreground'}>
                    {paybackMonths != null ? `${paybackMonths.toFixed(1)} 個月` : '-'}
                  </strong></span>
                </div>
                {canEditRoi && (
                  <button
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-3"
                    onClick={() => {
                      setRoiDraft({
                        grossMargin: roiParams?.grossMargin ?? null,
                        avgPrice: roiParams?.avgPrice ?? null,
                        capacity: roiParams?.capacity ?? null,
                      })
                      setEditingRoi(true)
                    }}
                  >
                    <Pencil className="h-3 w-3" /> 編輯
                  </button>
                )}
              </>
            )}
          </div>
          {/* Add button inside summary card */}
          {!readOnly && (
            <div className="flex justify-end border-t pt-4 mt-1">
              <Button onClick={() => openAddDialog(null)}>
                <Plus className="h-4 w-4 mr-1.5" /> 新增採購明細
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Budget items + CAPEX grouped ── */}
      <div className="space-y-3">
        {budgetItems.map((bi, biIdx) => {
          const biId = bi.id || `_bi_${biIdx}`
          const capexList = groupedItems.get(biId) || []
          const capexTotal = capexTotalByBudget.get(biId) ?? 0
          const isExpanded = expandedBudgetItems.has(biId)
          const pct = bi.estimatedCost && bi.estimatedCost > 0 ? Math.round((capexTotal / bi.estimatedCost) * 100) : 0
          const overBudget = pct > 100

          return (
            <Card key={biId} className="overflow-hidden">
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
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      預估 {fmtNT(bi.estimatedCost)}
                    </span>
                    {/* Progress bar */}
                    {bi.estimatedCost != null && bi.estimatedCost > 0 && (
                      <div className="flex items-center gap-1.5 flex-1 max-w-[180px]">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className={`text-[10px] tabular-nums ${overBudget ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {pct}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {capexList.length > 0 ? (
                    <div>
                      <div className="text-sm font-bold tabular-nums">{fmtNT(capexTotal)}</div>
                      <div className="text-xs text-muted-foreground">{capexList.length} 筆明細</div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs">尚無明細</Badge>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t">
                  {capexList.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-6">尚未填寫採購明細</div>
                  )}
                  {capexList.map(capex => (
                    <CapexItemRow
                      key={capex.id || Math.random()}
                      item={capex}
                      readOnly={readOnly}
                      onEdit={openEditDialog}
                      onDelete={handleDelete}
                    />
                  ))}
                  {!readOnly && (
                    <div className="px-4 py-2 border-t border-dashed">
                      <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => openAddDialog(bi.id)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> 在此項目下新增明細
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
          const unlinkedList = groupedItems.get('_unlinked') || []
          if (unlinkedList.length === 0 && readOnly) return null
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
                  <div className="text-xs text-muted-foreground">{unlinkedList.length} 筆</div>
                </div>
                {unlinkedList.length > 0 && (
                  <div className="text-sm font-bold tabular-nums">{fmtNT(capexTotalByBudget.get('_unlinked') ?? 0)}</div>
                )}
              </button>
              {isExpanded && (
                <div className="border-t">
                  {unlinkedList.map(capex => (
                    <CapexItemRow
                      key={capex.id || Math.random()}
                      item={capex}
                      readOnly={readOnly}
                      onEdit={openEditDialog}
                      onDelete={handleDelete}
                    />
                  ))}
                  {!readOnly && (
                    <div className="px-4 py-2 border-t border-dashed">
                      <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => openAddDialog(null)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> 新增明細
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })()}
      </div>

      {/* ── Dialog ── */}
      <CapexItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        budgetItems={budgetItems}
        capexCountByBudget={capexCountByBudget}
        item={dialogItem}
        defaultBudgetItemId={dialogDefaultBudgetId}
        onSaved={refetch}
      />
    </div>
  )
}

// ─── CAPEX Item Row (read-only with action buttons) ───

function CapexItemRow({ item, readOnly, onEdit, onDelete }: {
  item: CapexItemData
  readOnly: boolean
  onEdit: (item: CapexItemData) => void
  onDelete: (item: CapexItemData) => void
}) {
  return (
    <div className="border-b last:border-b-0 px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <CapexItemDisplay item={item} />
        </div>
        {!readOnly && (
          <div className="shrink-0 flex gap-1 pt-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(item)} title="編輯">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="刪除">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確認刪除此明細？</AlertDialogTitle>
                  <AlertDialogDescription>
                    {item.partDescription || item.poNumber
                      ? `即將刪除「${item.partDescription || item.poNumber}」，此操作無法復原。`
                      : '即將刪除此採購明細，此操作無法復原。'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(item)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    確認刪除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Read-only display (redesigned) ───

function CapexItemDisplay({ item }: { item: CapexItemData }) {
  const hasPay = item.depositPct != null || item.deliveryPct != null || item.acceptancePct != null
  const paidTotal = (item.depositPayDate ? (item.depositAmount ?? 0) : 0)
    + (item.deliveryPayDate ? (item.deliveryAmount ?? 0) : 0)
    + (item.acceptancePayDate ? (item.acceptanceAmount ?? 0) : 0)
  const payPct = item.orderAmount && item.orderAmount > 0 ? Math.round((paidTotal / item.orderAmount) * 100) : 0

  return (
    <div className="space-y-2">
      {/* Row 1: supplier + badges + amount */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {item.supplier && <span className="text-sm font-semibold">{item.supplier}</span>}
            {item.equipmentCategory && (
              <Badge variant="outline" className="text-[10px] py-0 h-4">{item.equipmentCategory.replace('固定資產_', '')}</Badge>
            )}
            {item.paymentStatus && <PaymentBadge status={item.paymentStatus} />}
          </div>
          {item.partDescription && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.partDescription}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold tabular-nums">{fmtNT(item.orderAmount)}</div>
          {item.quantity > 0 && item.twdPrice != null && (
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {item.quantity} {item.unit || '組'} × {fmtNT(item.twdPrice)}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: key fields + payment (right-aligned) */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {item.poNumber && <span>PO <strong className="text-foreground">{item.poNumber}</strong></span>}
          {item.partNumber && <span>料號 <strong className="text-foreground">{item.partNumber}</strong></span>}
          {item.station && <span>站別 <strong className="text-foreground">{item.station}</strong></span>}
          {item.currency !== 'TWD' && item.originalPrice != null && (
            <span>原幣 <strong className="text-foreground">{item.currency} {item.originalPrice.toLocaleString()}</strong></span>
          )}
          {item.deliveryDate && <span>入廠 <strong className="text-foreground">{item.deliveryDate}</strong></span>}
        </div>

        {hasPay && (
          <div className="shrink-0 flex flex-col items-end gap-0.5 text-xs">
            <div className="flex items-center gap-1.5 min-w-[120px]">
              <span className="text-muted-foreground shrink-0">付款</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(payPct, 100)}%` }} />
              </div>
              <span className="text-muted-foreground tabular-nums shrink-0">{payPct}%</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              {item.depositPct != null && (
                <span className={item.depositPayDate ? 'text-green-600' : ''}>
                  訂{fmtPct(item.depositPct)} {item.depositPayDate ? '✓' : '○'}
                </span>
              )}
              {item.deliveryPct != null && (
                <span className={item.deliveryPayDate ? 'text-green-600' : ''}>
                  交{fmtPct(item.deliveryPct)} {item.deliveryPayDate ? '✓' : '○'}
                </span>
              )}
              {item.acceptancePct != null && (
                <span className={item.acceptancePayDate ? 'text-green-600' : ''}>
                  驗{fmtPct(item.acceptancePct)} {item.acceptancePayDate ? '✓' : '○'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ───

function PaymentBadge({ status }: { status: string }) {
  if (!status) return null
  const variant = status === '已付清' ? 'default' : status === '部分付款' ? 'secondary' : 'outline'
  return <Badge variant={variant} className="text-[10px] py-0 h-4">{status}</Badge>
}
