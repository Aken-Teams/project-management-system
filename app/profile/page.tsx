'use client'

import { useState, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/lib/auth-context'
import { useProjectStore } from '@/lib/project-store'
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

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const { projects } = useProjectStore()

  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')

  const stats = useMemo(() => {
    if (!user) return { projects: 0, totalTasks: 0, completed: 0, pending: 0 }

    const userProjects = projects.filter(p => p.team.includes(user.name) || p.owner === user.name)
    const userTasks = projects.flatMap(p => p.tasks.filter(t => t.assignee === user.name))
    const completedTasks = userTasks.filter(t => !!t.completedAt)
    const pendingTasks = userTasks.filter(t => !t.completedAt)

    return {
      projects: userProjects.length,
      totalTasks: userTasks.length,
      completed: completedTasks.length,
      pending: pendingTasks.length,
    }
  }, [user, projects])

  const recentLogs = useMemo(() => {
    if (!user) return []
    return projects
      .flatMap(p => p.taskLogs
        .filter(l => l.loggedBy === user.name)
        .map(l => {
          const task = p.tasks.find(t => t.id === l.taskId)
          return { ...l, projectName: p.name, taskTitle: task?.title || l.taskId }
        })
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
  }, [user, projects])

  if (!user) return null

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('姓名不能為空')
      return
    }
    updateUser({ name: name.trim(), email: email.trim() })
    toast.success('個人資料已更新')
  }

  const hasChanges = name !== user.name || email !== user.email

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">個人資料</h1>
          <p className="text-sm text-muted-foreground mt-1">管理您的個人資訊</p>
        </div>

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
              </div>

              {/* Form Section */}
              <div className="flex-1 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleSave}
                    disabled={!hasChanges}
                  >
                    <Save className="h-3.5 w-3.5" />
                    儲存變更
                  </Button>
                  {hasChanges && (
                    <span className="text-sm text-muted-foreground">有未儲存的變更</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">參與專案</span>
              <FolderKanban className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold">{stats.projects}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">總任務數</span>
              <ListChecks className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.totalTasks}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">已完成</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">進行中</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          </Card>
        </div>

        {/* Recent Activity */}
        {recentLogs.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                近期活動
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0 divide-y">
                {recentLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary/40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{log.taskTitle}</span>
                        <span className="text-muted-foreground"> — {log.projectName}</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{log.content}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(log.createdAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
