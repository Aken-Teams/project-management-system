'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, FolderKanban } from 'lucide-react'

const QUICK_LOGINS = [
  { role: 'pm' as const, email: 'alice@example.com', label: '專案經理', initial: 'A', bgColor: 'bg-blue-100', textColor: 'text-blue-600' },
  { role: 'member' as const, email: 'bob@example.com', label: '團隊成員', initial: 'B', bgColor: 'bg-green-100', textColor: 'text-green-600' },
  { role: 'executive' as const, email: 'carol@example.com', label: '高階主管', initial: 'C', bgColor: 'bg-amber-100', textColor: 'text-amber-600' },
]

const FEATURES = [
  { title: '任務追蹤與排程', desc: '即時掌握團隊進度與里程碑' },
  { title: '團隊協作管理', desc: '角色權限分配，溝通無障礙' },
  { title: '數據報表分析', desc: '週報自動產出，決策有據可依' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      router.replace('/dashboard')
    } catch (err) {
      setError('登入失敗，請檢查您的帳號密碼')
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (role: 'pm' | 'member' | 'executive') => {
    const emails = {
      pm: 'alice@example.com',
      member: 'bob@example.com',
      executive: 'carol@example.com'
    }
    setEmail(emails[role])
    setPassword('demo')
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-[44%] bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-600 text-white flex-col justify-between p-16 xl:p-20">
        {/* Logo */}
        <div className="space-y-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600">
              <FolderKanban className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold tracking-tight">專案管理系統</span>
          </div>

          {/* Hero Text */}
          <div className="space-y-4">
            <h1 className="text-4xl xl:text-[40px] font-bold leading-tight">
              高效管理<br />每一個專案
            </h1>
            <p className="text-white/80 text-base leading-relaxed">
              從規劃到執行，一站式專案管理平台<br />
              讓團隊協作更順暢、進度更透明
            </p>
          </div>

          {/* Features */}
          <div className="space-y-5">
            {FEATURES.map((feat) => (
              <div key={feat.title} className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-[15px] font-semibold">{feat.title}</div>
                  <div className="text-[13px] text-white/60">{feat.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Right Login Panel */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Mobile Header (shown on small screens) */}
        <div className="lg:hidden flex items-center gap-2.5 p-6 bg-blue-600 text-white">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600">
            <FolderKanban className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold">專案管理系統</span>
        </div>

        {/* Form Area */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10 lg:px-20">
          <div className="w-full max-w-[400px] space-y-8">
            {/* Header */}
            <div className="space-y-2">
              <h2 className="text-[28px] font-bold text-zinc-900 tracking-tight">歡迎回來</h2>
              <p className="text-[15px] text-zinc-500">請登入您的帳號以繼續</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-zinc-900">電子郵件</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 border-zinc-200 focus-visible:ring-blue-600"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-zinc-900">密碼</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 border-zinc-200 focus-visible:ring-blue-600"
                />
              </div>

              <div className="flex justify-end">
                <button type="button" className="text-[13px] font-medium text-blue-600 hover:text-blue-700 transition-colors">
                  忘記密碼？
                </button>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-[15px] font-semibold" disabled={loading}>
                {loading ? '登入中...' : '登入'}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-xs font-medium text-zinc-400">
                  快速登入
                </span>
              </div>
            </div>

            {/* Quick Login Cards */}
            <div className="grid grid-cols-3 gap-3">
              {QUICK_LOGINS.map((item) => (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => quickLogin(item.role)}
                  className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-[10px] border border-zinc-200 bg-slate-50 hover:bg-slate-100 hover:border-zinc-300 transition-colors"
                >
                  <div className={`w-7 h-7 rounded-full ${item.bgColor} flex items-center justify-center`}>
                    <span className={`text-xs font-semibold ${item.textColor}`}>{item.initial}</span>
                  </div>
                  <span className="text-xs font-medium text-zinc-900">{item.label}</span>
                  <span className="text-[10px] text-zinc-400">{item.email.split('@')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="py-6 text-center">
          <a href="https://www.zh-aoi.com/" target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">© 2026 智合科技 All rights reserved.</a>
        </div>
      </div>
    </div>
  )
}
