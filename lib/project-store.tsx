'use client'

import React from 'react'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  MOCK_PROJECTS,
  generateProjectCode,
  type Project,
  type ProjectType,
  type WeeklyUpdate,
  type DelayRequest,
  type Milestone,
} from './mock-data'

interface ProjectStoreContextType {
  projects: Project[]
  getProject: (id: string) => Project | undefined
  addProject: (data: {
    projectType: ProjectType
    name: string
    objective: string
    purpose: string
    scope: string
    roi: string
    createdReason: string
    startDate: string
    endDate: string
    budget: number
    owner: string
    team: string[]
    milestones: Omit<Milestone, 'status' | 'progress'>[]
  }) => Project
  addWeeklyUpdate: (projectId: string, update: Omit<WeeklyUpdate, 'id' | 'projectId'>) => void
  submitDelayRequest: (projectId: string, request: Omit<DelayRequest, 'id' | 'projectId' | 'status'>) => void
  approveDelayRequest: (projectId: string, requestId: string, reviewedBy: string, reviewNotes: string) => void
  rejectDelayRequest: (projectId: string, requestId: string, reviewedBy: string, reviewNotes: string) => void
  getPendingApprovals: () => { project: Project; request: DelayRequest }[]
}

const ProjectStoreContext = createContext<ProjectStoreContextType | undefined>(undefined)

const STORAGE_KEY = 'pm-system-projects'
const STORAGE_VERSION_KEY = 'pm-system-version'
const CURRENT_VERSION = '4'

export function ProjectStoreProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY)
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && storedVersion === CURRENT_VERSION) {
      try {
        setProjects(JSON.parse(stored))
      } catch {
        setProjects(MOCK_PROJECTS)
      }
    } else {
      setProjects(MOCK_PROJECTS)
      localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION)
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
    }
  }, [projects, loaded])

  const getProject = useCallback((id: string) => {
    return projects.find(p => p.id === id)
  }, [projects])

  const addProject = useCallback((data: {
    projectType: ProjectType
    name: string
    objective: string
    purpose: string
    scope: string
    roi: string
    createdReason: string
    startDate: string
    endDate: string
    budget: number
    owner: string
    team: string[]
    milestones: Omit<Milestone, 'status' | 'progress'>[]
  }) => {
    const id = `proj-${Date.now()}`
    const projectCode = generateProjectCode(data.projectType)
    const milestones: Milestone[] = data.milestones.map(m => ({
      ...m,
      status: 'todo' as const,
      progress: 0,
    }))

    const newProject: Project = {
      id,
      projectCode,
      projectType: data.projectType,
      name: data.name,
      objective: data.objective,
      purpose: data.purpose,
      scope: data.scope,
      roi: data.roi,
      createdReason: data.createdReason,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'green',
      progress: 0,
      budget: data.budget,
      budgetUsed: 0,
      owner: data.owner,
      team: data.team,
      milestones,
      baseline: milestones.map(m => ({ ...m })),
      tasks: [],
      risks: [],
      weeklyUpdates: [],
      delayRequests: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setProjects(prev => [...prev, newProject])
    return newProject
  }, [])

  const addWeeklyUpdate = useCallback((projectId: string, update: Omit<WeeklyUpdate, 'id' | 'projectId'>) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p

      const newUpdate: WeeklyUpdate = {
        ...update,
        id: `wu-${Date.now()}`,
        projectId,
      }

      // Update milestone progress based on the update
      const updatedMilestones = p.milestones.map(m => {
        const mu = update.milestoneUpdates.find(u => u.milestoneId === m.id)
        if (mu) {
          return {
            ...m,
            progress: mu.progress,
            status: mu.progress >= 100 ? 'done' as const
              : mu.progress > 0 ? 'in-progress' as const
              : m.status,
          }
        }
        return m
      })

      // Calculate overall progress
      const totalProgress = updatedMilestones.reduce((acc, m) => acc + m.progress, 0)
      const avgProgress = Math.round(totalProgress / updatedMilestones.length)

      // Auto-detect status based on baseline comparison
      let newStatus = p.status
      const hasDelay = updatedMilestones.some((m, i) => {
        const baselineMs = p.baseline.find(b => b.id === m.id)
        if (!baselineMs) return false
        return m.status !== 'done' && new Date() > new Date(baselineMs.dueDate)
      })

      if (update.overallStatus === 'delay' || hasDelay) {
        const hasHighRisk = p.risks.some(r => r.impact === 'high' && r.status === 'open')
        newStatus = hasHighRisk ? 'red' : 'yellow'
      } else if (avgProgress >= 80) {
        newStatus = 'green'
      }

      return {
        ...p,
        milestones: updatedMilestones,
        progress: avgProgress,
        status: newStatus,
        weeklyUpdates: [newUpdate, ...p.weeklyUpdates],
        updatedAt: new Date().toISOString(),
      }
    }))
  }, [])

  const submitDelayRequest = useCallback((projectId: string, request: Omit<DelayRequest, 'id' | 'projectId' | 'status'>) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p
      const newRequest: DelayRequest = {
        ...request,
        id: `dr-${Date.now()}`,
        projectId,
        status: 'pending',
      }
      return {
        ...p,
        delayRequests: [newRequest, ...p.delayRequests],
        updatedAt: new Date().toISOString(),
      }
    }))
  }, [])

  const approveDelayRequest = useCallback((projectId: string, requestId: string, reviewedBy: string, reviewNotes: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p

      const updatedRequests = p.delayRequests.map(r => {
        if (r.id !== requestId) return r
        return { ...r, status: 'approved' as const, reviewedBy, reviewedAt: new Date().toISOString(), reviewNotes }
      })

      // Update milestone dates based on approved request
      const approvedRequest = p.delayRequests.find(r => r.id === requestId)
      let updatedMilestones = p.milestones
      if (approvedRequest) {
        updatedMilestones = p.milestones.map(m => {
          const affected = approvedRequest.affectedMilestones.find(am => am.milestoneId === m.id)
          if (affected) {
            return { ...m, dueDate: affected.proposedDate }
          }
          return m
        })
      }

      return {
        ...p,
        milestones: updatedMilestones,
        delayRequests: updatedRequests,
        updatedAt: new Date().toISOString(),
      }
    }))
  }, [])

  const rejectDelayRequest = useCallback((projectId: string, requestId: string, reviewedBy: string, reviewNotes: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p
      const updatedRequests = p.delayRequests.map(r => {
        if (r.id !== requestId) return r
        return { ...r, status: 'rejected' as const, reviewedBy, reviewedAt: new Date().toISOString(), reviewNotes }
      })
      return { ...p, delayRequests: updatedRequests, updatedAt: new Date().toISOString() }
    }))
  }, [])

  const getPendingApprovals = useCallback(() => {
    const results: { project: Project; request: DelayRequest }[] = []
    projects.forEach(p => {
      p.delayRequests
        .filter(r => r.status === 'pending')
        .forEach(r => results.push({ project: p, request: r }))
    })
    return results
  }, [projects])

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">載入中...</div>
      </div>
    )
  }

  return (
    <ProjectStoreContext.Provider value={{
      projects,
      getProject,
      addProject,
      addWeeklyUpdate,
      submitDelayRequest,
      approveDelayRequest,
      rejectDelayRequest,
      getPendingApprovals,
    }}>
      {children}
    </ProjectStoreContext.Provider>
  )
}

export function useProjectStore() {
  const context = useContext(ProjectStoreContext)
  if (context === undefined) {
    throw new Error('useProjectStore must be used within a ProjectStoreProvider')
  }
  return context
}
