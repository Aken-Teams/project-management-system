'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/lib/auth-context'
import { TEAM_ROLE_LABELS } from '@/lib/mock-data'
import { toast } from 'sonner'
import {
  User,
  Mail,
  Shield,
  FolderKanban,
  ListChecks,
  CheckCircle2,
  Clock,
  Save,
  Activity,
  Building2,
  CalendarDays,
  Loader2,
  AlertCircle,
  Crown,
  ExternalLink,
} from 'lucide-react'

const roleNames: Record<string, string> = {
  pm: '專案經理',
  member: '團隊成員',
  executive: '主管',
}

const roleBadgeColors: Record<string, string> = {
  pm: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  member: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  executive: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
}

interface ProfileData {
  id: string
  name: string
  email: string
  role: string
  organization: string
  createdAt: string
  stats: {
    projectCount: number
    ownedProjectCount: number
    totalTasks: number
    completedTasks: number
    inProgressTasks: number
    todoTasks: number
    blockedTasks: number
  }
  recentLogs: {
    id: string
    content: string
    logDate: string
    taskTitle: string
    projectName: string
  }[]
  projects: {
    id: string
    name: string
    projectCode: string
    role: string
    isOwner: boolean
  }[]
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const router = useRouter()

  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')

  const fetchProfile = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(`/api/users/${user.id}`)
      if (!res.ok) throw new Error()
      const data: ProfileData = await res.json()
      setProfileData(data)
      setName(data.name)
      setEmail(data.email)
      setOrganization(data.organization || '')
    } catch {
      toast.error('載入個人資料失敗')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  if (!user) return null

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('姓名不能為空')
      return
    }
    if (!email.trim()) {
      toast.error('Email 不能為空')
      return
    }
    setSaving(true)
    const ok = await updateUser({
      name: name.trim(),
      email: email.trim(),
      organization: organization.trim(),
    })
    setSaving(false)
    if (ok) {
      toast.success('個人資料已更新')
      // Refresh profile data from API
      fetchProfile()
    } else {
      toast.error('更新失敗，請稍後再試')
    }
  }

  const hasChanges = profileData
    ? name !== profileData.name || email !== profileData.email || organization !== (profileData.organization || '')
    : false

  const stats = profileData?.stats

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">個人資料</h1>
          <p className="text-sm text-muted-foreground mt-1">管理您的個人資訊</p>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              載入中...
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Profile Info Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Avatar Section */}
                  <div className="flex flex-col items-center gap-3">
                    <Avatar className="h-20 w-20">
                      <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                        {user.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <Badge className={`text-sm ${roleBadgeColors[user.role]}`}>
                      <Shield className="h-3 w-3 mr-1" />
                      {roleNames[user.role]}
                    </Badge>
                    {profileData?.createdAt && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {profileData.createdAt} 加入
                      </span>
                    )}
                  </div>

                  {/* Form Section */}
                  <div className="flex-1 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="profile-name" className="flex items-center gap-1.5 text-sm">
                          <User className="h-3.5 w-3.5" />
                          姓名
                        </Label>
                        <Input
                          id="profile-name"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder="輸入姓名"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="profile-email" className="flex items-center gap-1.5 text-sm">
                          <Mail className="h-3.5 w-3.5" />
                          電子郵件
                        </Label>
                        <Input
                          id="profile-email"
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="輸入電子郵件"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="profile-org" className="flex items-center gap-1.5 text-sm">
                          <Building2 className="h-3.5 w-3.5" />
                          組織 / 部門
                        </Label>
                        <Input
                          id="profile-org"
                          value={organization}
                          onChange={e => setOrganization(e.target.value)}
                          placeholder="輸入組織或部門名稱"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-1">
                      {hasChanges && (
                        <span className="text-sm text-muted-foreground">有未儲存的變更</span>
                      )}
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={handleSave}
                        disabled={!hasChanges || saving}
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        儲存變更
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">參與專案</span>
                  <FolderKanban className="h-4 w-4 text-primary" />
                </div>
                <div className="text-2xl font-bold">{stats?.projectCount ?? 0}</div>
                {(stats?.ownedProjectCount ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">其中 {stats!.ownedProjectCount} 個為負責人</p>
                )}
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">總任務數</span>
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">{stats?.totalTasks ?? 0}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">已完成</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-bold text-emerald-600">{stats?.completedTasks ?? 0}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">進行中</span>
                  <Clock className="h-4 w-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold text-amber-600">{stats?.inProgressTasks ?? 0}</div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">待開始</span>
                  <AlertCircle className="h-4 w-4 text-slate-400" />
                </div>
                <div className="text-2xl font-bold text-slate-500">{stats?.todoTasks ?? 0}</div>
              </Card>
            </div>

            {/* Projects + Recent Activity row */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* My Projects */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                    參與的專案
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profileData && profileData.projects.length > 0 ? (
                    <div className="space-y-0 divide-y">
                      {profileData.projects.map(p => (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
                          onClick={() => router.push(`/projects/${p.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{p.name}</span>
                              {p.isOwner && (
                                <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{p.projectCode}</span>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {TEAM_ROLE_LABELS[p.role as keyof typeof TEAM_ROLE_LABELS] || p.role}
                          </Badge>
                          <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">尚未參與任何專案</p>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    近期活動
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profileData && profileData.recentLogs.length > 0 ? (
                    <div className="space-y-0 divide-y">
                      {profileData.recentLogs.map(log => (
                        <div key={log.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                          <div className="mt-1.5 h-2 w-2 rounded-full bg-primary/40 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">
                              <span className="font-medium">{log.taskTitle}</span>
                              <span className="text-muted-foreground"> — {log.projectName}</span>
                            </p>
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{log.content}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 mt-1">{log.logDate}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">尚無活動紀錄</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
