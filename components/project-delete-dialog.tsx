'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import type { Project } from '@/lib/mock-data'

interface ProjectDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  onConfirm: () => Promise<void>
}

export function ProjectDeleteDialog({ open, onOpenChange, project, onConfirm }: ProjectDeleteDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const isConfirmed = confirmText === project.name

  const handleDelete = async () => {
    if (!isConfirmed) return
    setError('')
    setDeleting(true)
    try {
      await onConfirm()
    } catch {
      setError('刪除失敗，請稍後再試')
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={v => { if (!deleting) { onOpenChange(v); setConfirmText(''); setError('') } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確定要刪除此專案？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                此操作將永久刪除專案「<strong className="text-foreground">{project.name}</strong>」
                （{project.projectCode}）以及所有相關資料，包含：
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{project.milestones.length} 個里程碑</li>
                <li>{project.tasks.length} 個任務</li>
                <li>{project.risks.length} 個風險項目</li>
                <li>{project.weeklyUpdates.length} 筆週報</li>
                <li>{project.delayRequests.length} 筆延遲申請</li>
              </ul>
              <p className="font-medium text-destructive">此操作無法復原。</p>
              <div className="space-y-1.5 pt-1">
                <p className="text-sm">請輸入專案名稱「<strong className="text-foreground">{project.name}</strong>」以確認刪除：</p>
                <Input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={project.name}
                  disabled={deleting}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            確認刪除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
