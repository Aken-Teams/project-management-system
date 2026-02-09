'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useAuth } from '@/lib/auth-context'
import { useProjectStore } from '@/lib/project-store'
import { PROJECT_TYPE_LABELS, type DelayRequest, type Project } from '@/lib/mock-data'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  AlertTriangle,
  User,
  FileText,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ApprovalItem = { project: Project; request: DelayRequest }

export default function ApprovalsPage() {
  const { user } = useAuth()
  const { projects, getPendingApprovals, approveDelayRequest, rejectDelayRequest } = useProjectStore()

  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)
  const [showReviewForm, setShowReviewForm] = useState(false)

  const pendingApprovals = getPendingApprovals()

  const recentlyReviewed = projects
    .flatMap(p =>
      p.delayRequests
        .filter(r => r.status === 'approved' || r.status === 'rejected')
        .map(r => ({ project: p, request: r }))
    )
    .sort((a, b) => new Date(b.request.reviewedAt || '').getTime() - new Date(a.request.reviewedAt || '').getTime())
    .slice(0, 10)

  const getMilestoneName = (projectId: string, milestoneId: string): string => {
    const project = projects.find(p => p.id === projectId)
    if (!project) return milestoneId
    const milestone = project.milestones.find(m => m.id === milestoneId)
    return milestone?.name || milestoneId
  }

  const calculateDelayDays = (originalDate: string, proposedDate: string): number => {
    const original = new Date(originalDate)
    const proposed = new Date(proposedDate)
    return Math.ceil((proposed.getTime() - original.getTime()) / (1000 * 60 * 60 * 24))
  }

  const getMaxDelayDays = (request: DelayRequest): number => {
    return Math.max(...request.affectedMilestones.map(am => calculateDelayDays(am.originalDate, am.proposedDate)), 0)
  }

  const openDetail = (item: ApprovalItem) => {
    setSelectedItem(item)
    setSheetOpen(true)
    setShowReviewForm(false)
    setReviewAction(null)
    setReviewNotes('')
  }

  const handleStartReview = (action: 'approve' | 'reject') => {
    setReviewAction(action)
    setShowReviewForm(true)
    setReviewNotes('')
  }

  const handleConfirmReview = () => {
    if (!user || !reviewAction || !selectedItem) return

    if (reviewAction === 'approve') {
      approveDelayRequest(selectedItem.project.id, selectedItem.request.id, user.name, reviewNotes)
    } else {
      rejectDelayRequest(selectedItem.project.id, selectedItem.request.id, user.name, reviewNotes)
    }

    setSheetOpen(false)
    setSelectedItem(null)
    setShowReviewForm(false)
    setReviewAction(null)
    setReviewNotes('')
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('zh-TW')

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">審批中心</h1>
            <p className="text-sm text-muted-foreground mt-0.5">審核專案延遲申請</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={pendingApprovals.length > 0 ? 'destructive' : 'secondary'} className="text-xs px-2.5 py-1">
              <Clock className="h-3 w-3 mr-1" />
              {pendingApprovals.length} 件待審核
            </Badge>
            {recentlyReviewed.length > 0 && (
              <Badge variant="outline" className="text-xs px-2.5 py-1">
                {recentlyReviewed.length} 件已審核
              </Badge>
            )}
          </div>
        </div>

        {/* Pending Approvals Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              待審核申請
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingApprovals.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-400" />
                <p className="text-sm">沒有待審核的申請</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">專案</th>
                      <th className="text-left px-4 py-2.5 font-medium">申請人</th>
                      <th className="text-left px-4 py-2.5 font-medium">申請時間</th>
                      <th className="text-center px-4 py-2.5 font-medium">影響里程碑</th>
                      <th className="text-center px-4 py-2.5 font-medium">最大延遲</th>
                      <th className="text-right px-4 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingApprovals.map(({ project, request }, i) => {
                      const maxDays = getMaxDelayDays(request)
                      return (
                        <tr
                          key={request.id}
                          className={cn(
                            'cursor-pointer hover:bg-muted/50 transition-colors',
                            i % 2 !== 0 && 'bg-muted/20',
                          )}
                          onClick={() => openDetail({ project, request })}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">{project.name}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{project.projectCode}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{request.requestedBy}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(request.requestedAt)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className="text-[10px]">{request.affectedMilestones.length} 個</Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                              +{maxDays} 天
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recently Reviewed Table */}
        {recentlyReviewed.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                已審核紀錄
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">結果</th>
                      <th className="text-left px-4 py-2.5 font-medium">專案</th>
                      <th className="text-left px-4 py-2.5 font-medium">申請人</th>
                      <th className="text-left px-4 py-2.5 font-medium">審核人</th>
                      <th className="text-left px-4 py-2.5 font-medium">審核時間</th>
                      <th className="text-right px-4 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentlyReviewed.map(({ project, request }, i) => (
                      <tr
                        key={request.id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/50 transition-colors',
                          i % 2 !== 0 && 'bg-muted/20',
                        )}
                        onClick={() => openDetail({ project, request })}
                      >
                        <td className="px-4 py-3">
                          {request.status === 'approved' ? (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> 已核准
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-[10px]">
                              <XCircle className="h-3 w-3 mr-1" /> 已駁回
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{project.name}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{request.requestedBy}</td>
                        <td className="px-4 py-3 text-muted-foreground">{request.reviewedBy || '-'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{request.reviewedAt ? formatDate(request.reviewedAt) : '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className="h-4 w-4 text-muted-foreground inline-block" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {selectedItem && (() => {
            const { project, request } = selectedItem
            const isPending = request.status === 'pending'
            return (
              <>
                <SheetHeader className="pb-2">
                  <SheetTitle className="text-lg">{project.name}</SheetTitle>
                  <SheetDescription className="sr-only">延遲申請詳情</SheetDescription>
                </SheetHeader>
                <div className="flex items-center gap-2 flex-wrap pb-3">
                  <Badge variant="outline" className="font-mono text-[10px]">{project.projectCode}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{PROJECT_TYPE_LABELS[project.projectType]}</Badge>
                  {isPending ? (
                    <Badge variant="secondary" className="bg-warning/15 text-warning border-warning/30 text-[10px]">
                      <Clock className="h-3 w-3 mr-0.5" /> 待審核
                    </Badge>
                  ) : request.status === 'approved' ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-0.5" /> 已核准
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-[10px]">
                      <XCircle className="h-3 w-3 mr-0.5" /> 已駁回
                    </Badge>
                  )}
                </div>

                <div className="space-y-5">
                  {/* Meta info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-lg bg-muted/50">
                      <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1"><User className="h-3 w-3" /> 申請人</div>
                      <div className="text-sm font-medium">{request.requestedBy}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/50">
                      <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> 申請時間</div>
                      <div className="text-sm font-medium">{formatDate(request.requestedAt)}</div>
                    </div>
                  </div>

                  {/* Delay reason */}
                  <div>
                    <h4 className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" /> 延遲原因
                    </h4>
                    <div className="bg-muted/50 border p-3 rounded-lg text-sm leading-relaxed">
                      {request.reason}
                    </div>
                  </div>

                  {/* Affected milestones */}
                  <div>
                    <h4 className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> 受影響里程碑
                    </h4>
                    <div className="space-y-2">
                      {request.affectedMilestones.map(am => {
                        const delayDays = calculateDelayDays(am.originalDate, am.proposedDate)
                        return (
                          <div key={am.milestoneId} className="flex items-center gap-2 p-2.5 rounded-lg border text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-xs">{getMilestoneName(project.id, am.milestoneId)}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                {formatDate(am.originalDate)}
                                <ArrowRight className="h-3 w-3 shrink-0" />
                                {formatDate(am.proposedDate)}
                              </div>
                            </div>
                            <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] shrink-0">
                              +{delayDays} 天
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Can catch up + support needed */}
                  <div className="grid grid-cols-2 gap-3 items-stretch">
                    <div className="flex flex-col">
                      <h4 className="text-xs font-medium mb-1.5">能否追回</h4>
                      <div className={cn(
                        'flex items-center gap-1.5 p-2.5 rounded-lg border text-xs font-medium flex-1',
                        request.canCatchUp
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
                          : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300',
                      )}>
                        {request.canCatchUp ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                        {request.canCatchUp ? '可以追回' : '無法追回'}
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <h4 className="text-xs font-medium mb-1.5">需要支援</h4>
                      <div className="p-2.5 rounded-lg border bg-muted/50 text-xs leading-relaxed flex-1">
                        {request.supportNeeded || '無'}
                      </div>
                    </div>
                  </div>

                  {/* Review result (for already reviewed) */}
                  {!isPending && (
                    <div className="border-t pt-4 space-y-2">
                      <h4 className="text-xs font-medium">審核結果</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-2.5 rounded-lg bg-muted/50">
                          <div className="text-[10px] text-muted-foreground mb-0.5">審核人</div>
                          <div className="text-sm font-medium">{request.reviewedBy || '-'}</div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-muted/50">
                          <div className="text-[10px] text-muted-foreground mb-0.5">審核時間</div>
                          <div className="text-sm font-medium">{request.reviewedAt ? formatDate(request.reviewedAt) : '-'}</div>
                        </div>
                      </div>
                      {request.reviewNotes && (
                        <div className="p-2.5 rounded-lg bg-muted/50 border">
                          <div className="text-[10px] text-muted-foreground mb-0.5">審核意見</div>
                          <div className="text-sm">{request.reviewNotes}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review actions (for pending) */}
                  {isPending && (
                    <div className="border-t pt-4">
                      {showReviewForm ? (
                        <div className="space-y-3">
                          <h4 className="text-xs font-medium flex items-center gap-1.5">
                            {reviewAction === 'approve' ? (
                              <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> 確認核准</span>
                            ) : (
                              <span className="flex items-center gap-1 text-destructive"><XCircle className="h-3.5 w-3.5" /> 確認駁回</span>
                            )}
                          </h4>
                          <Textarea
                            placeholder="請輸入審核意見（選填）..."
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            rows={3}
                            className="text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
                              onClick={handleConfirmReview}
                              className="gap-1.5"
                            >
                              {reviewAction === 'approve' ? <><CheckCircle2 className="h-3.5 w-3.5" /> 確認核准</> : <><XCircle className="h-3.5 w-3.5" /> 確認駁回</>}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowReviewForm(false)}>取消</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" className="gap-1.5 flex-1" onClick={() => handleStartReview('approve')}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> 核准
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1.5 flex-1" onClick={() => handleStartReview('reject')}>
                            <XCircle className="h-3.5 w-3.5" /> 駁回
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  )
}
