'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { PROJECT_TYPE_LABELS, PROJECT_TIER_LABELS, type ProjectStatus, type ProjectTier, type Project } from '@/lib/mock-data'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { GanttChart } from '@/components/gantt-chart'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { useAuth } from '@/lib/auth-context'
import {
  Mail,
  FileDown,
  CheckCircle2,
  X,
  Printer,
  AlertTriangle,
  Target,
  DollarSign,
  BarChart3,
  Users,
  Loader2,
  Search,
  Calendar,
  ChevronDown,
  Clock,
  FileText,
  ShieldAlert,
  Timer,
  Layers,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──
type EmailUser = { username: string; name: string; email: string; organization: string }
type ADSearchResult = { id: string; name: string; organization: string }

interface ReportsData {
  user: {
    id: string
    name: string
    role: string
  }
  stats: {
    totalProjects: number
    totalTasks: number
    doneTasks: number
    inProgressTasks: number
    blockedTasks: number
    todoTasks: number
    totalMilestones: number
    doneMilestones: number
    budget: number
    budgetUsed: number
    openRisks: number
    pendingDelays: number
    teamSize: number
    progress: number
  }
  statusDistribution: {
    green: number
    yellow: number
    red: number
  }
  projects: Array<{
    id: string
    projectCode: string
    name: string
    projectType: string
    projectTier: ProjectTier | null
    status: ProjectStatus
    progress: number
    owner: string
    startDate: string
    endDate: string
    budget: number
    budgetUsed: number
    teamSize: number
    totalTasks: number
    doneTasks: number
    inProgressTasks: number
    blockedTasks: number
    todoTasks: number
    totalMilestones: number
    doneMilestones: number
    openRisks: number
    weeklyUpdatesCount: number
    milestones: Array<{
      id: string
      name: string
      status: string
      progress: number
      dueDate: string
    }>
    risks: Array<{
      id: string
      title: string
      impact: string
      status: string
    }>
    teamWorkload: Array<{
      name: string
      total: number
      done: number
    }>
  }>
  teamWorkload: Array<{
    name: string
    total: number
    done: number
  }>
}

// ── SVG Donut Chart ──
function DonutChart({ segments, size = 180, strokeWidth = 26, children }: {
  segments: { value: number; color: string; label: string }[]
  size?: number
  strokeWidth?: number
  children?: React.ReactNode
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  let accumulated = 0

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {total === 0 ? (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth}
          />
        ) : (
          segments.filter(s => s.value > 0).map((seg, i) => {
            const pct = seg.value / total
            const dashLength = circumference * pct
            const dashOffset = circumference * (1 - accumulated / total)
            accumulated += seg.value
            return (
              <circle
                key={i}
                cx={size / 2} cy={size / 2} r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            )
          })
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

// ── Mini ring (for project cards) ──
function MiniRing({ value, size = 44, strokeWidth = 5, color }: {
  value: number; size?: number; strokeWidth?: number; color: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashLen = circumference * (value / 100)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${dashLen} ${circumference - dashLen}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-xs font-bold">{value}%</span>
    </div>
  )
}

// ── Status dot ──
function StatusDot({ status }: { status: ProjectStatus }) {
  const colors: Record<ProjectStatus, string> = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-400',
    red: 'bg-red-500',
  }
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', colors[status])} />
}

function fmtMoney(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return `$${n}`
}

export default function ReportsPage() {
  const { user } = useAuth()
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [showPdfDialog, setShowPdfDialog] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [exportSuccess, setExportSuccess] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  // Email dialog — AD user picker (To)
  const [emailSelectedUsers, setEmailSelectedUsers] = useState<EmailUser[]>([])
  const [emailSearchQuery, setEmailSearchQuery] = useState('')
  const [emailSearchResults, setEmailSearchResults] = useState<ADSearchResult[]>([])
  const [emailSearchLoading, setEmailSearchLoading] = useState(false)
  const [emailFetchingUsers, setEmailFetchingUsers] = useState<Set<string>>(new Set())
  // Email dialog — CC picker
  const [ccSelectedUsers, setCcSelectedUsers] = useState<EmailUser[]>([])
  const [ccSearchQuery, setCcSearchQuery] = useState('')
  const [ccSearchResults, setCcSearchResults] = useState<ADSearchResult[]>([])
  const [ccSearchLoading, setCcSearchLoading] = useState(false)
  const [ccFetchingUsers, setCcFetchingUsers] = useState<Set<string>>(new Set())
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isPreviewingPdf, setIsPreviewingPdf] = useState(false)
  // Detail project data (fetched when single project selected)
  const [detailProject, setDetailProject] = useState<Project | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [ganttExpanded, setGanttExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [tierFilter, setTierFilter] = useState<ProjectTier | null>(null)

  // ── Fetch reports data from API ──
  useEffect(() => {
    if (!user) return

    const fetchReports = async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        if (user.id) params.append('userId', user.id)
        else if (user.email) params.append('userEmail', user.email)

        // Always fetch all projects, filter on frontend
        const response = await fetch(`/api/reports?${params}`)
        if (!response.ok) {
          throw new Error('Failed to fetch reports data')
        }

        const reportsData: ReportsData = await response.json()
        setData(reportsData)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch reports:', err)
        setError('載入報告資料失敗')
      } finally {
        setLoading(false)
      }
    }

    fetchReports()
  }, [user])

  // Reset project selection when tier filter changes and current selection is not in filtered list
  useEffect(() => {
    if (selectedProjectId !== 'all' && tierFilter && data) {
      const proj = data.projects.find(p => p.id === selectedProjectId)
      if (proj && proj.projectTier !== tierFilter) {
        setSelectedProjectId('all')
      }
    }
  }, [tierFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch full project detail when single project selected ──
  useEffect(() => {
    if (selectedProjectId === 'all') {
      setDetailProject(null)
      return
    }
    setActiveTab('overview')
    const controller = new AbortController()
    const fetchDetail = async () => {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/projects/${selectedProjectId}`, { signal: controller.signal })
        if (res.ok) {
          setDetailProject(await res.json())
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setDetailProject(null)
      } finally {
        setDetailLoading(false)
      }
    }
    fetchDetail()
    return () => controller.abort()
  }, [selectedProjectId])

  // Filtered projects by tier (for "all projects" mode)
  const filteredProjects = useMemo(() => {
    if (!data) return []
    if (!tierFilter) return data.projects
    return data.projects.filter(p => p.projectTier === tierFilter)
  }, [data, tierFilter])

  // Tier counts (computed from filtered projects so it reflects the active filter)
  const tierCounts = useMemo(() => {
    if (!data) return { T1: 0, T2: 0, T3: 0, CIP: 0 }
    const src = filteredProjects
    return {
      T1: src.filter(p => p.projectTier === 'T1').length,
      T2: src.filter(p => p.projectTier === 'T2').length,
      T3: src.filter(p => p.projectTier === 'T3').length,
      CIP: src.filter(p => p.projectTier === 'CIP').length,
    }
  }, [data, filteredProjects])

  // Calculate display stats based on selected project or all projects
  // Must be declared before any early returns to follow React Hooks rules
  const displayStats = useMemo(() => {
    if (!data) return null

    const selectedProject = selectedProjectId === 'all' ? null : data.projects.find(p => p.id === selectedProjectId)
    if (selectedProject) {
      return {
        totalProjects: 1,
        totalTasks: selectedProject.totalTasks,
        doneTasks: selectedProject.doneTasks,
        inProgressTasks: selectedProject.inProgressTasks,
        blockedTasks: selectedProject.blockedTasks,
        todoTasks: selectedProject.todoTasks,
        totalMilestones: selectedProject.totalMilestones,
        doneMilestones: selectedProject.doneMilestones,
        budget: selectedProject.budget,
        budgetUsed: selectedProject.budgetUsed,
        openRisks: selectedProject.openRisks,
        pendingDelays: 0,
        teamSize: selectedProject.teamSize,
        progress: selectedProject.progress,
      }
    }

    // "All projects" mode — aggregate from filtered projects
    if (!tierFilter) return data.stats
    const fp = filteredProjects
    return {
      totalProjects: fp.length,
      totalTasks: fp.reduce((a, p) => a + p.totalTasks, 0),
      doneTasks: fp.reduce((a, p) => a + p.doneTasks, 0),
      inProgressTasks: fp.reduce((a, p) => a + p.inProgressTasks, 0),
      blockedTasks: fp.reduce((a, p) => a + p.blockedTasks, 0),
      todoTasks: fp.reduce((a, p) => a + p.todoTasks, 0),
      totalMilestones: fp.reduce((a, p) => a + p.totalMilestones, 0),
      doneMilestones: fp.reduce((a, p) => a + p.doneMilestones, 0),
      budget: fp.reduce((a, p) => a + p.budget, 0),
      budgetUsed: fp.reduce((a, p) => a + p.budgetUsed, 0),
      openRisks: fp.reduce((a, p) => a + p.openRisks, 0),
      pendingDelays: 0,
      teamSize: new Set(fp.flatMap(p => p.teamWorkload.map(w => w.name))).size,
      progress: fp.length > 0 ? Math.round(fp.reduce((a, p) => a + p.progress, 0) / fp.length) : 0,
    }
  }, [data, selectedProjectId, tierFilter, filteredProjects])

  const displayStatusDistribution = useMemo(() => {
    if (!data) return null

    const selectedProject = selectedProjectId === 'all' ? null : data.projects.find(p => p.id === selectedProjectId)
    if (selectedProject) {
      return {
        green: selectedProject.status === 'green' ? 1 : 0,
        yellow: selectedProject.status === 'yellow' ? 1 : 0,
        red: selectedProject.status === 'red' ? 1 : 0,
      }
    }

    if (!tierFilter) return data.statusDistribution
    const fp = filteredProjects
    return {
      green: fp.filter(p => p.status === 'green').length,
      yellow: fp.filter(p => p.status === 'yellow').length,
      red: fp.filter(p => p.status === 'red').length,
    }
  }, [data, selectedProjectId, tierFilter, filteredProjects])

  const displayTeamWorkload = useMemo(() => {
    if (!data) return []

    const selectedProject = selectedProjectId === 'all' ? null : data.projects.find(p => p.id === selectedProjectId)
    if (selectedProject) return selectedProject.teamWorkload

    if (!tierFilter) return data.teamWorkload
    // Aggregate team workload from filtered projects
    const workloadMap = new Map<string, { total: number; done: number }>()
    filteredProjects.forEach(p => {
      p.teamWorkload.forEach(w => {
        const entry = workloadMap.get(w.name) || { total: 0, done: 0 }
        entry.total += w.total
        entry.done += w.done
        workloadMap.set(w.name, entry)
      })
    })
    return [...workloadMap.entries()]
      .map(([name, d]) => ({ name, total: d.total, done: d.done }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [data, selectedProjectId, tierFilter, filteredProjects])

  // ── Detail project computed data (must be before early returns) ──
  const tasksByMilestone = useMemo(() => {
    if (!detailProject) return []
    return detailProject.milestones.map(ms => ({
      milestone: ms,
      tasks: detailProject.tasks.filter(t => t.milestoneId === ms.id && !t.parentId),
    }))
  }, [detailProject])

  const recentActivity = useMemo(() => {
    if (!detailProject) return []
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const cutoff = twoWeeksAgo.toISOString().split('T')[0]
    const recentLogs = detailProject.taskLogs
      .filter(log => log.logDate >= cutoff)
      .sort((a, b) => b.logDate.localeCompare(a.logDate))

    const taskMap = new Map(detailProject.tasks.map(t => [t.id, t]))
    const weekGroups = new Map<string, Array<{ log: typeof recentLogs[0]; task: ReturnType<typeof taskMap.get> }>>()

    for (const log of recentLogs) {
      const date = new Date(log.logDate)
      const dayOfWeek = date.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(date)
      monday.setDate(date.getDate() + mondayOffset)
      const weekKey = monday.toISOString().split('T')[0]
      if (!weekGroups.has(weekKey)) weekGroups.set(weekKey, [])
      weekGroups.get(weekKey)!.push({ log, task: taskMap.get(log.taskId) })
    }

    return [...weekGroups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([weekStart, items]) => ({ weekStart, items }))
  }, [detailProject])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  if (error || !data || !displayStats || !displayStatusDistribution) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-semibold">{error || '載入失敗'}</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const { stats, statusDistribution, projects, teamWorkload } = data
  const selectedProject = selectedProjectId === 'all' ? null : projects.find(p => p.id === selectedProjectId)

  const budgetPct = displayStats.budget > 0 ? Math.round((displayStats.budgetUsed / displayStats.budget) * 100) : 0

  // ── Donut segments ──
  const taskSegments = [
    { value: displayStats.doneTasks, color: '#10b981', label: '已完成' },
    { value: displayStats.inProgressTasks, color: '#3b82f6', label: '進行中' },
    { value: displayStats.todoTasks, color: '#94a3b8', label: '待辦' },
    { value: displayStats.blockedTasks, color: '#ef4444', label: '受阻' },
  ]

  const statusSegments = [
    { value: displayStatusDistribution.green, color: '#10b981', label: '正常' },
    { value: displayStatusDistribution.yellow, color: '#f59e0b', label: '注意' },
    { value: displayStatusDistribution.red, color: '#ef4444', label: '風險' },
  ]

  const maxMemberTasks = Math.max(...displayTeamWorkload.map(m => m.total), 1)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done': return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-300">完成</Badge>
      case 'in-progress': return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-300">進行中</Badge>
      case 'blocked': return <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-300">受阻</Badge>
      default: return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-300">待辦</Badge>
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-300">高</Badge>
      case 'medium': return <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-300">中</Badge>
      default: return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-300">低</Badge>
    }
  }

  // ── Export handlers ──
  const handleOpenPdfDialog = () => {
    setSelectedProjectIds(data.projects.map(p => p.id))
    setShowPdfDialog(true)
    setExportSuccess(false)
  }

  const handleOpenEmailDialog = () => {
    setSelectedProjectIds(data.projects.map(p => p.id))
    setEmailSelectedUsers([])
    setEmailSearchQuery('')
    setEmailSearchResults([])
    setIsSendingEmail(false)
    setShowEmailDialog(true)
    setEmailSuccess(false)
  }

  const handleToggleProject = (projectId: string) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }

  const handleSelectAllProjects = () => {
    setSelectedProjectIds(projects.map(p => p.id))
  }

  const handleDeselectAllProjects = () => {
    setSelectedProjectIds([])
  }

  // ── Email user picker ──
  const searchEmailUsers = async (q: string) => {
    setEmailSearchQuery(q)
    if (!q.trim()) { setEmailSearchResults([]); return }
    setEmailSearchLoading(true)
    try {
      const res = await fetch(`/api/ad-users/search?q=${encodeURIComponent(q.trim())}&limit=8`)
      if (res.ok) {
        const users: ADSearchResult[] = await res.json()
        const selected = new Set(emailSelectedUsers.map(u => u.username))
        setEmailSearchResults(users.filter(u => !selected.has(u.id)))
      }
    } catch { setEmailSearchResults([]) }
    finally { setEmailSearchLoading(false) }
  }

  const addEmailUser = async (result: ADSearchResult) => {
    setEmailSearchQuery('')
    setEmailSearchResults([])
    setEmailFetchingUsers(prev => new Set([...prev, result.id]))
    try {
      const res = await fetch(`/api/ad-users/${encodeURIComponent(result.id)}`)
      const detail = res.ok ? await res.json() : {}
      setEmailSelectedUsers(prev => [...prev, {
        username: result.id,
        name: detail.name || result.name,
        email: detail.email || '',
        organization: detail.organization || result.organization,
      }])
    } catch {
      setEmailSelectedUsers(prev => [...prev, { username: result.id, name: result.name, email: '', organization: result.organization }])
    } finally {
      setEmailFetchingUsers(prev => { const s = new Set(prev); s.delete(result.id); return s })
    }
  }

  const removeEmailUser = (username: string) =>
    setEmailSelectedUsers(prev => prev.filter(u => u.username !== username))

  const searchCcUsers = async (q: string) => {
    setCcSearchQuery(q)
    if (!q.trim()) { setCcSearchResults([]); return }
    setCcSearchLoading(true)
    try {
      const res = await fetch(`/api/ad-users/search?q=${encodeURIComponent(q.trim())}&limit=8`)
      if (res.ok) {
        const users: ADSearchResult[] = await res.json()
        const selected = new Set([...ccSelectedUsers.map(u => u.username), ...emailSelectedUsers.map(u => u.username)])
        setCcSearchResults(users.filter(u => !selected.has(u.id)))
      }
    } catch { setCcSearchResults([]) }
    finally { setCcSearchLoading(false) }
  }

  const addCcUser = async (result: ADSearchResult) => {
    setCcSearchQuery('')
    setCcSearchResults([])
    setCcFetchingUsers(prev => new Set([...prev, result.id]))
    try {
      const res = await fetch(`/api/ad-users/${encodeURIComponent(result.id)}`)
      const detail = res.ok ? await res.json() : {}
      setCcSelectedUsers(prev => [...prev, {
        username: result.id,
        name: detail.name || result.name,
        email: detail.email || '',
        organization: detail.organization || result.organization,
      }])
    } catch {
      setCcSelectedUsers(prev => [...prev, { username: result.id, name: result.name, email: '', organization: result.organization }])
    } finally {
      setCcFetchingUsers(prev => { const s = new Set(prev); s.delete(result.id); return s })
    }
  }

  const removeCcUser = (username: string) =>
    setCcSelectedUsers(prev => prev.filter(u => u.username !== username))

  const handleExportPdf = async () => {
    if (!data || selectedProjectIds.length === 0) return

    try {
      // Call the PDF generation API
      const response = await fetch('/api/reports/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectIds: selectedProjectIds,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

      // Get the HTML content
      const html = await response.text()

      // Open in a new window for printing
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(html)
        printWindow.document.close()

        // Wait for content to load, then trigger print dialog
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print()
          }, 500)
        }
      }

      // Show success message
      setExportSuccess(true)
      setTimeout(() => {
        setShowPdfDialog(false)
        setExportSuccess(false)
      }, 2000)
    } catch (error) {
      console.error('PDF export failed:', error)
      alert('PDF 匯出失敗，請稍後再試')
    }
  }

  // Download email PDF preview — server-side Puppeteer rendering (same quality as 匯出 PDF)
  const handlePreviewEmailPdf = async () => {
    if (selectedProjectIds.length === 0) { alert('請至少選擇一個專案'); return }
    setIsPreviewingPdf(true)
    try {
      const res = await fetch('/api/reports/pdf-binary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: selectedProjectIds }),
      })
      if (!res.ok) throw new Error('PDF 生成失敗')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toLocaleDateString('zh-TW').replace(/\//g, '')
      a.href = url
      a.download = `專案報告_預覽_${date}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Preview PDF failed:', err)
      alert(err instanceof Error ? err.message : 'PDF 預覽失敗')
    } finally {
      setIsPreviewingPdf(false)
    }
  }

  const handleSendEmail = async () => {
    const validRecipients = emailSelectedUsers.filter(u => u.email)
    if (validRecipients.length === 0) {
      alert('請先選擇有效的收件人（需有 email）')
      return
    }
    if (selectedProjectIds.length === 0) {
      alert('請至少選擇一個專案')
      return
    }

    setIsSendingEmail(true)
    try {
      const date = new Date().toLocaleDateString('zh-TW').replace(/\//g, '')
      const pjNames = data!.projects.filter(p => selectedProjectIds.includes(p.id)).map(p => p.name).join('、')

      // Server generates the PDF (same quality as 匯出 PDF) and sends the email
      const mailRes = await fetch('/api/reports/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: selectedProjectIds,
          recipients: validRecipients.map(u => u.email),
          cc: ccSelectedUsers.filter(u => u.email).map(u => u.email),
          filename: `專案報告_${date}.pdf`,
          subject: `專案報告 - ${pjNames || '所有專案'}`,
        }),
      })

      if (!mailRes.ok) {
        const err = await mailRes.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || '郵件發送失敗')
      }

      setEmailSuccess(true)
      setTimeout(() => {
        setShowEmailDialog(false)
        setEmailSuccess(false)
        setEmailSelectedUsers([])
        setCcSelectedUsers([])
      }, 3000)
    } catch (err) {
      console.error('Email send failed:', err)
      alert(err instanceof Error ? err.message : '寄送失敗，請稍後再試')
    } finally {
      setIsSendingEmail(false)
    }
  }

  const getStatusRingColor = (status: ProjectStatus) => {
    if (status === 'green') return '#3b82f6'
    if (status === 'yellow') return '#f59e0b'
    return '#ef4444'
  }

  return (
    <DashboardLayout>
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">專案報告</h1>
              <p className="text-sm text-muted-foreground mt-1">檢視專案進度與統計分析</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-[200px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有專案（總覽）</SelectItem>
                  {filteredProjects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Tier filter — only show in all-projects mode */}
              {selectedProjectId === 'all' && <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
                {[{ value: null as ProjectTier | null, label: '全部' }, ...Object.keys(PROJECT_TIER_LABELS).map(t => ({ value: t as ProjectTier | null, label: PROJECT_TIER_LABELS[t as ProjectTier] }))].map(item => (
                  <button
                    key={item.label}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      tierFilter === item.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                    }`}
                    onClick={() => setTierFilter(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpenEmailDialog}>
                <Mail className="h-3.5 w-3.5" /> Email
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleOpenPdfDialog}>
                <FileDown className="h-3.5 w-3.5" /> 匯出 PDF
              </Button>
            </div>
          </div>

          {/* PDF Export Dialog */}
          <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>匯出 PDF 報告</DialogTitle>
                <DialogDescription>
                  選擇要匯出的專案，系統將產生包含所選專案的完整報告
                </DialogDescription>
              </DialogHeader>

              {exportSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
                  <p className="font-medium text-emerald-600">PDF 報告已成功匯出！</p>
                  <p className="text-sm text-muted-foreground mt-1">檔案已下載至您的電腦</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">選擇專案</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleSelectAllProjects}
                          className="h-8 text-sm"
                        >
                          全選
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleDeselectAllProjects}
                          className="h-8 text-sm"
                        >
                          清除
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-lg p-3 space-y-2 max-h-[300px] overflow-y-auto">
                      {data.projects.map(project => (
                        <div key={project.id} className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                          <Checkbox
                            id={`pdf-project-${project.id}`}
                            checked={selectedProjectIds.includes(project.id)}
                            onCheckedChange={() => handleToggleProject(project.id)}
                            className="h-5 w-5"
                          />
                          <label
                            htmlFor={`pdf-project-${project.id}`}
                            className="flex-1 text-base cursor-pointer flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <StatusDot status={project.status} />
                              <span className="font-medium">{project.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span>{project.progress}%</span>
                              <Badge variant="outline" className="text-sm">
                                {PROJECT_TYPE_LABELS[project.projectType]}
                              </Badge>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      已選擇 {selectedProjectIds.length} 個專案
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowPdfDialog(false)} size="lg">
                      取消
                    </Button>
                    <Button
                      onClick={handleExportPdf}
                      disabled={selectedProjectIds.length === 0}
                      className="gap-2"
                      size="lg"
                    >
                      <FileDown className="h-4 w-4" />
                      下載 PDF ({selectedProjectIds.length})
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Email Dialog */}
          <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Email 報告</DialogTitle>
                <DialogDescription>
                  選擇收件人與專案，系統將自動產生 PDF 並透過 Email 直接寄出
                </DialogDescription>
              </DialogHeader>

              {emailSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
                  <p className="font-medium text-emerald-600">PDF 已產生並成功寄出！</p>
                  <p className="text-sm text-muted-foreground mt-1">報告已寄送至指定收件人</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {/* To + CC — Gmail-style compose fields */}
                    <div className="border rounded-lg overflow-visible divide-y">
                      {/* 收件人 row */}
                      <div className="relative flex items-start gap-2 px-3 py-2 min-h-[44px]">
                        <span className="text-sm text-muted-foreground w-14 shrink-0 pt-1.5">收件人</span>
                        <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
                          {emailSelectedUsers.map(u => (
                            <span key={u.username} className="inline-flex items-center gap-1 bg-muted rounded-md px-2 py-0.5 text-sm">
                              <span className="font-medium">{u.name}</span>
                              {!u.email && <span className="text-amber-500 text-xs">無mail</span>}
                              <button onClick={() => removeEmailUser(u.username)} className="text-muted-foreground hover:text-destructive ml-0.5">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            placeholder={emailSelectedUsers.length === 0 ? '搜尋姓名或帳號...' : ''}
                            value={emailSearchQuery}
                            onChange={e => searchEmailUsers(e.target.value)}
                            className="flex-1 min-w-[120px] text-sm bg-transparent outline-none placeholder:text-muted-foreground py-1"
                          />
                          {emailSearchLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                        </div>
                        {emailSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-lg bg-background shadow-md max-h-48 overflow-y-auto">
                            {emailSearchResults.map(result => (
                              <button key={result.id} onClick={() => addEmailUser(result)} disabled={emailFetchingUsers.has(result.id)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted text-left disabled:opacity-60">
                                {emailFetchingUsers.has(result.id)
                                  ? <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                                  : <Users className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                <div>
                                  <div className="text-sm font-medium">{result.name}</div>
                                  <div className="text-xs text-muted-foreground">{result.organization}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* CC row */}
                      <div className="relative flex items-start gap-2 px-3 py-2 min-h-[44px]">
                        <span className="text-sm text-muted-foreground w-14 shrink-0 pt-1.5">副本</span>
                        <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
                          {ccSelectedUsers.map(u => (
                            <span key={u.username} className="inline-flex items-center gap-1 bg-muted rounded-md px-2 py-0.5 text-sm">
                              <span className="font-medium">{u.name}</span>
                              {!u.email && <span className="text-amber-500 text-xs">無mail</span>}
                              <button onClick={() => removeCcUser(u.username)} className="text-muted-foreground hover:text-destructive ml-0.5">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            placeholder={ccSelectedUsers.length === 0 ? '搜尋姓名或帳號...' : ''}
                            value={ccSearchQuery}
                            onChange={e => searchCcUsers(e.target.value)}
                            className="flex-1 min-w-[120px] text-sm bg-transparent outline-none placeholder:text-muted-foreground py-1"
                          />
                          {ccSearchLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                        </div>
                        {ccSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-lg bg-background shadow-md max-h-48 overflow-y-auto">
                            {ccSearchResults.map(result => (
                              <button key={result.id} onClick={() => addCcUser(result)} disabled={ccFetchingUsers.has(result.id)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted text-left disabled:opacity-60">
                                {ccFetchingUsers.has(result.id)
                                  ? <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                                  : <Users className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                <div>
                                  <div className="text-sm font-medium">{result.name}</div>
                                  <div className="text-xs text-muted-foreground">{result.organization}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Select Projects */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">選擇專案</Label>
                        <div className="flex gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={handleSelectAllProjects} className="h-8 text-sm">全選</Button>
                          <Button type="button" variant="ghost" size="sm" onClick={handleDeselectAllProjects} className="h-8 text-sm">清除</Button>
                        </div>
                      </div>
                      <div className="border rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto">
                        {data.projects.map(project => (
                          <div key={project.id} className="flex items-center space-x-3 p-3 rounded hover:bg-muted/50">
                            <Checkbox
                              id={`email-project-${project.id}`}
                              checked={selectedProjectIds.includes(project.id)}
                              onCheckedChange={() => handleToggleProject(project.id)}
                              className="h-5 w-5"
                            />
                            <label htmlFor={`email-project-${project.id}`} className="flex-1 text-base cursor-pointer flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <StatusDot status={project.status} />
                                <span className="font-medium">{project.name}</span>
                              </div>
                              <Badge variant="outline" className="text-sm">{PROJECT_TYPE_LABELS[project.projectType]}</Badge>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      已選擇 {selectedProjectIds.length} 個專案
                    </p>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowEmailDialog(false)} size="lg" disabled={isSendingEmail || isPreviewingPdf}>
                      取消
                    </Button>
<Button
                      onClick={handleSendEmail}
                      disabled={emailSelectedUsers.filter(u => u.email).length === 0 || selectedProjectIds.length === 0 || isSendingEmail || isPreviewingPdf}
                      className="gap-2"
                      size="lg"
                    >
                      {isSendingEmail
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> 產生中...</>
                        : <><Mail className="h-4 w-4" /> 產生 PDF 並寄出</>
                      }
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4">
                {selectedProject ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Target className="h-3.5 w-3.5" /> 整體進度
                    </div>
                    <div className="text-2xl font-bold">{displayStats.progress}%</div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${displayStats.progress}%` }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Layers className="h-3.5 w-3.5" /> 專案層級
                    </div>
                    <div className="flex items-center justify-between">
                      {([
                        { tier: 'T1' as const, color: 'text-blue-600' },
                        { tier: 'T2' as const, color: 'text-emerald-600' },
                        { tier: 'T3' as const, color: 'text-amber-600' },
                        { tier: 'CIP' as const, color: 'text-purple-600' },
                      ] as const).map(({ tier, color }, i) => (
                        <div key={tier} className={`flex-1 text-center ${i < 3 ? 'border-r' : ''}`}>
                          <div className={`text-xl font-bold ${color}`}>{tierCounts[tier]}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{tier}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <DollarSign className="h-3.5 w-3.5" /> 預算執行
                </div>
                <div className={cn('text-2xl font-bold', budgetPct > 100 && 'text-destructive')}>{budgetPct}%</div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', budgetPct > 100 ? 'bg-destructive' : 'bg-emerald-500')} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmtMoney(displayStats.budgetUsed)} / {fmtMoney(displayStats.budget)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <BarChart3 className="h-3.5 w-3.5" /> 里程碑
                </div>
                <div className="text-2xl font-bold">{displayStats.doneMilestones}<span className="text-sm font-normal text-muted-foreground">/{displayStats.totalMilestones}</span></div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${displayStats.totalMilestones > 0 ? (displayStats.doneMilestones / displayStats.totalMilestones) * 100 : 0}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  {displayStatusDistribution.green >= displayStatusDistribution.red ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  健康度
                </div>
                <div className={cn('text-2xl font-bold', displayStatusDistribution.red > 0 ? 'text-destructive' : displayStatusDistribution.yellow > 0 ? 'text-amber-500' : 'text-emerald-600')}>
                  {displayStatusDistribution.green}<span className="text-sm font-normal text-muted-foreground">/{displayStats.totalProjects}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {displayStatusDistribution.red > 0
                    ? `${displayStatusDistribution.red} 個專案有風險`
                    : displayStatusDistribution.yellow > 0
                      ? `${displayStatusDistribution.yellow} 個專案需注意`
                      : '專案運行正常'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ══════ All projects view ══════ */}
          {!selectedProject && (
            <>
              {/* Donut Charts — 3-col */}
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader className="pb-0">
                    <CardTitle className="text-sm">任務狀態分佈</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center py-5 gap-4">
                    <DonutChart segments={taskSegments} size={150} strokeWidth={22}>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{displayStats.totalTasks}</div>
                        <div className="text-xs text-muted-foreground">總任務</div>
                      </div>
                    </DonutChart>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                      {taskSegments.filter(s => s.value > 0).map(seg => (
                        <div key={seg.label} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="text-sm text-muted-foreground">{seg.label}</span>
                          <span className="text-sm font-semibold">{seg.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-0">
                    <CardTitle className="text-sm">專案健康度</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center py-5 gap-4">
                    <DonutChart segments={statusSegments} size={150} strokeWidth={22}>
                      <div className="text-center">
                        <div className="text-2xl font-bold">{filteredProjects.length}</div>
                        <div className="text-xs text-muted-foreground">專案</div>
                      </div>
                    </DonutChart>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                      {statusSegments.filter(s => s.value > 0).map(seg => (
                        <div key={seg.label} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                          <span className="text-sm text-muted-foreground">{seg.label}</span>
                          <span className="text-sm font-semibold">{seg.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-0">
                    <CardTitle className="text-sm">預算執行</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center py-5 gap-4">
                    <DonutChart
                      segments={[
                        { value: displayStats.budgetUsed, color: budgetPct > 100 ? '#ef4444' : budgetPct > 80 ? '#f59e0b' : '#10b981', label: '已使用' },
                        { value: Math.max(displayStats.budget - displayStats.budgetUsed, 0), color: '#e2e8f0', label: '剩餘' },
                      ]}
                      size={150} strokeWidth={22}
                    >
                      <div className="text-center">
                        <div className={cn('text-2xl font-bold', budgetPct > 100 && 'text-destructive')}>{budgetPct}%</div>
                        <div className="text-xs text-muted-foreground">執行率</div>
                      </div>
                    </DonutChart>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-emerald-500" />
                        <span className="text-sm text-muted-foreground">已使用</span>
                        <span className="text-sm font-semibold">{fmtMoney(displayStats.budgetUsed)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-slate-200" />
                        <span className="text-sm text-muted-foreground">剩餘</span>
                        <span className="text-sm font-semibold">{fmtMoney(Math.max(displayStats.budget - displayStats.budgetUsed, 0))}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Project Progress Cards — mini ring per project */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">各專案進度</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {filteredProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProjectId(p.id)}
                        className="relative p-3 rounded-lg border hover:border-primary/40 hover:shadow-sm transition-all text-left flex items-center gap-3"
                      >
                        {p.projectTier && (
                          <span className={cn(
                            'absolute top-1.5 right-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none',
                            p.projectTier === 'T1' ? 'bg-blue-100 text-blue-700' :
                            p.projectTier === 'T2' ? 'bg-emerald-100 text-emerald-700' :
                            p.projectTier === 'T3' ? 'bg-amber-100 text-amber-700' :
                            'bg-purple-100 text-purple-700'
                          )}>
                            {p.projectTier}
                          </span>
                        )}
                        <MiniRing value={p.progress} color={getStatusRingColor(p.status)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate pr-8">{p.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusDot status={p.status} />
                            <span className="text-xs text-muted-foreground">{p.doneTasks}/{p.totalTasks} 任務</span>
                            <span className="text-xs text-muted-foreground">{p.doneMilestones}/{p.totalMilestones} 里程碑</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ══════ Single project view — Tabs ══════ */}
          {selectedProject && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0">
                <TabsTrigger value="overview" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-4 py-2.5 gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" /> 總覽
                </TabsTrigger>
                <TabsTrigger value="schedule" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-4 py-2.5 gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> 時程
                </TabsTrigger>
                <TabsTrigger value="team" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-4 py-2.5 gap-1.5">
                  <Users className="h-3.5 w-3.5" /> 團隊
                </TabsTrigger>
                <TabsTrigger value="risks" className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-4 py-2.5 gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" /> 風險延期
                </TabsTrigger>
              </TabsList>

              {/* ── Tab: 總覽 ── */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Donut Charts — 3-col */}
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-0">
                      <CardTitle className="text-sm">任務狀態分佈</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center py-5 gap-4">
                      <DonutChart segments={taskSegments} size={150} strokeWidth={22}>
                        <div className="text-center">
                          <div className="text-2xl font-bold">{displayStats.totalTasks}</div>
                          <div className="text-xs text-muted-foreground">總任務</div>
                        </div>
                      </DonutChart>
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                        {taskSegments.filter(s => s.value > 0).map(seg => (
                          <div key={seg.label} className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                            <span className="text-sm text-muted-foreground">{seg.label}</span>
                            <span className="text-sm font-semibold">{seg.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-0">
                      <CardTitle className="text-sm">里程碑狀態</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center py-5 gap-4">
                      <DonutChart
                        segments={[
                          { value: selectedProject.milestones.filter(m => m.status === 'done').length, color: '#10b981', label: '完成' },
                          { value: selectedProject.milestones.filter(m => m.status === 'in-progress').length, color: '#3b82f6', label: '進行中' },
                          { value: selectedProject.milestones.filter(m => m.status === 'todo').length, color: '#94a3b8', label: '待辦' },
                          { value: selectedProject.milestones.filter(m => m.status === 'blocked').length, color: '#ef4444', label: '受阻' },
                        ]}
                        size={150} strokeWidth={22}
                      >
                        <div className="text-center">
                          <div className="text-2xl font-bold">{selectedProject.progress}%</div>
                          <div className="text-xs text-muted-foreground">進度</div>
                        </div>
                      </DonutChart>
                      <div className="w-full space-y-1.5 px-2">
                        {selectedProject.milestones.map(m => (
                          <div key={m.id} className="flex items-center gap-2">
                            <span className={cn(
                              'h-2 w-2 rounded-full shrink-0',
                              m.status === 'done' ? 'bg-emerald-500' :
                              m.status === 'in-progress' ? 'bg-blue-500' :
                              m.status === 'blocked' ? 'bg-red-500' : 'bg-slate-400',
                            )} />
                            <span className="text-[11px] truncate">{m.name}</span>
                            <span className="text-[11px] font-semibold ml-auto">{m.progress}%</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-0">
                      <CardTitle className="text-sm">預算執行</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center py-5 gap-4">
                      <DonutChart
                        segments={[
                          { value: displayStats.budgetUsed, color: budgetPct > 100 ? '#ef4444' : budgetPct > 80 ? '#f59e0b' : '#10b981', label: '已使用' },
                          { value: Math.max(displayStats.budget - displayStats.budgetUsed, 0), color: '#e2e8f0', label: '剩餘' },
                        ]}
                        size={150} strokeWidth={22}
                      >
                        <div className="text-center">
                          <div className={cn('text-2xl font-bold', budgetPct > 100 && 'text-destructive')}>{budgetPct}%</div>
                          <div className="text-xs text-muted-foreground">執行率</div>
                        </div>
                      </DonutChart>
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-emerald-500" />
                          <span className="text-sm text-muted-foreground">已使用</span>
                          <span className="text-sm font-semibold">{fmtMoney(displayStats.budgetUsed)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-slate-200" />
                          <span className="text-sm text-muted-foreground">剩餘</span>
                          <span className="text-sm font-semibold">{fmtMoney(Math.max(displayStats.budget - displayStats.budgetUsed, 0))}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Milestone progress + Project info */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">里程碑進度</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedProject.milestones.map(m => (
                        <div key={m.id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium truncate mr-2">{m.name}</span>
                            <span className="text-muted-foreground shrink-0">{m.progress}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${m.progress}%`,
                              backgroundColor: m.status === 'done' ? '#10b981' : m.status === 'blocked' ? '#ef4444' : '#3b82f6',
                            }} />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">專案資訊</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1.5">專案類型</div>
                          <div className="font-medium">{PROJECT_TYPE_LABELS[selectedProject.projectType]}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1.5">負責人</div>
                          <div className="font-medium">{selectedProject.owner}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1.5">專案期間</div>
                          <div className="font-medium">
                            {new Date(selectedProject.startDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })} ~ {new Date(selectedProject.endDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1.5">預算</div>
                          <div className="font-medium">{fmtMoney(selectedProject.budgetUsed)} / {fmtMoney(selectedProject.budget)}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1.5">週報更新</div>
                          <div className="font-medium">{selectedProject.weeklyUpdatesCount} 次</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1.5">團隊</div>
                          <div className="font-medium">{selectedProject.teamSize} 人</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* ── Tab: 時程 ── */}
              <TabsContent value="schedule" className="space-y-4 mt-4">
                {detailLoading ? (
                  <Card>
                    <CardContent className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">載入詳細資料...</span>
                    </CardContent>
                  </Card>
                ) : detailProject ? (
                  <>
                    <Collapsible open={ganttExpanded} onOpenChange={setGanttExpanded}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-2 text-sm font-semibold cursor-pointer hover:text-foreground/80 transition-colors py-1">
                          <ChevronDown className={cn('h-4 w-4 transition-transform', !ganttExpanded && '-rotate-90')} />
                          甘特圖
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="overflow-hidden min-w-0">
                          <GanttChart
                            tasks={detailProject.tasks}
                            milestones={detailProject.milestones}
                            startDate={detailProject.startDate}
                            endDate={detailProject.endDate}
                            showBaseline={true}
                            taskLogs={detailProject.taskLogs}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {tasksByMilestone.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5" /> 任務明細
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {tasksByMilestone.map(({ milestone, tasks: msTasks }) => (
                            <div key={milestone.id}>
                              <div className="flex items-center gap-2 mb-2 pb-1 border-b">
                                <span className={cn(
                                  'h-2 w-2 rounded-full shrink-0',
                                  milestone.status === 'done' ? 'bg-emerald-500' :
                                  milestone.status === 'in-progress' ? 'bg-blue-500' :
                                  milestone.status === 'blocked' ? 'bg-red-500' : 'bg-slate-400',
                                )} />
                                <span className="text-sm font-semibold">{milestone.name}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {milestone.progress}% &middot; 到期 {milestone.dueDate}
                                </span>
                              </div>
                              {msTasks.length === 0 ? (
                                <p className="text-xs text-muted-foreground pl-4">無任務</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm table-fixed">
                                    <colgroup>
                                      <col className="w-[35%]" />
                                      <col className="w-[12%]" />
                                      <col className="w-[10%]" />
                                      <col className="w-[8%]" />
                                      <col className="w-[22%]" />
                                      <col className="w-[13%]" />
                                    </colgroup>
                                    <thead>
                                      <tr className="text-xs text-muted-foreground border-b">
                                        <th className="text-left py-1 pl-4 font-medium">任務名稱</th>
                                        <th className="text-left py-1 font-medium">負責人</th>
                                        <th className="text-left py-1 font-medium">狀態</th>
                                        <th className="text-left py-1 font-medium">優先</th>
                                        <th className="text-left py-1 font-medium">起迄</th>
                                        <th className="text-left py-1 font-medium">進度</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {msTasks.map(task => (
                                        <React.Fragment key={task.id}>
                                          <tr className="border-b border-dashed hover:bg-muted/30">
                                            <td className="py-1.5 pl-4 max-w-0 overflow-hidden">
                                              <div className="font-medium truncate">{task.title}</div>
                                            </td>
                                            <td className="py-1.5 max-w-0 overflow-hidden">
                                              <div className="text-muted-foreground truncate">{task.assignee}</div>
                                            </td>
                                            <td className="py-1.5">{getStatusBadge(task.status)}</td>
                                            <td className="py-1.5">{getPriorityBadge(task.priority)}</td>
                                            <td className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                                              {task.startDate} ~ {task.endDate}
                                            </td>
                                            <td className="py-1.5 pr-2">
                                              <div className="flex items-center gap-1.5">
                                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${task.progress}%` }} />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{task.progress}%</span>
                                              </div>
                                            </td>
                                          </tr>
                                          {task.subtasks?.map(sub => (
                                            <tr key={sub.id} className="border-b border-dashed hover:bg-muted/20">
                                              <td className="py-1 pl-6 max-w-0 overflow-hidden">
                                                <div className="text-muted-foreground truncate">
                                                  <span className="text-xs">└ </span>{sub.title}
                                                </div>
                                              </td>
                                              <td className="py-1 max-w-0 overflow-hidden">
                                                <div className="text-xs text-muted-foreground truncate">{sub.assignee}</div>
                                              </td>
                                              <td className="py-1">{getStatusBadge(sub.status)}</td>
                                              <td className="py-1">{getPriorityBadge(sub.priority)}</td>
                                              <td className="py-1 text-xs text-muted-foreground whitespace-nowrap">
                                                {sub.startDate} ~ {sub.endDate}
                                              </td>
                                              <td className="py-1 pr-2">
                                                <div className="flex items-center gap-1.5">
                                                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                    <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${sub.progress}%` }} />
                                                  </div>
                                                  <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{sub.progress}%</span>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </React.Fragment>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : null}
              </TabsContent>

              {/* ── Tab: 團隊 ── */}
              <TabsContent value="team" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" /> 團隊工作量
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {displayTeamWorkload.map(m => (
                      <div key={m.name} className="flex items-center gap-3">
                        <span className="text-sm font-medium w-[72px] truncate shrink-0">{m.name}</span>
                        <div className="flex-1 h-5 rounded bg-muted overflow-hidden relative">
                          <div
                            className="h-full rounded bg-primary/80 transition-all"
                            style={{ width: `${(m.total / maxMemberTasks) * 100}%` }}
                          />
                          <div
                            className="h-full rounded bg-emerald-500 absolute top-0 left-0 transition-all"
                            style={{ width: `${(m.done / maxMemberTasks) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground shrink-0 w-[52px] text-right">{m.done}/{m.total}</span>
                      </div>
                    ))}
                    {displayTeamWorkload.length > 0 && (
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
                        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-emerald-500 inline-block" />已完成</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-primary/80 inline-block" />總任務</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {detailProject && recentActivity.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" /> 近期活動記錄（最近兩週）
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {recentActivity.map(({ weekStart, items }) => (
                        <div key={weekStart}>
                          <div className="text-xs font-semibold text-muted-foreground mb-2">
                            {weekStart} 起的一週
                          </div>
                          <div className="space-y-1.5">
                            {items.slice(0, 20).map(({ log, task }) => (
                              <div
                                key={log.id}
                                className={cn(
                                  'flex items-start gap-3 text-sm py-1.5 px-2 rounded',
                                  task?.status === 'done' && 'bg-emerald-50 dark:bg-emerald-950/20',
                                )}
                              >
                                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                                  {log.logDate}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">{task?.title || '(未知任務)'}</span>
                                  {task?.status === 'done' && (
                                    <Badge className="text-[10px] px-1 py-0 bg-emerald-100 text-emerald-700 ml-1.5">完成</Badge>
                                  )}
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    {log.content.length > 80 ? log.content.slice(0, 80) + '...' : log.content}
                                  </p>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">{log.author}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ── Tab: 風險延期 ── */}
              <TabsContent value="risks" className="space-y-4 mt-4">
                {detailLoading ? (
                  <Card>
                    <CardContent className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">載入詳細資料...</span>
                    </CardContent>
                  </Card>
                ) : detailProject ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldAlert className="h-3.5 w-3.5" /> 未解決風險
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {detailProject.risks.filter(r => r.status === 'open').length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">目前無未解決風險</p>
                        ) : (
                          detailProject.risks.filter(r => r.status === 'open').map(risk => (
                            <div key={risk.id} className="p-3 rounded-lg border space-y-1">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className={cn(
                                  'h-3.5 w-3.5 shrink-0',
                                  risk.impact === 'high' ? 'text-red-500' :
                                  risk.impact === 'medium' ? 'text-amber-500' : 'text-slate-400',
                                )} />
                                <span className="text-sm font-medium">{risk.title}</span>
                                <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                                  {risk.impact === 'high' ? '高' : risk.impact === 'medium' ? '中' : '低'}影響
                                </Badge>
                              </div>
                              {risk.description && (
                                <p className="text-xs text-muted-foreground pl-5">
                                  {risk.description.length > 120 ? risk.description.slice(0, 120) + '...' : risk.description}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Timer className="h-3.5 w-3.5" /> 延期申請
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {detailProject.delayRequests.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">目前無延期申請</p>
                        ) : (
                          detailProject.delayRequests.map(dr => (
                            <div key={dr.id} className="p-3 rounded-lg border space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Badge className={cn(
                                  'text-[10px] px-1.5 py-0',
                                  dr.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                  dr.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                                  'bg-red-100 text-red-700 border-red-300',
                                )}>
                                  {dr.status === 'pending' ? '待審' : dr.status === 'approved' ? '已核准' : '已拒絕'}
                                </Badge>
                                {dr.taskTitle && (
                                  <span className="text-sm font-medium truncate">{dr.taskTitle}</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {dr.reason.length > 100 ? dr.reason.slice(0, 100) + '...' : dr.reason}
                              </p>
                              {dr.affectedMilestones.length > 0 && (
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  {dr.affectedMilestones.map((am, i) => {
                                    const msName = detailProject.milestones.find(m => m.id === am.milestoneId)?.name || am.milestoneId
                                    return (
                                      <div key={i} className="flex items-center gap-1">
                                        <span className="truncate">{msName}:</span>
                                        <span className="line-through">{am.originalDate}</span>
                                        <span>→</span>
                                        <span className="font-medium">{am.proposedDate}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">尚無風險或延期資料</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
    </DashboardLayout>
  )
}
