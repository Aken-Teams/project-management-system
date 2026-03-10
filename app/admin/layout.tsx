'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { isAdmin } from '@/lib/permissions'
import { DashboardLayout } from '@/components/dashboard-layout'
import { AdminTabNav } from '@/components/admin/admin-tab-nav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !isAdmin(user))) {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  if (loading || !user || !isAdmin(user)) return null

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">管理後台</h1>
            <p className="text-sm text-muted-foreground mt-1">系統設定、使用者管理與角色權限</p>
          </div>
        </div>
        <AdminTabNav />
        {children}
      </div>
    </DashboardLayout>
  )
}
