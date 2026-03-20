import { useState, useEffect, useMemo } from 'react'

export interface ProjectTypeOption {
  key: string
  label: string
  codePrefix: string
}

export function useProjectTypes() {
  const [projectTypes, setProjectTypes] = useState<ProjectTypeOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/project-types')
      .then(r => r.json())
      .then(data => setProjectTypes(data))
      .finally(() => setLoading(false))
  }, [])

  // Lookup map: key → label (e.g. 'npi' → 'NPI-新產品開發')
  const typeLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of projectTypes) {
      map[t.key] = t.label
      map[t.key.replace(/-/g, '_')] = t.label // also map underscore variant
    }
    return map
  }, [projectTypes])

  return { projectTypes, typeLabels, loading }
}
