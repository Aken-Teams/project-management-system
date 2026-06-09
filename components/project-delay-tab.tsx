'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
  ArrowRight,
  AlertTriangle,
  Wrench,
  TimerReset,
  FileText,
  User,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { Project, DelayRequest } from '@/lib/mock-data'

interface Props {
  project: Project
  onRefresh?: () => void
  readOnly?: boolean
}

const PAGE_SIZE = 10

export function ProjectDelayTab({ project, onRefresh, readOnly }: Props) {
  const { user } = useAuth()
  const [subTab, setSubTab] = useState('delays')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'' | 'pending' | 'approved' | 'rejected'>('')
  const [filterResolved, setFilterResolved] = useState<'' | 'resolved' | 'unresolved'>('')
  const [page, setPage] = useState(1)
  const [selectedDr, setSelectedDr] = useState<DelayRequest | null>(null)

  // Resolve support states
  const [resolveTarget, setResolveTarget] = useState<DelayRequest | null>(null)
  const [resolveNotes, setResolveNotes] = useState('')
  const [resolving, setResolving] = useState(false)

  const formatDate = (d: string) => new Date(d).toLocaleDateString('zh-TW')

  // Data sources
  const allDelays = project.delayRequests
  const allSupport = useMemo(() =>
    allDelays.filter(r => r.status === 'approved' && r.supportNeeded && r.supportNeeded.trim() !== ''),
  [allDelays])
  const unresolvedSupportCount = allSupport.filter(r => !r.supportResolved).length

  // Match search
  const match = (r: DelayRequest) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.requestedBy.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q) ||
      (r.taskTitle || '').toLowerCase().includes(q) ||
      r.affectedMilestones.some(am => {
        const ms = project.milestones.find(m => m.id === am.milestoneId)
        return ms?.name.toLowerCase().includes(q)
      })
  }

  // Filtered data per sub-tab
  const filtered = useMemo(() => {
    if (subTab === 'support') {
      let list = allSupport.filter(match)
      if (filterResolved === 'resolved') list = list.filter(r => r.supportResolved)
      if (filterResolved === 'unresolved') list = list.filter(r => !r.supportResolved)
      return list
    }
    let list = allDelays.filter(match)
    if (filterStatus) list = list.filter(r => r.status === filterStatus)
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, allDelays, allSupport, search, filterStatus, filterResolved])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset page on filter change
  const handleTabChange = (v: string) => { setSubTab(v); setPage(1); setSearch(''); setFilterStatus(''); setFilterResolved('') }
  const handleFilterChange = (v: '' | 'pending' | 'approved' | 'rejected') => { setFilterStatus(v); setPage(1) }
  const handleFilterResolved = (v: '' | 'resolved' | 'unresolved') => { setFilterResolved(v); setPage(1) }
  const handleSearchChange = (v: string) => { setSearch(v); setPage(1) }

  const calcDays = (orig: string, proposed: string) =>
    Math.ceil((new Date(proposed).getTime() - new Date(orig).getTime()) / (1000 * 60 * 60 * 24))

  // Resolve support handler
  const handleResolveSupport = async () => {
    if (!user || !resolveTarget) return
    setResolving(true)
    try {
      const res = await fetch(`/api/delay-requests/${resolveTarget.id}/resolve-support`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedById: user.id,
          notes: resolveNotes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '操作失敗')
      }
      setResolveTarget(null)
      setResolveNotes('')
      onRefresh?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失敗')
    } finally {
      setResolving(false)
    }
  }

  return (
    <>
      <Tabs value={subTab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between mb-3">
          <TabsList className="bg-transparent border-b-0 h-auto p-0 gap-0">
            <TabsTrigger value="delays" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-3 py-2 gap-1.5 text-sm">
              <TimerReset className="h-3.5 w-3.5" /> 延遲紀錄
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{allDelays.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="support" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-3 py-2 gap-1.5 text-sm">
              <Wrench className="h-3.5 w-3.5" /> 需要協助
              {unresolvedSupportCount > 0 ? (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px] px-1.5 py-0 ml-0.5">{unresolvedSupportCount}</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{allSupport.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {subTab === 'delays' && (
              <div className="flex items-center gap-1">
                {(['', 'pending', 'approved', 'rejected'] as const).map(s => (
                  <Button key={s} variant={filterStatus === s ? 'default' : 'outline'} size="sm" className="h-8 text-xs px-2.5" onClick={() => handleFilterChange(s)}>
                    {s === '' ? '全部' : s === 'pending' ? '待審核' : s === 'approved' ? '已核准' : '已駁回'}
                  </Button>
                ))}
              </div>
            )}
            {subTab === 'support' && (
              <div className="flex items-center gap-1">
                {(['', 'unresolved', 'resolved'] as const).map(s => (
                  <Button key={s} variant={filterResolved === s ? 'default' : 'outline'} size="sm" className="h-8 text-xs px-2.5" onClick={() => handleFilterResolved(s)}>
                    {s === '' ? '全部' : s === 'unresolved' ? '待處理' : '已解決'}
                  </Button>
                ))}
              </div>
            )}
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="搜尋..." value={search} onChange={e => handleSearchChange(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>
          </div>
        </div>

        {/* Sub-tab: 延遲紀錄 */}
        <TabsContent value="delays" className="mt-0">
          {renderTable(paged, filtered.length, 'delay')}
        </TabsContent>

        {/* Sub-tab: 需要協助 */}
        <TabsContent value="support" className="mt-0">
          {renderTable(paged, filtered.length, 'support')}
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">共 {filtered.length} 筆，第 {page}/{totalPages} 頁</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedDr} onOpenChange={open => !open && setSelectedDr(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedDr && renderDetail(selectedDr)}
        </DialogContent>
      </Dialog>

      {/* Resolve Support Dialog */}
      <Dialog open={!!resolveTarget} onOpenChange={open => { if (!open) { setResolveTarget(null); setResolveNotes('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>標記協助已解決</DialogTitle>
            <DialogDescription>確認此協助需求已處理完成</DialogDescription>
          </DialogHeader>
          {resolveTarget && (
            <div className="space-y-4">
              <div className="bg-muted/50 border p-3 rounded-lg text-sm">
                <div className="text-xs text-muted-foreground mb-1">需要的協助</div>
                <p>{resolveTarget.supportNeeded}</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">解決備註（選填）</label>
                <Textarea
                  placeholder="描述如何解決..."
                  value={resolveNotes}
                  onChange={e => setResolveNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setResolveTarget(null); setResolveNotes('') }}>取消</Button>
                <Button onClick={handleResolveSupport} disabled={resolving} className="gap-1.5">
                  {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  確認已解決
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )

  function renderTable(items: DelayRequest[], total: number, mode: 'delay' | 'support') {
    if (total === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-400" />
            <p className="text-sm">
              {mode === 'delay'
                ? (allDelays.length === 0 ? '沒有延遲紀錄' : '無符合條件的結果')
                : (allSupport.length === 0 ? '沒有待處理的協助' : '無符合條件的結果')
              }
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  {mode === 'delay' ? (
                    <>
                      <th className="text-left px-4 py-2.5 font-medium">狀態</th>
                      <th className="text-left px-4 py-2.5 font-medium">申請人</th>
                      <th className="text-left px-4 py-2.5 font-medium">原因</th>
                      <th className="text-left px-4 py-2.5 font-medium">受影響里程碑</th>
                      <th className="text-center px-4 py-2.5 font-medium">延遲天數</th>
                      <th className="text-left px-4 py-2.5 font-medium">申請時間</th>
                      <th className="text-right px-4 py-2.5 font-medium"></th>
                    </>
                  ) : (
                    <>
                      <th className="text-left px-4 py-2.5 font-medium">狀態</th>
                      <th className="text-left px-4 py-2.5 font-medium">申請人</th>
                      <th className="text-left px-4 py-2.5 font-medium">需要的協助</th>
                      <th className="text-left px-4 py-2.5 font-medium">受影響里程碑</th>
                      <th className="text-left px-4 py-2.5 font-medium">核准時間</th>
                      {!readOnly && <th className="text-center px-4 py-2.5 font-medium">操作</th>}
                      <th className="text-right px-4 py-2.5 font-medium"></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => {
                  const maxDays = Math.max(...r.affectedMilestones.map(am => calcDays(am.originalDate, am.proposedDate)), 0)
                  const msNames = r.affectedMilestones
                    .map(am => project.milestones.find(m => m.id === am.milestoneId)?.name || am.milestoneId)
                    .join('、')

                  return (
                    <tr
                      key={r.id}
                      className={cn('cursor-pointer hover:bg-muted/50 transition-colors text-sm', i % 2 !== 0 && 'bg-muted/20')}
                      onClick={() => setSelectedDr(r)}
                    >
                      {mode === 'delay' ? (
                        <>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0',
                              r.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                              r.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                              'bg-red-100 text-red-700 border-red-300',
                            )}>
                              {r.status === 'pending' ? '待審核' : r.status === 'approved' ? '已核准' : '已駁回'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{r.requestedBy}</td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <span className="line-clamp-1">{r.reason}</span>
                          </td>
                          <td className="px-4 py-3 max-w-[160px]">
                            <span className="line-clamp-1 text-muted-foreground">{msNames}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                              +{maxDays}天
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(r.requestedAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0',
                              r.supportResolved
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                : 'bg-amber-100 text-amber-700 border-amber-300',
                            )}>
                              {r.supportResolved ? '已解決' : '待處理'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{r.requestedBy}</td>
                          <td className="px-4 py-3 max-w-[220px]">
                            <span className="line-clamp-2">{r.supportNeeded}</span>
                          </td>
                          <td className="px-4 py-3 max-w-[160px]">
                            <span className="line-clamp-1 text-muted-foreground">{msNames}</span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.reviewedAt ? formatDate(r.reviewedAt) : '-'}
                          </td>
                          {!readOnly && (
                            <td className="px-4 py-3 text-center">
                              {!r.supportResolved ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2 gap-1"
                                  onClick={(e) => { e.stopPropagation(); setResolveTarget(r) }}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> 標記已解決
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    )
  }

  function renderDetail(r: DelayRequest) {
    return (
      <>
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">延遲申請詳情</DialogTitle>
          <DialogDescription className="sr-only">延遲申請詳細資訊</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 flex-wrap pb-3">
          <Badge variant="outline" className={cn('text-xs px-2 py-0.5',
            r.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-300' :
            r.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
            'bg-red-100 text-red-700 border-red-300',
          )}>
            {r.status === 'pending' ? '待審核' : r.status === 'approved' ? '已核准' : '已駁回'}
          </Badge>
          {r.taskTitle && (
            <span className="text-sm text-muted-foreground">任務：{r.taskTitle}</span>
          )}
        </div>

        <div className="space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><User className="h-3 w-3" /> 申請人</div>
              <div className="text-sm font-medium">{r.requestedBy}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> 申請時間</div>
              <div className="text-sm font-medium">{formatDate(r.requestedAt)}</div>
            </div>
          </div>

          {/* Reason */}
          <div>
            <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> 延遲原因
            </h4>
            <div className="bg-muted/50 border p-2.5 rounded-lg text-sm leading-relaxed">{r.reason}</div>
          </div>

          {/* Affected milestones */}
          {r.affectedMilestones.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> 受影響里程碑
              </h4>
              <div className="space-y-1.5">
                {r.affectedMilestones.map(am => {
                  const ms = project.milestones.find(m => m.id === am.milestoneId)
                  const days = calcDays(am.originalDate, am.proposedDate)
                  return (
                    <div key={am.milestoneId} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">{ms?.name || am.milestoneId}</span>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground line-through">{formatDate(am.originalDate)}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-medium text-amber-600">{formatDate(am.proposedDate)}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{days >= 0 ? '+' : ''}{days}天</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Affected tasks / subtasks */}
          {r.pendingTaskChanges && r.pendingTaskChanges.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> 任務 / 子任務變更
              </h4>
              <div className="space-y-1.5">
                {r.pendingTaskChanges.map(tc => {
                  // 找原值（頂層任務或子任務），顯示「原 → 新」
                  const orig: { durationDays?: number; startDate?: string } =
                    project.tasks.find(t => t.id === tc.taskId)
                    || (project.tasks.flatMap(t => t.subtasks ?? []).find(s => s.id === tc.taskId) as { durationDays?: number; startDate?: string } | undefined)
                    || {}
                  return (
                    <div key={tc.taskId} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium truncate">{tc.taskTitle}</span>
                      <div className="flex items-center gap-2 text-xs whitespace-nowrap tabular-nums">
                        {tc.durationDays !== undefined && (
                          <span>天數 {orig.durationDays !== undefined && (<><span className="text-muted-foreground line-through">{orig.durationDays}</span> → </>)}<span className="font-medium text-amber-600">{tc.durationDays}</span></span>
                        )}
                        {tc.startDate && orig.startDate !== tc.startDate && (
                          <span>起 {orig.startDate && (<><span className="text-muted-foreground line-through">{formatDate(orig.startDate)}</span> → </>)}<span className="font-medium text-amber-600">{formatDate(tc.startDate)}</span></span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Support needed */}
          {r.supportNeeded && r.supportNeeded.trim() !== '' && (
            <div>
              <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5 text-amber-500" /> 需要的協助
              </h4>
              <div className="bg-muted/50 border p-2.5 rounded-lg text-sm">{r.supportNeeded}</div>
              {r.supportResolved && (
                <div className="mt-1.5 flex items-center gap-2 p-2 rounded-lg border bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">已解決</span>
                    {r.supportResolvedBy && <span className="text-muted-foreground"> · {r.supportResolvedBy}</span>}
                    {r.supportResolvedNotes && <span className="text-muted-foreground"> · {r.supportResolvedNotes}</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Review result */}
          {r.reviewedBy && (
            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> 審核結果
              </h4>
              <div className="p-2.5 rounded-lg bg-muted/50 border text-sm">
                <span className="text-muted-foreground">{r.reviewedBy}</span>
                {r.reviewedAt && <span className="text-muted-foreground"> · {formatDate(r.reviewedAt)}</span>}
                {r.reviewNotes && <p className="mt-1">{r.reviewNotes}</p>}
              </div>
            </div>
          )}
        </div>
      </>
    )
  }
}
