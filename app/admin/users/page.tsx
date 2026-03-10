'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Search, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'

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

export default function AdminUsersPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('member')
  const [editOrg, setEditOrg] = useState('')
  const [saving, setSaving] = useState(false)
  const limit = 20

  const fetchUsers = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('q', search)
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
  }, [user, page, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const openEdit = (u: AdminUser) => {
    setEditingUser(u)
    setEditRole(u.role)
    setEditOrg(u.organization)
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

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">使用者管理</h2>
        <p className="text-sm text-muted-foreground mt-0.5">管理系統所有使用者的角色與部門資訊</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜尋姓名或 Email"
            className="pl-8 h-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {/* Table */}
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
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">載入中...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">沒有使用者</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.organization || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.jobTitle || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u._count.ownedProjects}</td>
                    <td className="px-4 py-3">
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
    </div>
  )
}
