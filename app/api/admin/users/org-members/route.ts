import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AD_URL = process.env.AD_URL!
const AD_API = process.env.AD_API!
const CACHE_TTL_MS = 5 * 60 * 1000

interface ADMember { username: string; displayName: string }
interface ADNode { name: string; members: ADMember[]; children: ADNode[] }

let cachedTree: ADNode | null = null
let cacheTime = 0

async function getRawTree(): Promise<ADNode> {
  if (cachedTree && Date.now() - cacheTime < CACHE_TTL_MS) return cachedTree
  const res = await fetch(`${AD_URL}/ldap/api/v1/organizations/tree?domain=PANJIT`, {
    headers: { 'X-API-Key': AD_API },
  })
  if (!res.ok) throw new Error('AD fetch failed')
  const data = await res.json()
  cachedTree = data.tree as ADNode
  cacheTime = Date.now()
  return cachedTree!
}

function findOrgNode(node: ADNode, name: string): ADNode | null {
  if (node.name === name) return node
  for (const child of node.children ?? []) {
    const found = findOrgNode(child, name)
    if (found) return found
  }
  return null
}

function collectAllMembers(node: ADNode): Array<{ username: string; displayName: string; dept: string }> {
  const direct = (node.members ?? []).map(m => ({ username: m.username, displayName: m.displayName, dept: node.name }))
  const fromChildren = (node.children ?? []).flatMap(collectAllMembers)
  return [...direct, ...fromChildren]
}

async function guardAdmin(request: NextRequest): Promise<boolean> {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

// GET /api/admin/users/org-members?org=ORGNAME
export async function GET(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const orgName = request.nextUrl.searchParams.get('org') ?? ''
  if (!orgName) return NextResponse.json({ error: '請指定組織名稱' }, { status: 400 })

  try {
    const tree = await getRawTree()
    const orgNode = findOrgNode(tree, orgName)
    if (!orgNode) return NextResponse.json({ error: '找不到組織' }, { status: 404 })

    const adMembers = collectAllMembers(orgNode)
    const usernames = [...new Set(adMembers.map(m => m.username.toLowerCase()))]

    // Match DB users by email prefix (username@domain)
    const dbUsers = await prisma.user.findMany({
      where: {
        OR: usernames.map(u => ({ email: { startsWith: u + '@' } })),
      },
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, jobTitle: true, organization: true,
        _count: { select: { ownedProjects: true } },
      },
    })

    const dbByPrefix = new Map<string, typeof dbUsers[0]>()
    for (const u of dbUsers) {
      dbByPrefix.set(u.email.split('@')[0].toLowerCase(), u)
    }

    const rows = adMembers.map(m => {
      const db = dbByPrefix.get(m.username.toLowerCase())
      return {
        adUsername: m.username,
        name: db?.name ?? m.displayName,
        email: db?.email ?? '',
        organization: m.dept,
        jobTitle: db?.jobTitle ?? '',
        role: db?.role ?? null,
        isActive: db?.isActive ?? null,   // null = not in system
        projectCount: db?._count.ownedProjects ?? 0,
        dbId: db?.id ?? null,
        inSystem: !!db,
      }
    })

    // In-system users first, then alphabetically
    rows.sort((a, b) => {
      if (a.inSystem !== b.inSystem) return a.inSystem ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-TW')
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('org-members error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
