'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Role color map ─────────────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  pm:            { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  engineer:      { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  procurement:   { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  qa:            { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  manufacturing: { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  designer:      { bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-500' },
  other:         { bg: 'bg-slate-50',  text: 'text-slate-600',  dot: 'bg-slate-400' },
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.other
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
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
  responsibility: string
  organization?: string
  email?: string
}

interface SearchResult {
  id: string
  name: string
  email: string
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
const GRID_COLS = 'grid grid-cols-[1fr_100px_140px_1fr_32px] gap-0 items-center'

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
  const dropdownRef = useRef<HTMLDivElement>(null)
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
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}&limit=6`)
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
      const target = e.target as Node
      if (
        wrapperRef.current && !wrapperRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
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

  const selectUser = (user: SearchResult) => {
    onSelect(user)
    setShowDropdown(false)
    setResults([])
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

      {showDropdown && value.trim() && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-50 rounded-md border bg-popover shadow-md overflow-hidden"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 260) }}
        >
          {isSearching ? (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center">搜尋中...</div>
          ) : results.length > 0 ? (
            results.map((user, idx) => (
              <button
                key={user.id}
                type="button"
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  idx === highlightIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                }`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectUser(user)
                }}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {user.email}
                    {user.organization && ` · ${user.organization}`}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center">
              找不到匹配的使用者，按 Enter 手動新增
            </div>
          )}
        </div>,
        document.body,
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
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${(ROLE_COLORS[member.role] || ROLE_COLORS.other).bg} ${(ROLE_COLORS[member.role] || ROLE_COLORS.other).text}`}>
          {member.name.charAt(0)}
        </div>
        <NameAutocompleteInput
          value={member.name}
          excludeEmails={excludeEmails}
          onChange={(val) => onUpdate(member.id, 'name', val)}
          onSelect={(user) => {
            onUpdate(member.id, 'name', user.name)
            onUpdate(member.id, 'organization', user.organization || '')
            onUpdate(member.id, 'email', user.email)
          }}
          className="h-8 border-0 bg-transparent font-medium text-sm focus-visible:ring-1 px-1.5 min-w-0"
        />
      </div>

      {/* Organization (read-only) */}
      <div className="px-1 min-w-0">
        {member.organization ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{member.organization}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>

      {/* Role */}
      <div>
        <Select value={member.role} onValueChange={(v) => onUpdate(member.id, 'role', v)}>
          <SelectTrigger className="h-8 border-0 bg-transparent text-xs focus:ring-1 px-0.5 [&>span]:overflow-visible">
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
          className="h-8 border-0 bg-transparent text-xs focus-visible:ring-1 px-1.5"
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
  const [role, setRole] = useState('engineer')
  const [responsibility, setResponsibility] = useState('')
  const [organization, setOrganization] = useState('')
  const [email, setEmail] = useState('')

  const handleAdd = () => {
    if (!name.trim()) return
    onAdd({
      id: `tm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      role,
      responsibility: responsibility.trim(),
      organization: organization.trim() || undefined,
      email: email.trim() || undefined,
    })
    setName('')
    setRole('engineer')
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
          onChange={(val) => { setName(val); setOrganization(''); setEmail('') }}
          onSelect={(user) => {
            setName(user.name)
            setOrganization(user.organization || '')
            setEmail(user.email)
          }}
          onKeyDown={handleKeyDown}
          placeholder="+ 新增成員..."
          className="h-8 border-0 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary focus-visible:rounded-none px-1.5"
        />
      </div>

      {/* Organization (read-only, auto-filled) */}
      <div className="px-1 min-w-0">
        {organization && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{organization}</span>
          </span>
        )}
      </div>

      {/* Role */}
      <div>
        {name.trim() && (
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-8 border-0 bg-transparent text-xs focus:ring-1 px-0.5 [&>span]:overflow-visible">
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
            className="h-8 border-0 bg-transparent text-xs text-muted-foreground focus-visible:ring-1 px-1.5"
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
        className={`${GRID_COLS} px-3 py-2.5 bg-muted/60 border-b text-xs font-medium text-muted-foreground tracking-wide`}
      >
        <span>姓名</span>
        <span>組織</span>
        <span>角色</span>
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
      <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        共 {members.length} 位成員
      </div>
    </div>
  )
}
