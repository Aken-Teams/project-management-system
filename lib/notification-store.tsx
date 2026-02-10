'use client'

import React from 'react'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { type Project } from './mock-data'
import { type User } from './auth-context'

export type NotificationType =
  | 'task-assigned'
  | 'delay-submitted'
  | 'delay-approved'
  | 'delay-rejected'
  | 'task-overdue'
  | 'support-needed'

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
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  generateDemoNotifications: (projects: Project[], user: User) => void
}

const NotificationStoreContext = createContext<NotificationStoreContextType | undefined>(undefined)

const STORAGE_KEY = 'pm-system-notifications'
const VERSION_KEY = 'pm-system-notifications-version'
const CURRENT_VERSION = '1'

export function NotificationStoreProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const storedVersion = localStorage.getItem(VERSION_KEY)
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && storedVersion === CURRENT_VERSION) {
      try {
        setNotifications(JSON.parse(stored))
      } catch {
        setNotifications([])
      }
    } else {
      setNotifications([])
      localStorage.setItem(VERSION_KEY, CURRENT_VERSION)
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    }
  }, [notifications, loaded])

  const unreadCount = notifications.filter(n => !n.read).length

  const addNotification = useCallback((data: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
    const notification: Notification = {
      ...data,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      read: false,
      createdAt: new Date().toISOString(),
    }
    setNotifications(prev => [notification, ...prev])
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const generateDemoNotifications = useCallback((projects: Project[], user: User) => {
    const notifs: Notification[] = []
    const now = new Date()

    // Generate relative timestamps for demo variety
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString()

    // 1. Tasks assigned to current user
    const userTasks = projects.flatMap(p =>
      p.tasks.filter(t => t.assignee === user.name && !t.completedAt).map(t => ({ project: p, task: t }))
    )
    userTasks.slice(0, 3).forEach(({ project, task }, i) => {
      notifs.push({
        id: `notif-demo-assign-${i}`,
        type: 'task-assigned',
        title: '新任務指派',
        message: `您被指派了「${task.title}」— ${project.name}`,
        read: i > 0,
        createdAt: hoursAgo(2 + i * 8),
        projectId: project.id,
      })
    })

    // 2. Overdue tasks
    projects.forEach(p => {
      p.tasks.filter(t => t.assignee === user.name && !t.completedAt && now > new Date(t.endDate))
        .slice(0, 2)
        .forEach((task, i) => {
          const daysOverdue = Math.ceil((now.getTime() - new Date(task.endDate).getTime()) / (1000 * 60 * 60 * 24))
          notifs.push({
            id: `notif-demo-overdue-${p.id}-${i}`,
            type: 'task-overdue',
            title: '任務逾期提醒',
            message: `「${task.title}」已逾期 ${daysOverdue} 天`,
            read: false,
            createdAt: hoursAgo(1 + i * 4),
            projectId: p.id,
          })
        })
    })

    // 3. Pending delay requests (for PM/executive)
    if (user.role === 'pm' || user.role === 'executive') {
      projects.forEach(p => {
        p.delayRequests.filter(r => r.status === 'pending').forEach((r, i) => {
          notifs.push({
            id: `notif-demo-delay-${r.id}`,
            type: 'delay-submitted',
            title: '延期申請待審核',
            message: `${r.requestedBy} 提交了延期申請 — ${p.name}`,
            read: false,
            createdAt: hoursAgo(3 + i * 6),
            projectId: p.id,
          })
        })
      })

      // Support needed
      projects.forEach(p => {
        p.delayRequests
          .filter(r => r.status === 'approved' && r.supportNeeded && r.supportNeeded.trim() !== '' && !r.supportResolved)
          .forEach((r, i) => {
            notifs.push({
              id: `notif-demo-support-${r.id}`,
              type: 'support-needed',
              title: '成員需要協助',
              message: `${r.requestedBy}：${r.supportNeeded}`,
              read: false,
              createdAt: hoursAgo(5 + i * 3),
              projectId: p.id,
            })
          })
      })
    }

    // 4. Recently reviewed delay requests (for the requester)
    projects.forEach(p => {
      p.delayRequests
        .filter(r => (r.status === 'approved' || r.status === 'rejected') && r.requestedBy === user.name)
        .slice(0, 2)
        .forEach((r, i) => {
          notifs.push({
            id: `notif-demo-review-${r.id}`,
            type: r.status === 'approved' ? 'delay-approved' : 'delay-rejected',
            title: r.status === 'approved' ? '延期申請已核准' : '延期申請已駁回',
            message: `您在「${p.name}」的延期申請已${r.status === 'approved' ? '核准' : '駁回'}`,
            read: true,
            createdAt: hoursAgo(12 + i * 24),
            projectId: p.id,
          })
        })
    })

    // Sort by createdAt descending
    notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    setNotifications(notifs)
  }, [])

  if (!loaded) return null

  return (
    <NotificationStoreContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      generateDemoNotifications,
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
