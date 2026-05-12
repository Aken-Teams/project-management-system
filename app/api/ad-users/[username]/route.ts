import { NextRequest, NextResponse } from 'next/server'

const AD_URL = process.env.AD_URL!
const AD_API = process.env.AD_API!

// GET /api/ad-users/[username]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params
    const res = await fetch(
      `${AD_URL}/ldap/api/v1/users/${encodeURIComponent(username)}`,
      { headers: { 'X-API-Key': AD_API } }
    )
    if (!res.ok) return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    const data = await res.json()
    if (!data.success || !data.user) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    }
    const u = data.user
    return NextResponse.json({
      id: u.username,
      name: u.displayName,
      email: u.mail || '',
      jobTitle: u.title || '',
      organization: u.department || '',
    })
  } catch (error) {
    console.error('AD user detail error:', error)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
