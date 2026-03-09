'use client'

import { useState, useRef, useCallback } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Input } from '@/components/ui/input'

interface SearchResult {
  id: string
  name: string
  email: string
  jobTitle: string
  organization: string
}

interface TeamMemberAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (user: SearchResult) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  placeholder?: string
  className?: string
  excludeEmails?: Set<string>
}

export function TeamMemberAutocomplete({
  value,
  onChange,
  onSelect,
  onKeyDown,
  placeholder,
  className,
  excludeEmails,
}: TeamMemberAutocompleteProps) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const excludeRef = useRef(excludeEmails)
  excludeRef.current = excludeEmails
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

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
          const filtered = ex?.size ? data.filter((u) => !ex.has(u.email)) : data
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

  const selectUser = useCallback((user: SearchResult) => {
    onSelectRef.current(user)
    setShowDropdown(false)
    setResults([])
  }, [])

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
    <PopoverPrimitive.Root open={showDropdown} onOpenChange={setShowDropdown}>
      <PopoverPrimitive.Anchor asChild>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); searchUsers(e.target.value) }}
          onKeyDown={handleKeyDownInternal}
          onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
          placeholder={placeholder}
          className={className}
        />
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={() => setShowDropdown(false)}
          align="start"
          sideOffset={4}
          style={{ width: 'var(--radix-popover-anchor-width)', minWidth: 260 }}
          className="z-[200] rounded-md border bg-popover shadow-md overflow-hidden p-0"
        >
          {isSearching ? (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">搜尋中...</div>
          ) : results.length > 0 ? (
            results.map((user, idx) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault() // keep input focused
                  selectUser(user)
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  idx === highlightIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                }`}
                onMouseEnter={() => setHighlightIdx(idx)}
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
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
