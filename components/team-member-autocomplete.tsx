'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'

interface SearchResult {
  id: string
  name: string
  email: string
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
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectUser(user)
                }}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{user.name}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {user.email}
                    {user.organization && ` · ${user.organization}`}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">
              找不到匹配的使用者，按 Enter 手動新增
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
