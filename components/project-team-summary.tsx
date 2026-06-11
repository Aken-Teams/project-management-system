'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Project, TaskStatus, TeamRole } from '@/lib/mock-data'
import { TEAM_ROLE_LABELS } from '@/lib/mock-data'
import { Users, Ban, Clock, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react'

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function weekStartOf(d: Date) {
  const dow = d.getDay()
  const m = new Date(d)
  m.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return toYMD(m)
}

const ROLE_BADGE: Record<TeamRole, string> = {
  A: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  R: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  S: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  P: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  C: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  I: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}
const ROLE_ORDER: TeamRole[] = ['S', 'A', 'P', 'R', 'C', 'I']

export function ProjectTeamSummary({ project }: { project: Project }) {
  const data = useMemo(() => {
    const today = new Date()
    const todayStr = toYMD(today)
    const wkStart = weekStartOf(today)
    const endD = new Date(wkStart); endD.setDate(endD.getDate() + 6)
    const wkEnd = toYMD(endD)

    const parentIds = new Set(project.tasks.filter(t => t.parentId).map(t => t.parentId as string))
    const leaf = project.tasks.filter(t => !parentIds.has(t.id))
    const msName = new Map(project.milestones.map(m => [m.id, m.name]))

    // members: from team (roles) ∪ task assignees
    type Member = { name: string; jobTitle?: string; roles: Set<TeamRole> }
    const map = new Map<string, Member>()
    for (const m of project.teamMembers || []) {
      const e = map.get(m.name) || { name: m.name, jobTitle: m.jobTitle, roles: new Set<TeamRole>() }
      e.roles.add(m.role)
      if (m.jobTitle && !e.jobTitle) e.jobTitle = m.jobTitle
      map.set(m.name, e)
    }
    for (const t of leaf) if (t.assignee && !map.has(t.assignee)) map.set(t.assignee, { name: t.assignee, roles: new Set<TeamRole>() })

    // logs this week by author
    const reportsByAuthor = new Map<string, number>()
    for (const l of project.taskLogs) {
      if (l.logDate >= wkStart && l.logDate <= wkEnd) reportsByAuthor.set(l.author, (reportsByAuthor.get(l.author) || 0) + 1)
    }

    const members = [...map.values()].map(m => {
      const mine = leaf.filter(t => t.assignee === m.name)
      const done = mine.filter(t => t.status === 'done').length
      const inProgress = mine.filter(t => t.status === 'in-progress').length
      const blocked = mine.filter(t => t.status === 'blocked')
      const overdue = mine.filter(t => t.status !== 'done' && t.status !== 'blocked' && t.endDate < todayStr)
      const reports = reportsByAuthor.get(m.name) || 0
      const active = mine.length - done
      return {
        name: m.name, jobTitle: m.jobTitle,
        roles: [...m.roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)),
        total: mine.length, done, inProgress,
        blocked, overdue,
        reports, active,
        pct: mine.length > 0 ? Math.round((done / mine.length) * 100) : 0,
        needsReport: active > 0 && reports === 0,
      }
    }).sort((a, b) => (b.blocked.length + b.overdue.length) - (a.blocked.length + a.overdue.length) || b.total - a.total)

    const reportedCount = members.filter(m => m.reports > 0).length
    const expectedCount = members.filter(m => m.active > 0).length
    const issueOwners = members.filter(m => m.blocked.length + m.overdue.length > 0)
    const working = members.filter(m => m.total > 0)

    // RACI 角色名冊（依角色分組）
    const rosterMap = new Map<TeamRole, string[]>()
    for (const m of project.teamMembers || []) {
      const arr = rosterMap.get(m.role) || []
      if (!arr.includes(m.name)) arr.push(m.name)
      rosterMap.set(m.role, arr)
    }
    const roster = ROLE_ORDER.filter(r => rosterMap.has(r)).map(r => ({ role: r, names: rosterMap.get(r)! }))

    return { members, working, roster, reportedCount, expectedCount, issueOwners, msName }
  }, [project])

  return (
    <div className="space-y-4">
      {/* 摘要列 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="團隊人數" value={`${data.members.length}`} />
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="本期回報" value={`${data.reportedCount}/${Math.max(data.expectedCount, data.reportedCount)}`} sub="人已交週報" tone={data.reportedCount < data.expectedCount ? 'amber' : 'green'} />
        <StatCard icon={<Ban className="h-4 w-4" />} label="有受阻的成員" value={`${data.members.filter(m => m.blocked.length > 0).length}`} tone={data.members.some(m => m.blocked.length > 0) ? 'red' : 'green'} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="有逾期的成員" value={`${data.members.filter(m => m.overdue.length > 0).length}`} tone={data.members.some(m => m.overdue.length > 0) ? 'amber' : 'green'} />
      </div>

      {/* 成員表 */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <Users className="h-4 w-4" /><h3 className="font-semibold text-sm">工作中的成員</h3>
          <span className="text-xs text-muted-foreground">有被指派任務者</span>
          <span className="ml-auto text-xs text-muted-foreground">依「受阻/逾期」優先排序</span>
        </div>
        {data.working.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 py-6 text-center">目前尚無成員被指派任務</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground text-xs">
                <th className="text-left font-medium px-4 py-2.5">成員</th>
                <th className="text-left font-medium px-3 py-2.5">角色</th>
                <th className="text-left font-medium px-3 py-2.5 w-[180px]">任務進度</th>
                <th className="text-center font-medium px-3 py-2.5">進行中</th>
                <th className="text-center font-medium px-3 py-2.5">受阻</th>
                <th className="text-center font-medium px-3 py-2.5">逾期</th>
                <th className="text-center font-medium px-3 py-2.5">本期回報</th>
              </tr>
            </thead>
            <tbody>
              {data.working.map(m => (
                <tr key={m.name} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{m.name}</div>
                    {m.jobTitle && <div className="text-xs text-muted-foreground">{m.jobTitle}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {m.roles.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : m.roles.map(r => (
                        <span key={r} title={TEAM_ROLE_LABELS[r]} className={cn('inline-flex items-center justify-center h-5 min-w-5 px-1 rounded text-xs font-bold', ROLE_BADGE[r])}>{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {m.total === 0 ? <span className="text-xs text-muted-foreground">無指派</span> : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${m.pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{m.done}/{m.total}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{m.inProgress > 0 ? <span className="text-blue-600">{m.inProgress}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{m.blocked.length > 0 ? <span className="font-semibold text-red-600">{m.blocked.length}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{m.overdue.length > 0 ? <span className="font-semibold text-amber-600">{m.overdue.length}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-center">
                    {m.reports > 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{m.reports}</span>
                    ) : m.needsReport ? (
                      <span className="inline-flex items-center gap-1 text-amber-600"><AlertCircle className="h-3.5 w-3.5" />未交</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* RACI 角色分工名冊 */}
      {data.roster.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-3">
            <Users className="h-4 w-4" /><h3 className="font-semibold text-sm">團隊角色分工 (RACI)</h3>
            <span className="ml-auto text-xs text-muted-foreground">共 {data.members.length} 人</span>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            {data.roster.map(({ role, names }) => (
              <div key={role} className="flex items-start gap-3">
                <span title={TEAM_ROLE_LABELS[role]} className={cn('shrink-0 inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded text-xs font-bold', ROLE_BADGE[role])}>{role}</span>
                <span className="shrink-0 text-xs text-muted-foreground w-16 pt-0.5">{TEAM_ROLE_LABELS[role].replace(/\s*\(.\)$/, '')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {names.map(n => (
                    <span key={n} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs">{n}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 受阻/逾期歸屬 */}
      {data.issueOwners.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-3 text-red-600">
            <Ban className="h-4 w-4" /><h3 className="font-semibold text-sm">受阻 / 逾期歸屬</h3>
          </div>
          <div className="px-5 py-4 grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {data.issueOwners.map(m => (
              <div key={m.name}>
                <div className="font-medium text-sm mb-1">{m.name} <span className="text-xs text-muted-foreground font-normal">受阻 {m.blocked.length} · 逾期 {m.overdue.length}</span></div>
                <ul className="space-y-1 pl-1">
                  {m.blocked.map(t => (
                    <li key={t.id} className="flex items-baseline gap-2 text-sm">
                      <span className="text-red-500 shrink-0">⛔</span>
                      <span className="flex-1 min-w-0 truncate">{t.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{data.msName.get(t.milestoneId) || ''}</span>
                    </li>
                  ))}
                  {m.overdue.map(t => (
                    <li key={t.id} className="flex items-baseline gap-2 text-sm">
                      <span className="text-amber-500 shrink-0">⏰</span>
                      <span className="flex-1 min-w-0 truncate">{t.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{data.msName.get(t.milestoneId) || ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'red' | 'amber' | 'green'
}) {
  const toneCls = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : ''
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">{icon} {label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-2xl font-bold', toneCls)}>{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}
