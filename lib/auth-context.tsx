'use client'

import React from "react"

import { createContext, useContext, useState, useEffect } from 'react'

export type UserRole = 'pm' | 'member' | 'executive' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  organization?: string
  avatar?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  switchRole: (role: UserRole) => void
  updateUser: (updates: Partial<Pick<User, 'name' | 'email' | 'organization'>>) => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Mock users data — emails must match DB seed users
const MOCK_USERS: User[] = [
  { id: '1', name: 'Alice Chen', email: 'alice@example.com', role: 'pm', avatar: '/avatars/alice.jpg' },
  { id: '2', name: 'Bob Wang', email: 'bob@example.com', role: 'member', avatar: '/avatars/bob.jpg' },
  { id: '3', name: 'Carol Lee', email: 'carol@example.com', role: 'executive', avatar: '/avatars/carol.jpg' },
]

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is stored in localStorage
    const storedUser = localStorage.getItem('currentUser')
    if (!storedUser) {
      setLoading(false)
      return
    }

    let parsed: User
    try {
      parsed = JSON.parse(storedUser)
    } catch {
      localStorage.removeItem('currentUser')
      setLoading(false)
      return
    }

    // Always re-resolve DB user ID and role from email (localStorage may have stale data)
    // Use AbortController to avoid long waits when DB is slow (cold start)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 5000)
    fetch(`/api/users/search?q=${encodeURIComponent(parsed.email)}&limit=1`, { signal: ac.signal })
      .then(res => res.ok ? res.json() : [])
      .then((users: { id: string; email: string; role?: string }[]) => {
        clearTimeout(timer)
        const dbUser = users.find(u => u.email === parsed.email)
        if (dbUser && (dbUser.id !== parsed.id || dbUser.role !== parsed.role)) {
          const updated = { ...parsed, id: dbUser.id, role: (dbUser.role ?? parsed.role) as UserRole }
          setUser(updated)
          localStorage.setItem('currentUser', JSON.stringify(updated))
        } else {
          setUser(parsed)
        }
      })
      .catch(() => setUser(parsed))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    // Mock login - in real app, this would call an API
    const foundUser = MOCK_USERS.find(u => u.email === email)
    if (!foundUser) throw new Error('Invalid credentials')

    // Resolve real DB user ID and role (timeout after 5s to avoid blocking login)
    let resolvedUser = { ...foundUser }
    try {
      const loginAc = new AbortController()
      const loginTimer = setTimeout(() => loginAc.abort(), 5000)
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(email)}&limit=1`, { signal: loginAc.signal })
      clearTimeout(loginTimer)
      if (res.ok) {
        const users = await res.json()
        const dbUser = users.find((u: { email: string }) => u.email === email)
        if (dbUser) resolvedUser = { ...foundUser, id: dbUser.id, role: dbUser.role ?? foundUser.role }
      }
    } catch { /* fallback to mock id */ }

    setUser(resolvedUser)
    localStorage.setItem('currentUser', JSON.stringify(resolvedUser))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('currentUser')
  }

  const switchRole = (role: UserRole) => {
    if (user) {
      const updatedUser = { ...user, role }
      setUser(updatedUser)
      localStorage.setItem('currentUser', JSON.stringify(updatedUser))
    }
  }

  const updateUser = async (updates: Partial<Pick<User, 'name' | 'email' | 'organization'>>): Promise<boolean> => {
    if (!user) return false
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) return false
      const data = await res.json()
      const updatedUser = { ...user, name: data.name, email: data.email, organization: data.organization }
      setUser(updatedUser)
      localStorage.setItem('currentUser', JSON.stringify(updatedUser))
      return true
    } catch {
      return false
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchRole, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
