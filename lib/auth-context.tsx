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

// Mock users data
const MOCK_USERS: User[] = [
  { id: '1', name: 'Alice Chen', email: 'pm@example.com', role: 'pm', avatar: '/avatars/alice.jpg' },
  { id: '2', name: 'Bob Wang', email: 'member@example.com', role: 'member', avatar: '/avatars/bob.jpg' },
  { id: '3', name: 'Carol Lin', email: 'exec@example.com', role: 'executive', avatar: '/avatars/carol.jpg' },
]

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is stored in localStorage
    const storedUser = localStorage.getItem('currentUser')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (error) {
        console.error('Failed to parse stored user:', error)
        localStorage.removeItem('currentUser')
      }
    }
    setLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    // Mock login - in real app, this would call an API
    const foundUser = MOCK_USERS.find(u => u.email === email)
    if (foundUser) {
      setUser(foundUser)
      localStorage.setItem('currentUser', JSON.stringify(foundUser))
    } else {
      throw new Error('Invalid credentials')
    }
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
