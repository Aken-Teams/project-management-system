'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  Search, ChevronLeft, ChevronRight, Pencil, ChevronDown, ChevronRight as ChevronRightIcon,
  Users, Loader2, FolderOpen, ExternalLink, CalendarCheck, AlertCircle, UserPlus, Eye,
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ─────────────────────────────────────────────────

type UserRole = 'pm' | 'member' | 'executive' | 'admin'

interface AdminUser {
  id: string; name: string; email: string; role: UserRole
  isActive: boolean; jobTitle: string; organization: string
  createdAt: string; _count: { ownedProjects: number }
}

interface OrgTreeNode {
  name: string; directCount: number; totalCount: number; children: OrgTreeNode[]
}

// Unified row type for table (works for both DB-list and AD-first views)
interface DisplayRow {
  key: string
  name: string; email: string; organization: string; jobTitle: string
  role: UserRole | null
  isActive: boolean | null   // null = not in system
  projectCount: number
  dbId: string | null
  inSystem: boolean
}

interface ProjectStat {
  id: string; name: string; status: string; progress: number
  projectTier: string | null; totalMilestones: number
  doneMilestones: number; overdueMilestones: number
}

interface TeamProject {
  id: string; name: string; status: string
  projectTier: string | null; teamRole: string
}

interface UserDetail {
  user: AdminUser & { _count: { ownedProjects: number; teamMemberships: number } }
  ownedProjects: ProjectStat[]
  teamProjects: TeamProject[]
  weeklyUpdates: { weekOf: string; status: 'on_time' | 'delay' }[]
}

// ─── Constants ──────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '系統管理員', executive: '主管', pm: '專案經理', member: '團隊成員',
}
const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: '系統管理員 — 管理所有系統設定與使用者',
  executive: '主管 — 檢視所有專案與報表、處理協助',
  pm: '專案經理 — 建立與管理專案、編輯預算',
  member: '團隊成員 — 參與被指派的專案',
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
const TIER_COLORS: Record<string, string> = {
  T1: 'bg-blue-100 text-blue-700',
  T2: 'bg-violet-100 text-violet-700',
  T3: 'bg-gray-100 text-gray-700',
  CIP: 'bg-amber-100 text-amber-700',
}
const TEAM_ROLE_LABELS: Record<string, string> = {
  R: '執行 (R)', A: '負責 (A)', C: '諮詢 (C)', I: '知會 (I)',
}

// ─── Helpers ────────────────────────────────────────────────

function collectNames(node: OrgTreeNode): string[] {
  return [node.name, ...node.children.flatMap(collectNames)]
}

function statusBadge(row: DisplayRow) {
  if (!row.inSystem)
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">未在系統</span>
  if (row.isActive === false)
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-600">已停用</span>
  return null
}

// ─── Org Tree ──────────────────────────────────────────────

const INDENT_PX = 14 // px per depth level

function OrgTreeNodeItem({
  node, depth, selectedOrg, onSelect,
}: {
  node: OrgTreeNode; depth: number
  selectedOrg: string | null
  onSelect: (names: string[]) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = node.children.length > 0
  const isSelected = selectedOrg === node.name

  return (
    <div>
      <button
        className={cn(
          'w-full flex items-start gap-1 text-left py-1.5 px-2 rounded-md transition-colors',
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-muted/50 text-foreground',
        )}
        style={{ paddingLeft: depth * INDENT_PX + 8 }}
        onClick={() => onSelect(collectNames(node))}
      >
        {hasChildren ? (
          <span
            className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className={cn(
          'flex-1 text-xs leading-5 min-w-0 break-words',
          depth === 0 && 'font-semibold',
          isSelected && 'font-medium',
        )}>
          {node.name}
        </span>
        <span className={cn(
          'shrink-0 mt-0.5 min-w-[22px] text-center text-[10px] font-semibold rounded-full px-1.5 py-px leading-4',
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted-foreground/15 text-muted-foreground',
        )}>
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
  orgTree: OrgTreeNode | null; orgLoading: boolean
  selectedOrg: string | null
  onSelect: (org: string | null, names: string[]) => void
}) {
  return (
    <div className="hidden lg:flex w-64 shrink-0 flex-col border-r pr-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
        組織架構
      </p>

      {/* All */}
      <button
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-left transition-colors mb-1',
          selectedOrg === null
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted/50 text-foreground font-medium'
        )}
        onClick={() => onSelect(null, [])}
      >
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">全部人員</span>
        {orgTree && (
          <span className={cn(
            'min-w-[22px] text-center text-[10px] font-semibold rounded-full px-1.5 py-px leading-4',
            selectedOrg === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted-foreground/15 text-muted-foreground',
          )}>
            {orgTree.totalCount}
          </span>
        )}
      </button>

      {/* Tree */}
      <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        {orgLoading && (
          <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> 載入中...
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
    </div>
  )
}

// ─── User Detail Sheet ──────────────────────────────────────

function UserDetailSheet({
  userId, open, onClose, authEmail, onEditUser,
}: {
  userId: string | null; open: boolean; onClose: () => void
  authEmail: string; onEditUser: (u: AdminUser) => void
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [tierFilter, setTierFilter] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || !open) { setDetail(null); setTierFilter(null); return }
    setLoading(true)
    fetch(`/api/admin/users/${userId}`, { headers: { 'x-user-email': authEmail } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setDetail(d))
      .finally(() => setLoading(false))
  }, [userId, open, authEmail])

  const u = detail?.user
  const allTiers = detail ? Array.from(new Set([
    ...detail.ownedProjects.map(p => p.projectTier),
    ...detail.teamProjects.map(p => p.projectTier),
  ].filter((t): t is string => !!t))).sort() : []
  const filteredOwned = detail ? (tierFilter ? detail.ownedProjects.filter(p => p.projectTier === tierFilter) : detail.ownedProjects) : []
  const filteredTeam = detail ? (tierFilter ? detail.teamProjects.filter(p => p.projectTier === tierFilter) : detail.teamProjects) : []

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className={cn(!loading && u ? '' : 'sr-only')}>
          <SheetTitle className="flex items-center gap-3">
            {u && (
              <>
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-base font-semibold shrink-0">
                  {u.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">{u.name}</span>
                    {u.isActive === false && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">已停用</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground font-normal truncate">{u.email}</div>
                </div>
              </>
            )}
            {!u && <span>使用者詳細資料</span>}
          </SheetTitle>
        </SheetHeader>
        {loading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && u && detail && (
          <div className="space-y-5 pt-2">

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground mb-0.5">部門</p><p className="font-medium">{u.organization || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground mb-0.5">職稱</p><p className="font-medium">{u.jobTitle || '—'}</p></div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">系統角色</p>
                <div className="flex items-center gap-2">
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', ROLE_COLORS[u.role as UserRole])}>
                    {ROLE_LABELS[u.role as UserRole]}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEditUser(u as AdminUser)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">加入時間</p>
                <p className="font-medium">{new Date(u.createdAt).toLocaleDateString('zh-TW')}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '負責專案', value: u._count.ownedProjects },
                { label: '參與專案', value: u._count.teamMemberships },
              ].map(s => (
                <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Tier filter */}
            {allTiers.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors',
                    !tierFilter ? 'bg-primary text-primary-foreground border-transparent' : 'bg-muted/60 text-muted-foreground border-muted-foreground/20 hover:bg-muted'
                  )}
                  onClick={() => setTierFilter(null)}
                >全部</button>
                {allTiers.map(t => (
                  <button key={t}
                    className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors',
                      tierFilter === t
                        ? cn(TIER_COLORS[t] ?? 'bg-primary text-primary-foreground', 'border-transparent')
                        : 'bg-muted/60 text-muted-foreground border-muted-foreground/20 hover:bg-muted'
                    )}
                    onClick={() => setTierFilter(v => v === t ? null : t)}
                  >{t}</button>
                ))}
              </div>
            )}

            {/* Owned projects */}
            {filteredOwned.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" /> 負責的專案
                </p>
                <div className="space-y-2">
                  {filteredOwned.map(p => (
                    <div key={p.id} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Link href={`/projects/${p.id}`} className="font-medium hover:underline flex items-center gap-1 truncate" target="_blank">
                          {p.name} <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </Link>
                        <span className={cn('inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0', STATUS_COLORS[p.status])}>
                          {p.status === 'green' ? '正常' : p.status === 'yellow' ? '注意' : '風險'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarCheck className="h-3 w-3" />
                          {p.doneMilestones}/{p.totalMilestones} 完成
                        </span>
                        {p.overdueMilestones > 0 && (
                          <span className="flex items-center gap-1 text-red-500">
                            <AlertCircle className="h-3 w-3" /> {p.overdueMilestones} 逾期
                          </span>
                        )}
                        <span className="ml-auto">{p.progress}%</span>
                      </div>
                      <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${p.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team projects */}
            {filteredTeam.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-muted-foreground" /> 參與的專案
                </p>
                <div className="space-y-1.5">
                  {filteredTeam.map(p => (
                    <div key={p.id} className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm">
                      <Link href={`/projects/${p.id}`} className="flex-1 hover:underline truncate" target="_blank">{p.name}</Link>
                      <span className="text-xs text-muted-foreground shrink-0">{TEAM_ROLE_LABELS[p.teamRole] ?? p.teamRole}</span>
                      <span className={cn('inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0', STATUS_COLORS[p.status])}>
                        {p.status === 'green' ? '正常' : p.status === 'yellow' ? '注意' : '風險'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weekly updates */}
            {detail.weeklyUpdates.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">近期週報狀態</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.weeklyUpdates.map(wu => (
                    <span key={wu.weekOf} className={cn(
                      'text-xs px-2 py-1 rounded',
                      wu.status === 'on_time' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    )}>
                      {new Date(wu.weekOf).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                      {wu.status === 'on_time' ? ' 準時' : ' 延誤'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {filteredOwned.length === 0 && filteredTeam.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">尚無專案紀錄</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Main Page ──────────────────────────────────────────────

export default function AdminUsersPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  // Org tree
  const [orgTree, setOrgTree] = useState<OrgTreeNode | null>(null)
  const [orgLoading, setOrgLoading] = useState(true)
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
  const [selectedOrgNames, setSelectedOrgNames] = useState<string[]>([])

  // Table data
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [tableLoading, setTableLoading] = useState(true)
  const limit = 10

  // Edit dialog (existing DB user)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('member')
  const [editOrg, setEditOrg] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [saving, setSaving] = useState(false)

  // Add-from-AD dialog (AD-only user)
  interface AddingUser { adUsername: string; name: string; org: string; email: string | null }
  const [addingUser, setAddingUser] = useState<AddingUser | null>(null)
  const [addRole, setAddRole] = useState<UserRole>('member')
  const [addOrg, setAddOrg] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  // Detail sheet
  const [detailDbId, setDetailDbId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

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

  // Load users table
  const fetchTable = useCallback(async () => {
    if (!user) return
    setTableLoading(true)
    try {
      if (selectedOrg !== null) {
        // AD-first: org members view
        const res = await fetch(
          `/api/admin/users/org-members?org=${encodeURIComponent(selectedOrg)}`,
          { headers: { 'x-user-email': user.email } }
        )
        if (res.ok) {
          const data: Array<{
            adUsername: string; name: string; email: string; organization: string
            jobTitle: string; role: UserRole | null; isActive: boolean | null
            projectCount: number; dbId: string | null; inSystem: boolean
          }> = await res.json()
          // Apply client-side search + role filter
          const filtered = data.filter(r => {
            const matchSearch = !search ||
              r.name.toLowerCase().includes(search.toLowerCase()) ||
              r.email.toLowerCase().includes(search.toLowerCase())
            const matchRole = roleFilter === 'all' ||
              (roleFilter === 'none' ? !r.inSystem : r.role === roleFilter)
            return matchSearch && matchRole
          })
          setRows(filtered.map(r => ({ ...r, key: r.adUsername })))
          setTotal(filtered.length)
        }
      } else {
        // DB users view (paginated)
        const params = new URLSearchParams({ page: String(page), limit: String(limit) })
        if (search) params.set('q', search)
        if (roleFilter !== 'all') params.set('role', roleFilter)
        const res = await fetch(`/api/admin/users?${params}`, {
          headers: { 'x-user-email': user.email },
        })
        if (res.ok) {
          const data = await res.json()
          setRows(data.users.map((u: AdminUser) => ({
            key: u.id,
            name: u.name, email: u.email, organization: u.organization,
            jobTitle: u.jobTitle, role: u.role, isActive: u.isActive,
            projectCount: u._count.ownedProjects, dbId: u.id, inSystem: true,
          })))
          setTotal(data.total)
        }
      }
    } finally {
      setTableLoading(false)
    }
  }, [user, selectedOrg, page, search, roleFilter])

  useEffect(() => { fetchTable() }, [fetchTable])

  const handleSearchChange = (v: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1) }, 300)
  }

  const handleOrgSelect = (org: string | null, names: string[]) => {
    setSelectedOrg(org); setSelectedOrgNames(names); setPage(1)
  }

  const openEdit = (row: DisplayRow) => {
    if (!row.dbId || !row.role) return
    setEditingUser({
      id: row.dbId, name: row.name, email: row.email,
      role: row.role, isActive: row.isActive ?? true,
      jobTitle: row.jobTitle, organization: row.organization,
      createdAt: '', _count: { ownedProjects: row.projectCount },
    })
    setEditRole(row.role)
    setEditOrg(row.organization)
    setEditActive(row.isActive ?? true)
    setDetailOpen(false)
  }

  const openEditFromDetail = (u: AdminUser) => {
    setEditingUser(u)
    setEditRole(u.role)
    setEditOrg(u.organization)
    setEditActive(u.isActive)
    setDetailOpen(false)
  }

  const openAddFromAd = async (row: DisplayRow) => {
    const draft: AddingUser = { adUsername: row.key, name: row.name, org: row.organization, email: null }
    setAddingUser(draft)
    setAddRole('member')
    setAddOrg(row.organization)
    setAddLoading(true)
    try {
      const res = await fetch(`/api/ad-users/${encodeURIComponent(row.key)}`)
      if (res.ok) {
        const data = await res.json()
        setAddingUser({ ...draft, email: data.email || `${row.key}@ad.panjit.local` })
        // Don't overwrite addOrg here — user may have already edited it
      } else {
        setAddingUser({ ...draft, email: `${row.key}@ad.panjit.local` })
      }
    } catch {
      setAddingUser({ ...draft, email: `${row.key}@ad.panjit.local` })
    } finally {
      setAddLoading(false)
    }
  }

  const handleAddSave = async () => {
    if (!addingUser?.email || !user) return
    setAdding(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
        body: JSON.stringify({ email: addingUser.email, name: addingUser.name, role: addRole, organization: addOrg }),
      })
      if (res.ok) {
        toast({ title: '已加入系統', description: `${addingUser.name} 已設定為 ${ROLE_LABELS[addRole]}` })
        setAddingUser(null)
        fetchTable()
      }
    } finally {
      setAdding(false)
    }
  }

  const handleSave = async () => {
    if (!editingUser || !user) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
        body: JSON.stringify({ role: editRole, organization: editOrg, isActive: editActive }),
      })
      if (res.ok) {
        toast({ title: '已更新', description: `${editingUser.name} 的資料已儲存` })
        setEditingUser(null)
        fetchTable()
      }
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.ceil(total / limit)
  // For org view, rows holds ALL filtered results; slice client-side for display
  const displayRows = selectedOrg !== null
    ? rows.slice((page - 1) * limit, page * limit)
    : rows

  return (
    <div className="flex flex-col gap-4">
      {/* Header + Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">使用者管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">管理系統所有使用者的角色與部門資訊</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋姓名或 Email"
              className="pl-8 h-9 w-44 sm:w-52 bg-muted/60"
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>
          <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(1) }}>
            <SelectTrigger className="h-9 w-28 sm:w-32 bg-muted/60">
              <SelectValue placeholder="角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              {Object.entries(ROLE_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium', ROLE_COLORS[v as UserRole])}>{label}</span>
                </SelectItem>
              ))}
              {selectedOrg !== null && (
                <SelectItem value="none">未在系統</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-5">
        {/* Left org tree */}
        <OrgTreePanel
          orgTree={orgTree}
          orgLoading={orgLoading}
          selectedOrg={selectedOrg}
          onSelect={handleOrgSelect}
        />

        {/* Right table */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">姓名</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="hidden lg:table-cell text-left px-4 py-3 font-medium text-muted-foreground">部門</th>
                      <th className="hidden xl:table-cell text-left px-4 py-3 font-medium text-muted-foreground">職稱</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">角色</th>
                      <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-muted-foreground">專案數</th>
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tableLoading ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
                          {selectedOrg ? `${selectedOrg} 沒有人員` : '沒有使用者'}
                        </td>
                      </tr>
                    ) : displayRows.map(row => (
                      <tr
                        key={row.key}
                        className={cn(
                          'transition-colors border-b last:border-0',
                          !row.inSystem && 'opacity-60',
                          row.isActive === false && 'bg-orange-50/30'
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={cn('font-medium', !row.inSystem && 'text-muted-foreground')}>
                              {row.name}
                            </span>
                            {statusBadge(row)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.email || '—'}</td>
                        <td className="hidden lg:table-cell px-4 py-3 text-muted-foreground max-w-[180px] truncate" title={row.organization}>
                          {row.organization || '—'}
                        </td>
                        <td className="hidden xl:table-cell px-4 py-3 text-muted-foreground">{row.jobTitle || '—'}</td>
                        <td className="px-4 py-3">
                          {row.role ? (
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', ROLE_COLORS[row.role])}>
                              {ROLE_LABELS[row.role]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-muted-foreground">{row.projectCount}</td>
                        <td className="px-4 py-3">
                          {row.inSystem ? (
                            <div className="flex items-center gap-0.5">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="查看詳細" onClick={() => { setDetailDbId(row.dbId); setDetailOpen(true) }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="編輯" onClick={() => openEdit(row)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-primary hover:text-primary hover:bg-primary/10"
                              title="加入系統並設定角色"
                              onClick={() => openAddFromAd(row)}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer — shown for both DB and org views */}
              {total > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    共 {total} 筆
                    {selectedOrg !== null && rows.filter(r => r.inSystem).length > 0 && (
                      <span className="ml-2 text-primary">
                        · {rows.filter(r => r.inSystem).length} 人在系統中
                      </span>
                    )}
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">{page} / {totalPages}</span>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
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
                    {Object.entries(ROLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>部門</Label>
                <Input value={editOrg} onChange={e => setEditOrg(e.target.value)} placeholder="部門名稱" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>帳號狀態</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">停用後人員名稱將顯示「已停用」</p>
                </div>
                <Switch checked={editActive} onCheckedChange={setEditActive} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? '儲存中...' : '儲存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add-from-AD Dialog */}
      <Dialog open={!!addingUser} onOpenChange={open => !open && setAddingUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> 加入系統
            </DialogTitle>
          </DialogHeader>
          {addingUser && (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-medium">{addingUser.name}</p>
                {addLoading ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> 取得帳號資料中...
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">{addingUser.email}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>系統角色</Label>
                <Select value={addRole} onValueChange={v => setAddRole(v as UserRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>部門</Label>
                <Input value={addOrg} readOnly className="bg-muted/50 text-muted-foreground cursor-default" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingUser(null)}>取消</Button>
            <Button onClick={handleAddSave} disabled={adding || addLoading}>
              {adding ? '儲存中...' : '加入系統'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <UserDetailSheet
        userId={detailDbId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        authEmail={user?.email ?? ''}
        onEditUser={openEditFromDetail}
      />
    </div>
  )
}
