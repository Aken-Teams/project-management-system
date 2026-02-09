'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GanttChart } from '@/components/gantt-chart'
import { getAllProjects } from '@/lib/mock-data'
import { Download, Filter, Calendar } from 'lucide-react'

export default function GanttPage() {
  const projects = getAllProjects()
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '')
  
  const selectedProject = projects.find(p => p.id === selectedProjectId)

  const handleExport = () => {
    console.log('[v0] Exporting Gantt chart')
    alert('甘特圖匯出功能（示範模式）')
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">甘特圖</h1>
            <p className="text-muted-foreground mt-1">
              視覺化專案時程與任務排程
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">選擇專案：</span>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="選擇專案" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <span>{project.name}</span>
                          <Badge 
                            variant="secondary"
                            className={
                              project.status === 'green' 
                                ? 'bg-success text-success-foreground' 
                                : project.status === 'yellow'
                                ? 'bg-warning text-warning-foreground'
                                : 'bg-destructive text-destructive-foreground'
                            }
                          >
                            {project.status === 'green' ? '正常' : project.status === 'yellow' ? '注意' : '風險'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  <Calendar className="h-4 w-4" />
                  調整視圖
                </Button>
                <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                  匯出
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Info */}
        {selectedProject && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <span className="text-sm text-muted-foreground">專案名稱</span>
                  <p className="font-medium mt-1">{selectedProject.name}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">專案期間</span>
                  <p className="font-medium mt-1">
                    {new Date(selectedProject.startDate).toLocaleDateString('zh-TW')} - {new Date(selectedProject.endDate).toLocaleDateString('zh-TW')}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">總進度</span>
                  <p className="font-medium mt-1">{selectedProject.progress}%</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">負責人</span>
                  <p className="font-medium mt-1">{selectedProject.owner}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Gantt Chart */}
        {selectedProject ? (
          <GanttChart
            tasks={selectedProject.tasks}
            milestones={selectedProject.milestones}
            baseline={selectedProject.baseline}
            startDate={selectedProject.startDate}
            endDate={selectedProject.endDate}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">請選擇一個專案以檢視甘特圖</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
