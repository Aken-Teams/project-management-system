'use client'

import { ReactNode, useEffect, useState } from 'react'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Settings,
  LogOut,
  User,
  ClipboardCheck,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/lib/project-store'
import { computeTaskStatus } from '@/lib/task-utils'
import { Badge } from '@/components/ui/badge'
import { NotificationBell } from '@/components/notification-bell'

interface DashboardLayoutProps {
  children: ReactNode
}

const navigation = [
  { name: '儀表板', href: '/dashboard', icon: LayoutDashboard, roles: ['pm', 'executive'] as const },
  { name: '我的任務', href: '/my-tasks', icon: ClipboardList, roles: ['pm', 'member'] as const },
  { name: '專案看板', href: '/projects', icon: FolderKanban },
  { name: '報告', href: '/reports', icon: FileText, roles: ['pm', 'executive'] as const },
  { name: '審批中心', href: '/approvals', icon: ClipboardCheck, roles: ['pm', 'executive'] as const },
]

const defaultRoute: Record<string, string> = {
  pm: '/dashboard',
  member: '/my-tasks',
  executive: '/dashboard',
}

const roleNames: Record<string, string> = {
  pm: '專案經理',
  member: '團隊成員',
  executive: '主管',
}

const SIDEBAR_KEY = 'sidebar-collapsed'

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, logout } = useAuth()
  const { getPendingApprovals, getTasksForUser } = useProjectStore()
  const pendingCount = getPendingApprovals().length
  const userTasks = user ? getTasksForUser(user.name) : []
  const atRiskCount = userTasks.filter(({ project, task }) => {
    const status = computeTaskStatus(task, project.taskLogs)
    return status === 'at-risk' || status === 'overdue'
  }).length

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Load sidebar state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === 'true') setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_KEY, String(next))
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!loading && user && pathname) {
      const isOnRestrictedPage = navigation.some(
        item => (pathname === item.href || pathname.startsWith(item.href + '/')) &&
                item.roles && !item.roles.includes(user.role)
      )
      if (isOnRestrictedPage) {
        router.replace(defaultRoute[user.role] || '/dashboard')
      }
    }
  }, [user, loading, pathname, router])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Demo notifications removed — will be replaced by real notification system

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">載入中...</div>
      </div>
    )
  }

  const visibleNav = navigation.filter(
    item => !('roles' in item) || !item.roles || item.roles.includes(user.role)
  )

  const getBadgeValue = (href: string) => {
    if (href === '/approvals') return pendingCount
    if (href === '/my-tasks') return atRiskCount
    return 0
  }

  const sidebarContent = (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={cn('flex items-center h-16 px-4 border-b border-border/50', collapsed && 'justify-center px-2')}>
          <Link href={defaultRoute[user.role] || '/dashboard'} className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FolderKanban className="h-5 w-5" />
            </div>
            {!collapsed && (
              <span className="text-base font-semibold truncate">專案管理系統</span>
            )}
          </Link>
          {!collapsed && <NotificationBell />}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            const badgeValue = getBadgeValue(item.href)
            const showBadge = badgeValue > 0

            const linkContent = (
              <Link key={item.name} href={item.href} className="block">
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    collapsed && 'justify-center px-2'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                  {showBadge && (
                    <Badge
                      variant={item.href === '/my-tasks' ? 'secondary' : 'destructive'}
                      className={cn(
                        'h-5 min-w-5 px-1 flex items-center justify-center text-sm',
                        collapsed
                          ? 'absolute -top-1 -right-1 p-0 w-5'
                          : 'ml-auto'
                      )}
                    >
                      {badgeValue}
                    </Badge>
                  )}
                </div>
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <p>{item.name}</p>
                  </TooltipContent>
                </Tooltip>
              )
            }

            return linkContent
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="px-3 py-2 border-t border-border/50 hidden md:block">
          <button
            onClick={toggleCollapsed}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors w-full',
              collapsed && 'justify-center px-2'
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            {!collapsed && <span>收合選單</span>}
          </button>
        </div>

        {/* User */}
        <div className={cn('px-3 py-3 border-t border-border/50', collapsed && 'px-2')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 w-full hover:bg-accent transition-colors',
                  collapsed && 'justify-center px-2'
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {user.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-medium truncate w-full text-left">{user.name}</span>
                    <span className="text-sm text-muted-foreground">{roleNames[user.role]}</span>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={collapsed ? 'center' : 'end'}
              side={collapsed ? 'right' : 'top'}
              sideOffset={8}
              className="w-56"
            >
              <DropdownMenuLabel>我的帳號</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/profile')}>
                <User className="mr-2 h-4 w-4" />
                個人資料
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                設定
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
    </TooltipProvider>
  )

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r bg-card fixed inset-y-0 left-0 z-40 transition-all duration-300',
          collapsed ? 'w-[68px]' : 'w-60'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 bg-card border-r transition-transform duration-300 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main Area */}
      <div className={cn(
        'flex-1 flex flex-col min-h-screen transition-all duration-300',
        collapsed ? 'md:ml-[68px]' : 'md:ml-60'
      )}>
        {/* Mobile Top Bar */}
        <header className="sticky top-0 z-30 flex items-center h-14 px-4 border-b bg-card md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-accent"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 font-semibold text-sm flex-1">專案管理系統</span>
          <NotificationBell />
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
