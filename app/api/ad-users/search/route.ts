import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API
const DOMAIN = 'PANJIT'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface ADMember {
  username: string
  displayName: string
  dept: string
}

// In-memory cache
let cachedMembers: ADMember[] | null = null
let cacheTime = 0

function flattenTree(node: Record<string, unknown>, dept = ''): ADMember[] {
  const name = (node.name as string) || dept
  const members: ADMember[] = []
  for (const m of (node.members as { username: string; displayName: string }[]) || []) {
    members.push({ username: m.username, displayName: m.displayName, dept: name })
  }
  for (const child of (node.children as Record<string, unknown>[]) || []) {
    members.push(...flattenTree(child, name))
  }
  return members
}

async function getMembers(): Promise<ADMember[]> {
  if (cachedMembers && Date.now() - cacheTime < CACHE_TTL_MS) return cachedMembers

  if (!AD_URL || !AD_API) return []

  const res = await fetch(
    `${AD_URL}/ldap/api/v1/organizations/tree?domain=${DOMAIN}`,
    { headers: { 'X-API-Key': AD_API }, next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error('AD API error')
  const data = await res.json()
  cachedMembers = flattenTree(data.tree)
  cacheTime = Date.now()
  return cachedMembers
}

// GET /api/ad-users/search?q=keyword&limit=8
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase()
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 8

    if (!q) return NextResponse.json([])

    // Search AD
    let adResults: { id: string; name: string; email: string; jobTitle: string; organization: string }[] = []
    try {
      const members = await getMembers()
      adResults = members
        .filter(m =>
          m.username.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q)
        )
        .slice(0, limit)
        .map(m => ({
          id: m.username,
          name: m.displayName,
          email: '',
          jobTitle: '',
          organization: m.dept,
        }))
    } catch {
      // AD unavailable, continue with DB fallback
    }

    // Also search local DB users (so test accounts and manually created users are findable)
    const dbUsers = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
        ],
      },
      select: { id: true, name: true, email: true, jobTitle: true, organization: true },
      take: limit,
      orderBy: { name: 'asc' },
    })

    const dbResults = dbUsers.map(u => ({
      id: u.name.replace(/\s+/g, '.').toLowerCase(),
      name: u.name,
      email: u.email,
      jobTitle: u.jobTitle || '',
      organization: u.organization || '',
    }))

    // Merge: AD results first, then DB results (skip duplicates by name)
    const seen = new Set(adResults.map(r => r.name.toLowerCase()))
    const merged = [...adResults]
    for (const r of dbResults) {
      if (!seen.has(r.name.toLowerCase())) {
        merged.push(r)
        seen.add(r.name.toLowerCase())
      }
    }

    return NextResponse.json(merged.slice(0, limit))
  } catch (error) {
    console.error('AD search error:', error)
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}
