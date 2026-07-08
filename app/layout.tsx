import React from "react"
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/auth-context'
import { ProjectStoreProvider } from '@/lib/project-store'
import { NotificationStoreProvider } from '@/lib/notification-store'
import { Toaster } from '@/components/ui/sonner'
import { Toaster as ShadToaster } from '@/components/ui/toaster'

import './globals.css'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter'
})
const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-jetbrains-mono'
})

export const metadata: Metadata = {
  title: {
    default: '專案管理系統 | Project Management System',
    template: '%s | 專案管理系統',
  },
  description: '企業級專案管理與看板系統，支援甘特圖、里程碑追蹤、報告分析與 AI 智慧輔助，助您高效管理專案進度。',
  keywords: ['專案管理', '看板', '甘特圖', '里程碑', '報告', 'AI', 'Project Management', 'Kanban', 'Gantt Chart'],
  authors: [{ name: '專案管理系統團隊' }],
  creator: '專案管理系統',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'zh_TW',
    siteName: '專案管理系統',
    title: '專案管理系統 | Project Management System',
    description: '企業級專案管理與看板系統，支援甘特圖、里程碑追蹤、報告分析與 AI 智慧輔助。',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: '專案管理系統' }],
  },
  twitter: {
    card: 'summary',
    title: '專案管理系統 | Project Management System',
    description: '企業級專案管理與看板系統，支援甘特圖、里程碑追蹤、報告分析與 AI 智慧輔助。',
    images: ['/logo.png'],
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <ProjectStoreProvider>
              <NotificationStoreProvider>
                {children}
              </NotificationStoreProvider>
            </ProjectStoreProvider>
          </AuthProvider>
          <Toaster />
          {/* shadcn useToast() Toaster — needed for pages using useToast (e.g. 建立專案) */}
          <ShadToaster />

        </ThemeProvider>
      </body>
    </html>
  )
}
