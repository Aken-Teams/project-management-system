'use client'

import { useState, useEffect } from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { parseProjectRequirements, type ParsedProjectData } from '@/lib/ai-service'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { PROJECT_TYPE_LABELS, generateProjectCode, type ProjectType } from '@/lib/mock-data'
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
  GripVertical,
  Save,
  FolderOpen,
  Clock,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface ManualMilestone {
  id: string
  name: string
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
    manualMilestones?: ManualMilestone[]
    manualRisks?: ManualRisk[]
    manualTeamMembers?: string[]
    currentStep?: number
    // AI mode
    aiProjectType?: ProjectType
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
  { label: '專案定義', icon: Target },
  { label: '時程里程碑', icon: Calendar },
  { label: '團隊與風險', icon: Users },
]

// Sortable Milestone Item Component
function SortableMilestoneItem({
  milestone,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  milestone: ManualMilestone & { startDate?: string; endDate?: string }
  index: number
  onUpdate: (index: number, field: keyof ManualMilestone, value: string | number) => void
  onRemove: (index: number) => void
  canRemove: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: milestone.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted cursor-grab active:cursor-grabbing mt-1"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">里程碑名稱</Label>
          <Input
            placeholder="例如：需求分析完成"
            value={milestone.name}
            onChange={(e) => onUpdate(index, 'name', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">期程（週）</Label>
          <Input
            type="number"
            min="0"
            placeholder="例如：3"
            value={milestone.durationWeeks || ''}
            onChange={(e) => onUpdate(index, 'durationWeeks', Number(e.target.value) || 0)}
          />
        </div>
        {milestone.startDate && milestone.endDate && (
          <div className="md:col-span-2 space-y-1">
            <Label className="text-xs text-muted-foreground">計算日期</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span className="font-medium">{milestone.startDate}</span>
              <span>至</span>
              <span className="font-medium">{milestone.endDate}</span>
              <span className="text-xs">
                ({milestone.durationWeeks} 週)
              </span>
            </div>
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 mt-1 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default function NewProjectPage() {
  const router = useRouter()
  const { addProject } = useProjectStore()
  const { user } = useAuth()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('ai')
  const [showDraftsDialog, setShowDraftsDialog] = useState(false)
  const [showSaveDraftDialog, setShowSaveDraftDialog] = useState(false)
  const [draftNameInput, setDraftNameInput] = useState('')
  const [savedDrafts, setSavedDrafts] = useState<ProjectDraft[]>([])

  // AI Mode
  const [requirements, setRequirements] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedProjectData | null>(null)
  const [aiProjectType, setAiProjectType] = useState<ProjectType>('other')
  const [aiCreatedReason, setAiCreatedReason] = useState('')
  const [aiExpectedBenefits, setAiExpectedBenefits] = useState('')
  const [aiTeamMembers, setAiTeamMembers] = useState<string[]>([])
  const [aiTeamInput, setAiTeamInput] = useState('')

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
  const [manualProjectType, setManualProjectType] = useState<ProjectType>('other')
  const [manualMilestones, setManualMilestones] = useState<ManualMilestone[]>([
    { id: 'milestone-1', name: '', durationWeeks: 0 },
  ])
  const [manualRisks, setManualRisks] = useState<ManualRisk[]>([])
  const [manualTeamMembers, setManualTeamMembers] = useState<string[]>([])
  const [manualTeamInput, setManualTeamInput] = useState('')

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
        manualMilestones: activeTab === 'manual' ? manualMilestones : undefined,
        manualRisks: activeTab === 'manual' ? manualRisks : undefined,
        manualTeamMembers: activeTab === 'manual' ? manualTeamMembers : undefined,
        currentStep: activeTab === 'manual' ? currentStep : undefined,
        // AI mode data
        aiProjectType: activeTab === 'ai' ? aiProjectType : undefined,
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
      if (draft.data.manualMilestones) setManualMilestones(draft.data.manualMilestones)
      if (draft.data.manualRisks) setManualRisks(draft.data.manualRisks)
      if (draft.data.manualTeamMembers) setManualTeamMembers(draft.data.manualTeamMembers)
      if (draft.data.currentStep !== undefined) setCurrentStep(draft.data.currentStep)
    } else if (draft.mode === 'ai') {
      if (draft.data.aiProjectType) setAiProjectType(draft.data.aiProjectType)
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
      sourcing: 'SRC',
      npi: 'NPI',
      'cost-saving': 'CST',
      cip: 'CIP',
      other: 'PRJ',
    }
    const year = new Date().getFullYear()
    setPreviewCode(`${prefix[type]}-${year}-XXX`)
  }

  const handleManualTypeChange = (type: ProjectType) => {
    setManualProjectType(type)
    updateProjectCodePreview(type)
  }

  const handleAiTypeChange = (type: ProjectType) => {
    setAiProjectType(type)
    updateProjectCodePreview(type)
  }

  // Calculate milestone dates based on duration weeks
  const calculateMilestoneDates = (milestones: ManualMilestone[], projectStartDate: string) => {
    if (!projectStartDate) return milestones

    let currentDate = new Date(projectStartDate)

    return milestones.map((milestone) => {
      if (milestone.durationWeeks <= 0) {
        return { ...milestone, startDate: undefined, endDate: undefined }
      }

      const startDate = new Date(currentDate)
      const daysToAdd = milestone.durationWeeks * 7 - 1 // weeks to days, -1 because start day is included
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
  const recalculatedMilestones = calculateMilestoneDates(manualMilestones, manualData.startDate)

  // Auto-update project end date if milestones exceed it
  useEffect(() => {
    if (!manualData.startDate || recalculatedMilestones.length === 0) return

    // Find the last milestone with an end date
    const lastMilestone = [...recalculatedMilestones]
      .reverse()
      .find(m => m.endDate && m.durationWeeks > 0)

    if (!lastMilestone?.endDate) return

    // If no project end date is set, or if last milestone exceeds it, update automatically
    if (!manualData.endDate || new Date(lastMilestone.endDate) > new Date(manualData.endDate)) {
      setManualData(prev => ({ ...prev, endDate: lastMilestone.endDate! }))
    }
  }, [recalculatedMilestones, manualData.startDate]) // Removed manualData.endDate to avoid loop

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

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setManualMilestones((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
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
      case 0: return !!manualData.name.trim()
      case 1: return !!smartObjective.specific.trim() // SMART 至少要有具體目標
      case 2: return !!manualData.startDate && !!manualData.endDate
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
    } catch (error) {
      console.error('Failed to parse requirements:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCreateFromAI = () => {
    if (!parsedData) return

    const ownerName = user?.name || 'Unknown'

    const milestones = parsedData.suggestedMilestones.map((m, index) => ({
      id: `ms-new-${index}`,
      name: m.name,
      dueDate: parsedData.startDate,
    }))

    const risks = parsedData.identifiedRisks.map(r => ({
      title: r.title,
      description: r.description,
      impact: r.impact,
      probability: r.probability,
      mitigation: '',
      status: 'open' as const,
    }))

    const newProject = addProject({
      projectType: aiProjectType,
      name: parsedData.name,
      objective: parsedData.objective,
      purpose: parsedData.purpose,
      scope: parsedData.scope,
      roi: parsedData.roi,
      createdReason: aiCreatedReason || parsedData.purpose,
      expectedBenefits: aiExpectedBenefits,
      startDate: parsedData.startDate,
      endDate: parsedData.endDate,
      budget: parsedData.estimatedBudget,
      owner: ownerName,
      team: [ownerName, ...aiTeamMembers.filter(m => m !== ownerName)],
      milestones,
      risks,
    })

    router.push(`/projects/${newProject.id}`)
  }

  const handleManualCreate = () => {
    const ownerName = user?.name || 'Unknown'

    const validMilestones = recalculatedMilestones
      .filter((m) => m.name.trim() && m.durationWeeks > 0 && m.endDate)
      .map((m, index) => ({
        id: `ms-new-${index}`,
        name: m.name,
        dueDate: m.endDate!,
      }))

    const validRisks = manualRisks
      .filter(r => r.title.trim())
      .map(r => ({
        ...r,
        status: 'open' as const,
      }))

    const newProject = addProject({
      projectType: manualProjectType,
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
      owner: ownerName,
      team: [ownerName, ...manualTeamMembers.filter(m => m !== ownerName)],
      milestones: validMilestones,
      risks: validRisks,
    })

    router.push(`/projects/${newProject.id}`)
  }

  // Reusable team member input component
  const renderTeamInput = (
    members: string[],
    setMembers: (m: string[]) => void,
    input: string,
    setInput: (s: string) => void,
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          團隊成員
        </Label>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        負責人 ({user?.name}) 已自動加入團隊
      </p>
      <div className="flex items-center gap-2">
        <Input
          placeholder="輸入成員名稱"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTeamMember(members, setMembers, input, setInput)
            }
          }}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addTeamMember(members, setMembers, input, setInput)}
          className="gap-1 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          新增
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="default" className="text-xs">
          {user?.name} (負責人)
        </Badge>
        {members.map(name => (
          <Badge key={name} variant="secondary" className="text-xs gap-1 pr-1">
            {name}
            <button
              type="button"
              onClick={() => removeTeamMember(members, setMembers, name)}
              className="ml-0.5 hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  )

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
                  <Textarea
                    id="ai-created-reason"
                    placeholder="說明開立此專案的原因或背景"
                    value={aiCreatedReason}
                    onChange={(e) => setAiCreatedReason(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-expected-benefits">預期效益</Label>
                  <Textarea
                    id="ai-expected-benefits"
                    placeholder="描述專案完成後的預期效益，例如：提升營運效率、降低成本、增加收益等"
                    value={aiExpectedBenefits}
                    onChange={(e) => setAiExpectedBenefits(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requirements">專案需求描述</Label>
                  <Textarea
                    id="requirements"
                    placeholder="例如：我需要開發一個客戶管理系統，用來整合現有的客戶資料，追蹤銷售機會，並提供完整的客戶視圖。希望能提升銷售團隊的工作效率..."
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    rows={8}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    提示：描述越詳細，AI 產生的規劃越準確。可以包含目標、功能需求、預期效益等。
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

            {/* AI Parsed Results */}
            {parsedData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">AI 產生的專案規劃</h3>
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI 建議
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">基本資訊</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground">專案名稱</Label>
                        <p className="font-medium mt-1">{parsedData.name}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">專案類型</Label>
                        <p className="font-medium mt-1">{PROJECT_TYPE_LABELS[aiProjectType]}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">專案目標</Label>
                        <p className="mt-1">{parsedData.objective}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">專案目的</Label>
                        <p className="mt-1">{parsedData.purpose}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">範圍與效益</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground">專案範圍</Label>
                        <p className="mt-1">{parsedData.scope}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">投資報酬 (ROI)</Label>
                        <p className="mt-1">{parsedData.roi}</p>
                      </div>
                      {aiCreatedReason && (
                        <div>
                          <Label className="text-xs text-muted-foreground">開案原因</Label>
                          <p className="mt-1">{aiCreatedReason}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        時程規劃
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">開始日期</span>
                        <span className="font-medium">{parsedData.startDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">結束日期</span>
                        <span className="font-medium">{parsedData.endDate}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-muted-foreground">專案期程</span>
                        <span className="font-medium">
                          {Math.ceil(
                            (new Date(parsedData.endDate).getTime() -
                              new Date(parsedData.startDate).getTime()) /
                              (1000 * 60 * 60 * 24 * 7)
                          )}{' '}
                          週
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        預算與團隊
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">預估預算</span>
                        <span className="font-medium">
                          NT$ {(parsedData.estimatedBudget / 1000000).toFixed(1)}M
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">建議團隊規模</span>
                        <span className="font-medium flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {parsedData.recommendedTeamSize} 人
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">負責人</span>
                        <span className="font-medium">{user?.name || '—'}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* AI Team member input */}
                <Card>
                  <CardContent className="pt-6">
                    {renderTeamInput(aiTeamMembers, setAiTeamMembers, aiTeamInput, setAiTeamInput)}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">建議里程碑</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {parsedData.suggestedMilestones.map((milestone, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-medium text-sm">{milestone.name}</h4>
                              <Badge variant="outline" className="text-xs">
                                {milestone.estimatedDuration}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {milestone.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      識別的風險
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {parsedData.identifiedRisks.map((risk, index) => (
                        <div key={index} className="p-3 rounded-lg border bg-card space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium text-sm">{risk.title}</h4>
                            <div className="flex gap-1">
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
                                {risk.impact === 'high'
                                  ? '高'
                                  : risk.impact === 'medium'
                                    ? '中'
                                    : '低'}
                                影響
                              </Badge>
                              <Badge variant="outline">
                                {risk.probability === 'high'
                                  ? '高'
                                  : risk.probability === 'medium'
                                    ? '中'
                                    : '低'}
                                機率
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{risk.description}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button onClick={handleCreateFromAI} size="lg" className="flex-1">
                    建立專案
                  </Button>
                  <Button onClick={() => setParsedData(null)} variant="outline" size="lg">
                    重新解析
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Manual Mode — Step Wizard */}
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

            {/* Step 2: 專案定義 */}
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-muted-foreground" />
                    專案定義
                  </CardTitle>
                  <CardDescription>描述專案的目標、目的、範圍和預期效益</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* SMART 目標 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        專案目標（SMART 原則）<span className="text-destructive">*</span>
                      </Label>
                      <Badge variant="secondary" className="text-xs">
                        具體、可衡量、可達成、相關性、時限性
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      依據 SMART 原則設定專案目標，確保目標明確且可追蹤
                    </p>

                    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
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
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="purpose" className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      專案目的
                    </Label>
                    <Textarea
                      id="purpose"
                      placeholder="說明為何要執行此專案"
                      value={manualData.purpose}
                      onChange={(e) => setManualData({ ...manualData, purpose: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scope" className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-blue-500" />
                      專案範圍
                    </Label>
                    <Textarea
                      id="scope"
                      placeholder="定義專案的範圍與邊界"
                      value={manualData.scope}
                      onChange={(e) => setManualData({ ...manualData, scope: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expectedBenefits" className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      預期效益
                    </Label>
                    <Textarea
                      id="expectedBenefits"
                      placeholder="描述專案完成後的預期效益，例如：提升營運效率、降低成本、增加收益等"
                      value={manualData.expectedBenefits}
                      onChange={(e) => setManualData({ ...manualData, expectedBenefits: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="roi" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-violet-500" />
                      投資報酬 (ROI)
                    </Label>
                    <Textarea
                      id="roi"
                      placeholder="描述預期的投資報酬"
                      value={manualData.roi}
                      onChange={(e) => setManualData({ ...manualData, roi: e.target.value })}
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: 時程與里程碑 */}
            {currentStep === 2 && (
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
                        value={manualData.endDate}
                        onChange={(e) => setManualData({ ...manualData, endDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Milestones Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">里程碑</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addMilestone} className="gap-1">
                        <Plus className="h-3.5 w-3.5" />
                        新增里程碑
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      拖動左側圖標可改變里程碑順序。輸入週數後系統將自動計算日期。專案結束日期會根據里程碑自動調整。
                    </p>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={manualMilestones.map(m => m.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {recalculatedMilestones.map((milestone, index) => (
                            <SortableMilestoneItem
                              key={milestone.id}
                              milestone={milestone}
                              index={index}
                              onUpdate={updateMilestone}
                              onRemove={removeMilestone}
                              canRemove={manualMilestones.length > 1}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: 團隊與風險 */}
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
                  {renderTeamInput(manualTeamMembers, setManualTeamMembers, manualTeamInput, setManualTeamInput)}

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
                      !manualData.name ||
                      !smartObjective.specific.trim() ||
                      !manualData.startDate ||
                      !manualData.endDate
                    }
                    className="gap-2"
                  >
                    <Check className="h-4 w-4" />
                    建立專案
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
