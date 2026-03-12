/**
 * Auto-generate a 3–8 character uppercase English code prefix from a label.
 *
 * Rules:
 * 1. Strip non-alphanumeric characters
 * 2. If the result is pure ASCII and ≤ 8 chars → use it directly (uppercase)
 * 3. If multi-word → take first letter of each word (up to 8)
 * 4. If single long word → take first 6 chars
 * 5. Fallback → "PRJ"
 */
export function generateCodePrefix(label: string): string {
  if (!label?.trim()) return 'PRJ'

  // Strip non-alphanumeric (keep spaces for word splitting)
  const cleaned = label.trim().replace(/[^a-zA-Z0-9\s]/g, '')

  // If purely alphanumeric (no spaces) and short enough, use directly
  const noSpaces = cleaned.replace(/\s+/g, '')
  if (/^[a-zA-Z0-9]+$/.test(noSpaces) && noSpaces.length <= 8 && noSpaces.length >= 2) {
    return noSpaces.toUpperCase()
  }

  // Multi-word: take first letter of each word
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    const initials = words
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 8)
    if (initials.length >= 2) return initials
  }

  // Single long word: take first 6 chars
  if (noSpaces.length > 0) {
    return noSpaces.slice(0, 6).toUpperCase()
  }

  return 'PRJ'
}

/** Built-in project type prefix mapping */
export const BUILTIN_CODE_PREFIX: Record<string, string> = {
  npi: 'NPI',
  cost_optimization: 'CST',
  quality_improvement: 'QAL',
  automation: 'AUT',
  product_strategy: 'PST',
  process_optimization: 'PRC',
  external_requirement: 'EXT',
}
