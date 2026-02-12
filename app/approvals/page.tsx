'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useAuth } from '@/lib/auth-context'
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
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AffectedMilestone {
  milestoneId: string
  milestoneName: string
  originalDate: string
  proposedDate: string
}

interface DelayRequestItem {
  id: string
  projectId: string
  project: {
    id: string
    name: string
    projectCode: string
  }
  requestedBy: string
  requestedAt: string
  reason: string
  canCatchUp: boolean
  supportNeeded: string
  status: 'pending' | 'approved' | 'rejected'
  affectedMilestones: AffectedMilestone[]
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
}

export default function ApprovalsPage() {
  const { user } = useAuth()

  const [allRequests, setAllRequests] = useState<DelayRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<DelayRequestItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/delay-requests')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAllRequests(data.delayRequests || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const pendingApprovals = allRequests.filter(r => r.status === 'pending')
  const recentlyReviewed = allRequests
    .filter(r => r.status === 'approved' || r.status === 'rejected')
    .slice(0, 10)

  const calculateDelayDays = (originalDate: string, proposedDate: string): number => {
    const original = new Date(originalDate)
    const proposed = new Date(proposedDate)
    return Math.ceil((proposed.getTime() - original.getTime()) / (1000 * 60 * 60 * 24))
  }

  const getMaxDelayDays = (request: DelayRequestItem): number => {
    return Math.max(...request.affectedMilestones.map(am => calculateDelayDays(am.originalDate, am.proposedDate)), 0)
  }

  const openDetail = (item: DelayRequestItem) => {
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

  const handleConfirmReview = async () => {
    if (!user || !reviewAction || !selectedItem) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/delay-requests/${selectedItem.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: reviewAction,
          reviewerId: user.id,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '審核失敗')
      }

      setSheetOpen(false)
      setSelectedItem(null)
      setShowReviewForm(false)
      setReviewAction(null)
      setReviewNotes('')

      // Refresh data
      await fetchRequests()
    } catch (err) {
      alert(err instanceof Error ? err.message : '審核失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('zh-TW')

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">審批中心</h1>
            <p className="text-sm text-muted-foreground mt-1">審核專案延遲申請</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={pendingApprovals.length > 0 ? 'destructive' : 'secondary'} className="text-sm px-2.5 py-1">
              <Clock className="h-3 w-3 mr-1" />
              {pendingApprovals.length} 件待審核
            </Badge>
          </div>
        </div>

        {/* Pending Approvals Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
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
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 text-sm text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">專案</th>
                      <th className="text-left px-4 py-3 font-medium">申請人</th>
                      <th className="text-left px-4 py-3 font-medium">申請時間</th>
                      <th className="text-center px-4 py-3 font-medium">影響里程碑</th>
                      <th className="text-center px-4 py-3 font-medium">最大延遲</th>
                      <th className="text-right px-4 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingApprovals.map((request, i) => {
                      const maxDays = getMaxDelayDays(request)
                      return (
                        <tr
                          key={request.id}
                          className={cn(
                            'cursor-pointer hover:bg-muted/50 transition-colors',
                            i % 2 !== 0 && 'bg-muted/20',
                          )}
                          onClick={() => openDetail(request)}
                        >
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-base">{request.project.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{request.project.projectCode}</div>
                          </td>
                          <td className="px-4 py-3.5 text-sm">{request.requestedBy}</td>
                          <td className="px-4 py-3.5 text-sm text-muted-foreground">{formatDate(request.requestedAt)}</td>
                          <td className="px-4 py-3.5 text-center">
                            <Badge variant="outline" className="text-xs">{request.affectedMilestones.length} 個</Badge>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                              +{maxDays} 天
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-right">
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
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                已審核紀錄
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 text-sm text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">結果</th>
                      <th className="text-left px-4 py-3 font-medium">專案</th>
                      <th className="text-left px-4 py-3 font-medium">申請人</th>
                      <th className="text-left px-4 py-3 font-medium">審核人</th>
                      <th className="text-left px-4 py-3 font-medium">審核時間</th>
                      <th className="text-right px-4 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentlyReviewed.map((request, i) => (
                      <tr
                        key={request.id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/50 transition-colors',
                          i % 2 !== 0 && 'bg-muted/20',
                        )}
                        onClick={() => openDetail(request)}
                      >
                        <td className="px-4 py-3.5">
                          {request.status === 'approved' ? (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 已核准
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">
                              <XCircle className="h-3.5 w-3.5 mr-1" /> 已駁回
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-base">{request.project.name}</span>
                        </td>
                        <td className="px-4 py-3.5 text-sm">{request.requestedBy}</td>
                        <td className="px-4 py-3.5 text-sm">{request.reviewedBy || '-'}</td>
                        <td className="px-4 py-3.5 text-sm text-muted-foreground">{request.reviewedAt ? formatDate(request.reviewedAt) : '-'}</td>
                        <td className="px-4 py-3.5 text-right">
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

      {/* Detail Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedItem && (() => {
            const request = selectedItem
            const isPending = request.status === 'pending'
            return (
              <>
                <DialogHeader className="pb-2">
                  <DialogTitle className="text-xl">{request.project.name}</DialogTitle>
                  <DialogDescription className="sr-only">延遲申請詳情</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2.5 flex-wrap pb-3">
                  <Badge variant="outline" className="font-mono text-xs px-2.5 py-0.5">{request.project.projectCode}</Badge>
                  {isPending ? (
                    <Badge variant="secondary" className="bg-warning/15 text-warning border-warning/30 text-xs px-2.5 py-0.5">
                      <Clock className="h-3.5 w-3.5 mr-1" /> 待審核
                    </Badge>
                  ) : request.status === 'approved' ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs px-2.5 py-0.5">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 已核准
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs px-2.5 py-0.5">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> 已駁回
                    </Badge>
                  )}
                </div>

                <div className="space-y-5">
                  {/* Meta info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><User className="h-3.5 w-3.5" /> 申請人</div>
                      <div className="text-sm font-medium">{request.requestedBy}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> 申請時間</div>
                      <div className="text-sm font-medium">{formatDate(request.requestedAt)}</div>
                    </div>
                  </div>

                  {/* Delay reason */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-warning" /> 延遲原因
                    </h4>
                    <div className="bg-muted/50 border p-3 rounded-lg text-sm leading-relaxed">
                      {request.reason}
                    </div>
                  </div>

                  {/* Affected milestones */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-muted-foreground" /> 受影響里程碑
                    </h4>
                    <div className="space-y-2">
                      {request.affectedMilestones.map(am => {
                        const delayDays = calculateDelayDays(am.originalDate, am.proposedDate)
                        return (
                          <div key={am.milestoneId} className="flex items-center gap-2 p-3 rounded-lg border">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{am.milestoneName}</div>
                              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                                {formatDate(am.originalDate)}
                                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                {formatDate(am.proposedDate)}
                              </div>
                            </div>
                            <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 text-xs shrink-0">
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
                      <h4 className="text-sm font-semibold mb-2">能否追回</h4>
                      <div className={cn(
                        'flex items-center gap-1.5 p-3 rounded-lg border text-sm font-medium flex-1',
                        request.canCatchUp
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300'
                          : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300',
                      )}>
                        {request.canCatchUp ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                        {request.canCatchUp ? '可以追回' : '無法追回'}
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <h4 className="text-sm font-semibold mb-2">需要支援</h4>
                      <div className="p-3 rounded-lg border bg-muted/50 text-sm leading-relaxed flex-1">
                        {request.supportNeeded || '無'}
                      </div>
                    </div>
                  </div>

                  {/* Review result (for already reviewed) */}
                  {!isPending && (
                    <div className="border-t pt-4 space-y-3">
                      <h4 className="text-sm font-semibold">審核結果</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1">審核人</div>
                          <div className="text-sm font-medium">{request.reviewedBy || '-'}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-xs text-muted-foreground mb-1">審核時間</div>
                          <div className="text-sm font-medium">{request.reviewedAt ? formatDate(request.reviewedAt) : '-'}</div>
                        </div>
                      </div>
                      {request.reviewNotes && (
                        <div className="p-3 rounded-lg bg-muted/50 border">
                          <div className="text-xs text-muted-foreground mb-1">審核意見</div>
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
                          <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            {reviewAction === 'approve' ? (
                              <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> 確認核准</span>
                            ) : (
                              <span className="flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" /> 確認駁回</span>
                            )}
                          </h4>
                          <Textarea
                            placeholder="請輸入審核意見（選填）..."
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            rows={3}
                          />
                          <div className="flex items-center justify-end gap-3 pt-1">
                            <Button variant="ghost" onClick={() => setShowReviewForm(false)} disabled={submitting}>取消</Button>
                            <Button
                              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
                              onClick={handleConfirmReview}
                              disabled={submitting}
                              className="gap-1.5 min-w-[120px]"
                            >
                              {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : reviewAction === 'approve' ? (
                                <><CheckCircle2 className="h-4 w-4" /> 確認核准</>
                              ) : (
                                <><XCircle className="h-4 w-4" /> 確認駁回</>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button className="gap-1.5 flex-1" onClick={() => handleStartReview('approve')}>
                            <CheckCircle2 className="h-4 w-4" /> 核准
                          </Button>
                          <Button variant="destructive" className="gap-1.5 flex-1" onClick={() => handleStartReview('reject')}>
                            <XCircle className="h-4 w-4" /> 駁回
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
