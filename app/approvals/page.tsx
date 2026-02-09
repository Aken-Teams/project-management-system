'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth-context'
import { useProjectStore } from '@/lib/project-store'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  AlertTriangle,
  User,
  FileText,
  ArrowRight,
} from 'lucide-react'

export default function ApprovalsPage() {
  const { user } = useAuth()
  const { projects, getPendingApprovals, approveDelayRequest, rejectDelayRequest } = useProjectStore()

  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)

  const pendingApprovals = getPendingApprovals()

  // Collect recently reviewed requests (approved/rejected) across all projects
  const recentlyReviewed = projects
    .flatMap(p =>
      p.delayRequests
        .filter(r => r.status === 'approved' || r.status === 'rejected')
        .map(r => ({ project: p, request: r }))
    )
    .sort((a, b) => new Date(b.request.reviewedAt || '').getTime() - new Date(a.request.reviewedAt || '').getTime())
    .slice(0, 10)

  const handleStartReview = (requestId: string, action: 'approve' | 'reject') => {
    setReviewingId(requestId)
    setReviewAction(action)
    setReviewNotes('')
  }

  const handleCancelReview = () => {
    setReviewingId(null)
    setReviewAction(null)
    setReviewNotes('')
  }

  const handleConfirmReview = (projectId: string, requestId: string) => {
    if (!user || !reviewAction) return

    if (reviewAction === 'approve') {
      approveDelayRequest(projectId, requestId, user.name, reviewNotes)
    } else {
      rejectDelayRequest(projectId, requestId, user.name, reviewNotes)
    }

    setReviewingId(null)
    setReviewAction(null)
    setReviewNotes('')
  }

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

  const getProjectTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'npi': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'sourcing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'cost-saving': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
      case 'cip': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">審批中心</h1>
          <p className="text-muted-foreground mt-1">
            審核專案延遲申請，確保時程變更經過適當評估
          </p>
        </div>

        {/* Pending Approvals Count */}
        <div className="flex items-center gap-3">
          <Badge variant={pendingApprovals.length > 0 ? 'destructive' : 'secondary'} className="text-sm px-3 py-1">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {pendingApprovals.length} 件待審核
          </Badge>
          {recentlyReviewed.length > 0 && (
            <Badge variant="outline" className="text-sm px-3 py-1">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              {recentlyReviewed.length} 件已審核
            </Badge>
          )}
        </div>

        {/* Pending Approvals */}
        {pendingApprovals.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center text-muted-foreground">
                <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-success" />
                <h3 className="text-lg font-medium mb-1">沒有待審核的申請</h3>
                <p className="text-sm">所有延遲申請都已處理完畢</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingApprovals.map(({ project, request }) => (
              <Card key={request.id} className="border-l-4 border-l-warning">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 flex-wrap">
                        {project.name}
                        <Badge variant="outline" className="font-mono text-xs">
                          {project.projectCode}
                        </Badge>
                        <Badge variant="secondary" className={getProjectTypeBadgeColor(project.projectType)}>
                          {PROJECT_TYPE_LABELS[project.projectType]}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-2 flex items-center gap-4 flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          申請人：{request.requestedBy}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          申請時間：{new Date(request.requestedAt).toLocaleDateString('zh-TW')}{' '}
                          {new Date(request.requestedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-warning/15 text-warning border-warning/30 shrink-0">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      待審核
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Delay Reason */}
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      延遲原因
                    </h4>
                    <div className="bg-muted p-3 rounded-lg text-sm leading-relaxed">
                      {request.reason}
                    </div>
                  </div>

                  {/* Affected Milestones Table */}
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      受影響里程碑
                    </h4>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left px-4 py-2.5 font-medium">里程碑名稱</th>
                            <th className="text-left px-4 py-2.5 font-medium">原定日期</th>
                            <th className="text-center px-4 py-2.5 font-medium"></th>
                            <th className="text-left px-4 py-2.5 font-medium">建議日期</th>
                            <th className="text-right px-4 py-2.5 font-medium">延遲天數</th>
                          </tr>
                        </thead>
                        <tbody>
                          {request.affectedMilestones.map((am, index) => {
                            const delayDays = calculateDelayDays(am.originalDate, am.proposedDate)
                            return (
                              <tr key={am.milestoneId} className={index % 2 === 0 ? '' : 'bg-muted/20'}>
                                <td className="px-4 py-2.5 font-medium">
                                  {getMilestoneName(project.id, am.milestoneId)}
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground">
                                  {new Date(am.originalDate).toLocaleDateString('zh-TW')}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                                </td>
                                <td className="px-4 py-2.5">
                                  {new Date(am.proposedDate).toLocaleDateString('zh-TW')}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20">
                                    +{delayDays} 天
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Can Catch Up & Support Needed */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="text-sm font-medium mb-2">是否能追回進度</h4>
                      <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
                        request.canCatchUp
                          ? 'bg-success/10 border-success/20 text-success'
                          : 'bg-destructive/10 border-destructive/20 text-destructive'
                      }`}>
                        {request.canCatchUp ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            預計可以追回進度
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 shrink-0" />
                            無法追回，需調整時程
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-2">需要的支援</h4>
                      <div className="bg-muted p-3 rounded-lg text-sm leading-relaxed">
                        {request.supportNeeded || '無'}
                      </div>
                    </div>
                  </div>

                  {/* Review Actions */}
                  {reviewingId === request.id ? (
                    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                      <h4 className="text-sm font-medium">
                        {reviewAction === 'approve' ? (
                          <span className="flex items-center gap-1.5 text-success">
                            <CheckCircle2 className="h-4 w-4" />
                            確認核准
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-destructive">
                            <XCircle className="h-4 w-4" />
                            確認駁回
                          </span>
                        )}
                      </h4>
                      <Textarea
                        placeholder="請輸入審核意見（選填）..."
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        rows={3}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={reviewAction === 'approve' ? 'default' : 'destructive'}
                          onClick={() => handleConfirmReview(project.id, request.id)}
                        >
                          {reviewAction === 'approve' ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-1.5" />
                              確認核准
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-1.5" />
                              確認駁回
                            </>
                          )}
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancelReview}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleStartReview(request.id, 'approve')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        核准
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1.5"
                        onClick={() => handleStartReview(request.id, 'reject')}
                      >
                        <XCircle className="h-4 w-4" />
                        駁回
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recently Reviewed */}
        {recentlyReviewed.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                已審核紀錄
              </CardTitle>
              <CardDescription>
                最近審核過的延遲申請
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentlyReviewed.map(({ project, request }) => (
                <div key={request.id} className="flex items-start gap-4 p-4 rounded-lg border">
                  <div className="shrink-0 mt-0.5">
                    {request.status === 'approved' ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-medium">{project.name}</h4>
                      <Badge variant="outline" className="font-mono text-xs">
                        {project.projectCode}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={
                          request.status === 'approved'
                            ? 'bg-success/15 text-success border-success/30'
                            : 'bg-destructive/15 text-destructive border-destructive/30'
                        }
                      >
                        {request.status === 'approved' ? '已核准' : '已駁回'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {request.reason}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        申請人：{request.requestedBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        審核人：{request.reviewedBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        審核時間：{request.reviewedAt ? new Date(request.reviewedAt).toLocaleDateString('zh-TW') : '-'}
                      </span>
                    </div>
                    {request.reviewNotes && (
                      <div className="mt-2 bg-muted p-2.5 rounded text-sm">
                        <span className="font-medium">審核意見：</span> {request.reviewNotes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
