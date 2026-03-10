'use client'

import { useRef, useState, useCallback, useEffect, KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export interface VariableDef {
  name: string    // e.g. "projectName"
  label: string   // e.g. "專案名稱"
  sample: string  // e.g. "條碼自動化"
}

interface TemplateTextareaProps {
  value: string
  onChange: (value: string) => void
  variables: VariableDef[]
  placeholder?: string
  rows?: number
  className?: string
  singleLine?: boolean
  showPreview?: boolean
  onFocus?: () => void
}

// For the syntax-highlight backdrop: only text color, no padding/border on spans
// (layout-altering inline styles would break text alignment with the textarea)
function renderHighlightedBackdrop(text: string): React.ReactNode[] {
  const parts = text.split(/({{[^}]*}})/g)
  return parts.map((part, i) => {
    if (/^{{[^}]*}}$/.test(part)) {
      return <span key={i} style={{ color: '#2563eb', fontWeight: 600 }}>{part}</span>
    }
    return <span key={i}>{part}</span>
  })
}

// For the side preview panel (decorative styling OK since not overlaid on textarea)
function renderHighlighted(text: string): React.ReactNode[] {
  const parts = text.split(/({{[^}]*}})/g)
  return parts.map((part, i) => {
    if (/^{{[^}]*}}$/.test(part)) {
      return (
        <span key={i} className="text-blue-600 bg-blue-50 rounded px-0.5 font-mono text-[0.85em] border border-blue-200">
          {part}
        </span>
      )
    }
    return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>
  })
}

// Exported so pages can render template variables in their own preview UI
export function applyTemplateSamples(text: string, variables: VariableDef[]): string {
  const sampleMap = Object.fromEntries(variables.map(v => [v.name, v.sample]))
  return text.replace(/{{(\w+)}}/g, (_, key) => sampleMap[key] ?? `{{${key}}}`)
}

function renderWithSamples(text: string, variables: VariableDef[]): React.ReactNode[] {
  const sampleMap = Object.fromEntries(variables.map(v => [v.name, v.sample]))
  const parts = text.split(/({{[^}]*}})/g)
  return parts.map((part, i) => {
    const match = part.match(/^{{(\w+)}}$/)
    if (match) {
      const sample = sampleMap[match[1]]
      if (sample) {
        return <span key={i} className="text-blue-600 font-medium">{sample}</span>
      }
      return <span key={i} className="text-red-500 font-mono text-[0.85em]">{part}</span>
    }
    return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>
  })
}

export function TemplateTextarea({
  value,
  onChange,
  variables,
  placeholder,
  rows = 4,
  className,
  singleLine = false,
  showPreview = true,
  onFocus,
}: TemplateTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const [showAC, setShowAC] = useState(false)
  const [acQuery, setAcQuery] = useState('')
  const [acIndex, setAcIndex] = useState(0)
  const [acTriggerPos, setAcTriggerPos] = useState(0)
  const [previewMode, setPreviewMode] = useState<'highlight' | 'sample'>('highlight')

  const filteredVars = variables.filter(v =>
    v.name.toLowerCase().includes(acQuery.toLowerCase()) || v.label.includes(acQuery)
  )

  // Sync backdrop scroll position with textarea
  const syncScroll = useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  const checkAutocomplete = useCallback((val: string, cursorPos: number) => {
    const textBefore = val.substring(0, cursorPos)
    const match = textBefore.match(/\{\{([^}]*)$/)
    if (match) {
      setShowAC(true)
      setAcQuery(match[1])
      setAcTriggerPos(cursorPos - match[0].length)
      setAcIndex(0)
    } else {
      setShowAC(false)
    }
  }, [])

  const insertVariable = useCallback((variable: VariableDef) => {
    const el = (textareaRef.current ?? inputRef.current) as HTMLTextAreaElement | HTMLInputElement | null
    if (!el) return
    const cursorPos = el.selectionStart ?? 0
    const before = value.substring(0, acTriggerPos)
    const after = value.substring(cursorPos)
    const inserted = `{{${variable.name}}}`
    onChange(before + inserted + after)
    setShowAC(false)
    requestAnimationFrame(() => {
      const newPos = acTriggerPos + inserted.length
      el.setSelectionRange(newPos, newPos)
      el.focus()
    })
  }, [value, acTriggerPos, onChange])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!showAC || filteredVars.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setAcIndex(i => (i + 1) % filteredVars.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAcIndex(i => (i - 1 + filteredVars.length) % filteredVars.length) }
    else if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertVariable(filteredVars[acIndex]) }
    else if (e.key === 'Escape') { setShowAC(false) }
  }, [showAC, filteredVars, acIndex, insertVariable])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const newVal = e.target.value
    onChange(newVal)
    checkAutocomplete(newVal, e.target.selectionStart ?? 0)
  }, [onChange, checkAutocomplete])

  const handleClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    checkAutocomplete((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)
  }, [checkAutocomplete])

  const insertAtCursor = useCallback((varName: string) => {
    const el = (textareaRef.current ?? inputRef.current) as HTMLTextAreaElement | HTMLInputElement | null
    if (!el) return
    const pos = el.selectionStart ?? value.length
    const inserted = `{{${varName}}}`
    onChange(value.substring(0, pos) + inserted + value.substring(pos))
    requestAnimationFrame(() => {
      el.setSelectionRange(pos + inserted.length, pos + inserted.length)
      el.focus()
    })
  }, [value, onChange])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current && !textareaRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowAC(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Preview panel (shared) ──────────────────────────────────────────────────
  const previewPanel = (
    <div className="rounded-md border border-dashed bg-muted/20 flex flex-col h-full">
      <div className="flex border-b shrink-0">
        <button
          type="button"
          className={cn(
            'px-3 py-1.5 text-xs transition-colors rounded-tl-md',
            previewMode === 'highlight' ? 'bg-background border-r font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setPreviewMode('highlight')}
        >帶色顯示</button>
        <button
          type="button"
          className={cn(
            'px-3 py-1.5 text-xs transition-colors',
            previewMode === 'sample' ? 'bg-background border-r font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setPreviewMode('sample')}
        >預覽效果</button>
      </div>
      <div className="px-3 py-2 text-sm leading-relaxed flex-1 overflow-auto">
        {value
          ? previewMode === 'highlight'
            ? renderHighlighted(value)
            : renderWithSamples(value, variables)
          : <span className="text-muted-foreground text-xs italic">（空白）</span>
        }
      </div>
    </div>
  )

  // ── Autocomplete dropdown ──────────────────────────────────────────────────
  // w-max lets the dropdown size to content; all spans use shrink-0/whitespace-nowrap to prevent wrapping
  const autocompleteDropdown = showAC && filteredVars.length > 0 && (
    <div
      ref={dropdownRef}
      className="absolute left-0 top-full z-50 mt-1 w-max rounded-md border bg-popover shadow-md text-popover-foreground"
    >
      <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">↑↓ 選擇，Tab 插入</div>
      {filteredVars.map((v, i) => (
        <button
          key={v.name}
          type="button"
          className={cn(
            'flex w-full items-center gap-4 rounded-sm px-3 py-1.5 text-xs cursor-pointer',
            i === acIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
          )}
          onMouseDown={e => { e.preventDefault(); insertVariable(v) }}
          onMouseEnter={() => setAcIndex(i)}
        >
          <span className="font-mono text-blue-600 shrink-0 whitespace-nowrap">{`{{${v.name}}}`}</span>
          <span className="text-muted-foreground shrink-0 whitespace-nowrap">{v.label}</span>
          <span className="text-muted-foreground shrink-0 whitespace-nowrap opacity-60">{v.sample}</span>
        </button>
      ))}
    </div>
  )

  // ── Highlighted textarea (backdrop overlay for syntax coloring) ────────────
  // Backdrop sits behind the textarea with identical padding/font/line-height.
  // Textarea text is transparent; only the caret is visible.
  // The backdrop renders colored variable spans that show through.
  const highlightedTextarea = (
    <div className="relative">
      {/* Syntax-highlight backdrop — must match textarea padding/font exactly */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="absolute inset-[1px] rounded-md overflow-hidden pointer-events-none px-3 py-2 text-sm bg-background"
        style={{
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          lineHeight: '1.25rem',  // matches text-sm default line-height
          fontFamily: 'inherit',
        }}
      >
        {value
          ? renderHighlightedBackdrop(value)
          : placeholder
            ? <span className="text-muted-foreground/50">{placeholder}</span>
            : null
        }
        {/* Trailing newline prevents last line from collapsing in the backdrop */}
        {'\n'}
      </div>

      {/* Actual textarea — transparent text so backdrop colors show through */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onScroll={syncScroll}
        rows={rows}
        spellCheck={false}
        className="relative flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        style={{
          color: 'transparent',
          caretColor: 'var(--foreground, #0f172a)',
          lineHeight: '1.25rem',
        }}
      />
      {autocompleteDropdown}
    </div>
  )

  return (
    <div className={cn('space-y-2', className)}>
      {/* Variable chips */}
      <div className="flex flex-wrap gap-1">
        {variables.map(v => (
          <button
            key={v.name}
            type="button"
            className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100 transition-colors font-mono"
            onClick={() => insertAtCursor(v.name)}
          >
            {`{{${v.name}}}`}
            <span className="text-blue-500 font-sans ml-0.5">= {v.label}</span>
          </button>
        ))}
      </div>

      {singleLine ? (
        /* Single-line: same backdrop overlay technique as textarea */
        <>
          <div className="relative">
            {/* Syntax-highlight backdrop — single line, no wrapping */}
            <div
              aria-hidden="true"
              className="absolute inset-[1px] rounded-md overflow-hidden pointer-events-none px-3 bg-background flex items-center"
              style={{ fontFamily: 'inherit' }}
            >
              <span className="text-sm whitespace-nowrap" style={{ lineHeight: '1.25rem' }}>
                {value
                  ? renderHighlightedBackdrop(value)
                  : placeholder
                    ? <span className="text-muted-foreground/50">{placeholder}</span>
                    : null
                }
              </span>
            </div>
            {/* Input — transparent text, visible caret */}
            <input
              ref={inputRef}
              value={value}
              onChange={handleChange}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              onFocus={onFocus}
              spellCheck={false}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              style={{ color: 'transparent', caretColor: 'var(--foreground, #0f172a)' }}
            />
            {autocompleteDropdown}
          </div>
          {showPreview && previewPanel}
        </>
      ) : (
        showPreview ? (
          <div className="grid grid-cols-2 gap-3">
            {highlightedTextarea}
            <div style={{ minHeight: `${rows * 1.5 + 1}rem` }}>{previewPanel}</div>
          </div>
        ) : (
          highlightedTextarea
        )
      )}
    </div>
  )
}
