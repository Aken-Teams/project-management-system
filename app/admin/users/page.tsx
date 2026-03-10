'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  Search, ChevronLeft, ChevronRight, Pencil, ChevronDown, ChevronRight as ChevronRightIcon,
  Building2, Users, Loader2, FolderOpen, ExternalLink, CalendarCheck, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────

type UserRole = 'pm' | 'member' | 'executive' | 'admin'

interface AdminUser {
  id: string
  name: string
  email: string
  role: UserRole
  jobTitle: string
  organization: string
  createdAt: string
  _count: { ownedProjects: number }
}

interface OrgTreeNode {
  name: string
  directCount: number
  totalCount: number
  children: OrgTreeNode[]
}

interface ProjectStat {
  id: string
  name: string
  status: string
  progress: number
  projectTier: string | null
  startDate: string
  endDate: string
  totalMilestones: number
  doneMilestones: number
  overdueMilestones: number
}

interface TeamProject {
  id: string
  name: string
  status: string
  projectTier: string | null
  teamRole: string
}

interface WeeklyUpdateSummary {
  weekOf: string
  status: 'on_time' | 'delay'
}

interface UserDetail {
  user: AdminUser & { _count: { ownedProjects: number; teamMemberships: number } }
  ownedProjects: ProjectStat[]
  teamProjects: TeamProject[]
  weeklyUpdates: WeeklyUpdateSummary[]
}

// ─── Constants ────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  pm: '專案經理',
  member: '團隊成員',
  executive: '主管',
  admin: '系統管理員',
}

const ROLE_COLORS: Record<UserRole, string> = {
  pm: 'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-700',
  executive: 'bg-purple-100 text-purple-700',
  admin: 'bg-red-100 text-red-700',
}

const STATUS_COLORS: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  yellow: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
}

const TEAM_ROLE_LABELS: Record<string, string> = {
  R: '執行 (R)', A: '負責 (A)', C: '諮詢 (C)', I: '知會 (I)',
}

// ─── Org Tree helpers ──────────────────────────────────────

function collectNames(node: OrgTreeNode): string[] {
  return [node.name, ...node.children.flatMap(collectNames)]
}

// ─── OrgTreePanel ─────────────────────────────────────────

function OrgTreeNodeItem({
  node, depth, selectedOrg, onSelect,
}: {
  node: OrgTreeNode
  depth: number
  selectedOrg: string | null
  onSelect: (names: string[]) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <button
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-sm transition-colors group',
          selectedOrg === node.name
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted/50 text-foreground'
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(collectNames(node))}
      >
        {hasChildren ? (
          <span
            className="shrink-0 text-muted-foreground"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRightIcon className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <span className="shrink-0 w-3.5" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {node.totalCount}
        </span>
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map(child => (
            <OrgTreeNodeItem
              key={child.name}
              node={child}
              depth={depth + 1}
              selectedOrg={selectedOrg}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrgTreePanel({
  orgTree, orgLoading, selectedOrg, onSelect,
}: {
  orgTree: OrgTreeNode | null
  orgLoading: boolean
  selectedOrg: string | null
  onSelect: (org: string | null, names: string[]) => void
}) {
  return (
    <div className="w-56 shrink-0 flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-1">組織架構</p>

      {/* All */}
      <button
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors',
          selectedOrg === null
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted/50 text-foreground'
        )}
        onClick={() => onSelect(null, [])}
      >
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">全部人員</span>
        {orgTree && (
          <span className="text-xs text-muted-foreground tabular-nums">{orgTree.totalCount}</span>
        )}
      </button>

      {orgLoading && (
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 載入組織中...
        </div>
      )}

      {orgTree && (
        <OrgTreeNodeItem
          node={orgTree}
          depth={0}
          selectedOrg={selectedOrg}
          onSelect={names => onSelect(names[0] ?? null, names)}
        />
      )}
    </div>
  )
}

// ─── User Detail Sheet ─────────────────────────────────────

function UserDetailSheet({
  userId, open, onClose, user: authUser, onEditRole,
}: {
  userId: string | null
  open: boolean
  onClose: () => void
  user: { email: string } | null
  onEditRole: (u: AdminUser) => void
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId || !authUser || !open) return
    setLoading(true)
    fetch(`/api/admin/users/${userId}`, { headers: { 'x-user-email': authUser.email } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setDetail(d))
      .finally(() => setLoading(false))
  }, [userId, authUser, open])

  const u = detail?.user

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && u && detail && (
          <div className="space-y-6 pt-2">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-base font-semibold shrink-0">
                  {u.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-base leading-tight">{u.name}</div>
                  <div className="text-sm text-muted-foreground font-normal truncate">{u.email}</div>
                </div>
              </SheetTitle>
            </SheetHeader>

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">部門</p>
                <p className="font-medium">{u.organization || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">職稱</p>
                <p className="font-medium">{u.jobTitle || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">系統角色</p>
                <div className="flex items-center gap-2">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', ROLE_COLORS[u.role as UserRole])}>
                    {ROLE_LABELS[u.role as UserRole]}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEditRole(u as AdminUser)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">加入時間</p>
                <p className="font-medium">{new Date(u.createdAt).toLocaleDateString('zh-TW')}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '負責專案', value: u._count.ownedProjects },
                { label: '參與專案', value: u._count.teamMemberships },
                { label: '近期準時率', value: (() => {
                  const wus = detail.weeklyUpdates
                  if (!wus.length) return '—'
                  const onTime = wus.filter(w => w.status === 'on_time').length
                  return `${Math.round(onTime / wus.length * 100)}%`
                })() },
              ].map(s => (
                <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Owned projects */}
            {detail.ownedProjects.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" /> 負責的專案
                </p>
                <div className="space-y-2">
                  {detail.ownedProjects.map(p => (
                    <div key={p.id} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Link href={`/projects/${p.id}`} className="font-medium hover:underline flex items-center gap-1 truncate" target="_blank">
                          {p.name}
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </Link>
                        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0', STATUS_COLORS[p.status])}>
                          {p.status === 'green' ? '正常' : p.status === 'yellow' ? '警示' : '延誤'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarCheck className="h-3 w-3" />
                          {p.doneMilestones}/{p.totalMilestones} 里程碑完成
                        </span>
                        {p.overdueMilestones > 0 && (
                          <span className="flex items-center gap-1 text-red-500">
                            <AlertCircle className="h-3 w-3" />
                            {p.overdueMilestones} 逾期
                          </span>
                        )}
                        <span className="ml-auto">{p.progress}%</span>
                      </div>
                      {/* progress bar */}
                      <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team projects */}
            {detail.teamProjects.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-muted-foreground" /> 參與的專案
                </p>
                <div className="space-y-1.5">
                  {detail.teamProjects.map(p => (
                    <div key={p.id} className="flex items-center gap-3 text-sm border rounded-md px-3 py-2">
                      <Link href={`/projects/${p.id}`} className="flex-1 hover:underline truncate" target="_blank">
                        {p.name}
                      </Link>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {TEAM_ROLE_LABELS[p.teamRole] ?? p.teamRole}
                      </span>
                      <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0', STATUS_COLORS[p.status])}>
                        {p.status === 'green' ? '正常' : p.status === 'yellow' ? '警示' : '延誤'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weekly update history */}
            {detail.weeklyUpdates.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">近期週報狀態</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.weeklyUpdates.map(wu => (
                    <span
                      key={wu.weekOf}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs px-2 py-1 rounded',
                        wu.status === 'on_time'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      )}
                    >
                      {new Date(wu.weekOf).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                      {wu.status === 'on_time' ? ' 準時' : ' 延誤'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {detail.ownedProjects.length === 0 && detail.teamProjects.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">尚無專案紀錄</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Main Page ─────────────────────────────────────────────

export default function AdminUsersPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  // Org tree state
  const [orgTree, setOrgTree] = useState<OrgTreeNode | null>(null)
  const [orgLoading, setOrgLoading] = useState(true)
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
  const [selectedOrgNames, setSelectedOrgNames] = useState<string[]>([])

  // Users table state
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const limit = 20

  // Edit dialog
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('member')
  const [editOrg, setEditOrg] = useState('')
  const [saving, setSaving] = useState(false)

  // Detail sheet
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Search debounce
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load org tree
  useEffect(() => {
    setOrgLoading(true)
    fetch('/api/ad-users/org-tree')
      .then(r => r.ok ? r.json() : null)
      .then(d => setOrgTree(d))
      .catch(() => setOrgTree(null))
      .finally(() => setOrgLoading(false))
  }, [])

  // Load users
  const fetchUsers = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('q', search)
      if (roleFilter !== 'all') params.set('role', roleFilter)
      if (selectedOrgNames.length > 0) params.set('orgs', selectedOrgNames.join(','))
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { 'x-user-email': user.email },
      })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [user, page, search, roleFilter, selectedOrgNames])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleSearchChange = (v: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(v)
      setPage(1)
    }, 300)
  }

  const handleOrgSelect = (org: string | null, names: string[]) => {
    setSelectedOrg(org)
    setSelectedOrgNames(names)
    setPage(1)
  }

  const openEdit = (u: AdminUser) => {
    setEditingUser(u)
    setEditRole(u.role)
    setEditOrg(u.organization)
    setDetailOpen(false)
  }

  const handleSave = async () => {
    if (!editingUser || !user) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
        body: JSON.stringify({ role: editRole, organization: editOrg }),
      })
      if (res.ok) {
        toast({ title: '已更新', description: `${editingUser.name} 的資料已儲存` })
        setEditingUser(null)
        fetchUsers()
      }
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (u: AdminUser) => {
    setDetailUserId(u.id)
    setDetailOpen(true)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header + Toolbar */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">使用者管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">管理系統所有使用者的角色與部門資訊</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋姓名或 Email"
              className="pl-8 h-9 w-52"
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>
          <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(1) }}>
            <SelectTrigger className="h-9 w-32">
              <SelectValue placeholder="角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-5 min-h-0 flex-1">
        {/* Left: org tree */}
        <OrgTreePanel
          orgTree={orgTree}
          orgLoading={orgLoading}
          selectedOrg={selectedOrg}
          onSelect={handleOrgSelect}
        />

        {/* Right: users table */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">姓名</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">部門</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">職稱</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">角色</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">專案數</th>
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">沒有使用者</td>
                      </tr>
                    ) : users.map(u => (
                      <tr
                        key={u.id}
                        className="hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => openDetail(u)}
                      >
                        <td className="px-4 py-3 font-medium">{u.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.organization || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.jobTitle || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', ROLE_COLORS[u.role])}>
                            {ROLE_LABELS[u.role]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{u._count.ownedProjects}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(u)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">共 {total} 筆</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={open => !open && setEditingUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>編輯使用者</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-medium">{editingUser.name}</p>
                <p className="text-xs text-muted-foreground">{editingUser.email}</p>
              </div>
              <div className="space-y-1.5">
                <Label>角色</Label>
                <Select value={editRole} onValueChange={v => setEditRole(v as UserRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>部門</Label>
                <Input value={editOrg} onChange={e => setEditOrg(e.target.value)} placeholder="部門名稱" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? '儲存中...' : '儲存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Detail Sheet */}
      <UserDetailSheet
        userId={detailUserId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        user={user}
        onEditRole={openEdit}
      />
    </div>
  )
}
