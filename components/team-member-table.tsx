'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Role color map (RACI) ───────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  R: { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  A: { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  C: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  I: { bg: 'bg-slate-50',  text: 'text-slate-600',  dot: 'bg-slate-400' },
  P: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  S: { bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-500' },
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.I
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  )
}

// ─── Types ──────────────────────────────────────────────────
export interface TeamMember {
  id: string
  name: string
  role: string
  jobTitle?: string
  responsibility: string
  organization?: string
  email?: string
}

interface SearchResult {
  id: string
  name: string
  email: string
  jobTitle: string
  organization: string
}

export interface TeamMemberTableProps {
  members: TeamMember[]
  roleLabels: Record<string, string>
  onAdd: (member: TeamMember) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof TeamMember, value: string) => void
}

// ─── Column grid class ──────────────────────────────────────
const GRID_COLS = 'grid grid-cols-[1fr_80px_80px_100px_1fr_32px] gap-0 items-center'

// ─── NameAutocompleteInput (shared) ─────────────────────────
function NameAutocompleteInput({
  value,
  onChange,
  onSelect,
  onKeyDown,
  placeholder,
  className,
  excludeEmails,
}: {
  value: string
  onChange: (value: string) => void
  onSelect: (user: SearchResult) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string
  className?: string
  excludeEmails?: Set<string>
}) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const excludeRef = useRef(excludeEmails)
  excludeRef.current = excludeEmails
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

  const searchUsers = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      setShowDropdown(false)
      return
    }
    setIsSearching(true)
    setShowDropdown(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ad-users/search?q=${encodeURIComponent(query.trim())}&limit=6`)
        if (res.ok) {
          const data: SearchResult[] = await res.json()
          const ex = excludeRef.current
          const filtered = ex?.size
            ? data.filter((u) => !ex.has(u.email))
            : data
          setResults(filtered)
          setHighlightIdx(filtered.length > 0 ? 0 : -1)
        }
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }, [])

  useEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }, [showDropdown, value])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleChange = (val: string) => {
    onChange(val)
    searchUsers(val)
  }

  const selectUser = async (user: SearchResult) => {
    setShowDropdown(false)
    setResults([])
    // Fetch full user detail (includes jobTitle from AD)
    if (user.id) {
      try {
        const res = await fetch(`/api/ad-users/${encodeURIComponent(user.id)}`)
        if (res.ok) {
          const detail: SearchResult = await res.json()
          onSelect({ ...user, jobTitle: detail.jobTitle || user.jobTitle, organization: detail.organization || user.organization })
          return
        }
      } catch { /* fallback to search result */ }
    }
    onSelect(user)
  }

  const handleKeyDownInternal = (e: React.KeyboardEvent) => {
    if (showDropdown && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((prev) => (prev < results.length - 1 ? prev + 1 : 0))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((prev) => (prev > 0 ? prev - 1 : results.length - 1))
        return
      }
      if (e.key === 'Enter' && highlightIdx >= 0) {
        e.preventDefault()
        selectUser(results[highlightIdx])
        return
      }
      if (e.key === 'Escape') {
        setShowDropdown(false)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div ref={wrapperRef}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDownInternal}
        onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
        placeholder={placeholder}
        className={className}
      />

      {showDropdown && value.trim() && (
        <div
          className="fixed z-50 rounded-md border bg-popover shadow-md overflow-hidden"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 260) }}
        >
          {isSearching ? (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">搜尋中...</div>
          ) : results.length > 0 ? (
            results.map((user, idx) => (
              <button
                key={user.id}
                type="button"
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  idx === highlightIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                }`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectUser(user)}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{user.name}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {user.organization && `· ${user.organization}`}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">
              找不到匹配的使用者，按 Enter 手動新增
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MemberRow ──────────────────────────────────────────────
function MemberRow({
  member,
  roleLabels,
  excludeEmails,
  onRemove,
  onUpdate,
}: {
  member: TeamMember
  roleLabels: Record<string, string>
  excludeEmails: Set<string>
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof TeamMember, value: string) => void
}) {
  return (
    <div className={`${GRID_COLS} px-3 py-1.5 hover:bg-muted/20 transition-colors text-sm border-t`}>
      {/* Name with avatar + autocomplete */}
      <div className="flex items-center gap-2 pr-2 min-w-0">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${(ROLE_COLORS[member.role] || ROLE_COLORS.I).bg} ${(ROLE_COLORS[member.role] || ROLE_COLORS.I).text}`}>
          {member.name.charAt(0)}
        </div>
        <NameAutocompleteInput
          value={member.name}
          excludeEmails={excludeEmails}
          onChange={(val) => onUpdate(member.id, 'name', val)}
          onSelect={(user) => {
            onUpdate(member.id, 'name', user.name)
            onUpdate(member.id, 'jobTitle', user.jobTitle || '')
            onUpdate(member.id, 'organization', user.organization || '')
            onUpdate(member.id, 'email', user.email || '')
          }}
          className="h-8 border-0 bg-transparent font-medium text-sm focus-visible:ring-1 px-1.5 min-w-0"
        />
      </div>

      {/* Job Title */}
      <div className="px-1 min-w-0 text-center">
        <Input
          value={member.jobTitle || ''}
          onChange={(e) => onUpdate(member.id, 'jobTitle', e.target.value)}
          placeholder="—"
          className="h-8 border-0 bg-transparent text-sm text-center focus-visible:ring-1 px-1"
        />
      </div>

      {/* Organization */}
      <div className="px-1 min-w-0 text-center">
        <Input
          value={member.organization || ''}
          onChange={(e) => onUpdate(member.id, 'organization', e.target.value)}
          placeholder="—"
          className="h-8 border-0 bg-transparent text-sm text-center focus-visible:ring-1 px-1"
        />
      </div>

      {/* Role */}
      <div className="flex justify-center">
        <Select value={member.role} onValueChange={(v) => onUpdate(member.id, 'role', v)}>
          <SelectTrigger className="h-8 border-0 bg-transparent text-sm focus:ring-1 px-0.5 [&>span]:overflow-visible">
            <RoleBadge role={member.role} label={roleLabels[member.role] || member.role} />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(roleLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                <RoleBadge role={value} label={label} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Responsibility */}
      <div className="px-1">
        <Input
          value={member.responsibility}
          onChange={(e) => onUpdate(member.id, 'responsibility', e.target.value)}
          placeholder="負責工作項目"
          className="h-8 border-0 bg-transparent text-sm focus-visible:ring-1 px-1.5"
        />
      </div>

      {/* Remove */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(member.id)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── InlineMemberInput ──────────────────────────────────────
function InlineMemberInput({
  roleLabels,
  excludeEmails,
  onAdd,
}: {
  roleLabels: Record<string, string>
  excludeEmails: Set<string>
  onAdd: (member: TeamMember) => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('R')
  const [jobTitle, setJobTitle] = useState('')
  const [responsibility, setResponsibility] = useState('')
  const [organization, setOrganization] = useState('')
  const [email, setEmail] = useState('')

  const handleAdd = () => {
    if (!name.trim()) return
    onAdd({
      id: `tm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      role,
      jobTitle: jobTitle.trim() || undefined,
      responsibility: responsibility.trim(),
      organization: organization.trim() || undefined,
      email: email.trim() || undefined,
    })
    setName('')
    setRole('R')
    setJobTitle('')
    setResponsibility('')
    setOrganization('')
    setEmail('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className={`${GRID_COLS} px-3 py-1 border-t`}>
      {/* Name input with autocomplete */}
      <div className="pr-2">
        <NameAutocompleteInput
          value={name}
          excludeEmails={excludeEmails}
          onChange={(val) => { setName(val); setJobTitle(''); setOrganization(''); setEmail('') }}
          onSelect={(user) => {
            // Immediately add the member to the table
            onAdd({
              id: `tm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: user.name,
              role,
              jobTitle: user.jobTitle || undefined,
              responsibility: responsibility.trim(),
              organization: user.organization || undefined,
              email: user.email || undefined,
            })
            setName('')
            setRole('R')
            setJobTitle('')
            setResponsibility('')
            setOrganization('')
            setEmail('')
          }}
          onKeyDown={handleKeyDown}
          placeholder="+ 新增成員..."
          className="h-8 border-0 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary focus-visible:rounded-none px-1.5"
        />
      </div>

      {/* Job Title (auto-filled, editable) */}
      <div className="px-1 min-w-0 text-center">
        {name.trim() && (
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="—"
            className="h-8 border-0 bg-transparent text-sm text-center text-muted-foreground focus-visible:ring-1 px-1"
          />
        )}
      </div>

      {/* Organization (auto-filled, editable) */}
      <div className="px-1 min-w-0 text-center">
        {name.trim() && (
          <Input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="—"
            className="h-8 border-0 bg-transparent text-sm text-center text-muted-foreground focus-visible:ring-1 px-1"
          />
        )}
      </div>

      {/* Role */}
      <div className="flex justify-center">
        {name.trim() && (
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-8 border-0 bg-transparent text-sm focus:ring-1 px-0.5 [&>span]:overflow-visible">
              <RoleBadge role={role} label={roleLabels[role] || role} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(roleLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  <RoleBadge role={value} label={label} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Responsibility */}
      <div className="px-1">
        {name.trim() && (
          <Input
            value={responsibility}
            onChange={(e) => setResponsibility(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="負責工作項目"
            className="h-8 border-0 bg-transparent text-sm text-muted-foreground focus-visible:ring-1 px-1.5"
          />
        )}
      </div>

      {/* Add button */}
      <div className="flex justify-center">
        {name.trim() && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── TeamMemberTable (main export) ──────────────────────────
export function TeamMemberTable({
  members,
  roleLabels,
  onAdd,
  onRemove,
  onUpdate,
}: TeamMemberTableProps) {
  const allEmails = new Set(members.map((m) => m.email).filter(Boolean) as string[])

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div
        className={`${GRID_COLS} px-3 py-2.5 bg-muted/60 border-b text-sm font-medium text-muted-foreground tracking-wide`}
      >
        <span>姓名</span>
        <span className="text-center">職稱</span>
        <span className="text-center">組織</span>
        <span className="text-center">角色</span>
        <span className="pl-1.5">負責工作項目</span>
        <span />
      </div>

      {/* Member rows */}
      {members.map((member) => {
        // Exclude all emails except this member's own
        const otherEmails = new Set([...allEmails].filter((e) => e !== member.email))
        return (
          <MemberRow
            key={member.id}
            member={member}
            roleLabels={roleLabels}
            excludeEmails={otherEmails}
            onRemove={onRemove}
            onUpdate={onUpdate}
          />
        )
      })}

      {/* Inline add */}
      <InlineMemberInput roleLabels={roleLabels} excludeEmails={allEmails} onAdd={onAdd} />

      {/* Footer */}
      <div className="px-3 py-2 border-t bg-muted/20 text-sm text-muted-foreground">
        共 {members.length} 位成員
      </div>
    </div>
  )
}
