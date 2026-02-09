'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  Hash,
} from 'lucide-react'

interface ManualMilestone {
  name: string
  dueDate: string
}

export default function NewProjectPage() {
  const router = useRouter()
  const { addProject } = useProjectStore()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('ai')

  // AI Mode
  const [requirements, setRequirements] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedProjectData | null>(null)
  const [aiProjectType, setAiProjectType] = useState<ProjectType>('other')
  const [aiCreatedReason, setAiCreatedReason] = useState('')

  // Manual Mode
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
  })
  const [manualProjectType, setManualProjectType] = useState<ProjectType>('other')
  const [manualMilestones, setManualMilestones] = useState<ManualMilestone[]>([
    { name: '', dueDate: '' },
  ])

  // Project code preview
  const [previewCode, setPreviewCode] = useState<string>('')

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

  // Milestone helpers
  const addMilestone = () => {
    setManualMilestones([...manualMilestones, { name: '', dueDate: '' }])
  }

  const removeMilestone = (index: number) => {
    if (manualMilestones.length <= 1) return
    setManualMilestones(manualMilestones.filter((_, i) => i !== index))
  }

  const updateMilestone = (index: number, field: keyof ManualMilestone, value: string) => {
    setManualMilestones(
      manualMilestones.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    )
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

    const newProject = addProject({
      projectType: aiProjectType,
      name: parsedData.name,
      objective: parsedData.objective,
      purpose: parsedData.purpose,
      scope: parsedData.scope,
      roi: parsedData.roi,
      createdReason: aiCreatedReason || parsedData.purpose,
      startDate: parsedData.startDate,
      endDate: parsedData.endDate,
      budget: parsedData.estimatedBudget,
      owner: ownerName,
      team: [ownerName],
      milestones,
    })

    router.push(`/projects/${newProject.id}`)
  }

  const handleManualCreate = () => {
    const ownerName = user?.name || 'Unknown'

    const validMilestones = manualMilestones
      .filter((m) => m.name.trim() && m.dueDate)
      .map((m, index) => ({
        id: `ms-new-${index}`,
        name: m.name,
        dueDate: m.dueDate,
      }))

    const newProject = addProject({
      projectType: manualProjectType,
      name: manualData.name,
      objective: manualData.objective,
      purpose: manualData.purpose,
      scope: manualData.scope,
      roi: manualData.roi,
      createdReason: manualData.createdReason,
      startDate: manualData.startDate,
      endDate: manualData.endDate,
      budget: Number(manualData.budget) || 0,
      owner: ownerName,
      team: [ownerName],
      milestones: validMilestones,
    })

    router.push(`/projects/${newProject.id}`)
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">建立新專案</h1>
          <p className="text-muted-foreground mt-1">
            使用 AI 快速產生專案規劃，或手動輸入專案資訊
          </p>
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
                    <Label htmlFor="ai-project-type">專案類型 *</Label>
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
                    <Label className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5" />
                      專案代碼預覽
                    </Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-mono text-muted-foreground">
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

          {/* Manual Mode */}
          <TabsContent value="manual" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>手動輸入專案資訊</CardTitle>
                <CardDescription>填寫以下欄位來建立新專案</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="manual-project-type">專案類型 *</Label>
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
                    <Label className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5" />
                      專案代碼預覽
                    </Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-mono text-muted-foreground">
                      {previewCode || '選擇類型後自動產生'}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">專案名稱 *</Label>
                    <Input
                      id="name"
                      placeholder="輸入專案名稱"
                      value={manualData.name}
                      onChange={(e) => setManualData({ ...manualData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget">預算 (NT$)</Label>
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
                  <Label htmlFor="objective">專案目標 *</Label>
                  <Textarea
                    id="objective"
                    placeholder="描述專案的主要目標"
                    value={manualData.objective}
                    onChange={(e) => setManualData({ ...manualData, objective: e.target.value })}
                    rows={3}
                  />
                </div>

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
                  <Label htmlFor="created-reason">開案原因</Label>
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

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">開始日期 *</Label>
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
                    <Label htmlFor="endDate">結束日期 *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={manualData.endDate}
                      onChange={(e) => setManualData({ ...manualData, endDate: e.target.value })}
                    />
                  </div>
                </div>

                {/* Milestones Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">里程碑</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addMilestone} className="gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      新增里程碑
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {manualMilestones.map((milestone, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium mt-1">
                          {index + 1}
                        </div>
                        <div className="flex-1 grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">里程碑名稱</Label>
                            <Input
                              placeholder="例如：需求分析完成"
                              value={milestone.name}
                              onChange={(e) => updateMilestone(index, 'name', e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">到期日</Label>
                            <Input
                              type="date"
                              value={milestone.dueDate}
                              onChange={(e) => updateMilestone(index, 'dueDate', e.target.value)}
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 mt-1 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMilestone(index)}
                          disabled={manualMilestones.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleManualCreate}
                    disabled={
                      !manualData.name ||
                      !manualData.objective ||
                      !manualData.startDate ||
                      !manualData.endDate
                    }
                    size="lg"
                    className="flex-1"
                  >
                    建立專案
                  </Button>
                  <Button onClick={() => router.push('/projects')} variant="outline" size="lg">
                    取消
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
