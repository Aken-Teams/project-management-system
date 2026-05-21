'use client'

import { useEffect, useState } from 'react'
import { DollarSign, AlertTriangle } from 'lucide-react'
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
  budget: number
  roiParams: RoiParams | null
  budgetItems: BudgetItemMin[]
}

const fmtNT = (n: number) => `NT$ ${Math.round(n).toLocaleString('zh-TW')}`

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
    <div className="overflow-hidden rounded-md border text-xs h-full flex flex-col">
      <div className="bg-[#1f3864] text-white text-center font-semibold py-1.5 px-3 text-sm shrink-0">
        預計投資回收期
      </div>
      <div className="flex flex-col flex-1 divide-y">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`flex items-center flex-1 ${
              r.highlight
                ? 'bg-red-50 font-bold text-red-700'
                : 'even:bg-muted/20'
            }`}
          >
            <div className="px-3 py-1 font-medium w-28 shrink-0 border-r border-muted self-stretch flex items-center">
              {r.label}
            </div>
            <div className="px-3 py-1 text-right tabular-nums flex-1">{r.value}</div>
            <div className="px-3 py-1 text-left text-muted-foreground w-20 shrink-0 border-l border-muted self-stretch flex items-center">
              {r.unit}
            </div>
          </div>
        ))}
      </div>
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

  if (!mounted) return <div className="min-h-[260px]" />

  return (
    <div className="flex flex-col h-full">
      <div className="text-sm text-muted-foreground mb-2 font-medium shrink-0">
        投資回收曲線（預估回收期：<span className="text-[#1f3864] font-semibold">{payback.toFixed(1)} 個月</span>）
      </div>
      <div className="flex-1 min-h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }}
            label={{ value: '月', position: 'insideBottomRight', offset: -4, fontSize: 12 }} />
          <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11 }} width={56} domain={yDomain} />
          <Tooltip
            formatter={(v: number) => [fmtNT(v), '累積淨益']}
            labelFormatter={(l) => `第 ${l} 個月`}
            contentStyle={{ fontSize: 13 }}
          />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5}
            label={{ value: '損益平衡', position: 'insideTopRight', fontSize: 11, fill: '#ef4444' }} />
          <ReferenceLine
            x={Math.round(payback)} stroke="#1f3864" strokeDasharray="4 2" strokeWidth={1.5}
            label={{ value: `第 ${payback.toFixed(1)} 月回收`, position: 'top', fontSize: 11, fill: '#1f3864' }}
          />
          <Line type="monotone" dataKey="累積淨益" stroke="#2563eb" dot={false} strokeWidth={2.5} />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Main RoiSection (display only — editing is in 投資報酬 tab) ───
export function RoiSection({
  budget,
  roiParams: initialRoiParams,
  budgetItems: initialItems,
}: RoiSectionProps) {
  const capitalExp = budget > 0 ? budget : initialItems.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
  const { monthlyProfit } = calcRoi(initialRoiParams, capitalExp)

  return (
    <div>
      {/* ─── Section header ─── */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-primary flex items-center gap-1.5"><DollarSign className="h-3 w-3" />投資報酬 (ROI)</span>
      </div>

      <div className="space-y-3">
        {/* Table + chart side by side when chart data available, else table alone */}
        {monthlyProfit != null && monthlyProfit > 0 && capitalExp > 0 ? (
          <div className="grid grid-cols-[auto_1fr] gap-4 items-stretch">
            <RoiParamsTable roiParams={initialRoiParams} budget={capitalExp} />
            <div className="min-w-0">
            <PaybackChart budget={capitalExp} monthlyProfit={monthlyProfit} />
            </div>
          </div>
        ) : (
          <RoiParamsTable roiParams={initialRoiParams} budget={capitalExp} />
        )}

        {/* Warning when ROI params missing or incomplete */}
        {(initialRoiParams == null || initialRoiParams.grossMargin == null || initialRoiParams.avgPrice == null || initialRoiParams.capacity == null) && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">ROI 參數尚未填寫完成</p>
              <p className="text-xs text-amber-700 mt-0.5">
                請至「投資報酬」頁籤或專案編輯中填寫毛利率、平均售價、Capacity，以計算投資回報期
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
