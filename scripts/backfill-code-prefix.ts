import 'dotenv/config'
import { prisma } from '../lib/db'

const BUILTIN_CODE_PREFIX: Record<string, string> = {
  npi: 'NPI',
  cost_optimization: 'CST',
  quality_improvement: 'QAL',
  automation: 'AUT',
  product_strategy: 'PST',
  process_optimization: 'PRC',
  external_requirement: 'EXT',
}

function generateCodePrefix(label: string): string {
  if (!label?.trim()) return 'PRJ'
  const cleaned = label.trim().replace(/[^a-zA-Z0-9\s]/g, '')
  const noSpaces = cleaned.replace(/\s+/g, '')
  if (/^[a-zA-Z0-9]+$/.test(noSpaces) && noSpaces.length <= 8 && noSpaces.length >= 2) {
    return noSpaces.toUpperCase()
  }
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    const initials = words.map(w => w[0]).join('').toUpperCase().slice(0, 8)
    if (initials.length >= 2) return initials
  }
  if (noSpaces.length > 0) return noSpaces.slice(0, 6).toUpperCase()
  return 'PRJ'
}

async function main() {
  const types = await prisma.projectTypeConfig.findMany()
  console.log(`Found ${types.length} project types`)

  for (const t of types) {
    if (t.codePrefix) {
      console.log(`  ✓ ${t.key} (${t.label}) → already has prefix: ${t.codePrefix}`)
      continue
    }

    const prefix = BUILTIN_CODE_PREFIX[t.key] ?? generateCodePrefix(t.label)
    await prisma.projectTypeConfig.update({
      where: { key: t.key },
      data: { codePrefix: prefix },
    })
    console.log(`  ✎ ${t.key} (${t.label}) → set prefix: ${prefix}`)
  }

  console.log('\nDone!')
}

main().catch(console.error)
