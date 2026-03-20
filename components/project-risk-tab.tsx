'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Search,
  Shield,
  Info,
  Loader2,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project, Risk } from '@/lib/mock-data'

interface Props {
  project: Project
  onRefresh?: () => void
  readOnly?: boolean
}

const PAGE_SIZE = 10

const IMPACT_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' }
const PROBABILITY_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' }
const STATUS_LABELS: Record<string, string> = { open: '未處理', mitigated: '已緩解', closed: '已關閉' }

function getRiskLevelColor(level: string) {
  switch (level) {
    case 'high': return 'bg-destructive text-destructive-foreground'
    case 'medium': return 'bg-warning text-warning-foreground'
    case 'low': return 'bg-muted text-muted-foreground'
    default: return 'bg-muted text-muted-foreground'
  }
}

export function ProjectRiskTab({ project, onRefresh, readOnly }: Props) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'' | 'open' | 'mitigated' | 'closed'>('')
  const [filterImpact, setFilterImpact] = useState<'' | 'high' | 'medium' | 'low'>('')
  const [page, setPage] = useState(1)
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const allRisks = project.risks

  const openCount = allRisks.filter(r => r.status === 'open').length
  const mitigatedCount = allRisks.filter(r => r.status === 'mitigated').length
  const closedCount = allRisks.filter(r => r.status === 'closed').length

  // Filtered data
  const filtered = useMemo(() => {
    let list = allRisks
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.mitigation.toLowerCase().includes(q)
      )
    }
    if (filterStatus) list = list.filter(r => r.status === filterStatus)
    if (filterImpact) list = list.filter(r => r.impact === filterImpact)
    return list
  }, [allRisks, search, filterStatus, filterImpact])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFilterStatus = (v: '' | 'open' | 'mitigated' | 'closed') => { setFilterStatus(v); setPage(1) }
  const handleFilterImpact = (v: '' | 'high' | 'medium' | 'low') => { setFilterImpact(v); setPage(1) }
  const handleSearchChange = (v: string) => { setSearch(v); setPage(1) }

  const handleChangeStatus = async (risk: Risk, newStatus: string) => {
    setUpdatingId(risk.id)
    try {
      const res = await fetch(`/api/projects/${project.id}/risks/${risk.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '操作失敗')
      }
      onRefresh?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失敗')
    } finally {
      setUpdatingId(null)
    }
  }

  if (allRisks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">尚未登記風險項目</p>
          <p className="text-sm text-muted-foreground mt-1">開案時可預先識別已知風險，評估影響程度和發生機率</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-muted/50 border px-4 py-2.5 mb-3">
        <div className="flex items-center gap-1.5 text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">已識別 {allRisks.length} 項風險</span>
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <Badge variant="destructive" className="text-sm">{openCount} 未處理</Badge>
          )}
          {mitigatedCount > 0 && (
            <Badge className="text-sm bg-warning text-warning-foreground">{mitigatedCount} 已緩解</Badge>
          )}
          {closedCount > 0 && (
            <Badge variant="secondary" className="text-sm">{closedCount} 已關閉</Badge>
          )}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex items-center justify-end gap-2 mb-3 flex-wrap">
        {/* Status filter */}
        <div className="flex items-center gap-1">
          {(['', 'open', 'mitigated', 'closed'] as const).map(s => (
            <Button key={s} variant={filterStatus === s ? 'default' : 'outline'} size="sm" className="h-8 text-xs px-2.5" onClick={() => handleFilterStatus(s)}>
              {s === '' ? '全部' : STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
        {/* Impact filter */}
        <div className="flex items-center gap-1">
          {(['', 'high', 'medium', 'low'] as const).map(i => (
            <Button key={i} variant={filterImpact === i ? 'default' : 'outline'} size="sm" className="h-8 text-xs px-2.5" onClick={() => handleFilterImpact(i)}>
              {i === '' ? '影響程度' : IMPACT_LABELS[i]}
            </Button>
          ))}
        </div>
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="搜尋..." value={search} onChange={e => handleSearchChange(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm">無符合條件的風險項目</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">狀態</th>
                    <th className="text-left px-4 py-2.5 font-medium">風險名稱</th>
                    <th className="text-center px-4 py-2.5 font-medium">影響程度</th>
                    <th className="text-center px-4 py-2.5 font-medium">發生機率</th>
                    <th className="text-left px-4 py-2.5 font-medium">緩解措施</th>
                    {!readOnly && <th className="text-center px-4 py-2.5 font-medium">操作</th>}
                    <th className="text-right px-4 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((risk, i) => (
                    <tr
                      key={risk.id}
                      className={cn('cursor-pointer hover:bg-muted/50 transition-colors text-sm', i % 2 !== 0 && 'bg-muted/20')}
                      onClick={() => setSelectedRisk(risk)}
                    >
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0',
                          risk.status === 'open' ? 'bg-red-100 text-red-700 border-red-300' :
                          risk.status === 'mitigated' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                          'bg-emerald-100 text-emerald-700 border-emerald-300',
                        )}>
                          {STATUS_LABELS[risk.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <span className={cn('line-clamp-1', risk.status === 'closed' && 'text-muted-foreground line-through')}>
                          {risk.title}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={cn('text-[10px] px-1.5', getRiskLevelColor(risk.impact))}>
                          {IMPACT_LABELS[risk.impact]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={cn('text-[10px] px-1.5', getRiskLevelColor(risk.probability))}>
                          {PROBABILITY_LABELS[risk.probability]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="line-clamp-1 text-muted-foreground">{risk.mitigation || '-'}</span>
                      </td>
                      {!readOnly && (
                        <td className="px-4 py-3 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1 text-muted-foreground" disabled={updatingId === risk.id}>
                                {updatingId === risk.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Pencil className="h-3.5 w-3.5" />
                                )}
                                變更狀態
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                              {(['open', 'mitigated', 'closed'] as const).map(s => (
                                <DropdownMenuItem
                                  key={s}
                                  disabled={risk.status === s}
                                  onClick={() => handleChangeStatus(risk, s)}
                                  className="gap-2"
                                >
                                  <span className={cn('inline-block h-2 w-2 rounded-full shrink-0',
                                    s === 'open' ? 'bg-red-500' :
                                    s === 'mitigated' ? 'bg-amber-500' :
                                    'bg-emerald-500',
                                  )} />
                                  {STATUS_LABELS[s]}
                                  {risk.status === s && <span className="text-muted-foreground ml-auto text-[10px]">目前</span>}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <ChevronRightIcon className="h-4 w-4 text-muted-foreground inline-block" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">共 {filtered.length} 筆，第 {page}/{totalPages} 頁</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground flex items-center gap-1.5 pt-2">
        <Info className="h-3.5 w-3.5 shrink-0" />
        風險於開案時識別登記，用於評估專案潛在問題與準備緩解措施
      </p>

      {/* Detail Dialog */}
      <Dialog open={!!selectedRisk} onOpenChange={open => !open && setSelectedRisk(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedRisk && (
            <>
              <DialogHeader className="pb-2">
                <DialogTitle className="text-lg">風險詳情</DialogTitle>
                <DialogDescription className="sr-only">風險項目詳細資訊</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 flex-wrap pb-3">
                <Badge variant="outline" className={cn('text-xs px-2 py-0.5',
                  selectedRisk.status === 'open' ? 'bg-red-100 text-red-700 border-red-300' :
                  selectedRisk.status === 'mitigated' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                  'bg-emerald-100 text-emerald-700 border-emerald-300',
                )}>
                  {STATUS_LABELS[selectedRisk.status]}
                </Badge>
                <Badge className={cn('text-xs px-2 py-0.5', getRiskLevelColor(selectedRisk.impact))}>
                  影響：{IMPACT_LABELS[selectedRisk.impact]}
                </Badge>
                <Badge className={cn('text-xs px-2 py-0.5', getRiskLevelColor(selectedRisk.probability))}>
                  機率：{PROBABILITY_LABELS[selectedRisk.probability]}
                </Badge>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1">
                    <AlertTriangle className={cn('h-3.5 w-3.5',
                      selectedRisk.status === 'closed' ? 'text-muted-foreground' :
                      selectedRisk.impact === 'high' ? 'text-destructive' : 'text-warning'
                    )} />
                    風險名稱
                  </h4>
                  <div className="bg-muted/50 border p-2.5 rounded-lg text-sm font-medium">
                    {selectedRisk.title}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h4 className="text-sm font-semibold mb-1.5">風險描述</h4>
                  <div className="bg-muted/50 border p-2.5 rounded-lg text-sm leading-relaxed">
                    {selectedRisk.description}
                  </div>
                </div>

                {/* Mitigation */}
                {selectedRisk.mitigation && (
                  <div>
                    <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                      緩解措施
                    </h4>
                    <div className="bg-muted/50 border p-2.5 rounded-lg text-sm leading-relaxed">
                      {selectedRisk.mitigation}
                    </div>
                  </div>
                )}

                {/* Status change in dialog */}
                {!readOnly && (
                  <div className="border-t pt-3">
                    <h4 className="text-sm font-semibold mb-2">變更狀態</h4>
                    <div className="flex items-center gap-2">
                      {(['open', 'mitigated', 'closed'] as const).map(s => (
                        <Button
                          key={s}
                          variant={selectedRisk.status === s ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 text-xs px-3"
                          disabled={selectedRisk.status === s || updatingId === selectedRisk.id}
                          onClick={() => handleChangeStatus(selectedRisk, s)}
                        >
                          {updatingId === selectedRisk.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : null}
                          {STATUS_LABELS[s]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
