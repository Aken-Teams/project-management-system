'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { PROJECT_TIER_LABELS, type ProjectTier } from '@/lib/mock-data'
import { useProjectTypes } from '@/hooks/use-project-types'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  AlertTriangle,
  User,
  FileText,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Wrench,
  Filter,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AffectedMilestone {
  milestoneId: string
  milestoneName: string
  originalDate: string
  proposedDate: string
}

interface ReviewerStatus {
  id: string
  name: string
  action: string | null
  notes: string | null
  createdAt: string | null
}

interface DelayRequestItem {
  id: string
  projectId: string
  project: {
    id: string
    name: string
    projectCode: string
    projectType: string
    projectTier: string | null
    ownerName: string
  }
  requestedBy: string
  requestedAt: string
  reason: string
  type?: 'delay' | 'date_change'
  canCatchUp: boolean
  supportNeeded: string
  status: 'pending' | 'approved' | 'rejected'
  affectedMilestones: AffectedMilestone[]
  taskId?: string
  taskTitle?: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
  supportResolved?: boolean
  supportResolvedAt?: string
  supportResolvedBy?: string
  supportResolvedNotes?: string
  requiredReviewers?: number
  approvedCount?: number
  reviewers?: ReviewerStatus[]
}

// Track which tab was used to open the detail dialog
type DetailSource = 'pending' | 'support' | 'history'

export default function ApprovalsPage() {
  const { user } = useAuth()
  const { typeLabels } = useProjectTypes()

  const [allRequests, setAllRequests] = useState<DelayRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<DelayRequestItem | null>(null)
  const [detailSource, setDetailSource] = useState<DetailSource>('pending')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSupportForm, setShowSupportForm] = useState(false)
  const [supportNotes, setSupportNotes] = useState('')
  const [activeTab, setActiveTab] = useState('pending')

  // Search & filter states (shared across tabs)
  const [searchPending, setSearchPending] = useState('')
  const [searchSupport, setSearchSupport] = useState('')
  const [searchHistory, setSearchHistory] = useState('')
  const [filterType, setFilterType] = useState<'' | 'delay' | 'date_change'>('')
  const [filterResult, setFilterResult] = useState<'' | 'approved' | 'rejected'>('')
  // Advanced filter states
  const [filterTier, setFilterTier] = useState('')
  const [filterProjectType, setFilterProjectType] = useState('')
  const [filterRequester, setFilterRequester] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Pagination states
  const PAGE_SIZE = 10
  const [pagePending, setPagePending] = useState(1)
  const [pageSupport, setPageSupport] = useState(1)
  const [pageHistory, setPageHistory] = useState(1)

  const fetchRequests = useCallback(async () => {
    try {
      const params = user?.role !== 'admin' && user?.email
        ? `?memberEmail=${encodeURIComponent(user.email)}`
        : ''
      const res = await fetch(`/api/delay-requests${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAllRequests(data.delayRequests || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [user?.role, user?.email])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const pendingAll = useMemo(() => allRequests.filter(r => r.status === 'pending'), [allRequests])
  const supportAll = useMemo(() => allRequests.filter(r =>
    r.status === 'approved' && r.supportNeeded && r.supportNeeded.trim() !== '' && !r.supportResolved
  ), [allRequests])
  const historyAll = useMemo(() => allRequests.filter(r => r.status === 'approved' || r.status === 'rejected'), [allRequests])

  // Extract unique values for filter dropdowns
  const uniqueValues = useMemo(() => {
    const tiers = new Set<string>()
    const types = new Set<string>()
    const requesters = new Set<string>()
    const owners = new Set<string>()
    for (const r of allRequests) {
      if (r.project.projectTier) tiers.add(r.project.projectTier)
      if (r.project.projectType) types.add(r.project.projectType)
      requesters.add(r.requestedBy)
      if (r.project.ownerName) owners.add(r.project.ownerName)
    }
    return {
      tiers: [...tiers].sort(),
      types: [...types].sort(),
      requesters: [...requesters].sort(),
      owners: [...owners].sort(),
    }
  }, [allRequests])

  // Count active advanced filters
  const activeFilterCount = [filterTier, filterProjectType, filterRequester, filterOwner, filterDateFrom, filterDateTo].filter(Boolean).length

  // Filtered lists
  const matchSearch = (r: DelayRequestItem, q: string) => {
    if (!q) return true
    const lower = q.toLowerCase()
    return r.project.name.toLowerCase().includes(lower) ||
      r.project.projectCode.toLowerCase().includes(lower) ||
      r.requestedBy.toLowerCase().includes(lower) ||
      r.project.ownerName.toLowerCase().includes(lower)
  }

  const matchAdvancedFilters = (r: DelayRequestItem) => {
    if (filterTier && r.project.projectTier !== filterTier) return false
    if (filterProjectType && r.project.projectType !== filterProjectType) return false
    if (filterRequester && r.requestedBy !== filterRequester) return false
    if (filterOwner && r.project.ownerName !== filterOwner) return false
    if (filterDateFrom && r.requestedAt < filterDateFrom) return false
    if (filterDateTo && r.requestedAt.split('T')[0] > filterDateTo) return false
    return true
  }

  const filteredPending = useMemo(() => {
    let list = pendingAll.filter(r => matchSearch(r, searchPending) && matchAdvancedFilters(r))
    if (filterType) list = list.filter(r => (r.type || 'delay') === filterType)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAll, searchPending, filterType, filterTier, filterProjectType, filterRequester, filterOwner, filterDateFrom, filterDateTo])

  const filteredSupport = useMemo(() =>
    supportAll.filter(r => matchSearch(r, searchSupport) && matchAdvancedFilters(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  [supportAll, searchSupport, filterTier, filterProjectType, filterRequester, filterOwner, filterDateFrom, filterDateTo])

  const filteredHistory = useMemo(() => {
    let list = historyAll.filter(r => matchSearch(r, searchHistory) && matchAdvancedFilters(r))
    if (filterResult) list = list.filter(r => r.status === filterResult)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyAll, searchHistory, filterResult, filterTier, filterProjectType, filterRequester, filterOwner, filterDateFrom, filterDateTo])

  // Paginated slices
  const pagedPending = filteredPending.slice((pagePending - 1) * PAGE_SIZE, pagePending * PAGE_SIZE)
  const pagedSupport = filteredSupport.slice((pageSupport - 1) * PAGE_SIZE, pageSupport * PAGE_SIZE)
  const pagedHistory = filteredHistory.slice((pageHistory - 1) * PAGE_SIZE, pageHistory * PAGE_SIZE)

  const totalPagesPending = Math.max(1, Math.ceil(filteredPending.length / PAGE_SIZE))
  const totalPagesSupport = Math.max(1, Math.ceil(filteredSupport.length / PAGE_SIZE))
  const totalPagesHistory = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE))

  // Reset page when filters change
  useEffect(() => { setPagePending(1) }, [searchPending, filterType, filterTier, filterProjectType, filterRequester, filterOwner, filterDateFrom, filterDateTo])
  useEffect(() => { setPageSupport(1) }, [searchSupport, filterTier, filterProjectType, filterRequester, filterOwner, filterDateFrom, filterDateTo])
  useEffect(() => { setPageHistory(1) }, [searchHistory, filterResult, filterTier, filterProjectType, filterRequester, filterOwner, filterDateFrom, filterDateTo])

  const calculateDelayDays = (originalDate: string, proposedDate: string): number => {
    const original = new Date(originalDate)
    const proposed = new Date(proposedDate)
    return Math.ceil((proposed.getTime() - original.getTime()) / (1000 * 60 * 60 * 24))
  }

  const getMaxDelayDays = (request: DelayRequestItem): number => {
    return Math.max(...request.affectedMilestones.map(am => calculateDelayDays(am.originalDate, am.proposedDate)), 0)
  }

  const openDetail = (item: DelayRequestItem, source: DetailSource) => {
    setSelectedItem(item)
    setDetailSource(source)
    setSheetOpen(true)
    setShowReviewForm(false)
    setReviewAction(null)
    setReviewNotes('')
    setShowSupportForm(false)
    setSupportNotes('')
  }

  const handleStartReview = (action: 'approve' | 'reject') => {
    setReviewAction(action)
    setShowReviewForm(true)
    setReviewNotes('')
  }

  const handleConfirmReview = async () => {
    if (!user || !reviewAction || !selectedItem) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/delay-requests/${selectedItem.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: reviewAction,
          reviewerId: user.id,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '審核失敗')
      }

      setSheetOpen(false)
      setSelectedItem(null)
      setShowReviewForm(false)
      setReviewAction(null)
      setReviewNotes('')

      await fetchRequests()
    } catch (err) {
      alert(err instanceof Error ? err.message : '審核失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResolveSupport = async () => {
    if (!user || !selectedItem) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/delay-requests/${selectedItem.id}/resolve-support`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedById: user.id,
          notes: supportNotes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '操作失敗')
      }
      setSheetOpen(false)
      setSelectedItem(null)
      setShowSupportForm(false)
      setSupportNotes('')
      await fetchRequests()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('zh-TW')

  const clearAdvancedFilters = () => {
    setFilterTier('')
    setFilterProjectType('')
    setFilterRequester('')
    setFilterOwner('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </DashboardLayout>
    )
  }

  // ── Filter bar component (shared across tabs) ──
  const FilterBar = ({ search, setSearch, children }: { search: string; setSearch: (v: string) => void; children?: React.ReactNode }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 justify-end flex-wrap">
        {children}
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          className="h-9 text-xs gap-1.5"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-3.5 w-3.5" />
          篩選
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5 bg-primary-foreground text-primary">{activeFilterCount}</Badge>
          )}
        </Button>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋專案、申請人、負責人..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>
      {showFilters && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">層級</label>
                <Select value={filterTier || '__all__'} onValueChange={v => setFilterTier(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="全部" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">全部</SelectItem>
                    {uniqueValues.tiers.map(t => (
                      <SelectItem key={t} value={t}>{PROJECT_TIER_LABELS[t as ProjectTier] || t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">專案種類</label>
                <Select value={filterProjectType || '__all__'} onValueChange={v => setFilterProjectType(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="全部" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">全部</SelectItem>
                    {uniqueValues.types.map(t => (
                      <SelectItem key={t} value={t}>{typeLabels[t] || t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">專案負責人</label>
                <Select value={filterOwner || '__all__'} onValueChange={v => setFilterOwner(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="全部" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">全部</SelectItem>
                    {uniqueValues.owners.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">申請人</label>
                <Select value={filterRequester || '__all__'} onValueChange={v => setFilterRequester(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="全部" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">全部</SelectItem>
                    {uniqueValues.requesters.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">日期（從）</label>
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-9 text-xs [&::-webkit-calendar-picker-indicator]:order-1 [&::-webkit-calendar-picker-indicator]:ml-auto" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">日期（到）</label>
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-9 text-xs [&::-webkit-calendar-picker-indicator]:order-1 [&::-webkit-calendar-picker-indicator]:ml-auto" />
              </div>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex justify-end mt-3">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={clearAdvancedFilters}>
                  <X className="h-3 w-3" /> 清除篩選
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )

  // ── Pagination component ──
  const Pagination = ({ total, filtered, page, totalPages, setPage }: {
    total: number; filtered: number; page: number; totalPages: number; setPage: (fn: (p: number) => number) => void
  }) => totalPages > 1 ? (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-muted-foreground">共 {filtered} 筆，第 {page}/{totalPages} 頁</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  ) : null

  // ── Detail Dialog: Support-focused view ──
  const renderSupportDetail = (request: DelayRequestItem) => (
    <>
      <DialogHeader className="pb-2">
        <DialogTitle className="text-xl">協助需求</DialogTitle>
        <DialogDescription className="sr-only">協助處理詳情</DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2.5 flex-wrap pb-3">
        <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5">{request.project.projectCode}</Badge>
        {request.supportResolved ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs px-2.5 py-0.5">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 協助已完成
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs px-2.5 py-0.5">
            <Clock className="h-3.5 w-3.5 mr-1" /> 待協助
          </Badge>
        )}
      </div>

      <div className="space-y-5">
        {/* Primary: support content */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-amber-500" /> 需要的協助
          </h4>
          <div className="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-800 p-4 rounded-lg text-sm leading-relaxed">
            {request.supportNeeded}
          </div>
        </div>

        {/* Project & requester info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">專案名稱</div>
            <div className="text-sm font-medium">{request.project.name}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">專案負責人</div>
            <div className="text-sm font-medium">{request.project.ownerName}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><User className="h-3.5 w-3.5" /> 申請人</div>
            <div className="text-sm font-medium">{request.requestedBy}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> 申請時間</div>
            <div className="text-sm font-medium">{formatDate(request.requestedAt)}</div>
          </div>
        </div>

        {/* Brief delay context (collapsed) */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">延期申請摘要</h4>
          <div className="p-3 rounded-lg bg-muted/30 border text-sm text-muted-foreground space-y-2">
            <div><span className="font-medium text-foreground">延遲原因：</span>{request.reason}</div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">能否追回：</span>
              {request.canCatchUp ? (
                <span className="text-emerald-600 font-medium">可以追回</span>
              ) : (
                <span className="text-red-600 font-medium">無法追回</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {request.affectedMilestones.map(am => {
                const days = calculateDelayDays(am.originalDate, am.proposedDate)
                return (
                  <Badge key={am.milestoneId} variant="outline" className="text-xs font-normal">
                    {am.milestoneName} <span className="ml-1 text-destructive">+{days}天</span>
                  </Badge>
                )
              })}
            </div>
          </div>
        </div>

        {/* Support resolution action */}
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-amber-500" /> 處理狀態
          </h4>
          {request.supportResolved ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">已解決</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {request.supportResolvedBy && <span>{request.supportResolvedBy}</span>}
                    {request.supportResolvedAt && <span> · {formatDate(request.supportResolvedAt)}</span>}
                  </div>
                </div>
              </div>
              {request.supportResolvedNotes && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="text-xs text-muted-foreground mb-1">處理備註</div>
                  <div className="text-sm">{request.supportResolvedNotes}</div>
                </div>
              )}
            </div>
          ) : (() => {
            const canResolve = user?.role === 'admin' || user?.role === 'executive'
            if (!canResolve) {
              return (
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-amber-50/50 border-amber-200 dark:bg-amber-950/10 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
                  <Clock className="h-4 w-4 shrink-0" />
                  等待主管處理中
                </div>
              )
            }
            return showSupportForm ? (
              <div className="space-y-3">
                <Textarea
                  placeholder="處理備註（選填）..."
                  value={supportNotes}
                  onChange={(e) => setSupportNotes(e.target.value)}
                  rows={3}
                />
                <div className="flex items-center justify-end gap-3">
                  <Button variant="ghost" onClick={() => setShowSupportForm(false)} disabled={submitting}>取消</Button>
                  <Button onClick={handleResolveSupport} disabled={submitting} className="gap-1.5">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    確認已解決
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="default" className="gap-1.5 w-full" onClick={() => setShowSupportForm(true)}>
                <CheckCircle2 className="h-4 w-4" /> 標記協助已解決
              </Button>
            )
          })()}
        </div>
      </div>
    </>
  )

  // ── Detail Dialog: Standard review view ──
  const renderStandardDetail = (request: DelayRequestItem) => {
    const isPending = request.status === 'pending'
    return (
      <>
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl">{request.project.name}</DialogTitle>
          <DialogDescription className="sr-only">
            {request.type === 'date_change' ? '日期變更申請詳情' : '延遲申請詳情'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2.5 flex-wrap pb-3">
          <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5">{request.project.projectCode}</Badge>
          <Badge variant="outline" className={cn(
            'text-xs px-2.5 py-0.5',
            request.type === 'date_change'
              ? 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400'
              : 'border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400',
          )}>
            {request.type === 'date_change' ? '日期變更' : '延遲申請'}
          </Badge>
          {isPending ? (
            <Badge variant="secondary" className="bg-warning/15 text-warning border-warning/30 text-xs px-2.5 py-0.5">
              <Clock className="h-3.5 w-3.5 mr-1" /> 待審核
            </Badge>
          ) : request.status === 'approved' ? (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs px-2.5 py-0.5">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 延期已核准
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs px-2.5 py-0.5">
              <XCircle className="h-3.5 w-3.5 mr-1" /> 已駁回
            </Badge>
          )}
          {request.status === 'approved' && request.supportNeeded && request.supportNeeded.trim() !== '' && (
            request.supportResolved ? (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs px-2.5 py-0.5">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 協助已完成
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs px-2.5 py-0.5">
                <Clock className="h-3.5 w-3.5 mr-1" /> 待協助
              </Badge>
            )
          )}
        </div>

        <div className="space-y-5">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><User className="h-3.5 w-3.5" /> 申請人</div>
              <div className="text-sm font-medium">{request.requestedBy}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> 申請時間</div>
              <div className="text-sm font-medium">{formatDate(request.requestedAt)}</div>
            </div>
          </div>

          {/* Delay reason */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              {request.type === 'date_change' ? (
                <><Calendar className="h-4 w-4 text-blue-500" /> 變更原因</>
              ) : (
                <><AlertTriangle className="h-4 w-4 text-warning" /> 延遲原因</>
              )}
            </h4>
            <div className="bg-muted/50 border p-3 rounded-lg text-sm leading-relaxed">
              {request.reason}
            </div>
          </div>

          {/* Trigger task */}
          {request.taskId && request.taskTitle && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-muted-foreground" /> 延期任務
              </h4>
              <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800">
                <div className="font-medium text-sm">{request.taskTitle}</div>
              </div>
            </div>
          )}

          {/* Affected milestones */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" /> 受影響里程碑
            </h4>
            <div className="space-y-2">
              {request.affectedMilestones.map(am => {
                const delayDays = calculateDelayDays(am.originalDate, am.proposedDate)
                return (
                  <div key={am.milestoneId} className="flex items-center gap-2 p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{am.milestoneName}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                        {formatDate(am.originalDate)}
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                        {formatDate(am.proposedDate)}
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-xs shrink-0">
                      {delayDays >= 0 ? '+' : ''}{delayDays} 天
                    </Badge>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Can catch up + support needed */}
          {request.type !== 'date_change' && (
            <div className="grid grid-cols-2 gap-3 items-stretch">
              <div className="flex flex-col">
                <h4 className="text-sm font-semibold mb-2">能否追回</h4>
                <div className={cn(
                  'flex items-center gap-1.5 p-3 rounded-lg border text-sm font-medium flex-1',
                  request.canCatchUp
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300',
                )}>
                  {request.canCatchUp ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                  {request.canCatchUp ? '可以追回' : '無法追回'}
                </div>
              </div>
              <div className="flex flex-col">
                <h4 className="text-sm font-semibold mb-2">需要支援</h4>
                <div className="p-3 rounded-lg border bg-muted/50 text-sm leading-relaxed flex-1">
                  {request.supportNeeded || '無'}
                </div>
              </div>
            </div>
          )}

          {/* Review result */}
          {!isPending && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold">審核結果</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-1">審核人</div>
                  <div className="text-sm font-medium">{request.reviewedBy || '-'}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-1">審核時間</div>
                  <div className="text-sm font-medium">{request.reviewedAt ? formatDate(request.reviewedAt) : '-'}</div>
                </div>
              </div>
              {request.reviewNotes && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="text-xs text-muted-foreground mb-1">審核意見</div>
                  <div className="text-sm">{request.reviewNotes}</div>
                </div>
              )}
            </div>
          )}

          {/* Support resolution (for approved with supportNeeded) */}
          {request.status === 'approved' && request.supportNeeded && request.supportNeeded.trim() !== '' && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-amber-500" /> 協助處理狀態
              </h4>
              <div className="p-3 rounded-lg border bg-muted/50 text-sm leading-relaxed">
                <div className="text-xs text-muted-foreground mb-1">需要的協助</div>
                {request.supportNeeded}
              </div>
              {request.supportResolved ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">已解決</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {request.supportResolvedBy && <span>{request.supportResolvedBy}</span>}
                        {request.supportResolvedAt && <span> · {formatDate(request.supportResolvedAt)}</span>}
                      </div>
                    </div>
                  </div>
                  {request.supportResolvedNotes && (
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <div className="text-xs text-muted-foreground mb-1">處理備註</div>
                      <div className="text-sm">{request.supportResolvedNotes}</div>
                    </div>
                  )}
                </div>
              ) : (() => {
                const canResolve = user?.role === 'admin' || user?.role === 'executive'
                if (!canResolve) {
                  return (
                    <div className="flex items-center gap-2 p-3 rounded-lg border bg-amber-50/50 border-amber-200 dark:bg-amber-950/10 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
                      <Clock className="h-4 w-4 shrink-0" />
                      等待主管處理中
                    </div>
                  )
                }
                return showSupportForm ? (
                  <div className="space-y-3">
                    <Textarea
                      placeholder="處理備註（選填）..."
                      value={supportNotes}
                      onChange={(e) => setSupportNotes(e.target.value)}
                      rows={3}
                    />
                    <div className="flex items-center justify-end gap-3">
                      <Button variant="ghost" onClick={() => setShowSupportForm(false)} disabled={submitting}>取消</Button>
                      <Button onClick={handleResolveSupport} disabled={submitting} className="gap-1.5">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        確認已解決
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="default" className="gap-1.5 w-full" onClick={() => setShowSupportForm(true)}>
                    <CheckCircle2 className="h-4 w-4" /> 標記協助已解決
                  </Button>
                )
              })()}
            </div>
          )}

          {/* Multi-review progress */}
          {request.reviewers && request.reviewers.length > 0 && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <User className="h-4 w-4 text-muted-foreground" />
                審核進度
                {(request.requiredReviewers ?? 0) > 0 && (
                  <Badge variant="outline" className="text-xs ml-1">
                    {request.approvedCount ?? 0}/{request.requiredReviewers} 已核准
                  </Badge>
                )}
              </h4>
              <div className="space-y-2">
                {request.reviewers.map(r => (
                  <div key={r.id} className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border',
                    r.action === 'approve'
                      ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-800'
                      : r.action === 'reject'
                      ? 'bg-red-50/50 border-red-200 dark:bg-red-950/10 dark:border-red-800'
                      : 'bg-muted/30 border-muted',
                  )}>
                    {r.action === 'approve' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : r.action === 'reject' ? (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{r.name}</div>
                      {r.notes && <div className="text-xs text-muted-foreground mt-0.5">{r.notes}</div>}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {r.action ? formatDate(r.createdAt!) : '待審核'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review actions (for pending, S-role only) */}
          {isPending && (() => {
            const isAdmin = user?.role === 'admin'
            const isSRole = request.reviewers?.some(r => r.id === user?.id)
            const alreadyReviewed = request.reviewers?.some(r => r.id === user?.id && r.action != null)

            if (!isAdmin && !isSRole) return null

            return (
              <div className="border-t pt-4">
                {alreadyReviewed ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    您已完成審核，等待其他審核者
                  </div>
                ) : showReviewForm ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      {reviewAction === 'approve' ? (
                        <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> 確認核准</span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" /> 確認駁回</span>
                      )}
                    </h4>
                    <Textarea
                      placeholder="請輸入審核意見（選填）..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      rows={3}
                    />
                    <div className="flex items-center justify-end gap-3 pt-1">
                      <Button variant="ghost" onClick={() => setShowReviewForm(false)} disabled={submitting}>取消</Button>
                      <Button
                        variant={reviewAction === 'approve' ? 'default' : 'destructive'}
                        onClick={handleConfirmReview}
                        disabled={submitting}
                        className="gap-1.5 min-w-[120px]"
                      >
                        {submitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : reviewAction === 'approve' ? (
                          <><CheckCircle2 className="h-4 w-4" /> 確認核准</>
                        ) : (
                          <><XCircle className="h-4 w-4" /> 確認駁回</>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button className="gap-1.5 flex-1" onClick={() => handleStartReview('approve')}>
                      <CheckCircle2 className="h-4 w-4" /> 核准
                    </Button>
                    <Button variant="destructive" className="gap-1.5 flex-1" onClick={() => handleStartReview('reject')}>
                      <XCircle className="h-4 w-4" /> 駁回
                    </Button>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">審核中心</h1>
            <p className="text-sm text-muted-foreground mt-1">審核專案延遲申請與日期變更</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0">
            <TabsTrigger value="pending" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-4 py-2.5 gap-1.5">
              <AlertTriangle className="h-4 w-4" /> 待審核
              {pendingAll.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">{pendingAll.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="support" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-4 py-2.5 gap-1.5">
              <Wrench className="h-4 w-4" /> 待處理協助
              {supportAll.length > 0 && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px] px-1.5 py-0 ml-1">{supportAll.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-4 py-2.5 gap-1.5">
              <FileText className="h-4 w-4" /> 已審核紀錄
            </TabsTrigger>
          </TabsList>

          {/* Tab: 待審核 */}
          <TabsContent value="pending" className="mt-4 space-y-3">
            <FilterBar search={searchPending} setSearch={setSearchPending}>
              <div className="flex items-center gap-1">
                {(['', 'delay', 'date_change'] as const).map(t => (
                  <Button key={t} variant={filterType === t ? 'default' : 'outline'} size="sm" className="h-9 text-xs" onClick={() => setFilterType(t)}>
                    {t === '' ? '全部' : t === 'delay' ? '延遲申請' : '日期變更'}
                  </Button>
                ))}
              </div>
            </FilterBar>
            {filteredPending.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-400" />
                  <p className="text-sm">{pendingAll.length === 0 ? '沒有待審核的申請' : '無符合條件的結果'}</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50 text-sm text-muted-foreground">
                          <th className="text-left px-4 py-3 font-medium">專案</th>
                          <th className="text-left px-4 py-3 font-medium">類型</th>
                          <th className="text-left px-4 py-3 font-medium">申請人</th>
                          <th className="text-left px-4 py-3 font-medium">申請時間</th>
                          <th className="text-center px-4 py-3 font-medium">影響里程碑</th>
                          <th className="text-center px-4 py-3 font-medium">最大延遲</th>
                          <th className="text-center px-4 py-3 font-medium">審核進度</th>
                          <th className="text-right px-4 py-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedPending.map((request, i) => {
                          const maxDays = getMaxDelayDays(request)
                          return (
                            <tr
                              key={request.id}
                              className={cn(
                                'cursor-pointer hover:bg-muted/50 transition-colors',
                                i % 2 !== 0 && 'bg-muted/20',
                              )}
                              onClick={() => openDetail(request, 'pending')}
                            >
                              <td className="px-4 py-3.5">
                                <div className="font-semibold text-base">{request.project.name}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{request.project.projectCode}</div>
                              </td>
                              <td className="px-4 py-3.5">
                                <Badge variant="outline" className={cn(
                                  'text-xs',
                                  request.type === 'date_change'
                                    ? 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400'
                                    : 'border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400',
                                )}>
                                  {request.type === 'date_change' ? '日期變更' : '延遲申請'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3.5 text-sm">{request.requestedBy}</td>
                              <td className="px-4 py-3.5 text-sm text-muted-foreground">{formatDate(request.requestedAt)}</td>
                              <td className="px-4 py-3.5 text-center">
                                <Badge variant="outline" className="text-xs">{request.affectedMilestones.length} 個</Badge>
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                                  +{maxDays} 天
                                </Badge>
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                {(request.requiredReviewers ?? 0) > 0 ? (
                                  <Badge variant="outline" className="text-xs">
                                    {request.approvedCount ?? 0}/{request.requiredReviewers} 已核准
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <Pagination total={pendingAll.length} filtered={filteredPending.length} page={pagePending} totalPages={totalPagesPending} setPage={setPagePending} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: 待處理協助 */}
          <TabsContent value="support" className="mt-4 space-y-3">
            <FilterBar search={searchSupport} setSearch={setSearchSupport} />
            {filteredSupport.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-400" />
                  <p className="text-sm">{supportAll.length === 0 ? '沒有待處理的協助需求' : '無符合條件的結果'}</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50 text-sm text-muted-foreground">
                          <th className="text-left px-4 py-3 font-medium">專案</th>
                          <th className="text-left px-4 py-3 font-medium">申請人</th>
                          <th className="text-left px-4 py-3 font-medium">需要的協助</th>
                          <th className="text-left px-4 py-3 font-medium">專案負責人</th>
                          <th className="text-left px-4 py-3 font-medium">核准時間</th>
                          <th className="text-right px-4 py-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedSupport.map((request, i) => (
                          <tr
                            key={request.id}
                            className={cn(
                              'cursor-pointer hover:bg-muted/50 transition-colors',
                              i % 2 !== 0 && 'bg-muted/20',
                            )}
                            onClick={() => openDetail(request, 'support')}
                          >
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-base">{request.project.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{request.project.projectCode}</div>
                            </td>
                            <td className="px-4 py-3.5 text-sm">{request.requestedBy}</td>
                            <td className="px-4 py-3.5 text-sm max-w-[300px]">
                              <span className="line-clamp-2">{request.supportNeeded}</span>
                            </td>
                            <td className="px-4 py-3.5 text-sm">{request.project.ownerName}</td>
                            <td className="px-4 py-3.5 text-sm text-muted-foreground">
                              {request.reviewedAt ? formatDate(request.reviewedAt) : '-'}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination total={supportAll.length} filtered={filteredSupport.length} page={pageSupport} totalPages={totalPagesSupport} setPage={setPageSupport} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: 已審核紀錄 */}
          <TabsContent value="history" className="mt-4 space-y-3">
            <FilterBar search={searchHistory} setSearch={setSearchHistory}>
              <div className="flex items-center gap-1">
                {(['', 'approved', 'rejected'] as const).map(s => (
                  <Button key={s} variant={filterResult === s ? 'default' : 'outline'} size="sm" className="h-9 text-xs" onClick={() => setFilterResult(s)}>
                    {s === '' ? '全部' : s === 'approved' ? '已核准' : '已駁回'}
                  </Button>
                ))}
              </div>
            </FilterBar>
            {filteredHistory.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm">{historyAll.length === 0 ? '尚無審核紀錄' : '無符合條件的結果'}</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50 text-sm text-muted-foreground">
                          <th className="text-left px-4 py-3 font-medium">結果</th>
                          <th className="text-left px-4 py-3 font-medium">專案</th>
                          <th className="text-left px-4 py-3 font-medium">申請人</th>
                          <th className="text-left px-4 py-3 font-medium">審核人</th>
                          <th className="text-left px-4 py-3 font-medium">審核時間</th>
                          <th className="text-right px-4 py-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedHistory.map((request, i) => (
                          <tr
                            key={request.id}
                            className={cn(
                              'cursor-pointer hover:bg-muted/50 transition-colors',
                              i % 2 !== 0 && 'bg-muted/20',
                            )}
                            onClick={() => openDetail(request, 'history')}
                          >
                            <td className="px-4 py-3.5">
                              {request.status === 'approved' ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs">
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 已核准
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">
                                  <XCircle className="h-3.5 w-3.5 mr-1" /> 已駁回
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="font-semibold text-base">{request.project.name}</span>
                            </td>
                            <td className="px-4 py-3.5 text-sm">{request.requestedBy}</td>
                            <td className="px-4 py-3.5 text-sm">{request.reviewedBy || '-'}</td>
                            <td className="px-4 py-3.5 text-sm text-muted-foreground">{request.reviewedAt ? formatDate(request.reviewedAt) : '-'}</td>
                            <td className="px-4 py-3.5 text-right">
                              <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination total={historyAll.length} filtered={filteredHistory.length} page={pageHistory} totalPages={totalPagesHistory} setPage={setPageHistory} />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            detailSource === 'support'
              ? renderSupportDetail(selectedItem)
              : renderStandardDetail(selectedItem)
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
