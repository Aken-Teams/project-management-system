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
  type TaskStatus,
  type TaskLog,
  type Risk,
  type SmartObjective,
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
    expectedBenefits?: string
    smartObjective?: SmartObjective
    startDate: string
    endDate: string
    budget: number
    owner: string
    team: string[]
    milestones: Omit<Milestone, 'status' | 'progress'>[]
    risks?: Omit<Risk, 'id' | 'projectId'>[]
  }) => Project
  addWeeklyUpdate: (projectId: string, update: Omit<WeeklyUpdate, 'id' | 'projectId'>) => void
  submitDelayRequest: (projectId: string, request: Omit<DelayRequest, 'id' | 'projectId' | 'status'>) => void
  approveDelayRequest: (projectId: string, requestId: string, reviewedBy: string, reviewNotes: string) => void
  rejectDelayRequest: (projectId: string, requestId: string, reviewedBy: string, reviewNotes: string) => void
  updateTaskStatus: (projectId: string, taskId: string, newStatus: TaskStatus) => void
  addTaskLog: (projectId: string, log: Omit<TaskLog, 'id' | 'projectId' | 'createdAt'>) => void
  completeTask: (projectId: string, taskId: string, completedBy: string) => void
  uncompleteTask: (projectId: string, taskId: string) => void
  resolveSupport: (projectId: string, requestId: string, resolvedBy: string, notes: string) => void
  getTasksForUser: (userName: string) => { project: Project; task: import('./mock-data').Task }[]
  getPendingApprovals: () => { project: Project; request: DelayRequest }[]
  getUnresolvedSupportRequests: () => { project: Project; request: DelayRequest }[]
}

const ProjectStoreContext = createContext<ProjectStoreContextType | undefined>(undefined)

const STORAGE_KEY = 'pm-system-projects'
const STORAGE_VERSION_KEY = 'pm-system-version'
const CURRENT_VERSION = '10'

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
    expectedBenefits?: string
    smartObjective?: SmartObjective
    startDate: string
    endDate: string
    budget: number
    owner: string
    team: string[]
    milestones: Omit<Milestone, 'status' | 'progress'>[]
    risks?: Omit<Risk, 'id' | 'projectId'>[]
  }) => {
    const id = `proj-${Date.now()}`
    const projectCode = generateProjectCode(data.projectType)
    const milestones: Milestone[] = data.milestones.map(m => ({
      ...m,
      status: 'todo' as const,
      progress: 0,
    }))

    const risks: Risk[] = (data.risks || []).map((r, i) => ({
      ...r,
      id: `risk-${Date.now()}-${i}`,
      projectId: id,
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
      expectedBenefits: data.expectedBenefits,
      smartObjective: data.smartObjective,
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
      risks,
      weeklyUpdates: [],
      delayRequests: [],
      taskLogs: [],
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

      // Progress is now task-driven (auto-calculated), no longer overridden by milestoneUpdates.
      // Auto-detect project status based on baseline comparison and PM's judgment.
      let newStatus = p.status
      const hasDelay = p.milestones.some(m => {
        const baselineMs = p.baseline.find(b => b.id === m.id)
        if (!baselineMs) return false
        return m.status !== 'done' && new Date() > new Date(baselineMs.dueDate)
      })

      if (update.overallStatus === 'delay' || hasDelay) {
        const hasHighRisk = p.risks.some(r => r.impact === 'high' && r.status === 'open')
        newStatus = hasHighRisk ? 'red' : 'yellow'
      } else if (p.progress >= 80) {
        newStatus = 'green'
      }

      return {
        ...p,
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

  const updateTaskStatus = useCallback((projectId: string, taskId: string, newStatus: TaskStatus) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p

      const updatedTasks = p.tasks.map(t => {
        if (t.id !== taskId) return t
        return {
          ...t,
          status: newStatus,
          progress: newStatus === 'done' ? 100 : newStatus === 'todo' ? 0 : t.progress,
        }
      })

      // Recalculate milestone progress based on its tasks
      const updatedMilestones = p.milestones.map(m => {
        const milestoneTasks = updatedTasks.filter(t => t.milestoneId === m.id)
        if (milestoneTasks.length === 0) return m

        const avgProgress = Math.round(
          milestoneTasks.reduce((sum, t) => sum + t.progress, 0) / milestoneTasks.length
        )

        let milestoneStatus: TaskStatus = m.status
        if (milestoneTasks.every(t => t.status === 'done')) {
          milestoneStatus = 'done'
        } else if (milestoneTasks.some(t => t.status === 'blocked')) {
          milestoneStatus = 'blocked'
        } else if (milestoneTasks.some(t => t.status === 'in-progress' || t.status === 'done')) {
          milestoneStatus = 'in-progress'
        } else {
          milestoneStatus = 'todo'
        }

        return { ...m, progress: avgProgress, status: milestoneStatus }
      })

      const totalProgress = updatedMilestones.reduce((acc, m) => acc + m.progress, 0)
      const avgProgress = Math.round(totalProgress / updatedMilestones.length)

      return {
        ...p,
        tasks: updatedTasks,
        milestones: updatedMilestones,
        progress: avgProgress,
        updatedAt: new Date().toISOString(),
      }
    }))
  }, [])

  const addTaskLog = useCallback((projectId: string, log: Omit<TaskLog, 'id' | 'projectId' | 'createdAt'>) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p
      const newLog: TaskLog = {
        ...log,
        id: `tl-${Date.now()}`,
        projectId,
        createdAt: new Date().toISOString(),
      }
      return {
        ...p,
        taskLogs: [newLog, ...p.taskLogs],
        updatedAt: new Date().toISOString(),
      }
    }))
  }, [])

  const recalcProgress = (p: Project, updatedTasks: typeof p.tasks) => {
    const updatedMilestones = p.milestones.map(m => {
      const mTasks = updatedTasks.filter(t => t.milestoneId === m.id)
      if (mTasks.length === 0) return m
      const avgProgress = Math.round(mTasks.reduce((s, t) => s + t.progress, 0) / mTasks.length)
      let status: TaskStatus = m.status
      if (mTasks.every(t => t.status === 'done')) status = 'done'
      else if (mTasks.some(t => t.status === 'blocked')) status = 'blocked'
      else if (mTasks.some(t => t.status === 'in-progress' || t.status === 'done')) status = 'in-progress'
      else status = 'todo'
      return { ...m, progress: avgProgress, status }
    })
    const totalProgress = updatedMilestones.reduce((a, m) => a + m.progress, 0)
    const avgProgress = Math.round(totalProgress / updatedMilestones.length)
    return { milestones: updatedMilestones, progress: avgProgress }
  }

  const completeTask = useCallback((projectId: string, taskId: string, completedBy: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p
      const updatedTasks = p.tasks.map(t => {
        if (t.id !== taskId) return t
        return { ...t, status: 'done' as const, progress: 100, completedAt: new Date().toISOString().split('T')[0], completedBy }
      })
      const { milestones, progress } = recalcProgress(p, updatedTasks)
      return { ...p, tasks: updatedTasks, milestones, progress, updatedAt: new Date().toISOString() }
    }))
  }, [])

  const uncompleteTask = useCallback((projectId: string, taskId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p
      const updatedTasks = p.tasks.map(t => {
        if (t.id !== taskId) return t
        const { completedAt, completedBy, ...rest } = t
        return { ...rest, status: 'in-progress' as const, progress: 50 }
      })
      const { milestones, progress } = recalcProgress(p, updatedTasks)
      return { ...p, tasks: updatedTasks, milestones, progress, updatedAt: new Date().toISOString() }
    }))
  }, [])

  const resolveSupport = useCallback((projectId: string, requestId: string, resolvedBy: string, notes: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p
      const updatedRequests = p.delayRequests.map(r => {
        if (r.id !== requestId) return r
        return { ...r, supportResolved: true, supportResolvedAt: new Date().toISOString(), supportResolvedBy: resolvedBy, supportResolvedNotes: notes }
      })
      return { ...p, delayRequests: updatedRequests, updatedAt: new Date().toISOString() }
    }))
  }, [])

  const getTasksForUser = useCallback((userName: string) => {
    const results: { project: Project; task: import('./mock-data').Task }[] = []
    projects.forEach(p => {
      p.tasks.filter(t => t.assignee === userName).forEach(t => results.push({ project: p, task: t }))
    })
    return results
  }, [projects])

  const getPendingApprovals = useCallback(() => {
    const results: { project: Project; request: DelayRequest }[] = []
    projects.forEach(p => {
      p.delayRequests
        .filter(r => r.status === 'pending')
        .forEach(r => results.push({ project: p, request: r }))
    })
    return results
  }, [projects])

  const getUnresolvedSupportRequests = useCallback(() => {
    const results: { project: Project; request: DelayRequest }[] = []
    projects.forEach(p => {
      p.delayRequests
        .filter(r => r.status === 'approved' && r.supportNeeded && r.supportNeeded.trim() !== '' && !r.supportResolved)
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
      updateTaskStatus,
      addTaskLog,
      completeTask,
      uncompleteTask,
      getTasksForUser,
      submitDelayRequest,
      approveDelayRequest,
      rejectDelayRequest,
      resolveSupport,
      getPendingApprovals,
      getUnresolvedSupportRequests,
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
