'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { PROJECT_TIER_LABELS, type ProjectStatus, type ProjectTier, type Project } from '@/lib/mock-data'
import {
  Search,
  Users,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  RotateCcw,
  SlidersHorizontal,
  HelpCircle,
  Copy,
} from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { DuplicateProjectDialog } from '@/components/duplicate-project-dialog'
import { getRolePermissions } from '@/lib/permissions'
import { Loader2 } from 'lucide-react'
import { useProjectTypes } from '@/hooks/use-project-types'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function ProjectsPage() {
  const { user } = useAuth()
  // 複製專案：只有系統管理員／專案經理可用（會一次生出整組里程碑與任務）
  const canDuplicate = user?.role === 'admin' || user?.role === 'pm'
  const [dupTarget, setDupTarget] = useState<{ id: string; name: string } | null>(null)
  // 從頁首進來時還不知道要複製哪個專案，先選
  const [dupPickerOpen, setDupPickerOpen] = useState(false)
  const { projectTypes } = useProjectTypes()
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<ProjectTier | 'all'>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [memberFilter, setMemberFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<Date>(() => new Date(new Date().getFullYear(), 0, 1))
  const [dateTo, setDateTo] = useState<Date>(() => new Date(new Date().getFullYear(), 11, 31))
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 12

  // Default date range (current year)
  const defaultDateFrom = useMemo(() => new Date(new Date().getFullYear(), 0, 1), [])
  const defaultDateTo = useMemo(() => new Date(new Date().getFullYear(), 11, 31), [])

  // Fetch projects from API
  useEffect(() => {
    setLoading(true)
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAllProjects(data))
      .catch(() => setAllProjects([]))
      .finally(() => setLoading(false))
  }, [])

  // 所有角色都能看到全部專案（細部權限由專案角色 SAPRCI 控制）
  const projects = allProjects

  // 取得所有負責人列表
  const owners = useMemo(() => {
    const ownerSet = new Set(projects.map(p => p.owner))
    return Array.from(ownerSet).sort()
  }, [projects])

  // 取得所有負責執行成員 (角色 R)
  const responsibleMembers = useMemo(() => {
    const memberSet = new Set<string>()
    projects.forEach(p => {
      p.teamMembers?.forEach(tm => {
        if (tm.role === 'R') memberSet.add(tm.name)
      })
    })
    return Array.from(memberSet).sort()
  }, [projects])

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.objective.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         project.projectCode.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    const matchesType = typeFilter === 'all' || project.projectType === typeFilter
    const matchesTier = tierFilter === 'all' || project.projectTier === tierFilter
    const matchesOwner = ownerFilter === 'all' || project.owner === ownerFilter
    const matchesMember = memberFilter === 'all' || project.teamMembers?.some(tm => tm.role === 'R' && tm.name === memberFilter)
    // Date range filter: project overlaps with [dateFrom, dateTo]
    const projStart = new Date(project.startDate)
    const projEnd = new Date(project.endDate)
    const matchesDate = projStart <= dateTo && projEnd >= dateFrom
    return matchesSearch && matchesStatus && matchesType && matchesTier && matchesOwner && matchesMember && matchesDate
  })

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, typeFilter, tierFilter, ownerFilter, memberFilter, dateFrom, dateTo])

  // Check if any filter differs from defaults
  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || tierFilter !== 'all' || ownerFilter !== 'all' || memberFilter !== 'all' ||
    dateFrom.getTime() !== defaultDateFrom.getTime() || dateTo.getTime() !== defaultDateTo.getTime()

  // Count active "more" filters (owner, member, date)
  const moreFilterCount = [
    ownerFilter !== 'all',
    memberFilter !== 'all',
    dateFrom.getTime() !== defaultDateFrom.getTime() || dateTo.getTime() !== defaultDateTo.getTime(),
  ].filter(Boolean).length

  const resetAllFilters = () => {
    setStatusFilter('all')
    setTypeFilter('all')
    setTierFilter('all')
    setOwnerFilter('all')
    setMemberFilter('all')
    setDateFrom(defaultDateFrom)
    setDateTo(defaultDateTo)
  }

  const totalPages = Math.ceil(filteredProjects.length / PAGE_SIZE)
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // Generate visible page numbers (show max 5 pages around current)
  const getPageNumbers = useCallback(() => {
    const pages: number[] = []
    let start = Math.max(1, currentPage - 2)
    let end = Math.min(totalPages, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }, [currentPage, totalPages])

  const getStatusColor = (status: ProjectStatus) => {
    // hover:bg-* 明確鎖色，否則 secondary 變體的 hover:bg-secondary/80 會在卡片 hover 時把徽章洗成白色
    switch (status) {
      case 'green':
        return 'bg-success text-success-foreground hover:bg-success'
      case 'yellow':
        return 'bg-warning text-warning-foreground hover:bg-warning'
      case 'red':
        return 'bg-destructive text-destructive-foreground hover:bg-destructive'
    }
  }

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case 'green':
        return <CheckCircle2 className="h-4 w-4" />
      case 'yellow':
        return <Clock className="h-4 w-4" />
      case 'red':
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getStatusText = (status: ProjectStatus) => {
    switch (status) {
      case 'green':
        return '正常'
      case 'yellow':
        return '注意'
      case 'red':
        return '風險'
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              專案看板
              <button onClick={() => setHelpOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="h-5 w-5" />
              </button>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">管理和追蹤所有專案的進度與狀態</p>
          </div>
          <div className="flex items-center gap-2">
            {/* 複製要跟「建立新專案」並排。藏在卡片 hover 裡沒人找得到——
                使用者不會把滑鼠停在卡片上等按鈕浮出來。 */}
            {canDuplicate && (
              <Button variant="outline" className="gap-1.5" onClick={() => setDupPickerOpen(true)}>
                <Copy className="h-4 w-4" />複製現有專案
              </Button>
            )}
            {getRolePermissions(user?.role).canCreateProject && (
              <Link href="/projects/new">
                <Button>建立新專案</Button>
              </Link>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 bg-card rounded-lg px-3 py-2 border">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋專案名稱、目標或編碼..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as ProjectTier | 'all')}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部層級</SelectItem>
              {(Object.entries(PROJECT_TIER_LABELS) as [ProjectTier, string][]).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部類型</SelectItem>
              {projectTypes.map(({ key, label }) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectStatus | 'all')}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="green">正常</SelectItem>
              <SelectItem value="yellow">注意</SelectItem>
              <SelectItem value="red">風險</SelectItem>
            </SelectContent>
          </Select>
          {/* More filters popover */}
          <Popover open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                更多篩選
                {moreFilterCount > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">
                    {moreFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">負責人</label>
                  <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部負責人</SelectItem>
                      {owners.map(owner => (
                        <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">需求者</label>
                  <Select value={memberFilter} onValueChange={setMemberFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部需求者</SelectItem>
                      {responsibleMembers.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1">
                    日期範圍
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px] text-xs">
                          依專案的起迄日期篩選，只要專案期間與所選範圍有重疊即會顯示
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      { label: '今年', from: new Date(new Date().getFullYear(), 0, 1), to: new Date(new Date().getFullYear(), 11, 31) },
                      { label: '去年', from: new Date(new Date().getFullYear() - 1, 0, 1), to: new Date(new Date().getFullYear() - 1, 11, 31) },
                      { label: '近3個月', from: (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d })(), to: new Date() },
                      { label: '近6個月', from: (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d })(), to: new Date() },
                    ].map(preset => (
                      <Button
                        key={preset.label}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => { setDateFrom(preset.from); setDateTo(preset.to) }}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-start gap-1.5">
                        <CalendarDays className="h-4 w-4" />
                        {format(dateFrom, 'yyyy/MM/dd')} - {format(dateTo, 'yyyy/MM/dd')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="start" side="bottom">
                      <div className="flex gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">開始日期</p>
                          <CalendarUI
                            mode="single"
                            selected={dateFrom}
                            onSelect={(d) => { if (!d) return; setDateFrom(d); if (d > dateTo) setDateTo(d) }}
                            locale={zhTW}
                          />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">結束日期</p>
                          <CalendarUI
                            mode="single"
                            selected={dateTo}
                            onSelect={(d) => d && setDateTo(d)}
                            disabled={(date) => date < dateFrom}
                            locale={zhTW}
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAllFilters}
              className="h-9 gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重設
            </Button>
          )}
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">載入專案列表中...</p>
          </div>
        ) : (
        <>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {paginatedProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="block">
              {/* 複製：只有系統管理員／專案經理看得到。放在卡片外層絕對定位，
                  不進 <Link> 的內容流，點擊時要擋掉連結的導頁。 */}
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 space-y-2.5">
                  {/* Row 1: Code + Type + Status（單行並排，型別過長時僅截斷型別標籤） */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap shrink-0">{project.projectCode}</span>
                      <Badge variant="outline" className="text-xs px-1.5 py-0 min-w-0 shrink truncate">
                        {projectTypes.find(t => t.key === project.projectType)?.label ?? project.projectType}
                      </Badge>
                      <Badge variant="outline" className={`text-xs px-1.5 py-0 font-semibold whitespace-nowrap shrink-0 ${
                        project.projectTier === 'T1' ? 'border-blue-400 text-blue-600' :
                        project.projectTier === 'T2' ? 'border-emerald-400 text-emerald-600' :
                        project.projectTier === 'T3' ? 'border-amber-400 text-amber-600' :
                        'border-purple-400 text-purple-600'
                      }`}>
                        {project.projectTier}
                      </Badge>
                      <Badge variant="outline" className={`text-xs px-1.5 py-0 whitespace-nowrap shrink-0 ${
                        project.phase === 'draft'
                          ? 'border-amber-400 text-amber-600 bg-amber-50'
                          : 'border-emerald-400 text-emerald-600 bg-emerald-50'
                      }`}>
                        {project.phase === 'draft' ? '草稿' : '已開案'}
                      </Badge>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`${getStatusColor(project.status)} text-xs px-1.5 py-0 shrink-0 whitespace-nowrap`}
                    >
                      <span className="flex items-center gap-1">
                        {getStatusIcon(project.status)}
                        {getStatusText(project.status)}
                      </span>
                    </Badge>
                  </div>

                  {/* Row 2: Name */}
                  <h3 className="font-semibold text-base line-clamp-1">{project.name}</h3>

                  {/* Row 3: Progress bar */}
                  <div className="flex items-center gap-3">
                    <Progress value={project.progress} className="h-1.5 flex-1" />
                    <span className="text-sm font-medium w-10 text-right shrink-0">{project.progress}%</span>
                  </div>

                  {/* Row 4: Meta info inline */}
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{project.team.length} 人</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(project.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{(project.budgetUsed / 1000000).toFixed(1)}M/{((project.budgetDenom ?? project.budget) / 1000000).toFixed(1)}M</span>
                    <span className="ml-auto">{project.owner} · {project.milestones.filter(m => m.status === 'done').length}/{project.milestones.length} 里程碑</span>
                  </div>

                  {/* 複製：常駐顯示、有文字說明。只有系統管理員／專案經理看得到 */}
                  {canDuplicate && (
                    <div className="flex justify-end border-t pt-2">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDupTarget({ id: project.id, name: project.name }) }}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" />以此專案為範本
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              共 {filteredProjects.length} 個專案，第 {currentPage}/{totalPages} 頁
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {getPageNumbers().map(page => (
                <Button
                  key={page}
                  variant={page === currentPage ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* 頁首入口：先挑一個專案當範本 */}
        <Dialog open={dupPickerOpen} onOpenChange={setDupPickerOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Copy className="h-4 w-4" />複製現有專案
              </DialogTitle>
              <DialogDescription className="text-xs">
                選一個專案當範本。下一步可以挑要複製哪些內容。
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[50vh] space-y-1 overflow-y-auto">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setDupPickerOpen(false); setDupTarget({ id: p.id, name: p.name }) }}
                  className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.projectCode}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.milestones.length} 里程碑</span>
                </button>
              ))}
              {projects.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">目前沒有可複製的專案</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {dupTarget && (
          <DuplicateProjectDialog
            open={!!dupTarget}
            onOpenChange={o => { if (!o) setDupTarget(null) }}
            projectId={dupTarget.id}
            projectName={dupTarget.name}
          />
        )}

        {filteredProjects.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            找不到符合條件的專案
          </div>
        )}
        </>
        )}
      </div>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-3">
            <DialogTitle className="text-xl">專案看板 — 權限說明</DialogTitle>
            <DialogDescription>說明各系統角色在專案看板的功能與權限</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-500" /> 系統角色權限
              </h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">系統角色</th>
                      <th className="text-center px-3 py-2 font-medium">檢視專案</th>
                      <th className="text-center px-3 py-2 font-medium">建立專案</th>
                      <th className="text-center px-3 py-2 font-medium">編輯專案</th>
                      <th className="text-center px-3 py-2 font-medium">刪除專案</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: '專案經理', view: true, create: true, edit: true, del: true },
                      { name: '主管', view: true, create: false, edit: false, del: false },
                      { name: '管理員', view: true, create: true, edit: true, del: true },
                      { name: '一般成員', view: true, create: false, edit: false, del: false },
                    ].map((r, i) => (
                      <tr key={r.name} className={i % 2 !== 0 ? 'bg-muted/20' : ''}>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        {[r.view, r.create, r.edit, r.del].map((v, j) => (
                          <td key={j} className="px-3 py-2 text-center">
                            {v ? <span className="text-emerald-600 font-medium">✓</span> : <span className="text-muted-foreground">✗</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">※ 所有角色都能看到全部專案，細部操作由<span className="text-blue-600 dark:text-blue-400 font-medium">專案角色（SAPRCI）</span>控制。編輯專案含專案角色 A（當責）。</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
