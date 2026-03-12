import { useState, useEffect } from 'react'

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

  return { projectTypes, loading }
}
