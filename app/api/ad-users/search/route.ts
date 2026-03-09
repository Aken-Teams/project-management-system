import { NextRequest, NextResponse } from 'next/server'

const AD_URL = process.env.AD_URL!
const AD_API = process.env.AD_API!
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

  const res = await fetch(
    `${AD_URL}/api/v1/ldap/organizations/tree?domain=${DOMAIN}`,
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

    const members = await getMembers()

    const results = members
      .filter(m =>
        m.username.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q)
      )
      .slice(0, limit)
      .map(m => ({
        id: m.username,
        name: m.displayName,
        email: '',          // fetched on demand via /api/ad-users/[username]
        jobTitle: '',       // not available from AD
        organization: m.dept,
      }))

    return NextResponse.json(results)
  } catch (error) {
    console.error('AD search error:', error)
    return NextResponse.json({ error: '搜尋失敗' }, { status: 500 })
  }
}
