'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  LayoutDashboard,
  FolderKanban,
  GanttChart,
  FileText,
  Settings,
  LogOut,
  User,
  Plus,
  ClipboardCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/lib/project-store'
import { Badge } from '@/components/ui/badge'

interface DashboardLayoutProps {
  children: ReactNode
}

const navigation = [
  { name: '儀表板', href: '/dashboard', icon: LayoutDashboard },
  { name: '專案看板', href: '/projects', icon: FolderKanban },
  { name: '甘特圖', href: '/gantt', icon: GanttChart },
  { name: '報告', href: '/reports', icon: FileText },
  { name: '審批中心', href: '/approvals', icon: ClipboardCheck, roles: ['pm', 'executive'] as const },
]

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, logout, switchRole } = useAuth()
  const { getPendingApprovals } = useProjectStore()
  const pendingCount = getPendingApprovals().length

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const roleNames = {
    pm: '專案經理',
    member: '團隊成員',
    executive: '主管'
  }

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">載入中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FolderKanban className="h-5 w-5" />
              </div>
              <span className="text-lg font-semibold">專案管理系統</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-1">
              {navigation
                .filter(item => !('roles' in item) || !item.roles || item.roles.includes(user.role))
                .map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                const showBadge = item.href === '/approvals' && pendingCount > 0
                return (
                  <Link key={item.name} href={item.href}>
                    <Button
                      variant={isActive ? 'secondary' : 'ghost'}
                      size="sm"
                      className={cn(
                        'gap-2 relative',
                        isActive && 'bg-secondary'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.name}
                      {showBadge && (
                        <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                          {pendingCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* 只有 PM 可以建立專案 */}
            {user.role === 'pm' && (
              <Link href="/projects/new">
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  新增專案
                </Button>
              </Link>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {user.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground">{roleNames[user.role]}</span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>我的帳號</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  個人資料
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  設定
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  切換角色（示範）
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => switchRole('pm')}>
                  切換為專案經理
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchRole('member')}>
                  切換為團隊成員
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchRole('executive')}>
                  切換為主管
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  登出
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {children}
      </main>
    </div>
  )
}
