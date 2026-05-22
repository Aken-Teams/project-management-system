'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { startOfWeek, endOfWeek, isWithinInterval, getISOWeek, format, addWeeks, subWeeks } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

interface WeekPickerProps {
  /** The Monday date string (YYYY-MM-DD) of the selected week */
  value: string
  onChange: (mondayStr: string) => void
  /** Optional warning suffix shown after the week label (e.g. "已超過截止日") */
  warningLabel?: string
  className?: string
}

function fmtLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMondayOfWeek(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 })
}

export function WeekPicker({ value, onChange, warningLabel, className }: WeekPickerProps) {
  const [open, setOpen] = React.useState(false)

  // Parse selected week from value string
  const selectedMonday = React.useMemo(() => {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [value])

  const selectedRange = React.useMemo(() => ({
    from: getMondayOfWeek(selectedMonday),
    to: endOfWeek(selectedMonday, { weekStartsOn: 1 }),
  }), [selectedMonday])

  // Display month for DayPicker navigation
  const [displayMonth, setDisplayMonth] = React.useState(selectedMonday)

  // Sync display month when value changes externally
  React.useEffect(() => {
    setDisplayMonth(selectedMonday)
  }, [selectedMonday])

  const weekNum = getISOWeek(selectedMonday)
  const year = selectedMonday.getFullYear()
  const sunday = endOfWeek(selectedMonday, { weekStartsOn: 1 })

  // Check if selected week is current week
  const now = new Date()
  const thisMonday = getMondayOfWeek(now)
  const isThisWeek = fmtLocal(selectedMonday) === fmtLocal(thisMonday)

  const handleDayClick = (day: Date) => {
    const monday = getMondayOfWeek(day)
    onChange(fmtLocal(monday))
    setOpen(false)
  }

  const handlePrevWeek = () => {
    const prev = subWeeks(selectedMonday, 1)
    onChange(fmtLocal(prev))
  }

  const handleNextWeek = () => {
    const next = addWeeks(selectedMonday, 1)
    onChange(fmtLocal(next))
  }

  const handleGoThisWeek = () => {
    onChange(fmtLocal(thisMonday))
  }

  // Display label
  const displayLabel = `${year}W${String(weekNum).padStart(2, '0')} (${selectedMonday.getMonth() + 1}/${selectedMonday.getDate()} ~ ${sunday.getMonth() + 1}/${sunday.getDate()})`

  // Year options for dropdown
  const yearOptions = React.useMemo(() => {
    const current = new Date().getFullYear()
    return Array.from({ length: 7 }, (_, i) => current - 3 + i)
  }, [])

  return (
    <div className={cn('space-y-1', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">週報周別</span>
        </div>
        {!isThisWeek && (
          <button type="button" onClick={handleGoThisWeek} className="text-[10px] text-primary hover:underline">
            回到本周
          </button>
        )}
      </div>

      {/* Week display + controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handlePrevWeek}
          className="p-1.5 rounded-md border bg-background hover:bg-muted shrink-0 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex-1 flex items-center justify-between gap-2 text-sm border rounded-lg px-3 py-2 bg-background hover:bg-muted/50 transition-colors min-w-0',
                isThisWeek && !warningLabel && 'border-primary/30',
                warningLabel && 'border-red-300 bg-red-50/30 dark:bg-red-950/10',
              )}
            >
              <span className="truncate font-medium">
                {displayLabel}
                {isThisWeek && !warningLabel && <span className="text-primary ml-1.5 text-xs font-normal">本周</span>}
                {warningLabel && <span className="text-red-500 ml-1.5 text-xs font-normal">- {warningLabel}</span>}
              </span>
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 z-[60] overflow-y-auto"
            align="start"
            collisionPadding={12}
            style={{ maxHeight: 'var(--radix-popover-content-available-height, 420px)' }}
          >
            <div className="p-2 pb-0">
              {/* Year selector */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <select
                  value={displayMonth.getFullYear()}
                  onChange={e => {
                    const newYear = Number(e.target.value)
                    setDisplayMonth(new Date(newYear, displayMonth.getMonth(), 1))
                  }}
                  className="text-sm font-medium border rounded px-2 py-0.5 bg-background"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y}>{y}年</option>
                  ))}
                </select>
              </div>
            </div>
            <DayPicker
              mode="default"
              showOutsideDays
              showWeekNumber
              weekStartsOn={1}
              month={displayMonth}
              onMonthChange={setDisplayMonth}
              modifiers={{
                selectedWeek: (day: Date) => {
                  try {
                    return isWithinInterval(day, { start: selectedRange.from, end: selectedRange.to })
                  } catch { return false }
                },
                weekStart: selectedRange.from,
                weekEnd: selectedRange.to,
                today: now,
              }}
              modifiersClassNames={{
                selectedWeek: 'bg-primary/15 text-primary',
                weekStart: '!bg-primary !text-primary-foreground rounded-l-md',
                weekEnd: '!bg-primary !text-primary-foreground rounded-r-md',
              }}
              onDayClick={handleDayClick}
              className="p-3"
              classNames={{
                months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                month: 'space-y-4',
                caption: 'flex justify-center pt-1 relative items-center',
                caption_label: 'text-sm font-medium',
                nav: 'space-x-1 flex items-center',
                nav_button: cn(
                  buttonVariants({ variant: 'outline' }),
                  'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
                ),
                nav_button_previous: 'absolute left-1',
                nav_button_next: 'absolute right-1',
                table: 'w-full border-collapse space-y-1',
                head_row: 'flex',
                head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
                row: 'flex w-full mt-2 cursor-pointer hover:bg-accent/50 rounded-md transition-colors',
                cell: 'h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
                day: cn(
                  buttonVariants({ variant: 'ghost' }),
                  'h-9 w-9 p-0 font-normal',
                ),
                day_today: 'bg-accent text-accent-foreground font-bold',
                day_outside: 'text-muted-foreground opacity-50',
                day_disabled: 'text-muted-foreground opacity-50',
                day_hidden: 'invisible',
              }}
              components={{
                IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                IconRight: () => <ChevronRight className="h-4 w-4" />,
              }}
            />
            {/* Quick jump: this week */}
            <div className="border-t px-3 py-2 sticky bottom-0 bg-popover">
              <button
                type="button"
                onClick={() => { handleGoThisWeek(); setOpen(false) }}
                className="text-xs text-primary hover:underline w-full text-center"
              >
                跳到本周 (W{String(getISOWeek(thisMonday)).padStart(2, '0')})
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={handleNextWeek}
          className="p-1.5 rounded-md border bg-background hover:bg-muted shrink-0 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
