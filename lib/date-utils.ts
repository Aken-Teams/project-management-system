// ─── Shared "today" helpers ──────────────────────────────────
// DB dates are stored as UTC-midnight calendar dates (via new Date('YYYY-MM-DD')).
// Comparing against LOCAL midnight (new Date() + setHours(0,0,0,0)) is off by the
// timezone offset (Asia/Taipei = UTC+8 → up to a full day), which made overdue /
// auto-progress judgements disagree across screens. Always compare on the UTC
// calendar date so every engine shares one definition of "today". (Bug #9)

/** Current date at UTC midnight — matches DB-stored calendar dates. */
export function todayUtc(): Date {
  return new Date(new Date().toISOString().split('T')[0])
}

/** Current UTC calendar date as 'YYYY-MM-DD'. */
export function todayUtcStr(): string {
  return new Date().toISOString().split('T')[0]
}

/** A Date's UTC calendar date as 'YYYY-MM-DD'. */
export function toUtcDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}
