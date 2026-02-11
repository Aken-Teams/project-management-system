'use client'

import { useState } from 'react'
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
}

export interface TeamMemberTableProps {
  members: TeamMember[]
  roleLabels: Record<string, string>
  onAdd: (member: TeamMember) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof TeamMember, value: string) => void
}

// ─── Column grid class ──────────────────────────────────────
const GRID_COLS = 'grid grid-cols-[1fr_140px_1fr_32px] gap-0 items-center'

// ─── MemberRow ──────────────────────────────────────────────
function MemberRow({
  member,
  roleLabels,
  onRemove,
  onUpdate,
}: {
  member: TeamMember
  roleLabels: Record<string, string>
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof TeamMember, value: string) => void
}) {
  return (
    <div className={`${GRID_COLS} px-3 py-1.5 hover:bg-muted/20 transition-colors text-sm border-t`}>
      {/* Name with avatar */}
      <div className="flex items-center gap-2 pr-2 min-w-0">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${(ROLE_COLORS[member.role] || ROLE_COLORS.other).bg} ${(ROLE_COLORS[member.role] || ROLE_COLORS.other).text}`}>
          {member.name.charAt(0)}
        </div>
        <span className="truncate font-medium">{member.name}</span>
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
  onAdd,
}: {
  roleLabels: Record<string, string>
  onAdd: (member: TeamMember) => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('engineer')
  const [responsibility, setResponsibility] = useState('')

  const handleAdd = () => {
    if (!name.trim()) return
    onAdd({
      id: `tm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      role,
      responsibility: responsibility.trim(),
    })
    setName('')
    setRole('engineer')
    setResponsibility('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className={`${GRID_COLS} px-3 py-1 border-t`}>
      {/* Name input */}
      <div className="pr-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="+ 新增成員..."
          className="h-8 border-0 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary focus-visible:rounded-none px-1.5"
        />
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
  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div
        className={`${GRID_COLS} px-3 py-2.5 bg-muted/60 border-b text-xs font-medium text-muted-foreground tracking-wide`}
      >
        <span>姓名</span>
        <span>角色</span>
        <span className="pl-1.5">負責工作項目</span>
        <span />
      </div>

      {/* Member rows */}
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          roleLabels={roleLabels}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      ))}

      {/* Inline add */}
      <InlineMemberInput roleLabels={roleLabels} onAdd={onAdd} />

      {/* Footer */}
      <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        共 {members.length} 位成員
      </div>
    </div>
  )
}
