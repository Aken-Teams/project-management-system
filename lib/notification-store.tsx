'use client'

import React from 'react'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './auth-context'

export type NotificationType =
  | 'task-assigned'
  | 'delay-submitted'
  | 'delay-approved'
  | 'delay-rejected'
  | 'task-overdue'
  | 'support-needed'
  | 'weekly-upload-missing'
  | 'weekly-report-ready'
  | 'record-uploaded'
  | 'report-review-needed'
  | 'report-published'
  | 'report-done-review'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  createdAt: string
  projectId?: string
}

interface NotificationStoreContextType {
  notifications: Notification[]
  unreadCount: number
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => Promise<void>
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  refreshNotifications: () => void
}

const NotificationStoreContext = createContext<NotificationStoreContextType | undefined>(undefined)

export function NotificationStoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/notifications?userId=${user.id}&limit=50`)
      if (res.ok) {
        const data: Notification[] = await res.json()
        setNotifications(data)
      }
    } catch {
      // silently fail — bell just shows empty
    } finally {
      setLoaded(true)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      setNotifications([])
      setLoaded(true)
      return
    }
    fetchNotifications()
    // 自動輪詢（不需手動刷新）。10s 讓「被別人指派/審核」等通知更即時。
    const interval = setInterval(fetchNotifications, 10000)
    // 切回分頁 / 視窗重新聚焦時立刻抓一次 → 回到頁面幾乎即時看到新通知
    const onVisible = () => { if (document.visibilityState === 'visible') fetchNotifications() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', fetchNotifications)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', fetchNotifications)
    }
  }, [user?.id, fetchNotifications])

  const unreadCount = notifications.filter(n => !n.read).length

  const addNotification = useCallback(async (data: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, ...data }),
      })
      if (res.ok) {
        const created: Notification = await res.json()
        setNotifications(prev => [created, ...prev])
      }
    } catch {
      // silently fail
    }
  }, [user?.id])

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    }).catch(() => {})
  }, [])

  const markAllAsRead = useCallback(() => {
    if (!user?.id) return
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    fetch('/api/notifications/mark-all-read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    }).catch(() => {})
  }, [user?.id])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const refreshNotifications = useCallback(() => {
    fetchNotifications()
  }, [fetchNotifications])

  return (
    <NotificationStoreContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      refreshNotifications,
    }}>
      {children}
    </NotificationStoreContext.Provider>
  )
}

export function useNotificationStore() {
  const context = useContext(NotificationStoreContext)
  if (context === undefined) {
    throw new Error('useNotificationStore must be used within a NotificationStoreProvider')
  }
  return context
}
