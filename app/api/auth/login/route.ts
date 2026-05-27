import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API

// Mock users for quick-login testing (password: "demo")
const MOCK_USERS = [
  { email: 'alice@example.com', name: 'Alice Chen', role: 'admin' },
  { email: 'dave@example.com', name: 'Dave Liu', role: 'pm' },
  { email: 'bob@example.com', name: 'Bob Wang', role: 'member' },
  { email: 'carol@example.com', name: 'Carol Lee', role: 'executive' },
]

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: '請輸入帳號和密碼' }, { status: 400 })
    }

    // ── 1. Try AD authentication ──
    if (AD_URL && AD_API) {
      try {
        const adRes = await fetch(`${AD_URL}/ldap/api/v1/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })

        if (adRes.ok) {
          const adData = await adRes.json()
          if (adData.success && adData.user) {
            const adUser = adData.user
            const email = adUser.mail || `${adUser.username}@panjit.com.tw`
            const name = adUser.displayName || adUser.username

            // Find or create user in DB
            let dbUser = await prisma.user.findUnique({ where: { email } })
            if (!dbUser) {
              dbUser = await prisma.user.create({
                data: {
                  name,
                  email,
                  role: 'member',
                  jobTitle: '',
                  organization: adUser.department || '',
                },
              })
            } else if (dbUser.organization !== (adUser.department || '')) {
              // Sync department from AD
              dbUser = await prisma.user.update({
                where: { id: dbUser.id },
                data: { organization: adUser.department || '' },
              })
            }

            if (!dbUser.isActive) {
              return NextResponse.json({ error: '此帳號已被停用，請聯繫管理員' }, { status: 403 })
            }

            return NextResponse.json({
              success: true,
              user: {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                role: dbUser.role,
                organization: dbUser.organization || '',
              },
            })
          }
        }

        // AD returned non-ok or success=false — credentials invalid
        // Only fall through to mock if the username looks like an email (test account)
        const isEmail = username.includes('@')
        if (!isEmail) {
          return NextResponse.json({ error: 'AD 帳號或密碼錯誤' }, { status: 401 })
        }
      } catch {
        // AD unavailable, fall through to mock login
      }
    }

    // ── 2. Fallback: mock login (for test accounts) ──
    if (password !== 'demo') {
      return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
    }

    const mockUser = MOCK_USERS.find(u => u.email === username)
    if (!mockUser) {
      return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
    }

    // Find or create in DB
    let dbUser = await prisma.user.findUnique({ where: { email: mockUser.email } })
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
        },
      })
    }

    if (!dbUser.isActive) {
      return NextResponse.json({ error: '此帳號已被停用，請聯繫管理員' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        organization: dbUser.organization || '',
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: '登入失敗，請稍後再試' }, { status: 500 })
  }
}
