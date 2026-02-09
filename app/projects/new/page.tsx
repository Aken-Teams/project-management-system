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
import { parseProjectRequirements, type ParsedProjectData } from '@/lib/ai-service'
import { Loader2, Sparkles, FileText, Calendar, DollarSign, Users, AlertTriangle } from 'lucide-react'

export default function NewProjectPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('ai')
  
  // AI Mode
  const [requirements, setRequirements] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedProjectData | null>(null)
  
  // Manual Mode
  const [manualData, setManualData] = useState({
    name: '',
    objective: '',
    purpose: '',
    scope: '',
    roi: '',
    startDate: '',
    endDate: '',
    budget: '',
  })

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
    // In real app, this would save to database
    console.log('[v0] Creating project from AI data:', parsedData)
    alert('專案已建立！（示範模式）')
    router.push('/projects')
  }

  const handleManualCreate = () => {
    // In real app, this would save to database
    console.log('[v0] Creating project manually:', manualData)
    alert('專案已建立！（示範模式）')
    router.push('/projects')
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
                          {Math.ceil((new Date(parsedData.endDate).getTime() - new Date(parsedData.startDate).getTime()) / (1000 * 60 * 60 * 24 * 7))} 週
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
                        <div key={index} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
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
                                className={risk.impact === 'high' ? 'bg-destructive text-destructive-foreground' : risk.impact === 'medium' ? 'bg-warning text-warning-foreground' : ''}
                              >
                                {risk.impact === 'high' ? '高' : risk.impact === 'medium' ? '中' : '低'}影響
                              </Badge>
                              <Badge variant="outline">
                                {risk.probability === 'high' ? '高' : risk.probability === 'medium' ? '中' : '低'}機率
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
                  <Button 
                    onClick={() => setParsedData(null)} 
                    variant="outline" 
                    size="lg"
                  >
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
                      onChange={(e) => setManualData({ ...manualData, startDate: e.target.value })}
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

                <div className="flex gap-3 pt-4">
                  <Button 
                    onClick={handleManualCreate}
                    disabled={!manualData.name || !manualData.objective || !manualData.startDate || !manualData.endDate}
                    size="lg"
                    className="flex-1"
                  >
                    建立專案
                  </Button>
                  <Button 
                    onClick={() => router.push('/projects')} 
                    variant="outline" 
                    size="lg"
                  >
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
