'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Shield, Info } from 'lucide-react'
import { type Project } from '@/lib/mock-data'

const IMPACT_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' }
const PROBABILITY_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' }
const STATUS_LABELS: Record<string, string> = { open: '未處理', mitigated: '已緩解', closed: '已關閉' }

function getRiskLevelColor(level: string) {
  switch (level) {
    case 'high': return 'bg-destructive text-destructive-foreground'
    case 'medium': return 'bg-warning text-warning-foreground'
    case 'low': return 'bg-muted text-muted-foreground'
    default: return 'bg-muted text-muted-foreground'
  }
}

function getRiskStatusColor(status: string) {
  switch (status) {
    case 'open': return 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/10'
    case 'mitigated': return 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10'
    case 'closed': return 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/10'
    default: return ''
  }
}

export function ProjectRiskTab({ project }: { project: Project }) {
  const openRisks = project.risks.filter(r => r.status === 'open')
  const mitigatedRisks = project.risks.filter(r => r.status === 'mitigated')
  const closedRisks = project.risks.filter(r => r.status === 'closed')

  if (project.risks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">尚未登記風險項目</p>
          <p className="text-sm text-muted-foreground mt-1">開案時可預先識別已知風險，評估影響程度和發生機率</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-muted/50 border px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">已識別 {project.risks.length} 項風險</span>
        </div>
        <div className="flex items-center gap-2">
          {openRisks.length > 0 && (
            <Badge variant="destructive" className="text-sm">{openRisks.length} 未處理</Badge>
          )}
          {mitigatedRisks.length > 0 && (
            <Badge className="text-sm bg-warning text-warning-foreground">{mitigatedRisks.length} 已緩解</Badge>
          )}
          {closedRisks.length > 0 && (
            <Badge variant="secondary" className="text-sm">{closedRisks.length} 已關閉</Badge>
          )}
        </div>
      </div>

      {/* Risk list */}
      <div className="space-y-3">
        {project.risks.map(risk => (
          <Card key={risk.id} className={getRiskStatusColor(risk.status)}>
            <div className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${risk.status === 'closed' ? 'text-muted-foreground' : risk.impact === 'high' ? 'text-destructive' : 'text-warning'}`} />
                  <div className="min-w-0">
                    <h4 className={`text-sm font-medium ${risk.status === 'closed' ? 'text-muted-foreground line-through' : ''}`}>{risk.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{risk.description}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-sm shrink-0">
                  {STATUS_LABELS[risk.status]}
                </Badge>
              </div>

              {/* Impact + Probability badges */}
              <div className="flex items-center gap-2 pl-6.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">影響程度</span>
                  <Badge className={`text-[10px] px-1.5 ${getRiskLevelColor(risk.impact)}`}>
                    {IMPACT_LABELS[risk.impact]}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">發生機率</span>
                  <Badge className={`text-[10px] px-1.5 ${getRiskLevelColor(risk.probability)}`}>
                    {PROBABILITY_LABELS[risk.probability]}
                  </Badge>
                </div>
              </div>

              {/* Mitigation */}
              {risk.mitigation && (
                <div className="pl-6.5 pt-1 border-t">
                  <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    緩解措施
                  </div>
                  <p className="text-sm text-muted-foreground">{risk.mitigation}</p>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted-foreground flex items-center gap-1.5 pt-1">
        <Info className="h-3.5 w-3.5 shrink-0" />
        風險於開案時識別登記，用於評估專案潛在問題與準備緩解措施
      </p>
    </div>
  )
}
