import React from "react"
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'

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
  title: '專案管理系統 | Project Management System',
  description: '企業級專案管理與看板系統，支援甘特圖、報告與 AI 輔助',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
