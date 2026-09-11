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
    // API 失敗時 body 可能是空的（例如資料庫連線逾時回 500），
    //   直接 r.json() 會拋 SyntaxError 變成未攔截的錯誤畫面。
    //   專案類型只是選單資料，抓不到就留空、不要讓整頁掛掉。
    fetch('/api/project-types')
      .then(r => (r.ok ? r.json() : []))
      .then(data => setProjectTypes(Array.isArray(data) ? data : []))
      .catch(() => setProjectTypes([]))
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
