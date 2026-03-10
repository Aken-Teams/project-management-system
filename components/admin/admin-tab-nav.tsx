'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Users, Settings, Bell, FileText, ShieldCheck, CalendarDays } from 'lucide-react'

const tabs = [
  { label: '使用者管理', href: '/admin/users', icon: Users },
  { label: '角色權限', href: '/admin/roles', icon: ShieldCheck },
  { label: '專案設定', href: '/admin/project-settings', icon: Settings },
  { label: '通知設定', href: '/admin/notifications', icon: Bell },
  { label: '報告設定', href: '/admin/reports', icon: FileText },
  { label: '排程行事曆', href: '/admin/schedule', icon: CalendarDays },
]

export function AdminTabNav() {
  const pathname = usePathname()

  return (
    <div className="border-b mb-6">
      <nav className="flex gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
