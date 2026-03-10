'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil, Check, X, Loader2, AlertCircle } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

export interface RoiParams {
  grossMargin: number | null  // 毛利率 (%)
  avgPrice: number | null     // 平均售價 (NTD/K)
  capacity: number | null     // Capacity (K/M)
}

interface BudgetItemMin {
  station: string
  equipment: string
  estimatedCost: number | null
  actualCost: number | null
}

interface RoiSectionProps {
  projectId: string
  budget: number
  roiText: string
  roiParams: RoiParams | null
  budgetItems: BudgetItemMin[]
  onSaved: (newBudgetItems: BudgetItemMin[], newRoiParams: RoiParams) => void
}

const fmtNT = (n: number) => `NT$ ${Math.round(n).toLocaleString('zh-TW')}`

function parseNum(v: string): number | null {
  const n = parseFloat(v.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function calcRoi(params: RoiParams | null, budget: number) {
  const { grossMargin, avgPrice, capacity } = params ?? {}
  const monthlyProfit =
    avgPrice != null && capacity != null && grossMargin != null
      ? avgPrice * capacity * (grossMargin / 100)
      : null
  const paybackMonths =
    monthlyProfit != null && monthlyProfit > 0 && budget > 0
      ? budget / monthlyProfit
      : null
  return { monthlyProfit, paybackMonths }
}

// ─── 6-indicator table (always rendered) ───────────────────
function RoiParamsTable({
  roiParams,
  budget,
}: {
  roiParams: RoiParams | null
  budget: number
}) {
  const { grossMargin, avgPrice, capacity } = roiParams ?? {}
  const { monthlyProfit, paybackMonths } = calcRoi(roiParams, budget)

  const rows: { label: string; value: string; unit: string; highlight?: boolean }[] = [
    {
      label: '毛利率',
      value: grossMargin != null ? String(grossMargin) : '—',
      unit: '%',
    },
    {
      label: '平均售價',
      value: avgPrice != null ? avgPrice.toLocaleString('zh-TW') : '—',
      unit: 'NTD/K',
    },
    {
      label: 'Capacity',
      value: capacity != null ? capacity.toLocaleString('zh-TW') : '—',
      unit: 'K/M',
    },
    {
      label: '獲利額',
      value: monthlyProfit != null ? Math.round(monthlyProfit).toLocaleString('zh-TW') : '—',
      unit: 'NTD/M',
    },
    {
      label: '資本支出',
      value: budget > 0 ? Math.round(budget).toLocaleString('zh-TW') : '—',
      unit: 'NTD',
    },
    {
      label: '投資回報期',
      value: paybackMonths != null ? paybackMonths.toFixed(1) : '—',
      unit: '月',
      highlight: true,
    },
  ]

  return (
    <div className="overflow-hidden rounded-md border text-xs">
      <div className="bg-[#1f3864] text-white text-center font-semibold py-1.5 px-3 text-sm">
        預計投資回收期
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              className={
                r.highlight
                  ? 'bg-red-50 font-bold text-red-700'
                  : 'border-b last:border-0 even:bg-muted/20'
              }
            >
              <td className="px-3 py-1.5 text-left border-r border-muted font-medium w-28">
                {r.label}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.value}</td>
              <td className="px-3 py-1.5 text-left text-muted-foreground w-20 border-l border-muted">
                {r.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Payback chart ──────────────────────────────────────────
function PaybackChart({ budget, monthlyProfit }: { budget: number; monthlyProfit: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (monthlyProfit <= 0 || budget <= 0) return null
  const payback = budget / monthlyProfit

  // When payback is too long, the chart is misleading — show text instead
  if (payback > 60) {
    const years = (payback / 12).toFixed(1)
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        預估回收期約 <strong>{payback.toFixed(0)} 個月（{years} 年）</strong>，
        時間較長，圖表不適合呈現。請確認 ROI 參數是否填寫正確
        （提示：平均售價單位為 NTD/千顆，Capacity 單位為千顆/月）。
      </div>
    )
  }

  const maxMonths = Math.ceil(payback * 2.2)
  const data = Array.from({ length: maxMonths + 1 }, (_, m) => ({
    month: m,
    累積淨益: Math.round(monthlyProfit * m - budget),
  }))
  const yMax = Math.round(monthlyProfit * maxMonths - budget)
  const yDomain: [number, number] = [-budget * 1.05, Math.max(yMax * 1.1, budget * 0.1)]

  const tickFmt = (v: number) =>
    Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
      : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)

  if (!mounted) return <div className="h-[200px]" />

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1 font-medium">
        投資回收曲線（預估回收期：<span className="text-[#1f3864] font-semibold">{payback.toFixed(1)} 個月</span>）
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 16, right: 72, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }}
            label={{ value: '月', position: 'insideBottomRight', offset: -4, fontSize: 10 }} />
          <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9 }} width={44} domain={yDomain} />
          <Tooltip
            formatter={(v: number) => [fmtNT(v), '累積淨益']}
            labelFormatter={(l) => `第 ${l} 個月`}
            contentStyle={{ fontSize: 11 }}
          />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5}
            label={{ value: '損益平衡', position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }} />
          <ReferenceLine
            x={Math.round(payback)} stroke="#1f3864" strokeDasharray="4 2" strokeWidth={1.5}
            label={{ value: `第 ${payback.toFixed(1)} 月回收`, position: 'top', fontSize: 9, fill: '#1f3864' }}
          />
          <Line type="monotone" dataKey="累積淨益" stroke="#2563eb" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main RoiSection ───────────────────────────────────────
export function RoiSection({
  projectId,
  budget,
  roiText,
  roiParams: initialRoiParams,
  budgetItems: initialItems,
  onSaved,
}: RoiSectionProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [paramDraft, setParamDraft] = useState<RoiParams>(
    initialRoiParams ?? { grossMargin: null, avgPrice: null, capacity: null }
  )
  const [actualCostDraft, setActualCostDraft] = useState<(number | null)[]>(
    initialItems.map((i) => i.actualCost)
  )

  const capitalExp = budget > 0 ? budget : initialItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
  const { monthlyProfit, paybackMonths } = calcRoi(initialRoiParams, capitalExp)

  const estimated = initialItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
  const actual = initialItems.reduce((s, i) => s + (i.actualCost ?? 0), 0)
  const hasActual = initialItems.some((i) => i.actualCost != null)
  const missingActualCount = initialItems.filter((i) => i.actualCost == null).length

  const startEdit = () => {
    setParamDraft(initialRoiParams ?? { grossMargin: null, avgPrice: null, capacity: null })
    setActualCostDraft(initialItems.map((i) => i.actualCost))
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roiParams: JSON.stringify(paramDraft) }),
      })
      const updatedItems = initialItems.map((item, i) => ({
        ...item,
        actualCost: actualCostDraft[i] !== undefined ? actualCostDraft[i] : item.actualCost,
      }))
      const res = await fetch(`/api/projects/${projectId}/budget-items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updatedItems }),
      })
      if (res.ok) {
        const saved = await res.json()
        onSaved(saved, paramDraft)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* ─── Section header ─── */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">投資報酬 (ROI)</span>
        {!editing ? (
          <Button type="button" variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={startEdit} title="編輯 ROI 數據與實際費用">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => setEditing(false)} disabled={saving}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="icon" className="h-6 w-6"
              onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>

      {/* ─── ROI text from DB ─── */}
      {roiText && <p className="text-sm text-muted-foreground mb-3">{roiText}</p>}

      {/* ══════════ EDIT MODE ══════════ */}
      {editing && (
        <div className="space-y-4 mb-4">

          {/* 1. ROI params */}
          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold text-foreground">ROI 參數</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">毛利率 (%)</Label>
                <Input type="number" min={0} max={100} step={0.1}
                  value={paramDraft.grossMargin ?? ''}
                  onChange={(e) => setParamDraft((p) => ({ ...p, grossMargin: parseNum(e.target.value) }))}
                  className="h-7 text-xs" placeholder="例：30" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">平均售價 (NTD/K)</Label>
                <Input type="number" min={0}
                  value={paramDraft.avgPrice ?? ''}
                  onChange={(e) => setParamDraft((p) => ({ ...p, avgPrice: parseNum(e.target.value) }))}
                  className="h-7 text-xs" placeholder="例：150" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Capacity (K/M)</Label>
                <Input type="number" min={0}
                  value={paramDraft.capacity ?? ''}
                  onChange={(e) => setParamDraft((p) => ({ ...p, capacity: parseNum(e.target.value) }))}
                  className="h-7 text-xs" placeholder="例：3552" />
              </div>
            </div>
          </div>

          {/* 2. Actual costs table */}
          {initialItems.length > 0 && (
            <div className="rounded-md border overflow-hidden">
              <div className="bg-muted/60 px-3 py-2 border-b">
                <div className="text-xs font-semibold text-foreground">各設備實際費用</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  在右側欄位輸入實際採購金額（NT$），未填寫請留空
                </div>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-10">站別</th>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">設備名稱</th>
                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground w-32">預估費用</th>
                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground w-36">實際費用 (NT$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {initialItems.map((item, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-1 text-muted-foreground">{item.station}</td>
                      <td className="px-3 py-1">{item.equipment}</td>
                      <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
                        {item.estimatedCost != null ? item.estimatedCost.toLocaleString('zh-TW') : '—'}
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          type="text" inputMode="numeric"
                          value={actualCostDraft[i] != null ? actualCostDraft[i]!.toLocaleString('zh-TW') : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '')
                            const d = [...actualCostDraft]
                            d[i] = raw === '' ? null : (parseFloat(raw) || null)
                            setActualCostDraft(d)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && !e.shiftKey && actualCostDraft[i] == null && item.estimatedCost != null) {
                              e.preventDefault()
                              const d = [...actualCostDraft]
                              d[i] = item.estimatedCost
                              setActualCostDraft(d)
                              // move focus to next row
                              const inputs = (e.target as HTMLInputElement)
                                .closest('tbody')
                                ?.querySelectorAll<HTMLInputElement>('input')
                              if (inputs) {
                                const idx = Array.from(inputs).indexOf(e.target as HTMLInputElement)
                                inputs[idx + 1]?.focus()
                              }
                            }
                          }}
                          placeholder="—"
                          className="h-6 text-xs w-full text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════ DISPLAY MODE ══════════ */}
      {!editing && (
        <div className="space-y-3">

          {/* Budget vs actual summary */}
          {initialItems.length > 0 && (
            <div className="text-xs space-y-1 bg-muted/40 rounded-md p-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">資本支出（預估）</span>
                <span className="font-medium tabular-nums">{fmtNT(estimated)}</span>
              </div>
              {hasActual && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">實際投入</span>
                  <span className="font-medium tabular-nums">{fmtNT(actual)}</span>
                </div>
              )}
              <div className="flex justify-between pt-0.5 border-t text-muted-foreground">
                <span>{initialItems.length} 項設備</span>
                {hasActual && actual > 0 && estimated > 0 && (
                  <span className={actual <= estimated ? 'text-green-600 font-semibold' : 'text-destructive font-semibold'}>
                    {actual <= estimated
                      ? `節省 ${fmtNT(estimated - actual)}`
                      : `超支 ${fmtNT(actual - estimated)}`}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Incomplete actual costs reminder */}
          {initialItems.length > 0 && missingActualCount > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                尚有 <strong>{missingActualCount}</strong> 項設備未填寫實際費用，
                點擊右上角鉛筆圖示補充以計算實際 ROI。
              </span>
            </div>
          )}

          {/* Always show 6-indicator ROI table */}
          <RoiParamsTable roiParams={initialRoiParams} budget={capitalExp} />

          {/* Payback chart (only when data is available) */}
          {monthlyProfit != null && monthlyProfit > 0 && capitalExp > 0 && (
            <PaybackChart budget={capitalExp} monthlyProfit={monthlyProfit} />
          )}

          {/* Hint when completely empty */}
          {!roiText && initialItems.length === 0 && initialRoiParams == null && (
            <p className="text-xs text-muted-foreground">
              點擊右上角鉛筆圖示填寫 ROI 參數與實際費用
            </p>
          )}
        </div>
      )}
    </div>
  )
}
