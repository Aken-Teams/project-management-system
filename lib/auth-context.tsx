'use client'

import React from "react"

import { createContext, useContext, useState, useEffect } from 'react'

export type UserRole = 'pm' | 'member' | 'executive'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  switchRole: (role: UserRole) => void
  updateUser: (updates: Partial<Pick<User, 'name' | 'email'>>) => void
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

    // Always re-resolve DB user ID from email (localStorage may have stale mock ID)
    fetch(`/api/users/search?q=${encodeURIComponent(parsed.email)}&limit=1`)
      .then(res => res.ok ? res.json() : [])
      .then((users: { id: string; email: string }[]) => {
        const dbUser = users.find(u => u.email === parsed.email)
        if (dbUser && dbUser.id !== parsed.id) {
          const updated = { ...parsed, id: dbUser.id }
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

    // Resolve real DB user ID (mock IDs '1','2','3' don't match DB cuids)
    let resolvedUser = { ...foundUser }
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(email)}&limit=1`)
      if (res.ok) {
        const users = await res.json()
        const dbUser = users.find((u: { email: string }) => u.email === email)
        if (dbUser) resolvedUser = { ...foundUser, id: dbUser.id }
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

  const updateUser = (updates: Partial<Pick<User, 'name' | 'email'>>) => {
    if (user) {
      const updatedUser = { ...user, ...updates }
      setUser(updatedUser)
      localStorage.setItem('currentUser', JSON.stringify(updatedUser))
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
