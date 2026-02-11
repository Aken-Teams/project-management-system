'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Settings2, FileText, Target } from 'lucide-react'
import {
  type Project,
  type ProjectType,
  type ProjectTier,
  type DemandSource,
  type SmartObjective,
  PROJECT_TYPE_LABELS,
  PROJECT_TIER_LABELS,
  DEMAND_SOURCE_LABELS,
} from '@/lib/mock-data'

interface ProjectEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  onSave: (data: ProjectEditData) => Promise<void>
}

export interface ProjectEditData {
  name: string
  projectType: ProjectType
  projectTier?: ProjectTier | null
  demandSource?: DemandSource | null
  objective: string
  purpose: string
  scope: string
  roi: string
  createdReason: string
  expectedBenefits?: string
  budget: number
  smartObjective?: SmartObjective
}

const EMPTY_SMART: SmartObjective = {
  specific: '',
  measurable: '',
  achievable: '',
  relevant: '',
  timeBound: '',
}

export function ProjectEditDialog({ open, onOpenChange, project, onSave }: ProjectEditDialogProps) {
  const [form, setForm] = useState<ProjectEditData>({
    name: project.name,
    projectType: project.projectType,
    projectTier: project.projectTier ?? null,
    demandSource: project.demandSource ?? null,
    objective: project.objective,
    purpose: project.purpose,
    scope: project.scope,
    roi: project.roi,
    createdReason: project.createdReason,
    expectedBenefits: project.expectedBenefits ?? '',
    budget: project.budget,
    smartObjective: project.smartObjective ?? { ...EMPTY_SMART },
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('basic')

  const handleSave = async () => {
    // Validation matching the creation form
    if (!form.name.trim()) {
      setError('專案名稱不可為空')
      setActiveTab('basic')
      return
    }
    if (!form.purpose.trim()) {
      setError('專案目的不可為空')
      setActiveTab('description')
      return
    }
    if (!form.smartObjective?.specific?.trim()) {
      setError('SMART 目標中「具體目標」不可為空')
      setActiveTab('smart')
      return
    }

    setError('')
    setSaving(true)
    try {
      // Auto-generate objective from SMART (matching creation form logic)
      const smart = form.smartObjective
      const autoObjective = smart?.specific
        ? `${smart.specific}${smart.measurable ? '，' + smart.measurable : ''}`
        : form.objective
      await onSave({ ...form, objective: autoObjective })
      onOpenChange(false)
    } catch {
      setError('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const update = <K extends keyof ProjectEditData>(key: K, value: ProjectEditData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const updateSmart = (key: keyof SmartObjective, value: string) => {
    setForm(prev => ({
      ...prev,
      smartObjective: { ...(prev.smartObjective ?? EMPTY_SMART), [key]: value },
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>編輯專案</DialogTitle>
          <DialogDescription>
            修改專案資訊。專案編號（{project.projectCode}）及日期範圍由里程碑決定，無法在此變更。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="shrink-0 w-full grid grid-cols-3">
            <TabsTrigger value="basic" className="gap-1.5 text-sm">
              <Settings2 className="h-3.5 w-3.5" />
              基本資訊
            </TabsTrigger>
            <TabsTrigger value="smart" className="gap-1.5 text-sm">
              <Target className="h-3.5 w-3.5" />
              SMART 目標
            </TabsTrigger>
            <TabsTrigger value="description" className="gap-1.5 text-sm">
              <FileText className="h-3.5 w-3.5" />
              專案說明
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Basic Info */}
          <TabsContent value="basic" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4 pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">
                專案名稱 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={e => update('name', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>
                  專案類型 <span className="text-destructive">*</span>
                </Label>
                <Select value={form.projectType} onValueChange={v => update('projectType', v as ProjectType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>專案層級</Label>
                <Select value={form.projectTier ?? '__none__'} onValueChange={v => update('projectTier', v === '__none__' ? null : v as ProjectTier)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未設定</SelectItem>
                    {(Object.entries(PROJECT_TIER_LABELS) as [ProjectTier, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>需求來源</Label>
                <Select value={form.demandSource ?? '__none__'} onValueChange={v => update('demandSource', v === '__none__' ? null : v as DemandSource)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未設定</SelectItem>
                    {(Object.entries(DEMAND_SOURCE_LABELS) as [DemandSource, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-budget">預算 (NTD)</Label>
              <Input
                id="edit-budget"
                type="number"
                value={form.budget}
                onChange={e => update('budget', Number(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-reason">開案原因</Label>
              <Textarea
                id="edit-reason"
                value={form.createdReason}
                onChange={e => update('createdReason', e.target.value)}
                rows={2}
              />
            </div>

            <div className="rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              專案期間：{project.startDate} ~ {project.endDate}（由里程碑日期自動決定）
            </div>
          </TabsContent>

          {/* Tab 3: Description */}
          <TabsContent value="description" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4 pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-purpose">
                專案目的 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-purpose"
                value={form.purpose}
                onChange={e => update('purpose', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-scope">專案範圍</Label>
              <Textarea
                id="edit-scope"
                value={form.scope}
                onChange={e => update('scope', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-roi">投資報酬 (ROI)</Label>
              <Textarea
                id="edit-roi"
                value={form.roi}
                onChange={e => update('roi', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-benefits">預期效益</Label>
              <Textarea
                id="edit-benefits"
                value={form.expectedBenefits ?? ''}
                onChange={e => update('expectedBenefits', e.target.value)}
                rows={2}
              />
            </div>
          </TabsContent>

          {/* Tab 3: SMART Objective */}
          <TabsContent value="smart" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4 pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-s">
                Specific — 具體目標 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-smart-s"
                placeholder="明確描述要達成什麼具體成果"
                value={form.smartObjective?.specific ?? ''}
                onChange={e => updateSmart('specific', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-m">Measurable — 可衡量指標</Label>
              <Textarea
                id="edit-smart-m"
                placeholder="如何量化衡量目標是否達成"
                value={form.smartObjective?.measurable ?? ''}
                onChange={e => updateSmart('measurable', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-a">Achievable — 可達成性</Label>
              <Textarea
                id="edit-smart-a"
                placeholder="目標是否在資源與時間限制下可行"
                value={form.smartObjective?.achievable ?? ''}
                onChange={e => updateSmart('achievable', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-r">Relevant — 相關性</Label>
              <Textarea
                id="edit-smart-r"
                placeholder="目標與組織策略或業務需求的關聯"
                value={form.smartObjective?.relevant ?? ''}
                onChange={e => updateSmart('relevant', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-t">Time-bound — 時限性</Label>
              <Textarea
                id="edit-smart-t"
                placeholder="預計在何時完成目標"
                value={form.smartObjective?.timeBound ?? ''}
                onChange={e => updateSmart('timeBound', e.target.value)}
                rows={2}
              />
            </div>

          </TabsContent>
        </Tabs>

        {error && (
          <p className="text-sm text-destructive shrink-0">{error}</p>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            儲存變更
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
