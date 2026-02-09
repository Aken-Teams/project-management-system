'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import {
  ArrowLeft,
  Mic,
  MicOff,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
} from 'lucide-react'
import Link from 'next/link'

interface UpdatePageProps {
  params: Promise<{ id: string }>
}

function getMondayOfCurrentWeek(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  return monday.toISOString().split('T')[0]
}

export default function WeeklyUpdatePage({ params }: UpdatePageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { getProject, addWeeklyUpdate, submitDelayRequest } = useProjectStore()
  const { user } = useAuth()
  const project = getProject(id)

  const [weekOf, setWeekOf] = useState(getMondayOfCurrentWeek())
  const [milestoneUpdates, setMilestoneUpdates] = useState<
    Record<string, { progress: number; notes: string }>
  >(() => {
    if (!project) return {}
    const initial: Record<string, { progress: number; notes: string }> = {}
    project.milestones.forEach((m) => {
      initial[m.id] = { progress: m.progress, notes: '' }
    })
    return initial
  })

  const [overallStatus, setOverallStatus] = useState<'on-time' | 'delay'>('on-time')
  const [canCatchUp, setCanCatchUp] = useState<'yes' | 'no'>('yes')
  const [delayReason, setDelayReason] = useState('')
  const [proposedDates, setProposedDates] = useState<Record<string, string>>(() => {
    if (!project) return {}
    const initial: Record<string, string> = {}
    project.milestones.forEach((m) => {
      initial[m.id] = m.dueDate
    })
    return initial
  })
  const [supportNeeded, setSupportNeeded] = useState('')

  const [overallNotes, setOverallNotes] = useState('')
  const [blockers, setBlockers] = useState('')
  const [keyAchievements, setKeyAchievements] = useState('')
  const [nextWeekPlan, setNextWeekPlan] = useState('')

  const [isListening, setIsListening] = useState(false)
  const [activeField, setActiveField] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const startVoiceInput = (fieldSetter: (val: string) => void, currentVal: string, fieldName: string) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('您的瀏覽器不支援語音輸入')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-TW'
    recognition.continuous = false
    recognition.interimResults = false
    setIsListening(true)
    setActiveField(fieldName)
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      fieldSetter(currentVal ? currentVal + ' ' + transcript : transcript)
    }
    recognition.onend = () => {
      setIsListening(false)
      setActiveField(null)
    }
    recognition.onerror = () => {
      setIsListening(false)
      setActiveField(null)
    }
    recognition.start()
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-2xl font-bold mb-2">找不到專案</h2>
          <p className="text-muted-foreground mb-4">此專案不存在或已被刪除</p>
          <Button onClick={() => router.push('/projects')}>返回專案列表</Button>
        </div>
      </DashboardLayout>
    )
  }

  const handleSubmit = () => {
    if (!user) {
      alert('請先登入')
      return
    }

    setIsSubmitting(true)

    try {
      const milestoneUpdateArray = Object.entries(milestoneUpdates).map(
        ([milestoneId, data]) => ({
          milestoneId,
          progress: data.progress,
          notes: data.notes,
        })
      )

      addWeeklyUpdate(id, {
        weekOf,
        updatedBy: user.name,
        updatedAt: new Date().toISOString(),
        milestoneUpdates: milestoneUpdateArray,
        overallStatus,
        overallNotes,
        blockers,
        nextWeekPlan,
        keyAchievements,
      })

      if (overallStatus === 'delay' && canCatchUp === 'no') {
        const affectedMilestones = Object.entries(proposedDates)
          .filter(([msId, proposedDate]) => {
            const milestone = project.milestones.find((m) => m.id === msId)
            return milestone && proposedDate !== milestone.dueDate
          })
          .map(([msId, proposedDate]) => {
            const milestone = project.milestones.find((m) => m.id === msId)!
            return {
              milestoneId: msId,
              originalDate: milestone.dueDate,
              proposedDate,
            }
          })

        if (affectedMilestones.length > 0) {
          submitDelayRequest(id, {
            requestedBy: user.name,
            requestedAt: new Date().toISOString(),
            reason: delayReason,
            affectedMilestones,
            canCatchUp: false,
            supportNeeded,
          })
        }
      }

      router.push(`/projects/${id}`)
    } catch (error) {
      console.error('Failed to submit weekly update:', error)
      alert('提交失敗，請稍後再試')
    } finally {
      setIsSubmitting(false)
    }
  }

  const VoiceButton = ({
    fieldName,
    fieldSetter,
    currentVal,
  }: {
    fieldName: string
    fieldSetter: (val: string) => void
    currentVal: string
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 h-8 text-xs"
      onClick={() => startVoiceInput(fieldSetter, currentVal, fieldName)}
      disabled={isListening && activeField !== fieldName}
    >
      {isListening && activeField === fieldName ? (
        <>
          <MicOff className="h-3.5 w-3.5 text-destructive" />
          錄音中...
        </>
      ) : (
        <>
          <Mic className="h-3.5 w-3.5" />
          語音輸入
        </>
      )}
    </Button>
  )

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link href={`/projects/${id}`}>
            <Button variant="ghost" size="sm" className="gap-2 mb-4">
              <ArrowLeft className="h-4 w-4" />
              返回專案詳情
            </Button>
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold tracking-tight">每週進度更新</h1>
              <p className="text-muted-foreground mt-1">
                {project.name} - 週報填寫
              </p>
            </div>
            <Badge variant="outline" className="gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(weekOf).toLocaleDateString('zh-TW')}
            </Badge>
          </div>
        </div>

        {/* Week Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              選擇週次
            </CardTitle>
            <CardDescription>選擇本次更新對應的週次（預設為本週一）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="weekOf">週次起始日（週一）</Label>
              <Input
                id="weekOf"
                type="date"
                value={weekOf}
                onChange={(e) => setWeekOf(e.target.value)}
                className="max-w-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Milestone Progress Cards */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              里程碑進度更新
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              請更新每個里程碑的整體完成度。里程碑進度的平均值 = 專案整體完成度。
            </p>
          </div>

          {project.milestones.map((milestone, index) => {
            const msUpdate = milestoneUpdates[milestone.id] || {
              progress: milestone.progress,
              notes: '',
            }
            const baselineMilestone = project.baseline.find(
              (b) => b.id === milestone.id
            )

            return (
              <Card key={milestone.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <CardTitle className="text-base">{milestone.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          基準到期日：
                          {new Date(
                            baselineMilestone?.dueDate || milestone.dueDate
                          ).toLocaleDateString('zh-TW')}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={
                        milestone.status === 'done'
                          ? 'default'
                          : milestone.status === 'blocked'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {milestone.status === 'done'
                        ? '已完成'
                        : milestone.status === 'in-progress'
                          ? '進行中'
                          : milestone.status === 'blocked'
                            ? '受阻'
                            : '待辦'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Tasks under this milestone (read-only) */}
                  {(() => {
                    const milestoneTasks = project.tasks.filter(t => t.milestoneId === milestone.id)
                    if (milestoneTasks.length === 0) return null
                    return (
                      <div className="p-3 rounded-lg bg-muted/50 border">
                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3" />
                          此里程碑的任務 ({milestoneTasks.filter(t => t.status === 'done').length}/{milestoneTasks.length} 已完成)
                        </div>
                        <div className="space-y-1">
                          {milestoneTasks.map(task => (
                            <div key={task.id} className="flex items-center gap-2 text-xs">
                              <Badge variant={task.status === 'done' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 shrink-0">
                                {task.status === 'done' ? '完成' : task.status === 'in-progress' ? '進行中' : task.status === 'blocked' ? '受阻' : '待辦'}
                              </Badge>
                              <span className={task.status === 'done' ? 'line-through text-muted-foreground' : ''}>
                                {task.title}
                              </span>
                              <span className="text-muted-foreground ml-auto shrink-0">{task.assignee}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Progress Slider */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>目前進度</Label>
                      <span className="text-sm font-semibold text-primary">
                        {msUpdate.progress}%
                      </span>
                    </div>
                    <Slider
                      value={[msUpdate.progress]}
                      onValueChange={(value: number[]) => {
                        setMilestoneUpdates((prev) => ({
                          ...prev,
                          [milestone.id]: { ...prev[milestone.id], progress: value[0] },
                        }))
                      }}
                      max={100}
                      min={0}
                      step={5}
                      className="w-full"
                    />
                    <Progress value={msUpdate.progress} className="h-1.5" />
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`notes-${milestone.id}`}>本週說明</Label>
                      <VoiceButton
                        fieldName={`milestone-${milestone.id}`}
                        fieldSetter={(val) =>
                          setMilestoneUpdates((prev) => ({
                            ...prev,
                            [milestone.id]: { ...prev[milestone.id], notes: val },
                          }))
                        }
                        currentVal={msUpdate.notes}
                      />
                    </div>
                    <Textarea
                      id={`notes-${milestone.id}`}
                      placeholder="說明本週此里程碑的進展..."
                      value={msUpdate.notes}
                      onChange={(e) =>
                        setMilestoneUpdates((prev) => ({
                          ...prev,
                          [milestone.id]: {
                            ...prev[milestone.id],
                            notes: e.target.value,
                          },
                        }))
                      }
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Overall Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">整體進度狀態</CardTitle>
            <CardDescription>請評估本週的整體專案進度狀態</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={overallStatus}
              onValueChange={(value: string) =>
                setOverallStatus(value as 'on-time' | 'delay')
              }
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="on-time" id="on-time" />
                <Label htmlFor="on-time" className="flex items-center gap-1.5 cursor-pointer">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  On Time (準時)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="delay" id="delay" />
                <Label htmlFor="delay" className="flex items-center gap-1.5 cursor-pointer">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Delay (延遲)
                </Label>
              </div>
            </RadioGroup>

            {/* Delay Section */}
            {overallStatus === 'delay' && (
              <div className="space-y-6 border-t pt-6">
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-semibold">延遲處理</h3>
                </div>

                {/* Can catch up? */}
                <div className="space-y-3">
                  <Label className="font-medium">是否能自行追回進度？</Label>
                  <RadioGroup
                    value={canCatchUp}
                    onValueChange={(value: string) =>
                      setCanCatchUp(value as 'yes' | 'no')
                    }
                    className="flex gap-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="catch-up-yes" />
                      <Label htmlFor="catch-up-yes" className="cursor-pointer">
                        是，可以追回
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="catch-up-no" />
                      <Label htmlFor="catch-up-no" className="cursor-pointer">
                        否，需要調整時程
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Delay Request Section */}
                {canCatchUp === 'no' && (
                  <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <h4 className="font-semibold text-sm">延遲申請 (Delay Request)</h4>
                    </div>

                    {/* Delay Reason */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="delayReason">延遲原因 *</Label>
                        <VoiceButton
                          fieldName="delayReason"
                          fieldSetter={setDelayReason}
                          currentVal={delayReason}
                        />
                      </div>
                      <Textarea
                        id="delayReason"
                        placeholder="請詳細說明延遲的原因..."
                        value={delayReason}
                        onChange={(e) => setDelayReason(e.target.value)}
                        rows={3}
                        className="border-destructive/30"
                      />
                    </div>

                    {/* Proposed New Dates */}
                    <div className="space-y-3">
                      <Label className="font-medium">調整後的里程碑日期</Label>
                      <div className="space-y-2">
                        {project.milestones.map((milestone) => (
                          <div
                            key={milestone.id}
                            className="flex items-center gap-3 p-3 rounded-lg border bg-background"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {milestone.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                原定：
                                {new Date(milestone.dueDate).toLocaleDateString(
                                  'zh-TW'
                                )}
                              </p>
                            </div>
                            <div className="shrink-0">
                              <Input
                                type="date"
                                value={proposedDates[milestone.id] || milestone.dueDate}
                                onChange={(e) =>
                                  setProposedDates((prev) => ({
                                    ...prev,
                                    [milestone.id]: e.target.value,
                                  }))
                                }
                                className="w-40"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Support Needed */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="supportNeeded">需要的支援</Label>
                        <VoiceButton
                          fieldName="supportNeeded"
                          fieldSetter={setSupportNeeded}
                          currentVal={supportNeeded}
                        />
                      </div>
                      <Textarea
                        id="supportNeeded"
                        placeholder="需要什麼協助來解決目前的問題？"
                        value={supportNeeded}
                        onChange={(e) => setSupportNeeded(e.target.value)}
                        rows={2}
                        className="border-destructive/30"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overall Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">週報內容</CardTitle>
            <CardDescription>填寫本週的整體狀況與計畫</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Overall Notes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="overallNotes">本週整體說明</Label>
                <VoiceButton
                  fieldName="overallNotes"
                  fieldSetter={setOverallNotes}
                  currentVal={overallNotes}
                />
              </div>
              <Textarea
                id="overallNotes"
                placeholder="總結本週的專案整體進展..."
                value={overallNotes}
                onChange={(e) => setOverallNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Blockers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="blockers">遇到的阻礙</Label>
                <VoiceButton
                  fieldName="blockers"
                  fieldSetter={setBlockers}
                  currentVal={blockers}
                />
              </div>
              <Textarea
                id="blockers"
                placeholder="目前遇到的阻礙或需要解決的問題..."
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                rows={2}
              />
            </div>

            {/* Key Achievements */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="keyAchievements">本週重大成果</Label>
                <VoiceButton
                  fieldName="keyAchievements"
                  fieldSetter={setKeyAchievements}
                  currentVal={keyAchievements}
                />
              </div>
              <Textarea
                id="keyAchievements"
                placeholder="本週達成的重要成果或里程碑..."
                value={keyAchievements}
                onChange={(e) => setKeyAchievements(e.target.value)}
                rows={2}
              />
            </div>

            {/* Next Week Plan */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="nextWeekPlan">下週計畫</Label>
                <VoiceButton
                  fieldName="nextWeekPlan"
                  fieldSetter={setNextWeekPlan}
                  currentVal={nextWeekPlan}
                />
              </div>
              <Textarea
                id="nextWeekPlan"
                placeholder="下週預計執行的工作與目標..."
                value={nextWeekPlan}
                onChange={(e) => setNextWeekPlan(e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Section */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                <p>
                  提交者：{user?.name || '未登入'} | 專案：{project.name}
                </p>
                {overallStatus === 'delay' && canCatchUp === 'no' && (
                  <p className="text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    本次更新將同時提交延遲申請，需要主管審核
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Link href={`/projects/${id}`}>
                  <Button variant="outline">取消</Button>
                </Link>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting ||
                    !user ||
                    (overallStatus === 'delay' &&
                      canCatchUp === 'no' &&
                      !delayReason.trim())
                  }
                  className="gap-2"
                  size="lg"
                >
                  {isSubmitting ? (
                    '提交中...'
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      提交週報
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
