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
import { type ParsedProjectData } from '@/lib/ai-service'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { getRolePermissions } from '@/lib/permissions'
import { PROJECT_TIER_LABELS, DEMAND_SOURCE_LABELS, TEAM_ROLE_LABELS, type ProjectType, type ProjectTier, type DemandSource, type TeamRole } from '@/lib/mock-data'
import { useProjectTypes } from '@/hooks/use-project-types'
import { MILESTONE_TEMPLATES, type MilestoneTemplate } from '@/lib/milestone-templates'
import { TimelineTable } from '@/components/timeline-table'
import { TeamMemberTable } from '@/components/team-member-table'
import { VoiceInputButton } from '@/components/voice-input-button'
import { BudgetListEditor, validateBudgetItems } from '@/components/budget-list-editor'
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
  ShieldAlert,
  Check,
  ChevronRight,
  ArrowLeft,
  Target,
  X,
  Pencil,
  Lightbulb,
  Layers,
  TrendingUp,
  ClipboardList,
  Save,
  FolderOpen,
  Clock,
  Briefcase,
  BarChart3,
} from 'lucide-react'
import { arrayMove } from '@dnd-kit/sortable'
import { calculateMilestoneDates, calculateTaskDates, seedSequentialDates, daysBetween } from '@/lib/timeline-utils'
import { moveTreeItem, type TreeDropMode } from '@/lib/timeline-tree'
import { GanttChart } from '@/components/gantt-chart'

interface ManualMilestone {
  id: string
  name: string
  durationDays: number
  startDate?: string
  endDate?: string
}

interface AiMilestone {
  id: string
  name: string
  description: string
  durationDays: number
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

const RISK_IMPACT_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' }
const RISK_PROBABILITY_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' }
const RISK_LEVEL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  high: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
}
const RISK_SEVERITY_BORDER: Record<string, string> = {
  low: 'border-l-emerald-400',
  medium: 'border-l-amber-400',
  high: 'border-l-red-400',
}
function getRiskSeverity(impact: string, probability: string): 'low' | 'medium' | 'high' {
  const scores: Record<string, number> = { low: 1, medium: 2, high: 3 }
  const score = (scores[impact] ?? 2) * (scores[probability] ?? 2)
  if (score >= 6) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

function RiskInlineForm({
  severity,
  initial,
  onConfirm,
  onCancel,
  onRemove,
}: {
  severity: string
  initial?: ManualRisk
  onConfirm: (data: ManualRisk) => void
  onCancel: () => void
  onRemove?: () => void
}) {
  const [form, setForm] = useState<ManualRisk>(
    initial ?? { title: '', description: '', impact: 'medium', probability: 'medium', mitigation: '' }
  )

  const handleConfirm = () => {
    if (!form.title.trim()) return
    onConfirm({ ...form, title: form.title.trim(), description: form.description.trim(), mitigation: form.mitigation.trim() })
  }

  return (
    <div className={`border-t border-l-[3px] ${RISK_SEVERITY_BORDER[severity]} bg-primary/5 px-3 py-2 space-y-2`}>
      <div className="flex items-center gap-2">
        <Input
          value={form.title}
          onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
          placeholder="風險標題，例如：供應商交期不穩定"
          className="h-7 text-sm flex-1 min-w-0"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && form.title.trim()) handleConfirm() }}
        />
        <Select value={form.impact} onValueChange={v => setForm(prev => ({ ...prev, impact: v as ManualRisk['impact'] }))}>
          <SelectTrigger className="h-7 text-xs w-[88px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_IMPACT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>影響{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={form.probability} onValueChange={v => setForm(prev => ({ ...prev, probability: v as ManualRisk['probability'] }))}>
          <SelectTrigger className="h-7 text-xs w-[88px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_PROBABILITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>機率{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-primary hover:text-primary" onClick={handleConfirm} disabled={!form.title.trim()}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        {onRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {form.title.trim() && (
        <div className="flex items-center gap-2">
          <Input
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="風險描述（選填）"
            className="h-7 text-sm flex-1 min-w-0 border-dashed"
          />
          <Input
            value={form.mitigation}
            onChange={e => setForm(prev => ({ ...prev, mitigation: e.target.value }))}
            placeholder="緩解對策（選填）"
            className="h-7 text-sm flex-1 min-w-0 border-dashed"
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
          />
        </div>
      )}
    </div>
  )
}

interface TeamMemberDraft {
  id: string
  name: string
  role: TeamRole
  responsibility: string
  organization?: string
  email?: string
  jobTitle?: string
}

interface MilestoneTaskDraft {
  id: string
  milestoneId: string
  title: string
  assignee: string
  priority: 'low' | 'medium' | 'high'
  durationDays: number
  parentId?: string
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
    manualTasks?: MilestoneTaskDraft[]
    manualRisks?: ManualRisk[]
    manualTeamDetails?: TeamMemberDraft[]
    manualBudgetItems?: import('@/components/budget-list-editor').BudgetItem[]
    currentStep?: number
    // AI mode — input fields
    aiProjectType?: ProjectType
    aiProjectTier?: ProjectTier
    aiDemandSource?: DemandSource
    aiCreatedReason?: string
    aiExpectedBenefits?: string
    requirements?: string
    parsedData?: ParsedProjectData | null
    aiProjectNameHint?: string
    aiDurationMonths?: string
    aiBudgetRange?: string
    aiConstraints?: string
    // AI mode — generated content
    aiCurrentStep?: number
    aiEditableData?: {
      name: string; budget: string; startDate: string; endDate: string
      purpose: string; scope: string; roi: string; expectedBenefits: string
    }
    aiSmartObjective?: { specific: string; measurable: string; achievable: string; relevant: string; timeBound: string }
    aiMilestones?: AiMilestone[]
    aiRisks?: Array<{ title: string; description: string; impact: 'low' | 'medium' | 'high'; probability: 'low' | 'medium' | 'high' }>
    aiTeamDetails?: TeamMemberDraft[]
    aiTasks?: MilestoneTaskDraft[]
  }
}

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

interface AiTemplate {
  label: string
  description: string
  projectType: string
  projectTier: string
  demandSource: string
  requirements: string
  nameHint: string
  durationMonths: string
  budgetRange: string
  createdReason: string
  expectedBenefits: string
  constraints: string
}

const AI_TEMPLATES: AiTemplate[] = [
  {
    label: '自動化倉儲盤點',
    description: '條碼 / RFID 取代人工盤點',
    projectType: 'automation',
    projectTier: 'T2',
    demandSource: 'internal_demand',
    nameHint: '倉儲自動化盤點系統',
    durationMonths: '6',
    budgetRange: '100 萬～500 萬',
    createdReason: '目前倉庫每月需進行人工盤點，耗時 3 天、出錯率約 5%，嚴重影響出貨效率與客戶滿意度。',
    expectedBenefits: '盤點時間縮短 80%（3 天→半天）、出貨錯誤率降至 0.5% 以下、每年節省人力成本約 120 萬。',
    constraints: '需整合現有 ERP 系統（SAP B1）、不可影響日常倉儲作業、預算上限 300 萬。',
    requirements: `【背景】
目前倉庫採人工條碼掃描盤點，每月需暫停出貨 3 天進行全倉盤點，人員約 10 人，出錯率約 5%，導致帳面庫存與實際不符，影響客戶出貨準時率。

【目標】
導入 RFID 讀取器與自動化盤點系統，實現快速批量盤點，目標在不停止出貨的情況下，於 4 小時內完成全倉盤點。

【需求】
1. RFID 標籤貼附於所有棧板與料架，支援批量讀取
2. 手持式 / 固定式 RFID 讀取器，配合移動推車使用
3. 盤點結果即時上傳至 ERP（SAP B1）自動對帳
4. 差異報告自動產生，標示超差品項
5. 支援多倉儲分區盤點（A、B、C 區各自獨立）
6. 系統需能匯出 Excel 報表供主管審核

【預期效益】
盤點工時 3 天縮短至 4 小時、錯誤率 5% 降至 0.5%、年省人力 120 萬元。`,
  },
  {
    label: '品質不良率改善',
    description: 'SPC / 製程管制降低不良率',
    projectType: 'quality-improvement',
    projectTier: 'T2',
    demandSource: 'internal_demand',
    nameHint: '製程品質改善專案',
    durationMonths: '4',
    budgetRange: '50 萬～100 萬',
    createdReason: '近三個月 PCB 組裝製程不良率升至 3.2%，超過客戶要求的 1.5%，導致退貨與客訴增加。',
    expectedBenefits: '不良率從 3.2% 降至 1% 以下，減少每月報廢損失約 80 萬，提升客戶滿意度。',
    constraints: '不可更換主力設備、需在現有 SMT 產線執行改善、改善措施需通過客戶審核。',
    requirements: `【背景】
PCB 組裝線（SMT + DIP）近三個月不良率由 1.8% 上升至 3.2%，主要問題集中在錫橋（40%）、空焊（35%）兩大類，每月報廢損失達 80 萬元，並已收到客戶 A 正式改善通知（CAR）。

【目標】
透過 SPC 管制、製程參數最佳化與設備保養改善，在 4 個月內將不良率降至 1% 以下，並建立持續監控機制防止復發。

【需求】
1. 現況分析：8D 報告、魚骨圖、帕雷托分析定位根本原因
2. 製程參數優化：錫膏印刷壓力、速度、迴焊爐溫度曲線重新設定
3. 導入 SPC 管制圖（X-bar / R chart），設定管制上下限
4. 建立首件確認 SOP 與自動 AOI 判讀規則更新
5. 設備預防保養計畫（PM）更新，清潔週期從雙週改為每週
6. 改善成果報告提交客戶，取得 CAR 結案確認

【預期效益】
不良率降至 1% 以下、月省報廢 80 萬、取得客戶 CAR 結案。`,
  },
  {
    label: '新產品導入 (NPI)',
    description: '新產品量產前的導入規劃',
    projectType: 'npi',
    projectTier: 'T1',
    demandSource: 'self_proposal',
    nameHint: 'NPI 新產品量產導入',
    durationMonths: '5',
    budgetRange: '500 萬～1000 萬',
    createdReason: '客戶要求新款無線充電模組於 Q3 量產，需完成 EVT→DVT→PVT 三階段驗證並建立量產 SOP。',
    expectedBenefits: '依計畫達成量產交期、良率 EVT>85% / DVT>92% / PVT>96%、首批出貨 1 萬套。',
    constraints: '客戶指定關鍵零件供應商（線圈、IC 各一家）、量產前需通過 CE/FCC 認證、人力不可額外招募。',
    requirements: `【背景】
客戶委託開發新款 15W 無線充電模組（型號 WC-X15），要求 2026 Q3 正式量產，首批出貨 10,000 套。產品尚在 EVT 階段，需完成三階段驗證後建立完整量產 SOP 並移轉至產線。

【目標】
在 5 個月內完成 EVT→DVT→PVT 驗證，各階段良率目標 85%/92%/96%，取得 CE/FCC 認證，完成產線移轉與首批量產交付。

【需求】
1. EVT 階段：樣品製作 50 pcs，功能測試、安規初測、問題清單輸出
2. DVT 階段：樣品 200 pcs，可靠度驗證（高低溫循環、跌落、EMC）
3. PVT 階段：試產 500 pcs，全製程 SOP 確認、CT 計算、良率達標
4. 認證：委外 CE/FCC 認證，目標 DVT 結束前取得
5. 量產移轉：作業 SOP、BOM 凍結、治具製作、產線作業員訓練
6. 首批量產：10,000 套排程、物料齊套確認、出貨品質確認

【預期效益】
如期完成客戶 Q3 量產要求，首批 10,000 套準時出貨，建立可複製的 NPI 流程範本。`,
  },
  {
    label: '流程優化（報表自動化）',
    description: 'Excel 人工報表改為系統自動化',
    projectType: 'process-optimization',
    projectTier: 'T3',
    demandSource: 'internal_demand',
    nameHint: '生產日報表自動化',
    durationMonths: '3',
    budgetRange: '50 萬以下',
    createdReason: '生產管理部每日需花費 2 小時手動整理各產線數據並製作日報表，易出錯且時效性差。',
    expectedBenefits: '每日節省 2 小時人工作業、報表準確率 100%、主管可即時在線查看最新生產數據。',
    constraints: '需與現有 MES 系統 API 介接、IT 人力有限（1 名工程師）、需在 3 個月內完成。',
    requirements: `【背景】
生產管理部每天上午需花 2 小時，人工從 MES、ERP、Excel 三個來源彙整前一日各產線產出、良率、稼動率、異常停機等數據，製作成日報 Excel 後以 Email 發送給主管，時效性差且容易出錯（每月平均 3 次數據有誤）。

【目標】
開發自動化報表系統，每日凌晨 01:00 自動從 MES 抓取數據，產生標準化日報表並自動發送 Email，讓主管 08:00 上班時即可在線查看最新報表。

【需求】
1. API 串接 MES 系統，自動抓取：各線日產出、良率、稼動率、前三大停機原因
2. 報表格式與現有 Excel 日報一致，支援圖表（折線圖、長條圖）
3. 定時排程每日 01:00 執行，失敗自動告警給 IT
4. Email 自動發送（收件人清單可在後台維護）
5. 網頁版儀表板，支援日期區間查詢與歷史報表下載
6. 異常判斷：良率低於 95% 或稼動率低於 85% 自動標紅並加入異常摘要

【預期效益】
每日省 2 小時、報表準確率 100%、異常即時可見、可擴充至週報月報自動化。`,
  },
]


export default function NewProjectPage() {
  const router = useRouter()
  const { addProject } = useProjectStore()
  const { user } = useAuth()
  const { projectTypes } = useProjectTypes()
  const { toast } = useToast()

  // 權限守衛：只有 PM 和 admin 可建立專案
  useEffect(() => {
    if (user && !getRolePermissions(user.role).canCreateProject) {
      router.replace('/projects')
    }
  }, [user, router])
  const [isCreating, setIsCreating] = useState(false)
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('ai')
  const [showDraftsDialog, setShowDraftsDialog] = useState(false)
  const [showSaveDraftDialog, setShowSaveDraftDialog] = useState(false)
  const [draftNameInput, setDraftNameInput] = useState('')
  const [savedDrafts, setSavedDrafts] = useState<ProjectDraft[]>([])

  // AI Mode
  const [requirements, setRequirements] = useState('')
  const [requirementsInterim, setRequirementsInterim] = useState('')
  const [parsedData, setParsedData] = useState<ParsedProjectData | null>(null)
  const [aiProjectType, setAiProjectType] = useState<ProjectType | ''>('')
  const [aiProjectTier, setAiProjectTier] = useState<ProjectTier | ''>('')
  const [aiDemandSource, setAiDemandSource] = useState<DemandSource | ''>('')
  const [aiCreatedReason, setAiCreatedReason] = useState('')
  const [aiExpectedBenefits, setAiExpectedBenefits] = useState('')
  // Additional AI hint fields
  const [aiProjectNameHint, setAiProjectNameHint] = useState('')
  const [aiDurationMonths, setAiDurationMonths] = useState<string>('')
  const [aiBudgetRange, setAiBudgetRange] = useState<string>('')
  const [aiConstraints, setAiConstraints] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

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
  const [manualBudgetItems, setManualBudgetItems] = useState<import('@/components/budget-list-editor').BudgetItem[]>([])
  const [editingRiskIndex, setEditingRiskIndex] = useState<number | null>(null)
  const [showRiskAddForm, setShowRiskAddForm] = useState(false)
  const [manualTeamDetails, setManualTeamDetails] = useState<TeamMemberDraft[]>([])
  // Milestone tasks
  const [manualTasks, setManualTasks] = useState<MilestoneTaskDraft[]>([])

  // Project code preview
  const [previewCode, setPreviewCode] = useState<string>('')

  // Track whether budget was set by AI total (合計 row from image)
  const [aiBudgetTotal, setAiBudgetTotal] = useState<number | null>(null)

  // Auto-sync budget from budget items total (only when no AI total is set)
  useEffect(() => {
    if (aiBudgetTotal != null) return // AI total takes priority — don't auto-sync
    const total = manualBudgetItems.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0)
    if (manualBudgetItems.some(i => i.estimatedCost != null)) {
      setManualData(prev => ({ ...prev, budget: String(total) }))
    }
  }, [manualBudgetItems, aiBudgetTotal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handler: AI parsing sets the budget to the image's 合計 total
  const handleAITotal = (total: number) => {
    setAiBudgetTotal(total)
    setManualData(prev => ({ ...prev, budget: String(total) }))
  }

  // Load drafts from API on mount
  useEffect(() => {
    if (!user?.email) return
    fetch(`/api/drafts?email=${encodeURIComponent(user.email)}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setSavedDrafts(data))
      .catch((e) => console.error('Failed to load drafts:', e))
  }, [user?.email])

  // Open save draft dialog
  const openSaveDraftDialog = () => {
    const defaultName = activeTab === 'manual'
      ? manualData.name || '未命名專案'
      : aiEditableData.name || requirements.slice(0, 30) || '未命名專案'

    setDraftNameInput(defaultName)
    setShowSaveDraftDialog(true)
  }

  // Save current state as draft
  const confirmSaveDraft = async () => {
    const draftTitle = draftNameInput.trim() || '未命名專案'

    const draftData = {
      // Manual mode data
      manualData: activeTab === 'manual' ? manualData : undefined,
      smartObjective: activeTab === 'manual' ? smartObjective : undefined,
      manualProjectType: activeTab === 'manual' ? manualProjectType : undefined,
      manualProjectTier: activeTab === 'manual' ? manualProjectTier : undefined,
      manualDemandSource: activeTab === 'manual' ? manualDemandSource : undefined,
      manualMilestones: activeTab === 'manual' ? manualMilestones : undefined,
      manualTasks: activeTab === 'manual' ? manualTasks : undefined,
      manualRisks: activeTab === 'manual' ? manualRisks : undefined,
      manualTeamDetails: activeTab === 'manual' ? manualTeamDetails : undefined,
      manualBudgetItems: activeTab === 'manual' ? manualBudgetItems : undefined,
      currentStep: activeTab === 'manual' ? currentStep : undefined,
      // AI mode data — input fields
      aiProjectType: activeTab === 'ai' ? aiProjectType : undefined,
      aiProjectTier: activeTab === 'ai' ? aiProjectTier : undefined,
      aiDemandSource: activeTab === 'ai' ? aiDemandSource : undefined,
      aiCreatedReason: activeTab === 'ai' ? aiCreatedReason : undefined,
      aiExpectedBenefits: activeTab === 'ai' ? aiExpectedBenefits : undefined,
      requirements: activeTab === 'ai' ? requirements : undefined,
      parsedData: activeTab === 'ai' ? parsedData : undefined,
      aiProjectNameHint: activeTab === 'ai' ? aiProjectNameHint : undefined,
      aiDurationMonths: activeTab === 'ai' ? aiDurationMonths : undefined,
      aiBudgetRange: activeTab === 'ai' ? aiBudgetRange : undefined,
      aiConstraints: activeTab === 'ai' ? aiConstraints : undefined,
      // AI mode data — generated content
      aiCurrentStep: activeTab === 'ai' ? aiCurrentStep : undefined,
      aiEditableData: activeTab === 'ai' ? aiEditableData : undefined,
      aiSmartObjective: activeTab === 'ai' ? aiSmartObjective : undefined,
      aiMilestones: activeTab === 'ai' ? aiMilestones : undefined,
      aiRisks: activeTab === 'ai' ? aiRisks : undefined,
      aiTeamDetails: activeTab === 'ai' ? aiTeamDetails : undefined,
      aiTasks: activeTab === 'ai' ? aiTasks : undefined,
    }

    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          userName: user?.name,
          title: draftTitle,
          mode: activeTab,
          data: draftData,
        }),
      })

      if (!res.ok) throw new Error('儲存失敗')

      const saved = await res.json()
      setSavedDrafts([saved, ...savedDrafts])

      setShowSaveDraftDialog(false)
      setDraftNameInput('')

      toast({
        title: '草稿已儲存',
        description: `「${draftTitle}」已成功儲存`,
      })
    } catch (error) {
      toast({
        title: '儲存草稿失敗',
        description: '請稍後再試',
        variant: 'destructive',
      })
    }
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
      if (draft.data.manualTasks) setManualTasks(draft.data.manualTasks)
      if (draft.data.manualRisks) setManualRisks(draft.data.manualRisks)
      if (draft.data.manualTeamDetails) setManualTeamDetails(draft.data.manualTeamDetails)
      if (draft.data.manualBudgetItems) setManualBudgetItems(draft.data.manualBudgetItems)
      if (draft.data.currentStep !== undefined) setCurrentStep(draft.data.currentStep)
    } else if (draft.mode === 'ai') {
      // Restore input fields
      if (draft.data.aiProjectType) setAiProjectType(draft.data.aiProjectType)
      if (draft.data.aiProjectTier) setAiProjectTier(draft.data.aiProjectTier)
      if (draft.data.aiDemandSource) setAiDemandSource(draft.data.aiDemandSource)
      if (draft.data.aiCreatedReason) setAiCreatedReason(draft.data.aiCreatedReason)
      if (draft.data.aiExpectedBenefits) setAiExpectedBenefits(draft.data.aiExpectedBenefits)
      if (draft.data.requirements) setRequirements(draft.data.requirements)
      if (draft.data.parsedData) setParsedData(draft.data.parsedData)
      if (draft.data.aiProjectNameHint) setAiProjectNameHint(draft.data.aiProjectNameHint)
      if (draft.data.aiDurationMonths) setAiDurationMonths(draft.data.aiDurationMonths)
      if (draft.data.aiBudgetRange) setAiBudgetRange(draft.data.aiBudgetRange)
      if (draft.data.aiConstraints) setAiConstraints(draft.data.aiConstraints)
      // Restore generated content
      if (draft.data.aiEditableData) setAiEditableData(draft.data.aiEditableData)
      if (draft.data.aiSmartObjective) setAiSmartObjective(draft.data.aiSmartObjective)
      if (draft.data.aiMilestones) setAiMilestones(draft.data.aiMilestones)
      if (draft.data.aiRisks) setAiRisks(draft.data.aiRisks)
      if (draft.data.aiTeamDetails) setAiTeamDetails(draft.data.aiTeamDetails)
      if (draft.data.aiTasks) setAiTasks(draft.data.aiTasks)
      if (draft.data.aiCurrentStep !== undefined) setAiCurrentStep(draft.data.aiCurrentStep)
    }

    setShowDraftsDialog(false)
    toast({
      title: '草稿已載入',
      description: `「${draft.title}」已成功載入`,
    })
  }

  // Delete draft
  const deleteDraft = async (draftId: string) => {
    try {
      const res = await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('刪除失敗')

      setSavedDrafts(savedDrafts.filter(d => d.id !== draftId))
      toast({
        title: '草稿已刪除',
        description: '草稿已從清單中移除',
      })
    } catch (error) {
      toast({
        title: '刪除草稿失敗',
        description: '請稍後再試',
        variant: 'destructive',
      })
    }
  }

  const updateProjectCodePreview = (type: ProjectType) => {
    const match = projectTypes.find(pt => pt.key === type)
    const prefix = match?.codePrefix ?? 'PRJ'
    const year = new Date().getFullYear()
    setPreviewCode(`${prefix}-${year}-XXX`)
  }

  const applyMilestoneTemplate = async (type: ProjectType, mode: 'manual' | 'ai') => {
    // Try fetching from API (includes DB-customized tasks), fallback to hardcoded
    let templates: MilestoneTemplate[]
    try {
      const res = await fetch(`/api/milestone-templates/${type}`)
      if (res.ok) {
        const data = await res.json()
        templates = data.templates
      } else {
        templates = MILESTONE_TEMPLATES[type] ?? []
      }
    } catch {
      templates = MILESTONE_TEMPLATES[type] ?? []
    }
    if (!templates.length) return

    const now = Date.now()
    if (mode === 'manual') {
      const newMilestones = templates.map((t, i) => ({
        id: `milestone-${now}-${i}`,
        name: t.name,
        durationDays: t.durationDays,
      }))
      const newTasks: MilestoneTaskDraft[] = []
      templates.forEach((t, i) => {
        (t.tasks ?? []).forEach((task, j) => {
          const taskId = `task-${now}-${i}-${j}`
          newTasks.push({
            id: taskId,
            milestoneId: `milestone-${now}-${i}`,
            title: task.title,
            assignee: '',
            priority: task.priority,
            durationDays: task.durationDays,
          })
          // Add subtasks (children)
          ;(task.children ?? []).forEach((child, k) => {
            newTasks.push({
              id: `task-${now}-${i}-${j}-${k}`,
              milestoneId: `milestone-${now}-${i}`,
              parentId: taskId,
              title: child.title,
              assignee: '',
              priority: child.priority,
              durationDays: child.durationDays,
            })
          })
        })
      })
      // ADR-01: seed absolute dates ONCE (sequential initial layout); afterwards
      // dates are edited locally and never auto-re-sequenced.
      const seeded = seedSequentialDates(newMilestones, newTasks, manualData.startDate)
      setManualMilestones(seeded.milestones)
      setManualTasks(seeded.tasks)
    } else {
      const newMilestones = templates.map((t, i) => ({
        id: `ai-ms-${now}-${i}`,
        name: t.name,
        description: '',
        durationDays: t.durationDays,
      }))
      const newTasks: MilestoneTaskDraft[] = []
      templates.forEach((t, i) => {
        (t.tasks ?? []).forEach((task, j) => {
          const taskId = `ai-task-${now}-${i}-${j}`
          newTasks.push({
            id: taskId,
            milestoneId: `ai-ms-${now}-${i}`,
            title: task.title,
            assignee: '',
            priority: task.priority,
            durationDays: task.durationDays,
          })
          ;(task.children ?? []).forEach((child, k) => {
            newTasks.push({
              id: `ai-task-${now}-${i}-${j}-${k}`,
              milestoneId: `ai-ms-${now}-${i}`,
              parentId: taskId,
              title: child.title,
              assignee: '',
              priority: child.priority,
              durationDays: child.durationDays,
            })
          })
        })
      })
      const seeded = seedSequentialDates(newMilestones, newTasks, aiEditableData.startDate)
      setAiMilestones(seeded.milestones)
      setAiTasks(seeded.tasks)
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

  // Recalculate dates when milestones or start date changes
  const recalculatedMilestones = calculateMilestoneDates(manualMilestones, manualData.startDate, manualTasks)

  const manualTaskDates = calculateTaskDates(manualTasks, recalculatedMilestones)

  // ADR-01: milestones are independent of tasks (no auto-expand to fit tasks).

  // Seed absolute dates once the project start is known but milestones are still
  // unseeded (template applied before start was set, or an old draft). Only fires
  // when EVERY milestone lacks a startDate — never overwrites user-set dates.
  useEffect(() => {
    if (!manualData.startDate || manualMilestones.length === 0) return
    if (!manualMilestones.every(m => !m.startDate)) return
    const seeded = seedSequentialDates(manualMilestones, manualTasks, manualData.startDate)
    setManualMilestones(seeded.milestones)
    setManualTasks(seeded.tasks)
  }, [manualData.startDate, manualMilestones, manualTasks])

  // Track the last milestone's end date (only changes when milestones actually change)
  const lastMilestoneEndDate = useMemo(() => {
    const endDates = recalculatedMilestones
      .filter(m => m.endDate && m.durationDays > 0)
      .map(m => m.endDate!)
    const lastMilestone = endDates.length > 0 ? { endDate: endDates.sort().pop()! } : null
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
    setManualMilestones([...manualMilestones, { id: newId, name: '', durationDays: 0 }])
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
  const addRisk = (risk: ManualRisk) => {
    if (!risk.title.trim()) return
    setManualRisks([...manualRisks, risk])
    setShowRiskAddForm(false)
  }

  const removeRisk = (index: number) => {
    setManualRisks(manualRisks.filter((_, i) => i !== index))
    if (editingRiskIndex === index) setEditingRiskIndex(null)
  }

  const updateRisk = (index: number, data: Partial<ManualRisk>) => {
    setManualRisks(
      manualRisks.map((r, i) => (i === index ? { ...r, ...data } : r))
    )
    setEditingRiskIndex(null)
  }

  // Recalculate AI milestone dates (same algorithm as manual mode)
  const recalculatedAiMilestones = calculateMilestoneDates(aiMilestones, aiEditableData.startDate, aiTasks)

  const aiTaskDates = calculateTaskDates(aiTasks, recalculatedAiMilestones)

  // ADR-01: milestones are independent of tasks (no auto-expand to fit tasks).

  // Seed absolute dates once the AI project start is known but milestones are unseeded.
  useEffect(() => {
    if (!aiEditableData.startDate || aiMilestones.length === 0) return
    if (!aiMilestones.every(m => !m.startDate)) return
    const seeded = seedSequentialDates(aiMilestones, aiTasks, aiEditableData.startDate)
    setAiMilestones(seeded.milestones)
    setAiTasks(seeded.tasks)
  }, [aiEditableData.startDate, aiMilestones, aiTasks])

  // Track AI last milestone end date
  const aiLastMilestoneEndDate = useMemo(() => {
    const endDates = recalculatedAiMilestones
      .filter(m => m.endDate && m.durationDays > 0)
      .map(m => m.endDate!)
    return endDates.length > 0 ? endDates.sort().pop()! : ''
  }, [recalculatedAiMilestones])

  // Auto-update AI project end date
  useEffect(() => {
    if (!aiEditableData.startDate || !aiLastMilestoneEndDate) return
    setAiEditableData(prev => ({ ...prev, endDate: aiLastMilestoneEndDate }))
  }, [aiLastMilestoneEndDate, aiEditableData.startDate])

  // AI Milestone helpers
  const addAiMilestone = () => {
    const newId = `ai-milestone-${Date.now()}`
    setAiMilestones([...aiMilestones, { id: newId, name: '', description: '', durationDays: 0 }])
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

  // ─── Gantt preview state ─────────────────────────────────────
  const [ganttPreviewOpen, setGanttPreviewOpen] = useState(false)
  const [ganttPreviewMode, setGanttPreviewMode] = useState<'manual' | 'ai'>('manual')

  // ─── Date change handlers (manual mode) ──────────────────────
  const handleManualMilestoneDateChange = (index: number, field: 'startDate' | 'endDate', value: string) => {
    if (!value) return
    if (field === 'endDate') {
      const ms = recalculatedMilestones[index]
      if (!ms?.startDate) return
      const newDuration = daysBetween(ms.startDate, value) + 1
      if (newDuration < 1) return
      setManualMilestones(prev => prev.map((m, i) => i === index ? { ...m, durationDays: newDuration } : m))
    } else {
      // startDate change — directly set milestone's own startDate (overlapping)
      setManualMilestones(prev => prev.map((m, i) => {
        if (i !== index) return m
        const currentEnd = recalculatedMilestones[index]?.endDate
        const newDuration = currentEnd ? daysBetween(value, currentEnd) + 1 : m.durationDays
        return { ...m, startDate: value, durationDays: Math.max(newDuration, 1) }
      }))
    }
  }

  const handleManualTaskDateChange = (taskId: string, field: 'startDate' | 'endDate', value: string) => {
    if (!value) return
    const taskDates = manualTaskDates.get(taskId)
    if (!taskDates) return
    if (field === 'endDate') {
      const newDuration = daysBetween(taskDates.startDate, value) + 1
      if (newDuration < 1) return
      setManualTasks(prev => prev.map(t => t.id === taskId ? { ...t, durationDays: newDuration } : t))
    } else {
      // startDate change — directly set task's own startDate (overlapping)
      const currentEnd = taskDates.endDate
      const newDuration = daysBetween(value, currentEnd) + 1
      setManualTasks(prev => prev.map(t => t.id === taskId ? { ...t, startDate: value, durationDays: Math.max(newDuration, 1) } : t))
    }
  }

  // ─── Date change handlers (AI mode) ──────────────────────────
  const handleAiMilestoneDateChange = (index: number, field: 'startDate' | 'endDate', value: string) => {
    if (!value) return
    if (field === 'endDate') {
      const ms = recalculatedAiMilestones[index]
      if (!ms?.startDate) return
      const newDuration = daysBetween(ms.startDate, value) + 1
      if (newDuration < 1) return
      setAiMilestones(prev => prev.map((m, i) => i === index ? { ...m, durationDays: newDuration } : m))
    } else {
      // startDate change — directly set milestone's own startDate (overlapping)
      setAiMilestones(prev => prev.map((m, i) => {
        if (i !== index) return m
        const currentEnd = recalculatedAiMilestones[index]?.endDate
        const newDuration = currentEnd ? daysBetween(value, currentEnd) + 1 : m.durationDays
        return { ...m, startDate: value, durationDays: Math.max(newDuration, 1) }
      }))
    }
  }

  const handleAiTaskDateChange = (taskId: string, field: 'startDate' | 'endDate', value: string) => {
    if (!value) return
    const taskDates = aiTaskDates.get(taskId)
    if (!taskDates) return
    if (field === 'endDate') {
      const newDuration = daysBetween(taskDates.startDate, value) + 1
      if (newDuration < 1) return
      setAiTasks(prev => prev.map(t => t.id === taskId ? { ...t, durationDays: newDuration } : t))
    } else {
      // startDate change — directly set task's own startDate (overlapping)
      const currentEnd = taskDates.endDate
      const newDuration = daysBetween(value, currentEnd) + 1
      setAiTasks(prev => prev.map(t => t.id === taskId ? { ...t, startDate: value, durationDays: Math.max(newDuration, 1) } : t))
    }
  }

  // ─── Tree move (drag reparent) + indent/outdent buttons ─────
  // Buttons are the reliable path for level changes; drag also works via moveTreeItem.
  const manualItemMove = (activeId: string, overId: string, mode: TreeDropMode) => {
    const r = moveTreeItem(manualTasks, manualMilestones, activeId, overId, mode)
    if (!r) return
    setManualTasks(r.tasks)
    setManualMilestones(r.milestones)
  }
  const manualIndent = (taskId: string) => {
    const t = manualTasks.find(x => x.id === taskId)
    if (!t || t.parentId) return
    const tops = manualTasks.filter(x => x.milestoneId === t.milestoneId && !x.parentId)
    const idx = tops.findIndex(x => x.id === taskId)
    if (idx <= 0) return
    manualItemMove(taskId, tops[idx - 1].id, 'inside')
  }
  const manualOutdent = (taskId: string) => {
    const t = manualTasks.find(x => x.id === taskId)
    if (!t || !t.parentId) return
    manualItemMove(taskId, t.parentId, 'after')
  }
  const aiItemMove = (activeId: string, overId: string, mode: TreeDropMode) => {
    const r = moveTreeItem(aiTasks, aiMilestones, activeId, overId, mode)
    if (!r) return
    setAiTasks(r.tasks)
    setAiMilestones(r.milestones)
  }
  const aiIndent = (taskId: string) => {
    const t = aiTasks.find(x => x.id === taskId)
    if (!t || t.parentId) return
    const tops = aiTasks.filter(x => x.milestoneId === t.milestoneId && !x.parentId)
    const idx = tops.findIndex(x => x.id === taskId)
    if (idx <= 0) return
    aiItemMove(taskId, tops[idx - 1].id, 'inside')
  }
  const aiOutdent = (taskId: string) => {
    const t = aiTasks.find(x => x.id === taskId)
    if (!t || !t.parentId) return
    aiItemMove(taskId, t.parentId, 'after')
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

  // Budget validation: if AI total is set and items sum doesn't match, block proceeding
  const budgetItemsTotal = manualBudgetItems.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0)
  const hasBudgetMismatch = aiBudgetTotal != null && manualBudgetItems.length > 0
    && Math.abs(budgetItemsTotal - aiBudgetTotal) >= 1

  // Step navigation
  const canProceed = (step: number) => {
    switch (step) {
      case 0: return !!manualProjectType && !!manualProjectTier && !!manualDemandSource && !!manualData.name.trim() && !!manualData.createdReason.trim() && !hasBudgetMismatch
      case 1: return !!smartObjective.specific.trim() && !!smartObjective.measurable.trim() && !!smartObjective.achievable.trim() && !!smartObjective.relevant.trim() && !!smartObjective.timeBound.trim()
      case 2: return !!manualData.purpose.trim() // 專案定義至少要有目的
      case 3: return manualTeamDetails.length > 0 // 團隊至少一人
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
    setAiParsing(true)
    try {
      const aiRes = await fetch('/api/ai/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectType: aiProjectType,
          projectTier: aiProjectTier,
          demandSource: aiDemandSource,
          createdReason: aiCreatedReason,
          expectedBenefits: aiExpectedBenefits,
          requirements,
          projectNameHint: aiProjectNameHint || undefined,
          durationMonths: aiDurationMonths ? parseInt(aiDurationMonths) : undefined,
          budgetRange: aiBudgetRange || undefined,
          constraints: aiConstraints || undefined,
        }),
      })

      if (!aiRes.ok) {
        const err = await aiRes.json().catch(() => ({ error: 'AI 分析失敗' }))
        toast({ title: 'AI 分析失敗', description: err.error ?? '請稍後再試', variant: 'destructive' })
        return
      }

      const { plan } = await aiRes.json()

      type RawMilestone = { name: string; description: string; durationDays: number }
      type RawTask = { milestoneIndex: number; title: string; priority: string; durationDays: number }
      type RawTeam = { name: string; role: string; jobTitle: string; responsibility: string }
      type RawRisk = { title: string; description: string; impact: string; probability: string; mitigation: string }

      // Populate basic info
      setAiEditableData({
        name: plan.name ?? '',
        budget: plan.budget ? String(Math.round(plan.budget)) : '',
        startDate: plan.startDate ?? '',
        endDate: plan.endDate ?? '',
        purpose: plan.purpose ?? '',
        scope: plan.scope ?? '',
        roi: plan.roi ?? '',
        expectedBenefits: plan.expectedBenefits ?? '',
      })

      // Populate SMART objective
      setAiSmartObjective({
        specific: plan.smartObjective?.specific ?? '',
        measurable: plan.smartObjective?.measurable ?? '',
        achievable: plan.smartObjective?.achievable ?? '',
        relevant: plan.smartObjective?.relevant ?? '',
        timeBound: plan.smartObjective?.timeBound ?? '',
      })

      // Populate milestones
      const rawMilestones: RawMilestone[] = plan.milestones ?? []
      const newMilestones: AiMilestone[] = rawMilestones.map((m, i) => ({
        id: `ai-ms-${i}`,
        name: m.name,
        description: m.description ?? '',
        durationDays: m.durationDays,
      }))
      setAiMilestones(newMilestones)

      // Populate tasks
      const rawTasks: RawTask[] = plan.tasks ?? []
      setAiTasks(rawTasks.map((t, i) => ({
        id: `ai-task-${i}`,
        milestoneId: newMilestones[t.milestoneIndex]?.id ?? newMilestones[0]?.id ?? '',
        title: t.title,
        assignee: '',
        priority: (t.priority ?? 'medium') as 'low' | 'medium' | 'high',
        durationDays: t.durationDays ?? 3,
      })))

      // Populate team (AI role suggestions, name = "待確認" — user fills in actual names)
      const rawTeam: RawTeam[] = plan.team ?? []
      setAiTeamDetails(rawTeam.map((t, i) => ({
        id: `ai-team-${i}`,
        name: t.name === '待確認' ? '' : (t.name ?? ''),
        role: (t.role ?? 'R') as TeamRole,
        responsibility: t.responsibility ?? '',
        organization: t.jobTitle ?? '',
      })))

      // Populate risks
      const rawRisks: RawRisk[] = plan.risks ?? []
      setAiRisks(rawRisks.map(r => ({
        title: r.title,
        description: r.description ?? '',
        impact: (r.impact ?? 'medium') as 'low' | 'medium' | 'high',
        probability: (r.probability ?? 'medium') as 'low' | 'medium' | 'high',
      })))

      toast({ title: 'AI 分析完成', description: '請逐步確認並修改各步驟內容，確認無誤後點擊「建立專案」' })
      setAiCurrentStep(1)
    } catch (err) {
      console.error(err)
      toast({ title: 'AI 分析失敗', description: err instanceof Error ? err.message : '請稍後再試', variant: 'destructive' })
    } finally {
      setAiParsing(false)
    }
  }

  const handleCreateFromAI = async () => {
    const ownerName = user?.name || 'Unknown'

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
          startDate: m.startDate,
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

    const aiParentDrafts = aiTasks.filter(t => !t.parentId && t.title.trim() && milestoneIdMap.has(t.milestoneId))
    const aiSubtaskDrafts = aiTasks.filter(t => t.parentId && t.title.trim())
    const validTasks = [...aiParentDrafts, ...aiSubtaskDrafts]
      .map(t => {
        const msId = milestoneIdMap.get(t.milestoneId)!
        const ms = milestones.find(m => m.id === msId)
        const dates = aiTaskDates.get(t.id)
        const parentDates = t.parentId ? aiTaskDates.get(t.parentId) : null
        return {
          tempId: t.id,
          milestoneId: msId,
          title: t.title,
          description: '',
          assignee: t.assignee.trim() || '未指派',
          priority: t.priority,
          // 方案 A：父任務天數＝子任務 envelope 跨度（dates 已是最早開始～最晚結束）
          durationDays: dates ? daysBetween(dates.startDate, dates.endDate) + 1 : (t.durationDays || 1),
          startDate: dates?.startDate || parentDates?.startDate || aiEditableData.startDate,
          endDate: dates?.endDate || parentDates?.endDate || ms?.dueDate || aiEditableData.endDate,
          dependencies: [] as string[],
          ...(t.parentId ? { parentTempId: t.parentId } : {}),
        }
      })

    const uniqueNames = new Set<string>()
    const teamNames: string[] = []
    aiTeamDetails.filter(m => m.name.trim()).forEach(m => {
      if (!uniqueNames.has(m.name)) {
        uniqueNames.add(m.name)
        teamNames.push(m.name)
      }
    })
    const teamMembersData = aiTeamDetails
      .filter(m => m.name.trim())
      .map((m, i) => ({ id: `temp-${i}`, name: m.name, role: m.role, responsibility: m.responsibility, email: m.email, jobTitle: m.jobTitle, organization: m.organization }))

    setIsCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          budget: Number(aiEditableData.budget) || 0,
          ownerName,
          team: teamNames,
          milestones,
          risks,
          tasks: validTasks,
          teamMembers: teamMembersData,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '建立專案失敗')
      }

      const newProject = await res.json()
      toast({ title: '專案建立成功', description: `AI 產生專案：${newProject.projectCode}` })
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

  const handleManualCreate = async () => {
    const ownerName = user?.name || 'Unknown'

    // Build milestone ID mapping: old draft ID -> new stable ID
    const milestoneIdMap = new Map<string, string>()
    const validMilestones = recalculatedMilestones
      .filter((m) => m.name.trim() && m.durationDays > 0 && m.endDate)
      .map((m, index) => {
        const newId = `ms-new-${index}`
        milestoneIdMap.set(m.id, newId)
        return {
          id: newId,
          name: m.name,
          dueDate: m.endDate!,
          startDate: m.startDate,
        }
      })

    const validRisks = manualRisks
      .filter(r => r.title.trim())
      .map(r => ({
        ...r,
        status: 'open' as const,
      }))

    // Map draft tasks to real tasks with correct milestone IDs and calculated dates
    // Parent tasks first, then subtasks, so parentId resolution works
    const parentDrafts = manualTasks.filter(t => !t.parentId && t.title.trim() && milestoneIdMap.has(t.milestoneId))
    const subtaskDrafts = manualTasks.filter(t => t.parentId && t.title.trim())
    const validTasks = [...parentDrafts, ...subtaskDrafts]
      .map(t => {
        const msId = milestoneIdMap.get(t.milestoneId)!
        const dates = manualTaskDates.get(t.id)
        // For subtasks, use parent dates as fallback
        const parentDates = t.parentId ? manualTaskDates.get(t.parentId) : null
        // Fallback to milestone range if no calculated dates
        const ms = validMilestones.find(m => m.id === msId)
        const msIndex = validMilestones.indexOf(ms!)
        const prevMs = msIndex > 0 ? validMilestones[msIndex - 1] : null
        const fallbackStart = prevMs
          ? new Date(new Date(prevMs.dueDate).getTime() + 86400000).toISOString().split('T')[0]
          : manualData.startDate
        return {
          tempId: t.id,
          milestoneId: msId,
          title: t.title,
          description: '',
          assignee: t.assignee.trim() || '未指派',
          priority: t.priority,
          // 方案 A：父任務天數＝子任務 envelope 跨度（dates 已是最早開始～最晚結束）
          durationDays: dates ? daysBetween(dates.startDate, dates.endDate) + 1 : (t.durationDays || 1),
          startDate: dates?.startDate || parentDates?.startDate || fallbackStart,
          endDate: dates?.endDate || parentDates?.endDate || ms?.dueDate || manualData.endDate,
          ...(t.parentId ? { parentTempId: t.parentId } : {}),
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
    const teamMembersData = manualTeamDetails.map((m, i) => ({ id: `temp-${i}`, name: m.name, role: m.role, responsibility: m.responsibility, email: m.email, jobTitle: m.jobTitle, organization: m.organization }))

    // Validate budget items before submit
    const budgetErrors = validateBudgetItems(manualBudgetItems)
    if (budgetErrors.length > 0) {
      toast({
        title: '設備清單費用有誤，請修正後再送出',
        description: budgetErrors[0] + (budgetErrors.length > 1 ? ` 等 ${budgetErrors.length} 筆` : ''),
        variant: 'destructive',
      })
      return
    }

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
          budgetItems: manualBudgetItems,
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
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                      >
                        {/* Left: info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={draft.mode === 'ai' ? 'default' : 'secondary'} className="text-xs shrink-0">
                              {draft.mode === 'ai' ? 'AI 模式' : '手動模式'}
                            </Badge>
                            <h4 className="font-medium text-sm truncate">{draft.title}</h4>
                          </div>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {new Date(draft.updatedAt).toLocaleString('zh-TW')}
                          </span>
                        </div>
                        {/* Right: actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="default" onClick={() => loadDraft(draft)}>
                            載入
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteDraft(draft.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
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
                      <span className={`text-sm hidden sm:inline ${isCurrent ? 'font-semibold' : 'font-medium'}`}>
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
                      <Label htmlFor="ai-project-tier">專案層別 <span className="text-destructive">*</span></Label>
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
                      <Label htmlFor="ai-demand-source">需求來源 <span className="text-destructive">*</span></Label>
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
                          {projectTypes.map(({ key: value, label }) => (
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="requirements">專案需求描述 <span className="text-destructive">*</span></Label>
                      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/5 hover:border-primary">
                            <ClipboardList className="h-3.5 w-3.5" />
                            套用範本
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>選擇範本</DialogTitle>
                            <DialogDescription>點擊範本即可快速填入，再依實際情況修改。</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-3 sm:grid-cols-2 pt-2">
                            {AI_TEMPLATES.map((tpl) => (
                              <div
                                key={tpl.label}
                                className="rounded-lg border bg-card p-3 space-y-1.5 cursor-pointer hover:border-primary hover:shadow-sm transition-all"
                                onClick={() => {
                                  handleAiTypeChange(tpl.projectType as ProjectType)
                                  setAiProjectTier(tpl.projectTier as ProjectTier)
                                  setAiDemandSource(tpl.demandSource as DemandSource)
                                  setRequirements(tpl.requirements)
                                  setAiProjectNameHint(tpl.nameHint)
                                  setAiDurationMonths(tpl.durationMonths)
                                  setAiBudgetRange(tpl.budgetRange)
                                  setAiCreatedReason(tpl.createdReason)
                                  setAiExpectedBenefits(tpl.expectedBenefits)
                                  setAiConstraints(tpl.constraints)
                                  setShowTemplates(false)
                                }}
                              >
                                <span className="font-medium text-sm">{tpl.label}</span>
                                <p className="text-xs text-muted-foreground">{tpl.description}</p>
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  <span className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                    {projectTypes.find(t => t.key === tpl.projectType)?.label ?? tpl.projectType}
                                  </span>
                                  <span className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                    {PROJECT_TIER_LABELS[tpl.projectTier as ProjectTier] ?? tpl.projectTier}
                                  </span>
                                  <span className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{tpl.durationMonths} 個月</span>
                                  <span className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{tpl.budgetRange}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        id="requirements"
                        placeholder="描述您的專案目標、功能需求、開案背景與預期效益。例如：我們需要一套自動化倉儲系統，解決目前人工盤點效率低的問題，預計可降低出貨錯誤率 30%..."
                        value={requirements + (requirementsInterim ? (requirements ? ' ' : '') + requirementsInterim : '')}
                        onChange={(e) => { setRequirements(e.target.value); setRequirementsInterim('') }}
                        rows={8}
                        className="resize-none flex-1"
                      />
                      <VoiceInputButton
                        onTranscript={(text) => { setRequirements(prev => prev + (prev ? ' ' : '') + text); setRequirementsInterim('') }}
                        onInterimTranscript={setRequirementsInterim}
                        className="shrink-0"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      描述越詳細，AI 產生的規劃越準確。可包含目標、背景、需求、預期效益等。
                    </p>
                  </div>

                  {/* Optional hint fields */}
                  <div className="rounded-lg border border-dashed p-4 space-y-4 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">選填：提供更多提示讓 AI 產生更精準的規劃</p>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="ai-name-hint">專案名稱提示</Label>
                        <Input
                          id="ai-name-hint"
                          placeholder="例如：WMS 倉儲系統"
                          value={aiProjectNameHint}
                          onChange={(e) => setAiProjectNameHint(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-duration">預計工期</Label>
                        <Select value={aiDurationMonths} onValueChange={setAiDurationMonths}>
                          <SelectTrigger id="ai-duration">
                            <SelectValue placeholder="選擇工期" />
                          </SelectTrigger>
                          <SelectContent>
                            {[1,2,3,4,5,6,9,12,18,24].map(m => (
                              <SelectItem key={m} value={String(m)}>{m} 個月</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-budget-range">預算範圍</Label>
                        <Select value={aiBudgetRange} onValueChange={setAiBudgetRange}>
                          <SelectTrigger id="ai-budget-range">
                            <SelectValue placeholder="選擇預算區間" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="50 萬以下">50 萬以下</SelectItem>
                            <SelectItem value="50 萬～100 萬">50 萬～100 萬</SelectItem>
                            <SelectItem value="100 萬～500 萬">100 萬～500 萬</SelectItem>
                            <SelectItem value="500 萬～1000 萬">500 萬～1000 萬</SelectItem>
                            <SelectItem value="1000 萬以上">1000 萬以上</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="ai-created-reason">開案原因</Label>
                        <div className="flex gap-2">
                          <Textarea
                            id="ai-created-reason"
                            placeholder="若需求描述已說明可略過"
                            value={aiCreatedReason}
                            onChange={(e) => setAiCreatedReason(e.target.value)}
                            rows={2}
                            className="flex-1 resize-none"
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
                            placeholder="若需求描述已說明可略過"
                            value={aiExpectedBenefits}
                            onChange={(e) => setAiExpectedBenefits(e.target.value)}
                            rows={2}
                            className="flex-1 resize-none"
                          />
                          <VoiceInputButton
                            onTranscript={(text) => setAiExpectedBenefits(prev => prev + (prev ? ' ' : '') + text)}
                            className="shrink-0"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ai-constraints">主要限制與備註</Label>
                      <Textarea
                        id="ai-constraints"
                        placeholder="例如：需在農曆年前完成、團隊只有 3 人、需整合現有 ERP 系統..."
                        value={aiConstraints}
                        onChange={(e) => setAiConstraints(e.target.value)}
                        rows={2}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleAIParse}
                    disabled={aiParsing || !aiProjectTier || !aiDemandSource || !aiProjectType || !requirements.trim()}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {aiParsing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        AI 分析中，請稍候...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        AI 分析需求，進入審核流程
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 1: 基本資訊 */}
            {aiCurrentStep === 1 && (
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
                      <Label htmlFor="ai-budget">投資預算（元）</Label>
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
            {aiCurrentStep === 2 && (
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
                        <Badge variant="outline" className="text-sm">S</Badge>
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
                        <Badge variant="outline" className="text-sm">M</Badge>
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
                        <Badge variant="outline" className="text-sm">A</Badge>
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
                        <Badge variant="outline" className="text-sm">R</Badge>
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
                        <Badge variant="outline" className="text-sm">T</Badge>
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
            {aiCurrentStep === 3 && (
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
                      placeholder="描述量化效益與投資回報率"
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
            {aiCurrentStep === 5 && (
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
                  <p className="text-sm text-muted-foreground">
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
                    onMilestoneDateChange={handleAiMilestoneDateChange}
                    onTaskAdd={(task) => setAiTasks([...aiTasks, task])}
                    onTaskRemove={(id) => setAiTasks(aiTasks.filter(t => t.id !== id))}
                    onTaskUpdate={(id, field, value) => setAiTasks(aiTasks.map(t => t.id === id ? { ...t, [field]: value } : t))}
                    onTaskReorder={(oldIdx, newIdx) => setAiTasks(arrayMove(aiTasks, oldIdx, newIdx))}
                    onTaskDateChange={handleAiTaskDateChange}
                    onItemMove={aiItemMove}
                    onIndent={aiIndent}
                    onOutdent={aiOutdent}
                    onGanttPreview={() => { setGanttPreviewMode('ai'); setGanttPreviewOpen(true) }}
                    storageKey="new-ai"
                  />
                </CardContent>
              </Card>
            )}

            {/* Step 4: 團隊與風險 */}
            {aiCurrentStep === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    團隊與風險
                  </CardTitle>
                  <CardDescription>設定團隊成員並檢視風險</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-base font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      團隊成員
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      請手動加入專案團隊成員，並指定每位成員在此專案中的角色
                    </p>
                    <TeamMemberTable
                      members={aiTeamDetails}
                      roleLabels={TEAM_ROLE_LABELS}
                      onAdd={(m) => setAiTeamDetails([...aiTeamDetails, { ...m, role: m.role as TeamRole }])}
                      onRemove={(id) => setAiTeamDetails(aiTeamDetails.filter(m => m.id !== id))}
                      onUpdate={(id, field, value) => setAiTeamDetails(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))}
                    />
                  </div>

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
            {aiCurrentStep > 0 && (
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
                      disabled={isCreating}
                      className="gap-2"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          建立中...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          建立專案
                        </>
                      )}
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
                      <span className={`text-sm hidden sm:inline ${isCurrent ? 'font-semibold' : 'font-medium'}`}>
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
                      <Label htmlFor="manual-project-tier">
                        專案層別 <span className="text-destructive">*</span>
                      </Label>
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
                      <Label htmlFor="manual-demand-source">
                        需求來源 <span className="text-destructive">*</span>
                      </Label>
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
                          {projectTypes.map(({ key: value, label }) => (
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

                  <div className="grid gap-4 md:grid-cols-2 items-end">
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
                      <div className="flex items-center justify-between min-h-[20px]">
                        <Label htmlFor="budget">投資預算 (NT$)</Label>
                        {aiBudgetTotal != null && (
                          <span className="text-xs text-muted-foreground">由 AI 解析合計帶入</span>
                        )}
                      </div>
                      <Input
                        id="budget"
                        type="number"
                        placeholder="5000000"
                        value={manualData.budget}
                        onChange={(e) => setManualData({ ...manualData, budget: e.target.value })}
                        readOnly={aiBudgetTotal != null}
                        className={aiBudgetTotal != null ? 'bg-muted/60 cursor-not-allowed' : ''}
                      />
                    </div>
                  </div>
                  {hasBudgetMismatch && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      清單合計 NT$ {budgetItemsTotal.toLocaleString('zh-TW')} 與預算 NT$ {aiBudgetTotal!.toLocaleString('zh-TW')} 不符（差 {Math.abs(budgetItemsTotal - aiBudgetTotal!).toLocaleString('zh-TW')}），請修正設備清單後才能繼續
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label>投資設備清單（選填）</Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      有設備清單時，預算由 AI 解析的合計金額帶入
                    </p>
                    <BudgetListEditor
                      items={manualBudgetItems}
                      onChange={setManualBudgetItems}
                      onAITotal={handleAITotal}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="created-reason" className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-slate-500" />
                      開案原因 <span className="text-destructive">*</span>
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
                          <Badge variant="outline" className="text-sm">S</Badge>
                          具體目標 (Specific) <span className="text-destructive">*</span>
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
                          <Badge variant="outline" className="text-sm">M</Badge>
                          可衡量指標 (Measurable) <span className="text-destructive">*</span>
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
                          <Badge variant="outline" className="text-sm">A</Badge>
                          可達成性 (Achievable) <span className="text-destructive">*</span>
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
                          <Badge variant="outline" className="text-sm">R</Badge>
                          相關性 (Relevant) <span className="text-destructive">*</span>
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
                          <Badge variant="outline" className="text-sm">T</Badge>
                          時限性 (Time-bound) <span className="text-destructive">*</span>
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
                    <Label htmlFor="purpose">
                      專案目的 <span className="text-destructive">*</span>
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
                        已根據「{projectTypes.find(t => t.key === manualProjectType)?.label ?? manualProjectType}」自動帶入 {manualMilestones.length} 個里程碑範本。
                        可直接在表格中編輯名稱、期程，或在每個里程碑下方快速新增任務。
                      </AlertDescription>
                    </Alert>
                  )}

                  <p className="text-sm text-muted-foreground">
                    拖動左側圖標可改變順序。輸入天數後系統自動計算日期。專案結束日期會根據里程碑自動調整。
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
                    onMilestoneDateChange={handleManualMilestoneDateChange}
                    onTaskAdd={(task) => setManualTasks([...manualTasks, task])}
                    onTaskRemove={(id) => setManualTasks(manualTasks.filter(t => t.id !== id))}
                    onTaskUpdate={(id, field, value) => setManualTasks(manualTasks.map(t => t.id === id ? { ...t, [field]: value } : t))}
                    onTaskReorder={(oldIdx, newIdx) => setManualTasks(arrayMove(manualTasks, oldIdx, newIdx))}
                    onTaskDateChange={handleManualTaskDateChange}
                    onItemMove={manualItemMove}
                    onIndent={manualIndent}
                    onOutdent={manualOutdent}
                    onGanttPreview={() => { setGanttPreviewMode('manual'); setGanttPreviewOpen(true) }}
                    storageKey="new-manual"
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
                  <div className="space-y-2">
                    <Label className="text-base font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      團隊成員 <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      組建專案團隊，輸入姓名按 Enter 即可新增{manualTeamDetails.length === 0 && (
                        <span className="text-destructive">（至少需要一位成員）</span>
                      )}
                    </p>
                    <TeamMemberTable
                      members={manualTeamDetails}
                      roleLabels={TEAM_ROLE_LABELS}
                      onAdd={(m) => setManualTeamDetails([...manualTeamDetails, { ...m, role: m.role as TeamRole }])}
                      onRemove={(id) => setManualTeamDetails(manualTeamDetails.filter(m => m.id !== id))}
                      onUpdate={(id, field, value) => setManualTeamDetails(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m))}
                    />
                  </div>

                  <Separator />

                  {/* Risks Section */}
                  <div className="space-y-3">
                    <Label className="text-base font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      風險識別
                      {manualRisks.length > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">共 {manualRisks.length} 項</span>
                      )}
                    </Label>
                    <p className="text-sm text-muted-foreground -mt-1">
                      預先識別專案可能面臨的風險，評估影響程度和發生機率
                    </p>

                    {/* Risk list + inline add form */}
                    <div className="rounded-lg border bg-card overflow-hidden">
                      {manualRisks.map((risk, index) => {
                        const severity = getRiskSeverity(risk.impact, risk.probability)
                        const impactC = RISK_LEVEL_COLORS[risk.impact] || RISK_LEVEL_COLORS.medium
                        const probC = RISK_LEVEL_COLORS[risk.probability] || RISK_LEVEL_COLORS.medium

                        if (editingRiskIndex === index) {
                          // ─── Inline edit mode ───
                          return (
                            <RiskInlineForm
                              key={index}
                              severity={severity}
                              initial={risk}
                              onConfirm={(data) => updateRisk(index, data)}
                              onCancel={() => setEditingRiskIndex(null)}
                              onRemove={() => removeRisk(index)}
                            />
                          )
                        }

                        // ─── Compact view mode ───
                        return (
                          <div
                            key={index}
                            className={`${index > 0 ? 'border-t' : ''} border-l-[3px] ${RISK_SEVERITY_BORDER[severity]} px-3 py-2 hover:bg-muted/30 transition-colors space-y-1`}
                          >
                            <div className="flex items-center gap-2">
                              <ShieldAlert className={`h-3.5 w-3.5 shrink-0 ${
                                severity === 'high' ? 'text-red-500' : severity === 'medium' ? 'text-amber-500' : 'text-emerald-500'
                              }`} />
                              <span className="font-medium text-sm truncate">{risk.title}</span>
                              <div className="flex items-center gap-1 ml-auto shrink-0">
                                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${impactC.bg} ${impactC.text}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${impactC.dot}`} />影響{RISK_IMPACT_LABELS[risk.impact]}
                                </span>
                                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${probC.bg} ${probC.text}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${probC.dot}`} />機率{RISK_PROBABILITY_LABELS[risk.probability]}
                                </span>
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => { setEditingRiskIndex(index); setShowRiskAddForm(false) }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeRisk(index)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {(risk.description || risk.mitigation) && (
                              <div className="pl-[1.375rem] text-sm text-muted-foreground leading-relaxed line-clamp-1">
                                {risk.description && <span>{risk.description}</span>}
                                {risk.description && risk.mitigation && <span className="mx-1.5 text-border">|</span>}
                                {risk.mitigation && <span><span className="font-medium text-foreground/70">對策：</span>{risk.mitigation}</span>}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Inline add form */}
                      {showRiskAddForm ? (
                        <RiskInlineForm
                          severity="medium"
                          onConfirm={(data) => addRisk(data as ManualRisk)}
                          onCancel={() => setShowRiskAddForm(false)}
                        />
                      ) : manualRisks.length === 0 ? (
                        <div
                          className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setShowRiskAddForm(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          點擊新增風險項目
                        </div>
                      ) : (
                        <div
                          className="border-t px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground/60 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => { setShowRiskAddForm(true); setEditingRiskIndex(null) }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>新增風險...</span>
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
                      !manualProjectTier ||
                      !manualDemandSource ||
                      !manualData.name ||
                      !manualData.createdReason.trim() ||
                      !smartObjective.specific.trim() ||
                      !smartObjective.measurable.trim() ||
                      !smartObjective.achievable.trim() ||
                      !smartObjective.relevant.trim() ||
                      !smartObjective.timeBound.trim() ||
                      !manualData.purpose.trim() ||
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
      {/* Gantt Preview Dialog */}
      <Dialog open={ganttPreviewOpen} onOpenChange={setGanttPreviewOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              甘特圖預覽
            </DialogTitle>
            <DialogDescription>
              根據目前編輯中的里程碑與任務產生的甘特圖預覽。
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {ganttPreviewOpen && (() => {
              const isAi = ganttPreviewMode === 'ai'
              const milestones = isAi ? recalculatedAiMilestones : recalculatedMilestones
              const tasks = isAi ? aiTasks : manualTasks
              const taskDatesMap = isAi ? aiTaskDates : manualTaskDates
              const startDate = isAi ? aiEditableData.startDate : manualData.startDate

              const lastMs = [...milestones].reverse().find(m => m.endDate)
              const endDate = lastMs?.endDate || (isAi ? aiEditableData.endDate : manualData.endDate) || startDate

              const previewMilestones = milestones.map(m => ({
                id: m.id, name: m.name,
                startDate: m.startDate || undefined,
                dueDate: m.endDate || '',
                status: 'todo' as const, progress: 0,
              }))
              const previewTasks = tasks.map(t => {
                const dates = taskDatesMap.get(t.id)
                return {
                  id: t.id, projectId: '', milestoneId: t.milestoneId,
                  title: t.title, description: '', assignee: t.assignee || '',
                  status: 'todo' as const, priority: t.priority,
                  durationDays: t.durationDays,
                  startDate: dates?.startDate || '', endDate: dates?.endDate || '',
                  dependencies: [] as string[], progress: 0,
                  parentId: t.parentId || null,
                }
              })
              return (
                <GanttChart
                  milestones={previewMilestones}
                  tasks={previewTasks}
                  startDate={startDate}
                  endDate={endDate}
                />
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
