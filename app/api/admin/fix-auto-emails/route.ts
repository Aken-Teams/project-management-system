import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

interface AdMember { username: string; displayName: string }

/** Fetch all AD members from org tree */
async function fetchAllAdMembers(): Promise<AdMember[]> {
  const res = await fetch(
    `${AD_URL}/ldap/api/v1/organizations/tree?domain=PANJIT`,
    { headers: { 'X-API-Key': AD_API! } }
  )
  if (!res.ok) return []
  const data = await res.json()
  const members: AdMember[] = []
  const flatten = (node: { members?: AdMember[]; children?: unknown[] }) => {
    if (node.members) members.push(...node.members)
    if (node.children) (node.children as typeof node[]).forEach(flatten)
  }
  if (data.tree) flatten(data.tree)
  return members
}

/** Fetch user detail by employee ID (工號) */
async function fetchAdUserDetail(employeeId: string): Promise<{
  mail: string; title: string; department: string; displayName: string
} | null> {
  try {
    const res = await fetch(
      `${AD_URL}/ldap/api/v1/users/${encodeURIComponent(employeeId)}`,
      { headers: { 'X-API-Key': AD_API! } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.success && data.user) {
      return {
        mail: data.user.mail || '',
        title: data.user.title || '',
        department: data.user.department || '',
        displayName: data.user.displayName || '',
      }
    }
    return null
  } catch {
    return null
  }
}

// POST /api/admin/fix-auto-emails — Batch fix @auto.local emails by looking up AD
export async function POST(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  if (!AD_URL || !AD_API) {
    return NextResponse.json({ error: 'AD 未設定' }, { status: 400 })
  }

  // Find all users with @auto.local emails
  const autoLocalUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@auto.local' } },
    select: { id: true, name: true, email: true },
  })

  if (autoLocalUsers.length === 0) {
    return NextResponse.json({ message: '沒有需要修正的帳號', fixed: 0, skipped: 0 })
  }

  // Fetch AD org tree to get all members (username=工號, displayName=name)
  let adMembers: AdMember[]
  try {
    adMembers = await fetchAllAdMembers()
  } catch {
    return NextResponse.json({ error: '無法連線 AD' }, { status: 502 })
  }

  if (adMembers.length === 0) {
    return NextResponse.json({ error: 'AD 回傳 0 筆成員' }, { status: 502 })
  }

  let fixed = 0
  let skipped = 0
  const results: { name: string; oldEmail: string; newEmail: string | null; status: string }[] = []

  for (const user of autoLocalUsers) {
    // Match by displayName (case-insensitive)
    const match = adMembers.find(m =>
      m.displayName.toLowerCase() === user.name.toLowerCase()
    )
    if (!match) {
      skipped++
      results.push({ name: user.name, oldEmail: user.email, newEmail: null, status: 'no_ad_match' })
      continue
    }

    // Use employee ID (工號) to fetch full user detail
    const adUser = await fetchAdUserDetail(match.username)
    if (!adUser || !adUser.mail) {
      skipped++
      results.push({
        name: user.name, oldEmail: user.email, newEmail: null,
        status: !adUser ? 'ad_detail_failed' : 'no_email_in_ad',
      })
      continue
    }

    const realEmail = adUser.mail

    // Check if another DB user already has this email
    const existing = await prisma.user.findUnique({
      where: { email: realEmail },
      select: { id: true, name: true, jobTitle: true, organization: true },
    })

    if (existing && existing.id !== user.id) {
      // Merge: transfer relations from auto.local user to the existing real user
      const autoLocalMemberships = await prisma.projectTeamMember.findMany({
        where: { userId: user.id },
        select: { id: true, projectId: true },
      })
      const existingMemberships = await prisma.projectTeamMember.findMany({
        where: { userId: existing.id },
        select: { projectId: true },
      })
      const existingProjectIds = new Set(existingMemberships.map(m => m.projectId))

      const conflicting = autoLocalMemberships.filter(m => existingProjectIds.has(m.projectId))
      const transferable = autoLocalMemberships.filter(m => !existingProjectIds.has(m.projectId))

      const ops = []
      if (conflicting.length > 0) {
        ops.push(prisma.projectTeamMember.deleteMany({
          where: { id: { in: conflicting.map(m => m.id) } },
        }))
      }
      if (transferable.length > 0) {
        ops.push(prisma.projectTeamMember.updateMany({
          where: { id: { in: transferable.map(m => m.id) } },
          data: { userId: existing.id },
        }))
      }
      ops.push(
        prisma.taskLog.updateMany({ where: { authorId: user.id }, data: { authorId: existing.id } }),
        prisma.notification.updateMany({ where: { userId: user.id }, data: { userId: existing.id } }),
        prisma.memberWeeklyReport.updateMany({ where: { userId: user.id }, data: { userId: existing.id } }),
        prisma.user.update({
          where: { id: existing.id },
          data: {
            name: adUser.displayName || existing.name,
            jobTitle: existing.jobTitle || adUser.title,
            organization: existing.organization || adUser.department,
          },
        }),
        prisma.user.delete({ where: { id: user.id } }),
      )

      await prisma.$transaction(ops)
      fixed++
      results.push({ name: user.name, oldEmail: user.email, newEmail: realEmail, status: 'merged' })
      continue
    }

    // No duplicate — just update the email + info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: realEmail,
        name: adUser.displayName || user.name,
        jobTitle: adUser.title || undefined,
        organization: adUser.department || undefined,
      },
    })
    fixed++
    results.push({ name: user.name, oldEmail: user.email, newEmail: realEmail, status: 'fixed' })
  }

  return NextResponse.json({ fixed, skipped, total: autoLocalUsers.length, results })
}
