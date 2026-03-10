import { NextResponse } from 'next/server'

const AD_URL = process.env.AD_URL!
const AD_API = process.env.AD_API!
const DOMAIN = 'PANJIT'
const CACHE_TTL_MS = 5 * 60 * 1000

export interface OrgTreeNode {
  name: string
  directCount: number   // members directly in this node
  totalCount: number    // members including all descendants
  children: OrgTreeNode[]
}

let cachedTree: OrgTreeNode | null = null
let cacheTime = 0

function processNode(node: Record<string, unknown>): OrgTreeNode {
  const name = (node.name as string) || ''
  const direct = ((node.members as unknown[]) || []).length
  const children = ((node.children as Record<string, unknown>[]) || []).map(processNode)
  const totalCount = direct + children.reduce((s, c) => s + c.totalCount, 0)
  return { name, directCount: direct, totalCount, children }
}

export async function GET() {
  try {
    if (cachedTree && Date.now() - cacheTime < CACHE_TTL_MS) {
      return NextResponse.json(cachedTree)
    }
    const res = await fetch(
      `${AD_URL}/api/v1/ldap/organizations/tree?domain=${DOMAIN}`,
      { headers: { 'X-API-Key': AD_API } }
    )
    if (!res.ok) throw new Error('AD API error')
    const data = await res.json()
    cachedTree = processNode(data.tree)
    cacheTime = Date.now()
    return NextResponse.json(cachedTree)
  } catch (error) {
    console.error('AD org-tree error:', error)
    return NextResponse.json({ error: '無法取得組織資料' }, { status: 500 })
  }
}
