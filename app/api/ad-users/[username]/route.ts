import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API

// GET /api/ad-users/[username]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params

    // Try AD first
    if (AD_URL && AD_API) {
      try {
        const res = await fetch(
          `${AD_URL}/ldap/api/v1/users/${encodeURIComponent(username)}`,
          { headers: { 'X-API-Key': AD_API } }
        )
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.user) {
            const u = data.user
            return NextResponse.json({
              id: u.username,
              name: u.displayName,
              email: u.mail || '',
              jobTitle: u.title || '',
              organization: u.department || '',
            })
          }
        }
      } catch {
        // AD unavailable, fall through to DB
      }
    }

    // Fallback: search DB by name pattern (username is typically name-based)
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { contains: username } },
          { name: { contains: username } },
        ],
      },
      select: { id: true, name: true, email: true, jobTitle: true, organization: true },
    })

    if (dbUser) {
      return NextResponse.json({
        id: dbUser.name.replace(/\s+/g, '.').toLowerCase(),
        name: dbUser.name,
        email: dbUser.email,
        jobTitle: dbUser.jobTitle || '',
        organization: dbUser.organization || '',
      })
    }

    return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
  } catch (error) {
    console.error('AD user detail error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
