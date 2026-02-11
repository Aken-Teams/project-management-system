'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { parseProjectRequirements, type ParsedProjectData } from '@/lib/ai-service'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { PROJECT_TYPE_LABELS, PROJECT_TIER_LABELS, DEMAND_SOURCE_LABELS, TEAM_ROLE_LABELS, generateProjectCode, type ProjectType, type ProjectTier, type DemandSource, type TeamRole } from '@/lib/mock-data'
import { MILESTONE_TEMPLATES } from '@/lib/milestone-templates'
import { TimelineTable } from '@/components/timeline-table'
import { VoiceInputButton } from '@/components/voice-input-button'
import {
  Loader2,
  Sparkles,
  FileText,
  Calendar,
  DollarSign,
  Users,
  AlertTriangle,
  Plus,
  Trash2,
  Shield,
  Check,
  ChevronRight,
  ArrowLeft,
  Target,
  X,
  Lightbulb,
  Layers,
  TrendingUp,
  ClipboardList,
  Save,
  FolderOpen,
  Clock,
  Briefcase,
} from 'lucide-react'
import { arrayMove } from '@dnd-kit/sortable'

interface ManualMilestone {
  id: string
  name: string
  durationWeeks: number
  startDate?: string
  endDate?: string
}

interface AiMilestone {
  id: string
  name: string
  description: string
  durationWeeks: number
  startDate?: string
  endDate?: string
}

interface ManualRisk {
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
  probability: 'low' | 'medium' | 'high'
  mitigation: string
}

interface TeamMemberDraft {
  id: string
  name: string
  role: TeamRole
  responsibility: string
}

interface MilestoneTaskDraft {
  id: string
  milestoneId: string
  title: string
  assignee: string
  priority: 'low' | 'medium' | 'high'
  durationWeeks: number
}

interface ProjectDraft {
  id: string
  mode: 'manual' | 'ai'
  createdAt: string
  updatedAt: string
  title: string
  data: {
    // Manual mode
    manualData?: {
      name: string
      objective: string
      purpose: string
      scope: string
      roi: string
      createdReason: string
      startDate: string
      endDate: string
      budget: string
      expectedBenefits: string
    }
    smartObjective?: {
      specific: string
      measurable: string
      achievable: string
      relevant: string
      timeBound: string
    }
    manualProjectType?: ProjectType
    manualProjectTier?: ProjectTier
    manualDemandSource?: DemandSource
    manualMilestones?: ManualMilestone[]
    manualRisks?: ManualRisk[]
    manualTeamMembers?: string[]
    currentStep?: number
    // AI mode
    aiProjectType?: ProjectType
    aiProjectTier?: ProjectTier
    aiDemandSource?: DemandSource
    aiCreatedReason?: string
    aiExpectedBenefits?: string
    requirements?: string
    parsedData?: ParsedProjectData | null
    aiTeamMembers?: string[]
  }
}

const DRAFTS_STORAGE_KEY = 'project-drafts'

const STEPS = [
  { label: '基本資訊', icon: FileText },
  { label: 'SMART 目標', icon: Target },
  { label: '專案定義', icon: Lightbulb },
  { label: '團隊與風險', icon: Users },
  { label: '時程里程碑', icon: Calendar },
]

const AI_STEPS = [
  { label: 'AI 解析', icon: Sparkles },
  { label: '基本資訊', icon: FileText },
  { label: 'SMART 目標', icon: Target },
  { label: '專案定義', icon: Lightbulb },
  { label: '團隊與風險', icon: Users },
  { label: '時程里程碑', icon: Calendar },
]


export default function NewProjectPage() {
  const router = useRouter()
  const { addProject } = useProjectStore()
  const { user } = useAuth()
  const { toast } = useToast()
  const [isCreating, setIsCreating] = useState(false)
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('ai')
  const [showDraftsDialog, setShowDraftsDialog] = useState(false)
  const [showSaveDraftDialog, setShowSaveDraftDialog] = useState(false)
  const [draftNameInput, setDraftNameInput] = useState('')
  const [savedDrafts, setSavedDrafts] = useState<ProjectDraft[]>([])

  // AI Mode
  const [requirements, setRequirements] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedProjectData | null>(null)
  const [aiProjectType, setAiProjectType] = useState<ProjectType | ''>('')
  const [aiProjectTier, setAiProjectTier] = useState<ProjectTier | ''>('')
  const [aiDemandSource, setAiDemandSource] = useState<DemandSource | ''>('')
  const [aiCreatedReason, setAiCreatedReason] = useState('')
  const [aiExpectedBenefits, setAiExpectedBenefits] = useState('')
  const [aiTeamMembers, setAiTeamMembers] = useState<string[]>([])
  const [aiTeamInput, setAiTeamInput] = useState('')

  // AI Step Wizard
  const [aiCurrentStep, setAiCurrentStep] = useState(0)
  const [aiEditableData, setAiEditableData] = useState({
    name: '',
    budget: '',
    startDate: '',
    endDate: '',
    purpose: '',
    scope: '',
    roi: '',
    expectedBenefits: '',
  })
  const [aiSmartObjective, setAiSmartObjective] = useState({
    specific: '',
    measurable: '',
    achievable: '',
    relevant: '',
    timeBound: '',
  })
  const [aiMilestones, setAiMilestones] = useState<AiMilestone[]>([])
  const [aiRisks, setAiRisks] = useState<Array<{ title: string; description: string; impact: 'low' | 'medium' | 'high'; probability: 'low' | 'medium' | 'high' }>>([])
  const [aiTeamDetails, setAiTeamDetails] = useState<TeamMemberDraft[]>([])
  const [aiNewMember, setAiNewMember] = useState({ name: '', role: 'engineer' as TeamRole, responsibility: '' })
  const [aiTasks, setAiTasks] = useState<MilestoneTaskDraft[]>([])

  // Manual Mode — Step Wizard
  const [currentStep, setCurrentStep] = useState(0)
  const [manualData, setManualData] = useState({
    name: '',
    objective: '',
    purpose: '',
    scope: '',
    roi: '',
    createdReason: '',
    startDate: '',
    endDate: '',
    budget: '',
    expectedBenefits: '',
  })
  // SMART 目標結構化數據
  const [smartObjective, setSmartObjective] = useState({
    specific: '',      // 具體目標
    measurable: '',    // 可衡量指標
    achievable: '',    // 可達成性
    relevant: '',      // 相關性
    timeBound: '',     // 時限性
  })
  const [manualProjectType, setManualProjectType] = useState<ProjectType | ''>('')
  const [manualProjectTier, setManualProjectTier] = useState<ProjectTier | ''>('')
  const [manualDemandSource, setManualDemandSource] = useState<DemandSource | ''>('')
  const [manualMilestones, setManualMilestones] = useState<ManualMilestone[]>([])
  const [manualRisks, setManualRisks] = useState<ManualRisk[]>([])
  const [manualTeamMembers, setManualTeamMembers] = useState<string[]>([])
  const [manualTeamInput, setManualTeamInput] = useState('')
  // Enhanced team members with roles
  const [manualTeamDetails, setManualTeamDetails] = useState<TeamMemberDraft[]>([])
  const [manualNewMember, setManualNewMember] = useState({ name: '', role: 'engineer' as TeamRole, responsibility: '' })
  // Milestone tasks
  const [manualTasks, setManualTasks] = useState<MilestoneTaskDraft[]>([])

  // Project code preview
  const [previewCode, setPreviewCode] = useState<string>('')

  // Load drafts from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(DRAFTS_STORAGE_KEY)
    if (stored) {
      try {
        setSavedDrafts(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to load drafts:', e)
      }
    }
  }, [])

  // Open save draft dialog
  const openSaveDraftDialog = () => {
    const defaultName = activeTab === 'manual'
      ? manualData.name || '未命名專案'
      : parsedData?.name || requirements.slice(0, 30) || '未命名專案'

    setDraftNameInput(defaultName)
    setShowSaveDraftDialog(true)
  }

  // Save current state as draft
  const confirmSaveDraft = () => {
    const draftTitle = draftNameInput.trim() || '未命名專案'

    const draft: ProjectDraft = {
      id: `draft-${Date.now()}`,
      mode: activeTab,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: draftTitle,
      data: {
        // Manual mode data
        manualData: activeTab === 'manual' ? manualData : undefined,
        smartObjective: activeTab === 'manual' ? smartObjective : undefined,
        manualProjectType: activeTab === 'manual' ? manualProjectType : undefined,
        manualProjectTier: activeTab === 'manual' ? manualProjectTier : undefined,
        manualDemandSource: activeTab === 'manual' ? manualDemandSource : undefined,
        manualMilestones: activeTab === 'manual' ? manualMilestones : undefined,
        manualRisks: activeTab === 'manual' ? manualRisks : undefined,
        manualTeamMembers: activeTab === 'manual' ? manualTeamMembers : undefined,
        currentStep: activeTab === 'manual' ? currentStep : undefined,
        // AI mode data
        aiProjectType: activeTab === 'ai' ? aiProjectType : undefined,
        aiProjectTier: activeTab === 'ai' ? aiProjectTier : undefined,
        aiDemandSource: activeTab === 'ai' ? aiDemandSource : undefined,
        aiCreatedReason: activeTab === 'ai' ? aiCreatedReason : undefined,
        aiExpectedBenefits: activeTab === 'ai' ? aiExpectedBenefits : undefined,
        requirements: activeTab === 'ai' ? requirements : undefined,
        parsedData: activeTab === 'ai' ? parsedData : undefined,
        aiTeamMembers: activeTab === 'ai' ? aiTeamMembers : undefined,
      }
    }

    const updatedDrafts = [draft, ...savedDrafts]
    setSavedDrafts(updatedDrafts)
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedDrafts))

    setShowSaveDraftDialog(false)
    setDraftNameInput('')

    toast({
      title: '草稿已儲存',
      description: `「${draftTitle}」已成功儲存`,
    })
  }

  // Load draft
  const loadDraft = (draft: ProjectDraft) => {
    setActiveTab(draft.mode)

    if (draft.mode === 'manual' && draft.data.manualData) {
      setManualData(draft.data.manualData)
      if (draft.data.smartObjective) setSmartObjective(draft.data.smartObjective)
      if (draft.data.manualProjectType) setManualProjectType(draft.data.manualProjectType)
      if (draft.data.manualProjectTier) setManualProjectTier(draft.data.manualProjectTier)
      if (draft.data.manualDemandSource) setManualDemandSource(draft.data.manualDemandSource)
      if (draft.data.manualMilestones) setManualMilestones(draft.data.manualMilestones)
      if (draft.data.manualRisks) setManualRisks(draft.data.manualRisks)
      if (draft.data.manualTeamMembers) setManualTeamMembers(draft.data.manualTeamMembers)
      if (draft.data.currentStep !== undefined) setCurrentStep(draft.data.currentStep)
    } else if (draft.mode === 'ai') {
      if (draft.data.aiProjectType) setAiProjectType(draft.data.aiProjectType)
      if (draft.data.aiProjectTier) setAiProjectTier(draft.data.aiProjectTier)
      if (draft.data.aiDemandSource) setAiDemandSource(draft.data.aiDemandSource)
      if (draft.data.aiCreatedReason) setAiCreatedReason(draft.data.aiCreatedReason)
      if (draft.data.aiExpectedBenefits) setAiExpectedBenefits(draft.data.aiExpectedBenefits)
      if (draft.data.requirements) setRequirements(draft.data.requirements)
      if (draft.data.parsedData) setParsedData(draft.data.parsedData)
      if (draft.data.aiTeamMembers) setAiTeamMembers(draft.data.aiTeamMembers)
    }

    setShowDraftsDialog(false)
    toast({
      title: '草稿已載入',
      description: `「${draft.title}」已成功載入`,
    })
  }

  // Delete draft
  const deleteDraft = (draftId: string) => {
    const updatedDrafts = savedDrafts.filter(d => d.id !== draftId)
    setSavedDrafts(updatedDrafts)
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedDrafts))

    toast({
      title: '草稿已刪除',
      description: '草稿已從清單中移除',
    })
  }

  const updateProjectCodePreview = (type: ProjectType) => {
    const prefix: Record<ProjectType, string> = {
      npi: 'NPI',
      'cost-optimization': 'CST',
      'quality-improvement': 'QAL',
      automation: 'AUT',
      'product-strategy': 'PST',
      'process-optimization': 'PRC',
      'external-requirement': 'EXT',
    }
    const year = new Date().getFullYear()
    setPreviewCode(`${prefix[type]}-${year}-XXX`)
  }

  const applyMilestoneTemplate = (type: ProjectType, mode: 'manual' | 'ai') => {
    const template = MILESTONE_TEMPLATES[type]
    if (!template) return
    if (mode === 'manual') {
      const newMilestones = template.map((t, i) => ({
        id: `milestone-${Date.now()}-${i}`,
        name: t.name,
        durationWeeks: t.durationWeeks,
      }))
      setManualMilestones(newMilestones)
      setManualTasks([])
    } else {
      setAiMilestones(template.map((t, i) => ({
        id: `ai-ms-${Date.now()}-${i}`,
        name: t.name,
        description: '',
        durationWeeks: t.durationWeeks,
      })))
      setAiTasks([])
    }
  }

  const handleManualTypeChange = (type: ProjectType) => {
    setManualProjectType(type)
    updateProjectCodePreview(type)
    applyMilestoneTemplate(type, 'manual')
  }

  const handleAiTypeChange = (type: ProjectType) => {
    setAiProjectType(type)
    updateProjectCodePreview(type)
    applyMilestoneTemplate(type, 'ai')
  }

  // Calculate milestone dates based on duration weeks
  const calculateMilestoneDates = (milestones: ManualMilestone[], projectStartDate: string, tasks: MilestoneTaskDraft[]) => {
    if (!projectStartDate) return milestones

    let currentDate = new Date(projectStartDate)

    return milestones.map((milestone) => {
      // Sum task durations for this milestone
      const totalTaskWeeks = tasks
        .filter(t => t.milestoneId === milestone.id)
        .reduce((sum, t) => sum + (t.durationWeeks || 0), 0)

      // Effective duration = max(milestone's own duration, total task duration)
      const effectiveWeeks = Math.max(milestone.durationWeeks, totalTaskWeeks)

      if (effectiveWeeks <= 0) {
        return { ...milestone, startDate: undefined, endDate: undefined }
      }

      const startDate = new Date(currentDate)
      const daysToAdd = effectiveWeeks * 7 - 1 // weeks to days, -1 because start day is included
      const endDate = new Date(currentDate)
      endDate.setDate(endDate.getDate() + daysToAdd)

      // Update current date for next milestone
      currentDate = new Date(endDate)
      currentDate.setDate(currentDate.getDate() + 1) // Next milestone starts the day after

      return {
        ...milestone,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      }
    })
  }

  // Recalculate dates when milestones or start date changes
  const recalculatedMilestones = calculateMilestoneDates(manualMilestones, manualData.startDate, manualTasks)

  // Calculate task dates within each milestone's date range
  const calculateTaskDates = (
    tasks: MilestoneTaskDraft[],
    milestones: (ManualMilestone & { startDate?: string; endDate?: string })[],
  ) => {
    const result: Map<string, { startDate: string; endDate: string }> = new Map()

    for (const ms of milestones) {
      if (!ms.startDate) continue
      const msTasks = tasks.filter(t => t.milestoneId === ms.id && t.durationWeeks > 0)
      let currentDate = new Date(ms.startDate)

      for (const task of msTasks) {
        const taskStart = new Date(currentDate)
        const daysToAdd = task.durationWeeks * 7 - 1
        const taskEnd = new Date(currentDate)
        taskEnd.setDate(taskEnd.getDate() + daysToAdd)

        result.set(task.id, {
          startDate: taskStart.toISOString().split('T')[0],
          endDate: taskEnd.toISOString().split('T')[0],
        })

        currentDate = new Date(taskEnd)
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }
    return result
  }

  const manualTaskDates = calculateTaskDates(manualTasks, recalculatedMilestones)

  // Auto-expand milestone duration when tasks exceed it
  useEffect(() => {
    let changed = false
    const updated = manualMilestones.map((ms) => {
      const totalTaskWeeks = manualTasks
        .filter(t => t.milestoneId === ms.id)
        .reduce((sum, t) => sum + (t.durationWeeks || 0), 0)
      if (totalTaskWeeks > ms.durationWeeks) {
        changed = true
        return { ...ms, durationWeeks: totalTaskWeeks }
      }
      return ms
    })
    if (changed) setManualMilestones(updated)
  }, [manualTasks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track the last milestone's end date (only changes when milestones actually change)
  const lastMilestoneEndDate = useMemo(() => {
    const lastMilestone = [...recalculatedMilestones]
      .reverse()
      .find(m => m.endDate && m.durationWeeks > 0)
    return lastMilestone?.endDate || ''
  }, [recalculatedMilestones])

  // Get the minimum allowed end date (last milestone's end date)
  const getMinEndDate = () => {
    return lastMilestoneEndDate || manualData.startDate || ''
  }

  // Auto-update project end date when milestones change
  useEffect(() => {
    if (!manualData.startDate || !lastMilestoneEndDate) return

    // Only update when the last milestone's end date actually changes
    // This allows users to manually extend the end date without it being reset
    setManualData(prev => ({ ...prev, endDate: lastMilestoneEndDate }))
  }, [lastMilestoneEndDate, manualData.startDate])

  // Milestone helpers
  const addMilestone = () => {
    const newId = `milestone-${Date.now()}`
    setManualMilestones([...manualMilestones, { id: newId, name: '', durationWeeks: 0 }])
  }

  const removeMilestone = (index: number) => {
    if (manualMilestones.length <= 1) return
    setManualMilestones(manualMilestones.filter((_, i) => i !== index))
  }

  const updateMilestone = (index: number, field: keyof ManualMilestone, value: string | number) => {
    setManualMilestones(
      manualMilestones.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    )
  }

  // Risk helpers
  const addRisk = () => {
    setManualRisks([...manualRisks, { title: '', description: '', impact: 'medium', probability: 'medium', mitigation: '' }])
  }

  const removeRisk = (index: number) => {
    setManualRisks(manualRisks.filter((_, i) => i !== index))
  }

  const updateRisk = (index: number, field: keyof ManualRisk, value: string) => {
    setManualRisks(
      manualRisks.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    )
  }

  // AI Milestone date calculation (same as manual mode)
  const calculateAiMilestoneDates = (milestones: AiMilestone[], startDate: string, tasks: MilestoneTaskDraft[]): AiMilestone[] => {
    if (!startDate) return milestones

    let currentDate = new Date(startDate)

    return milestones.map((milestone) => {
      const totalTaskWeeks = tasks
        .filter(t => t.milestoneId === milestone.id)
        .reduce((sum, t) => sum + (t.durationWeeks || 0), 0)

      const effectiveWeeks = Math.max(milestone.durationWeeks || 0, totalTaskWeeks)

      if (effectiveWeeks <= 0) {
        return { ...milestone, startDate: undefined, endDate: undefined }
      }

      const msStart = new Date(currentDate)
      const daysToAdd = effectiveWeeks * 7 - 1
      const msEnd = new Date(currentDate)
      msEnd.setDate(msEnd.getDate() + daysToAdd)

      currentDate = new Date(msEnd)
      currentDate.setDate(currentDate.getDate() + 1)

      return {
        ...milestone,
        startDate: msStart.toISOString().split('T')[0],
        endDate: msEnd.toISOString().split('T')[0],
      }
    })
  }

  // Recalculate AI milestone dates
  const recalculatedAiMilestones = calculateAiMilestoneDates(aiMilestones, aiEditableData.startDate, aiTasks)

  const aiTaskDates = calculateTaskDates(aiTasks, recalculatedAiMilestones)

  // Auto-expand AI milestone duration when tasks exceed it
  useEffect(() => {
    let changed = false
    const updated = aiMilestones.map((ms) => {
      const totalTaskWeeks = aiTasks
        .filter(t => t.milestoneId === ms.id)
        .reduce((sum, t) => sum + (t.durationWeeks || 0), 0)
      if (totalTaskWeeks > (ms.durationWeeks || 0)) {
        changed = true
        return { ...ms, durationWeeks: totalTaskWeeks }
      }
      return ms
    })
    if (changed) setAiMilestones(updated)
  }, [aiTasks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track AI last milestone end date
  const aiLastMilestoneEndDate = useMemo(() => {
    const lastMilestone = [...recalculatedAiMilestones]
      .reverse()
      .find(m => m.endDate && m.durationWeeks > 0)
    return lastMilestone?.endDate || ''
  }, [recalculatedAiMilestones])

  // Auto-update AI project end date
  useEffect(() => {
    if (!aiEditableData.startDate || !aiLastMilestoneEndDate) return
    setAiEditableData(prev => ({ ...prev, endDate: aiLastMilestoneEndDate }))
  }, [aiLastMilestoneEndDate, aiEditableData.startDate])

  // AI Milestone helpers
  const addAiMilestone = () => {
    const newId = `ai-milestone-${Date.now()}`
    setAiMilestones([...aiMilestones, { id: newId, name: '', description: '', durationWeeks: 0 }])
  }

  const removeAiMilestone = (index: number) => {
    if (aiMilestones.length <= 1) return
    setAiMilestones(aiMilestones.filter((_, i) => i !== index))
  }

  const updateAiMilestone = (index: number, field: keyof AiMilestone, value: string | number) => {
    setAiMilestones(
      aiMilestones.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    )
  }

  // Team member helpers
  const addTeamMember = (members: string[], setMembers: (m: string[]) => void, input: string, setInput: (s: string) => void) => {
    const name = input.trim()
    if (!name) return
    if (name === user?.name) return
    if (members.includes(name)) return
    setMembers([...members, name])
    setInput('')
  }

  const removeTeamMember = (members: string[], setMembers: (m: string[]) => void, name: string) => {
    setMembers(members.filter(m => m !== name))
  }

  // Step navigation
  const canProceed = (step: number) => {
    switch (step) {
      case 0: return !!manualProjectType && !!manualData.name.trim()
      case 1: return !!smartObjective.specific.trim() // SMART 至少要有具體目標
      case 2: return !!manualData.purpose.trim() // 專案定義至少要有目的
      case 3: return true // 團隊與風險（選填）
      case 4: return !!manualData.startDate && !!manualData.endDate
      default: return true
    }
  }

  const goNext = () => {
    if (currentStep < STEPS.length - 1 && canProceed(currentStep)) {
      setCurrentStep(currentStep + 1)
    }
  }

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const goToStep = (step: number) => {
    // Can go back freely, can go forward only if all previous steps are valid
    if (step < currentStep) {
      setCurrentStep(step)
    } else if (step > currentStep) {
      for (let i = currentStep; i < step; i++) {
        if (!canProceed(i)) return
      }
      setCurrentStep(step)
    }
  }

  const handleAIParse = async () => {
    if (!requirements.trim()) return

    setIsProcessing(true)
    try {
      const result = await parseProjectRequirements({ description: requirements })
      setParsedData(result)

      // Populate editable fields with AI results
      setAiEditableData({
        name: result.name,
        budget: (result.estimatedBudget / 1000000).toFixed(1),
        startDate: result.startDate,
        endDate: result.endDate,
        purpose: result.purpose,
        scope: result.scope,
        roi: result.roi,
        expectedBenefits: aiExpectedBenefits,
      })
      setAiSmartObjective(result.smartObjective)
      setAiMilestones(result.suggestedMilestones.map((m, index) => {
        // Parse weeks from duration string (e.g., "3 週" -> 3)
        const weeksMatch = m.estimatedDuration.match(/(\d+)\s*週/)
        const weeks = weeksMatch ? parseInt(weeksMatch[1]) : 0
        return {
          id: `ai-milestone-${Date.now()}-${index}`,
          name: m.name,
          description: m.description,
          durationWeeks: weeks,
        }
      }))
      setAiRisks(result.identifiedRisks)

      // Move to step 1 (Basic Info)
      setAiCurrentStep(1)
    } catch (error) {
      console.error('Failed to parse requirements:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCreateFromAI = () => {
    if (!parsedData) return

    const ownerName = user?.name || 'Unknown'

    // Use editable data instead of original parsedData
    const objective = `${aiSmartObjective.specific}${aiSmartObjective.measurable ? '，' + aiSmartObjective.measurable : ''}`

    const milestoneIdMap = new Map<string, string>()
    const milestones = recalculatedAiMilestones
      .filter(m => m.name.trim())
      .map((m, index) => {
        const newId = `ms-new-${index}`
        milestoneIdMap.set(m.id, newId)
        return {
          id: newId,
          name: m.name,
          dueDate: m.endDate || aiEditableData.endDate,
        }
      })

    const risks = aiRisks
      .filter(r => r.title.trim())
      .map(r => ({
        title: r.title,
        description: r.description,
        impact: r.impact,
        probability: r.probability,
        mitigation: '',
        status: 'open' as const,
      }))

    // Map AI draft tasks with calculated dates
    const validTasks = aiTasks
      .filter(t => t.title.trim() && milestoneIdMap.has(t.milestoneId))
      .map(t => {
        const msId = milestoneIdMap.get(t.milestoneId)!
        const ms = milestones.find(m => m.id === msId)
        const dates = aiTaskDates.get(t.id)
        return {
          milestoneId: msId,
          title: t.title,
          description: '',
          assignee: t.assignee.trim() || '未指派',
          priority: t.priority,
          durationWeeks: t.durationWeeks || 1,
          startDate: dates?.startDate || aiEditableData.startDate,
          endDate: dates?.endDate || ms?.dueDate || aiEditableData.endDate,
          dependencies: [] as string[],
        }
      })

    const uniqueNames = new Set<string>()
    const teamNames: string[] = []
    aiTeamDetails.forEach(m => {
      if (!uniqueNames.has(m.name)) {
        uniqueNames.add(m.name)
        teamNames.push(m.name)
      }
    })
    const teamMembersData = aiTeamDetails.map(m => ({ name: m.name, role: m.role, responsibility: m.responsibility }))

    const newProject = addProject({
      projectType: aiProjectType,
      projectTier: aiProjectTier || undefined,
      demandSource: aiDemandSource || undefined,
      name: aiEditableData.name,
      objective,
      purpose: aiEditableData.purpose,
      scope: aiEditableData.scope,
      roi: aiEditableData.roi,
      createdReason: aiCreatedReason || aiEditableData.purpose,
      expectedBenefits: aiEditableData.expectedBenefits,
      smartObjective: aiSmartObjective,
      startDate: aiEditableData.startDate,
      endDate: aiEditableData.endDate,
      budget: Number(aiEditableData.budget) * 1000000 || 0,
      owner: ownerName,
      team: teamNames,
      milestones,
      risks,
      tasks: validTasks,
      teamMembers: teamMembersData,
    })

    router.push(`/projects/${newProject.id}`)
  }

  const handleManualCreate = async () => {
    const ownerName = user?.name || 'Unknown'

    // Build milestone ID mapping: old draft ID -> new stable ID
    const milestoneIdMap = new Map<string, string>()
    const validMilestones = recalculatedMilestones
      .filter((m) => m.name.trim() && m.durationWeeks > 0 && m.endDate)
      .map((m, index) => {
        const newId = `ms-new-${index}`
        milestoneIdMap.set(m.id, newId)
        return {
          id: newId,
          name: m.name,
          dueDate: m.endDate!,
        }
      })

    const validRisks = manualRisks
      .filter(r => r.title.trim())
      .map(r => ({
        ...r,
        status: 'open' as const,
      }))

    // Map draft tasks to real tasks with correct milestone IDs and calculated dates
    const validTasks = manualTasks
      .filter(t => t.title.trim() && milestoneIdMap.has(t.milestoneId))
      .map(t => {
        const msId = milestoneIdMap.get(t.milestoneId)!
        const dates = manualTaskDates.get(t.id)
        // Fallback to milestone range if no calculated dates
        const ms = validMilestones.find(m => m.id === msId)
        const msIndex = validMilestones.indexOf(ms!)
        const prevMs = msIndex > 0 ? validMilestones[msIndex - 1] : null
        const fallbackStart = prevMs
          ? new Date(new Date(prevMs.dueDate).getTime() + 86400000).toISOString().split('T')[0]
          : manualData.startDate
        return {
          milestoneId: msId,
          title: t.title,
          description: '',
          assignee: t.assignee.trim() || '未指派',
          priority: t.priority,
          durationWeeks: t.durationWeeks || 1,
          startDate: dates?.startDate || fallbackStart,
          endDate: dates?.endDate || ms?.dueDate || manualData.endDate,
        }
      })

    // Build team names array + teamMembers detail from teamDetails
    const uniqueNames = new Set<string>()
    const teamNames: string[] = []
    manualTeamDetails.forEach(m => {
      if (!uniqueNames.has(m.name)) {
        uniqueNames.add(m.name)
        teamNames.push(m.name)
      }
    })
    const teamMembersData = manualTeamDetails.map(m => ({ name: m.name, role: m.role, responsibility: m.responsibility }))

    setIsCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectType: manualProjectType,
          projectTier: manualProjectTier || undefined,
          demandSource: manualDemandSource || undefined,
          name: manualData.name,
          objective: manualData.objective,
          purpose: manualData.purpose,
          scope: manualData.scope,
          roi: manualData.roi,
          createdReason: manualData.createdReason,
          expectedBenefits: manualData.expectedBenefits,
          smartObjective: smartObjective,
          startDate: manualData.startDate,
          endDate: manualData.endDate,
          budget: Number(manualData.budget) || 0,
          ownerName,
          team: teamNames,
          milestones: validMilestones,
          risks: validRisks,
          tasks: validTasks,
          teamMembers: teamMembersData,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '建立專案失敗')
      }

      const newProject = await res.json()

      toast({
        title: '專案建立成功',
        description: `專案代碼：${newProject.projectCode}`,
      })

      router.push(`/projects/${newProject.id}`)
    } catch (error) {
      toast({
        title: '建立專案失敗',
        description: error instanceof Error ? error.message : '請稍後再試',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Enhanced team member input component with roles and responsibilities
  const renderTeamInput = (
    _members: string[],
    _setMembers: (m: string[]) => void,
    _input: string,
    _setInput: (s: string) => void,
    teamDetails: TeamMemberDraft[],
    setTeamDetails: (d: TeamMemberDraft[]) => void,
    newMember: { name: string; role: TeamRole; responsibility: string },
    setNewMember: (m: { name: string; role: TeamRole; responsibility: string }) => void,
  ) => {
    const handleAddMember = () => {
      const name = newMember.name.trim()
      if (!name) return
      if (teamDetails.some(m => m.name === name)) return
      setTeamDetails([...teamDetails, { id: `tm-${Date.now()}`, name, role: newMember.role, responsibility: newMember.responsibility }])
      setNewMember({ name: '', role: 'engineer', responsibility: '' })
    }

    const handleRemoveMember = (id: string) => {
      setTeamDetails(teamDetails.filter(m => m.id !== id))
    }

    const handleUpdateMember = (id: string, field: keyof TeamMemberDraft, value: string) => {
      setTeamDetails(teamDetails.map(m => m.id === id ? { ...m, [field]: value } : m))
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            團隊成員
          </Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          請手動加入專案團隊成員，並指定每位成員在此專案中的角色
        </p>

        {/* All team members */}
        {teamDetails.map((member) => (
            <div key={member.id} className="p-3 rounded-lg border space-y-3 bg-card">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5 bg-muted text-muted-foreground">
                  {member.name.charAt(0)}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{member.name}</span>
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      {TEAM_ROLE_LABELS[member.role]}
                    </Badge>
                    {member.role === 'pm' && (
                      <Badge variant="default" className="text-xs px-2 py-0.5">負責人</Badge>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">角色</Label>
                      <Select value={member.role} onValueChange={(v) => handleUpdateMember(member.id, 'role', v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TEAM_ROLE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">負責工作項目</Label>
                      <Input
                        placeholder="例如：後端 API 開發"
                        value={member.responsibility}
                        onChange={(e) => handleUpdateMember(member.id, 'responsibility', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive h-7 w-7"
                  onClick={() => handleRemoveMember(member.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        )}

        {/* Add new member form */}
        <div className="p-4 rounded-lg border border-dashed space-y-3">
          <Label className="text-sm font-medium">新增成員</Label>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">姓名</Label>
              <Input
                placeholder="輸入成員名稱"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddMember()
                  }
                }}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">角色</Label>
              <Select value={newMember.role} onValueChange={(v) => setNewMember({ ...newMember, role: v as TeamRole })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEAM_ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">負責工作項目</Label>
              <Input
                placeholder="例如：UI/UX 設計"
                value={newMember.responsibility}
                onChange={(e) => setNewMember({ ...newMember, responsibility: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddMember()
                  }
                }}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddMember}
            disabled={!newMember.name.trim()}
            className="gap-1 w-full"
          >
            <Plus className="h-3.5 w-3.5" />
            新增成員
          </Button>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">建立新專案</h1>
            <p className="text-muted-foreground mt-1">
              使用 AI 快速產生專案規劃，或手動逐步輸入專案資訊
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openSaveDraftDialog}
              className="gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            >
              <Save className="h-4 w-4" />
              儲存草稿
            </Button>
            <Dialog open={showDraftsDialog} onOpenChange={setShowDraftsDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <FolderOpen className="h-4 w-4" />
                  載入草稿
                  {savedDrafts.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1">
                      {savedDrafts.length}
                    </Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>載入草稿</DialogTitle>
                  <DialogDescription>
                    選擇先前儲存的草稿繼續編輯
                  </DialogDescription>
                </DialogHeader>
                {savedDrafts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>尚無儲存的草稿</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {savedDrafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium truncate">{draft.title}</h4>
                            <Badge variant={draft.mode === 'ai' ? 'default' : 'secondary'} className="text-xs">
                              {draft.mode === 'ai' ? 'AI 模式' : '手動模式'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(draft.updatedAt).toLocaleString('zh-TW')}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => loadDraft(draft)}
                          >
                            載入
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteDraft(draft.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Save Draft Dialog */}
            <Dialog open={showSaveDraftDialog} onOpenChange={setShowSaveDraftDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>儲存草稿</DialogTitle>
                  <DialogDescription>
                    為這個草稿命名，方便日後識別
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="draft-name">草稿名稱</Label>
                    <Input
                      id="draft-name"
                      placeholder="輸入草稿名稱"
                      value={draftNameInput}
                      onChange={(e) => setDraftNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          confirmSaveDraft()
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowSaveDraftDialog(false)
                      setDraftNameInput('')
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={confirmSaveDraft}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    確認儲存
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'manual' | 'ai')}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="h-4 w-4" />
              AI 輔助建立
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <FileText className="h-4 w-4" />
              手動建立
            </TabsTrigger>
          </TabsList>

          {/* AI Mode */}
          <TabsContent value="ai" className="space-y-6 mt-6">
            {/* Step Indicator */}
            <div className="flex items-center justify-between rounded-xl border bg-card p-4">
              {AI_STEPS.map((step, index) => {
                const Icon = step.icon
                const isCompleted = index < aiCurrentStep
                const isCurrent = index === aiCurrentStep

                return (
                  <div key={index} className="flex items-center flex-1 last:flex-initial">
                    <button
                      type="button"
                      onClick={() => index <= aiCurrentStep && setAiCurrentStep(index)}
                      disabled={index > aiCurrentStep}
                      className={`flex flex-col items-center gap-1.5 transition-colors ${
                        isCurrent
                          ? 'text-primary'
                          : isCompleted
                            ? 'text-primary/70 hover:text-primary cursor-pointer'
                            : 'text-muted-foreground/50 cursor-default'
                      }`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-medium transition-colors ${
                        isCurrent
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : isCompleted
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground/50'
                      }`}>
                        {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <span className={`text-xs hidden sm:inline ${isCurrent ? 'font-semibold' : 'font-medium'}`}>
                        {step.label}
                      </span>
                    </button>
                    {index < AI_STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 rounded-full ${
                        index < aiCurrentStep ? 'bg-primary/30' : 'bg-border'
                      }`} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Step 0: AI 解析 */}
            {aiCurrentStep === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    AI 需求解析
                  </CardTitle>
                  <CardDescription>
                    描述您的專案需求，AI 將自動產生專案規劃、時程、預算等資訊
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ai-project-tier">專案層別</Label>
                      <Select
                        value={aiProjectTier}
                        onValueChange={(v) => setAiProjectTier(v as ProjectTier)}
                      >
                        <SelectTrigger id="ai-project-tier">
                          <SelectValue placeholder="選擇專案層別" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(PROJECT_TIER_LABELS) as [ProjectTier, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ai-demand-source">需求來源</Label>
                      <Select
                        value={aiDemandSource}
                        onValueChange={(v) => setAiDemandSource(v as DemandSource)}
                      >
                        <SelectTrigger id="ai-demand-source">
                          <SelectValue placeholder="選擇需求來源" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(DEMAND_SOURCE_LABELS) as [DemandSource, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ai-project-type">專案類型 <span className="text-destructive">*</span></Label>
                      <Select
                        value={aiProjectType}
                        onValueChange={(v) => handleAiTypeChange(v as ProjectType)}
                      >
                        <SelectTrigger id="ai-project-type">
                          <SelectValue placeholder="選擇專案類型" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>專案代碼預覽</Label>
                      <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm font-mono text-muted-foreground">
                        {previewCode || '選擇類型後自動產生'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-created-reason">開案原因</Label>
                    <div className="flex gap-2">
                      <Textarea
                        id="ai-created-reason"
                        placeholder="說明開立此專案的原因或背景"
                        value={aiCreatedReason}
                        onChange={(e) => setAiCreatedReason(e.target.value)}
                        rows={2}
                        className="flex-1"
                      />
                      <VoiceInputButton
                        onTranscript={(text) => setAiCreatedReason(prev => prev + (prev ? ' ' : '') + text)}
                        className="shrink-0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-expected-benefits">預期效益</Label>
                    <div className="flex gap-2">
                      <Textarea
                        id="ai-expected-benefits"
                        placeholder="描述專案完成後的預期效益，例如：提升營運效率、降低成本、增加收益等"
                        value={aiExpectedBenefits}
                        onChange={(e) => setAiExpectedBenefits(e.target.value)}
                        rows={2}
                        className="flex-1"
                      />
                      <VoiceInputButton
                        onTranscript={(text) => setAiExpectedBenefits(prev => prev + (prev ? ' ' : '') + text)}
                        className="shrink-0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="requirements">專案需求描述</Label>
                    <div className="flex gap-2">
                      <Textarea
                        id="requirements"
                        placeholder="例如：我需要開發一個客戶管理系統，用來整合現有的客戶資料，追蹤銷售機會，並提供完整的客戶視圖。希望能提升銷售團隊的工作效率..."
                        value={requirements}
                        onChange={(e) => setRequirements(e.target.value)}
                        rows={8}
                        className="resize-none flex-1"
                      />
                      <VoiceInputButton
                        onTranscript={(text) => setRequirements(prev => prev + (prev ? ' ' : '') + text)}
                        className="shrink-0"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      提示：描述越詳細，AI 產生的規劃越準確。可以包含目標、功能需求、預期效益等。點擊麥克風圖示可使用語音輸入。
                    </p>
                  </div>

                  <Button
                    onClick={handleAIParse}
                    disabled={!requirements.trim() || isProcessing}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        AI 解析中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        使用 AI 解析並產生規劃
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 1: 基本資訊 */}
            {aiCurrentStep === 1 && parsedData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    基本資訊
                  </CardTitle>
                  <CardDescription>檢視並編輯 AI 產生的專案基本資訊</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ai-name">專案名稱 <span className="text-destructive">*</span></Label>
                      <Input
                        id="ai-name"
                        value={aiEditableData.name}
                        onChange={(e) => setAiEditableData({ ...aiEditableData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ai-budget">投資預算 (百萬元)</Label>
                      <Input
                        id="ai-budget"
                        type="number"
                        value={aiEditableData.budget}
                        onChange={(e) => setAiEditableData({ ...aiEditableData, budget: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ai-start-date">開始日期</Label>
                      <Input
                        id="ai-start-date"
                        type="date"
                        value={aiEditableData.startDate}
                        onChange={(e) => setAiEditableData({ ...aiEditableData, startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ai-end-date">結束日期</Label>
                      <Input
                        id="ai-end-date"
                        type="date"
                        value={aiEditableData.endDate}
                        onChange={(e) => setAiEditableData({ ...aiEditableData, endDate: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: SMART 目標 */}
            {aiCurrentStep === 2 && parsedData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    SMART 目標
                  </CardTitle>
                  <CardDescription>檢視並編輯 AI 產生的 SMART 目標（具體、可衡量、可達成、相關性、時限性）</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="smart-specific" className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">S</Badge>
                        具體目標 (Specific)
                      </Label>
                      <Textarea
                        id="smart-specific"
                        value={aiSmartObjective.specific}
                        onChange={(e) => setAiSmartObjective({ ...aiSmartObjective, specific: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smart-measurable" className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">M</Badge>
                        可衡量指標 (Measurable)
                      </Label>
                      <Textarea
                        id="smart-measurable"
                        value={aiSmartObjective.measurable}
                        onChange={(e) => setAiSmartObjective({ ...aiSmartObjective, measurable: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smart-achievable" className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">A</Badge>
                        可達成性 (Achievable)
                      </Label>
                      <Textarea
                        id="smart-achievable"
                        value={aiSmartObjective.achievable}
                        onChange={(e) => setAiSmartObjective({ ...aiSmartObjective, achievable: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smart-relevant" className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">R</Badge>
                        相關性 (Relevant)
                      </Label>
                      <Textarea
                        id="smart-relevant"
                        value={aiSmartObjective.relevant}
                        onChange={(e) => setAiSmartObjective({ ...aiSmartObjective, relevant: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smart-timebound" className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">T</Badge>
                        時限性 (Time-bound)
                      </Label>
                      <Textarea
                        id="smart-timebound"
                        value={aiSmartObjective.timeBound}
                        onChange={(e) => setAiSmartObjective({ ...aiSmartObjective, timeBound: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: 專案定義 */}
            {aiCurrentStep === 3 && parsedData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-500" />
                    專案定義
                  </CardTitle>
                  <CardDescription>檢視並編輯專案目的、範圍和投資報酬</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ai-purpose">專案目的</Label>
                    <Textarea
                      id="ai-purpose"
                      value={aiEditableData.purpose}
                      onChange={(e) => setAiEditableData({ ...aiEditableData, purpose: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-scope">專案範圍</Label>
                    <Textarea
                      id="ai-scope"
                      value={aiEditableData.scope}
                      onChange={(e) => setAiEditableData({ ...aiEditableData, scope: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-roi">投資報酬 (ROI)</Label>
                    <Textarea
                      id="ai-roi"
                      value={aiEditableData.roi}
                      onChange={(e) => setAiEditableData({ ...aiEditableData, roi: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ai-expected-benefits">預期效益</Label>
                    <Textarea
                      id="ai-expected-benefits"
                      value={aiEditableData.expectedBenefits}
                      onChange={(e) => setAiEditableData({ ...aiEditableData, expectedBenefits: e.target.value })}
                      rows={2}
                      placeholder="描述專案完成後的預期效益"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: 時程里程碑 */}
            {aiCurrentStep === 5 && parsedData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    時程與里程碑
                  </CardTitle>
                  <CardDescription>檢視並編輯 AI 建議的里程碑</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Project Dates */}
                  <div className="grid gap-4 md:grid-cols-2 p-4 rounded-lg border bg-muted/30">
                    <div className="space-y-2">
                      <Label htmlFor="ai-project-start-date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-green-600" />
                        專案開始日期 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="ai-project-start-date"
                        type="date"
                        value={aiEditableData.startDate}
                        onChange={(e) => setAiEditableData({ ...aiEditableData, startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ai-project-end-date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-red-600" />
                        專案結束日期 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="ai-project-end-date"
                        type="date"
                        value={aiEditableData.endDate}
                        onChange={(e) => setAiEditableData({ ...aiEditableData, endDate: e.target.value })}
                        min={aiLastMilestoneEndDate || aiEditableData.startDate || ''}
                      />
                    </div>
                  </div>

                  {/* Timeline table */}
                  <p className="text-xs text-muted-foreground">
                    拖動左側圖標可調整順序，系統會自動計算每個里程碑的開始與結束日期
                  </p>
                  <TimelineTable
                    milestones={recalculatedAiMilestones}
                    tasks={aiTasks}
                    taskDates={aiTaskDates}
                    teamMembers={aiTeamDetails}
                    onMilestoneUpdate={updateAiMilestone}
                    onMilestoneRemove={removeAiMilestone}
                    onMilestoneAdd={addAiMilestone}
                    onMilestoneReorder={(oldIdx, newIdx) => setAiMilestones(arrayMove(aiMilestones, oldIdx, newIdx))}
                    onTaskAdd={(task) => setAiTasks([...aiTasks, task])}
                    onTaskRemove={(id) => setAiTasks(aiTasks.filter(t => t.id !== id))}
                    onTaskUpdate={(id, field, value) => setAiTasks(aiTasks.map(t => t.id === id ? { ...t, [field]: value } : t))}
                    onTaskReorder={(oldIdx, newIdx) => setAiTasks(arrayMove(aiTasks, oldIdx, newIdx))}
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 4: 團隊與風險 */}
            {aiCurrentStep === 4 && parsedData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    團隊與風險
                  </CardTitle>
                  <CardDescription>設定團隊成員並檢視風險</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {renderTeamInput(aiTeamMembers, setAiTeamMembers, aiTeamInput, setAiTeamInput, aiTeamDetails, setAiTeamDetails, aiNewMember, setAiNewMember)}

                  <Separator />

                  <div className="space-y-3">
                    <Label className="text-base font-medium">AI 識別的風險</Label>
                    {aiRisks.map((risk, index) => (
                      <div key={index} className="p-3 rounded-lg border bg-card space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <Input
                            value={risk.title}
                            onChange={(e) => {
                              const updated = [...aiRisks]
                              updated[index] = { ...risk, title: e.target.value }
                              setAiRisks(updated)
                            }}
                            placeholder="風險名稱"
                          />
                          <div className="flex gap-1 shrink-0">
                            <Badge
                              variant="secondary"
                              className={
                                risk.impact === 'high'
                                  ? 'bg-destructive text-destructive-foreground'
                                  : risk.impact === 'medium'
                                    ? 'bg-warning text-warning-foreground'
                                    : ''
                              }
                            >
                              {risk.impact === 'high' ? '高' : risk.impact === 'medium' ? '中' : '低'}影響
                            </Badge>
                          </div>
                        </div>
                        <Textarea
                          value={risk.description}
                          onChange={(e) => {
                            const updated = [...aiRisks]
                            updated[index] = { ...risk, description: e.target.value }
                            setAiRisks(updated)
                          }}
                          placeholder="風險描述"
                          rows={2}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation Buttons */}
            {aiCurrentStep > 0 && parsedData && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setAiCurrentStep(aiCurrentStep - 1)}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  上一步
                </Button>
                <div>
                  {aiCurrentStep < AI_STEPS.length - 1 ? (
                    <Button
                      size="lg"
                      onClick={() => setAiCurrentStep(aiCurrentStep + 1)}
                      className="gap-2"
                    >
                      下一步
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      onClick={handleCreateFromAI}
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      建立專案
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="manual" className="space-y-6 mt-6">
            {/* Step Indicator */}
            <div className="flex items-center justify-between rounded-xl border bg-card p-4">
              {STEPS.map((step, index) => {
                const Icon = step.icon
                const isCompleted = index < currentStep
                const isCurrent = index === currentStep
                const isClickable = index < currentStep || (index > currentStep && (() => {
                  for (let i = currentStep; i < index; i++) {
                    if (!canProceed(i)) return false
                  }
                  return true
                })())

                return (
                  <div key={index} className="flex items-center flex-1 last:flex-initial">
                    <button
                      type="button"
                      onClick={() => goToStep(index)}
                      disabled={!isClickable && !isCurrent}
                      className={`flex flex-col items-center gap-1.5 transition-colors ${
                        isCurrent
                          ? 'text-primary'
                          : isCompleted
                            ? 'text-primary/70 hover:text-primary'
                            : 'text-muted-foreground/50'
                      } ${isClickable || isCurrent ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-medium transition-colors ${
                        isCurrent
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : isCompleted
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground/50'
                      }`}>
                        {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <span className={`text-xs hidden sm:inline ${isCurrent ? 'font-semibold' : 'font-medium'}`}>
                        {step.label}
                      </span>
                    </button>
                    {index < STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 rounded-full ${
                        index < currentStep ? 'bg-primary/30' : 'bg-border'
                      }`} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Step 1: 基本資訊 */}
            {currentStep === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    基本資訊
                  </CardTitle>
                  <CardDescription>填寫專案的基本辨識與分類資訊</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="manual-project-tier">專案層別</Label>
                      <Select
                        value={manualProjectTier}
                        onValueChange={(v) => setManualProjectTier(v as ProjectTier)}
                      >
                        <SelectTrigger id="manual-project-tier">
                          <SelectValue placeholder="選擇專案層別" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(PROJECT_TIER_LABELS) as [ProjectTier, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manual-demand-source">需求來源</Label>
                      <Select
                        value={manualDemandSource}
                        onValueChange={(v) => setManualDemandSource(v as DemandSource)}
                      >
                        <SelectTrigger id="manual-demand-source">
                          <SelectValue placeholder="選擇需求來源" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(DEMAND_SOURCE_LABELS) as [DemandSource, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="manual-project-type">
                        專案類型 <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={manualProjectType}
                        onValueChange={(v) => handleManualTypeChange(v as ProjectType)}
                      >
                        <SelectTrigger id="manual-project-type">
                          <SelectValue placeholder="選擇專案類型" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        專案代碼預覽
                      </Label>
                      <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm font-mono text-muted-foreground">
                        {previewCode || '選擇類型後自動產生'}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">
                        專案名稱 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        placeholder="輸入專案名稱"
                        value={manualData.name}
                        onChange={(e) => setManualData({ ...manualData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="budget">
                        投資預算 (NT$)
                      </Label>
                      <Input
                        id="budget"
                        type="number"
                        placeholder="5000000"
                        value={manualData.budget}
                        onChange={(e) => setManualData({ ...manualData, budget: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="created-reason" className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-slate-500" />
                      開案原因
                    </Label>
                    <Textarea
                      id="created-reason"
                      placeholder="說明開立此專案的原因或背景"
                      value={manualData.createdReason}
                      onChange={(e) =>
                        setManualData({ ...manualData, createdReason: e.target.value })
                      }
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 1: SMART 目標 */}
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    SMART 目標
                  </CardTitle>
                  <CardDescription>依據 SMART 原則設定專案目標（具體、可衡量、可達成、相關性、時限性）</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="smart-specific" className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">S</Badge>
                          具體目標 (Specific)
                        </Label>
                        <Textarea
                          id="smart-specific"
                          placeholder="具體要達成什麼？例如：開發一套客戶關係管理系統，整合現有 3 個獨立的客戶資料庫"
                          value={smartObjective.specific}
                          onChange={(e) => {
                            setSmartObjective({ ...smartObjective, specific: e.target.value })
                            // 自動組合生成 objective
                            const combined = `${e.target.value}${smartObjective.measurable ? '，' + smartObjective.measurable : ''}`
                            setManualData({ ...manualData, objective: combined })
                          }}
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="smart-measurable" className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">M</Badge>
                          可衡量指標 (Measurable)
                        </Label>
                        <Textarea
                          id="smart-measurable"
                          placeholder="如何衡量成功？例如：提升客戶資料查詢效率 50%，減少資料重複率至 5% 以下"
                          value={smartObjective.measurable}
                          onChange={(e) => {
                            setSmartObjective({ ...smartObjective, measurable: e.target.value })
                            const combined = `${smartObjective.specific}${e.target.value ? '，' + e.target.value : ''}`
                            setManualData({ ...manualData, objective: combined })
                          }}
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="smart-achievable" className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">A</Badge>
                          可達成性 (Achievable)
                        </Label>
                        <Textarea
                          id="smart-achievable"
                          placeholder="有哪些資源和能力支持？例如：現有 IT 團隊 5 人、預算 500 萬、已有技術架構基礎"
                          value={smartObjective.achievable}
                          onChange={(e) => setSmartObjective({ ...smartObjective, achievable: e.target.value })}
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="smart-relevant" className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">R</Badge>
                          相關性 (Relevant)
                        </Label>
                        <Textarea
                          id="smart-relevant"
                          placeholder="與組織目標的關聯？例如：支持公司 2026 年業績成長 30% 的戰略目標"
                          value={smartObjective.relevant}
                          onChange={(e) => setSmartObjective({ ...smartObjective, relevant: e.target.value })}
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="smart-timebound" className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">T</Badge>
                          時限性 (Time-bound)
                        </Label>
                        <Textarea
                          id="smart-timebound"
                          placeholder="預期完成時間？例如：2026 年 Q2 完成開發，Q3 上線運行"
                          value={smartObjective.timeBound}
                          onChange={(e) => setSmartObjective({ ...smartObjective, timeBound: e.target.value })}
                          rows={2}
                        />
                      </div>
                    </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: 專案定義 */}
            {currentStep === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-500" />
                    專案定義
                  </CardTitle>
                  <CardDescription>描述專案的目的、範圍和預期效益</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="purpose">專案目的</Label>
                    <Textarea
                      id="purpose"
                      placeholder="說明為何要執行此專案"
                      value={manualData.purpose}
                      onChange={(e) => setManualData({ ...manualData, purpose: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scope">專案範圍</Label>
                    <Textarea
                      id="scope"
                      placeholder="定義專案的範圍與邊界"
                      value={manualData.scope}
                      onChange={(e) => setManualData({ ...manualData, scope: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="roi">投資報酬 (ROI)</Label>
                    <Textarea
                      id="roi"
                      placeholder="描述預期的投資報酬"
                      value={manualData.roi}
                      onChange={(e) => setManualData({ ...manualData, roi: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expectedBenefits">預期效益</Label>
                    <Textarea
                      id="expectedBenefits"
                      placeholder="描述專案完成後的預期效益，例如：提升營運效率、降低成本、增加收益等"
                      value={manualData.expectedBenefits}
                      onChange={(e) => setManualData({ ...manualData, expectedBenefits: e.target.value })}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: 時程與里程碑 */}
            {currentStep === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    時程與里程碑
                  </CardTitle>
                  <CardDescription>設定專案時間範圍與關鍵里程碑</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">開始日期 <span className="text-destructive">*</span></Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={manualData.startDate}
                        onChange={(e) =>
                          setManualData({ ...manualData, startDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">結束日期 <span className="text-destructive">*</span></Label>
                      <Input
                        id="endDate"
                        type="date"
                        min={getMinEndDate()}
                        value={manualData.endDate}
                        onChange={(e) => setManualData({ ...manualData, endDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Template alert */}
                  {manualProjectType && manualMilestones.length > 0 && (
                    <Alert className="border-blue-200 bg-blue-50/50">
                      <Lightbulb className="h-4 w-4 text-blue-500" />
                      <AlertDescription className="text-sm text-blue-700">
                        已根據「{PROJECT_TYPE_LABELS[manualProjectType]}」自動帶入 {manualMilestones.length} 個里程碑範本。
                        可直接在表格中編輯名稱、期程，或在每個里程碑下方快速新增任務。
                      </AlertDescription>
                    </Alert>
                  )}

                  <p className="text-xs text-muted-foreground">
                    拖動左側圖標可改變順序。輸入週數後系統自動計算日期。專案結束日期會根據里程碑自動調整。
                  </p>

                  {/* Timeline table */}
                  <TimelineTable
                    milestones={recalculatedMilestones}
                    tasks={manualTasks}
                    taskDates={manualTaskDates}
                    teamMembers={manualTeamDetails}
                    onMilestoneUpdate={updateMilestone}
                    onMilestoneRemove={removeMilestone}
                    onMilestoneAdd={addMilestone}
                    onMilestoneReorder={(oldIdx, newIdx) => setManualMilestones(arrayMove(manualMilestones, oldIdx, newIdx))}
                    onTaskAdd={(task) => setManualTasks([...manualTasks, task])}
                    onTaskRemove={(id) => setManualTasks(manualTasks.filter(t => t.id !== id))}
                    onTaskUpdate={(id, field, value) => setManualTasks(manualTasks.map(t => t.id === id ? { ...t, [field]: value } : t))}
                    onTaskReorder={(oldIdx, newIdx) => setManualTasks(arrayMove(manualTasks, oldIdx, newIdx))}
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 3: 團隊與風險 */}
            {currentStep === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    團隊與風險
                  </CardTitle>
                  <CardDescription>組建專案團隊並預先識別潛在風險</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Team Members */}
                  {renderTeamInput(manualTeamMembers, setManualTeamMembers, manualTeamInput, setManualTeamInput, manualTeamDetails, setManualTeamDetails, manualNewMember, setManualNewMember)}

                  <Separator />

                  {/* Risks Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        風險識別
                      </Label>
                      <Button type="button" variant="outline" size="sm" onClick={addRisk} className="gap-1">
                        <Plus className="h-3.5 w-3.5" />
                        新增風險
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-1">
                      預先識別專案可能面臨的風險，評估影響程度和發生機率
                    </p>
                    <div className="space-y-3">
                      {manualRisks.map((risk, index) => (
                        <div
                          key={index}
                          className="p-3 rounded-lg border bg-card space-y-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xs font-medium mt-1">
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 space-y-3">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">風險名稱</Label>
                                <Input
                                  placeholder="例如：供應商交期不穩定"
                                  value={risk.title}
                                  onChange={(e) => updateRisk(index, 'title', e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">風險描述</Label>
                                <Textarea
                                  placeholder="描述此風險的具體內容"
                                  value={risk.description}
                                  onChange={(e) => updateRisk(index, 'description', e.target.value)}
                                  rows={2}
                                />
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">影響程度</Label>
                                  <Select value={risk.impact} onValueChange={(v) => updateRisk(index, 'impact', v)}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="high">高</SelectItem>
                                      <SelectItem value="medium">中</SelectItem>
                                      <SelectItem value="low">低</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">發生機率</Label>
                                  <Select value={risk.probability} onValueChange={(v) => updateRisk(index, 'probability', v)}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="high">高</SelectItem>
                                      <SelectItem value="medium">中</SelectItem>
                                      <SelectItem value="low">低</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">緩解措施</Label>
                                <Textarea
                                  placeholder="描述如何降低或避免此風險"
                                  value={risk.mitigation}
                                  onChange={(e) => updateRisk(index, 'mitigation', e.target.value)}
                                  rows={2}
                                />
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 mt-1 text-muted-foreground hover:text-destructive"
                              onClick={() => removeRisk(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {manualRisks.length === 0 && (
                        <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">
                          尚未新增風險項目，點擊上方按鈕新增
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step Navigation Buttons */}
            <div className="flex items-center justify-between">
              <div>
                {currentStep > 0 ? (
                  <Button variant="outline" size="lg" onClick={goPrev} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    上一步
                  </Button>
                ) : (
                  <Button variant="outline" size="lg" onClick={() => router.push('/projects')}>
                    取消
                  </Button>
                )}
              </div>
              <div>
                {currentStep < STEPS.length - 1 ? (
                  <Button
                    size="lg"
                    onClick={goNext}
                    disabled={!canProceed(currentStep)}
                    className="gap-2"
                  >
                    下一步
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={handleManualCreate}
                    disabled={
                      isCreating ||
                      !manualProjectType ||
                      !manualData.name ||
                      !smartObjective.specific.trim() ||
                      !manualData.startDate ||
                      !manualData.endDate
                    }
                    className="gap-2"
                  >
                    {isCreating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {isCreating ? '建立中...' : '建立專案'}
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
