'use client'

import React from "react"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { type Task, type TaskStatus } from '@/lib/mock-data'
import { GripVertical, Clock, AlertCircle, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KanbanBoardProps {
  tasks: Task[]
  projectId: string
}

const columns: { status: TaskStatus; title: string; color: string }[] = [
  { status: 'todo', title: '待辦', color: 'bg-muted' },
  { status: 'in-progress', title: '進行中', color: 'bg-primary' },
  { status: 'done', title: '已完成', color: 'bg-success' },
  { status: 'blocked', title: '受阻', color: 'bg-destructive' },
]

export function KanbanBoard({ tasks, projectId }: KanbanBoardProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter(task => task.status === status)
  }

  const handleDragStart = (task: Task) => {
    setDraggedTask(task)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (status: TaskStatus) => {
    if (draggedTask) {
      console.log(`[v0] Moving task ${draggedTask.id} to ${status}`)
      // In real app, this would update the database
      setDraggedTask(null)
    }
  }

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high':
        return 'bg-destructive text-destructive-foreground'
      case 'medium':
        return 'bg-warning text-warning-foreground'
      case 'low':
        return 'bg-muted text-muted-foreground'
    }
  }

  const getPriorityText = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high':
        return '高'
      case 'medium':
        return '中'
      case 'low':
        return '低'
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {columns.map((column) => {
        const columnTasks = getTasksByStatus(column.status)
        
        return (
          <div
            key={column.status}
            className="flex flex-col"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(column.status)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn('w-3 h-3 rounded-full', column.color)} />
                <h3 className="font-semibold">{column.title}</h3>
                <Badge variant="secondary" className="ml-1">
                  {columnTasks.length}
                </Badge>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Tasks */}
            <div className="flex-1 space-y-3 min-h-[200px]">
              {columnTasks.map((task) => (
                <Card
                  key={task.id}
                  draggable
                  onDragStart={() => handleDragStart(task)}
                  className="cursor-move hover:shadow-md transition-shadow"
                >
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-medium line-clamp-2">
                          {task.title}
                        </CardTitle>
                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="secondary" 
                        className={cn('text-xs', getPriorityColor(task.priority))}
                      >
                        {getPriorityText(task.priority)}優先
                      </Badge>
                      {task.progress > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {task.progress}%
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                      </div>
                      
                      {task.assignee && (
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                            {task.assignee.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>

                    {task.dependencies && task.dependencies.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <AlertCircle className="h-3 w-3" />
                        <span>{task.dependencies.length} 個依賴項目</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {columnTasks.length === 0 && (
                <div className="flex items-center justify-center h-32 border-2 border-dashed border-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">無任務</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
