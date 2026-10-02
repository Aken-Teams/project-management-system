'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Copy, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/lib/auth-context'

/** 可勾選的項目。基本資料（名稱／目標／類型／期間）一律複製，不列在這裡。 */
const PARTS = [
  { key: 'milestones', label: '里程碑與任務', hint: '含子任務與層級；進度與完成狀態會歸零' },
  { key: 'team', label: '團隊成員', hint: '含角色與報告審核主管設定；不勾則任務不帶指派人' },
  { key: 'smart', label: 'SMART 與投資報酬', hint: '目標描述、預期效益、ROI 欄位' },
  { key: 'budget', label: '投資設備清單', hint: '站別、廠商、組數與預估金額；實際花費不帶' },
  { key: 'capex', label: '採購明細', hint: 'CAPEX 逐筆資料' },
  { key: 'risks', label: '風險', hint: '風險描述、影響、對策' },
] as const

type PartKey = typeof PARTS[number]['key']

export function DuplicateProjectDialog({
  open, onOpenChange, projectId, projectName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  projectName: string
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<PartKey>>(new Set(['milestones']))
  const [saving, setSaving] = useState(false)

  // 每次開啟都回到預設：沿用上次的勾選會讓人以為「這次也只複製那些」
  useEffect(() => {
    if (open) {
      setName(`${projectName} (複製)`)
      setPicked(new Set(['milestones']))
    }
  }, [open, projectName])

  const toggle = (k: PartKey, on: boolean) => {
    const s = new Set(picked)
    if (on) s.add(k); else s.delete(k)
    setPicked(s)
  }

  const submit = async () => {
    if (!user?.email) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
        body: JSON.stringify({
          name: name.trim(),
          ...Object.fromEntries(PARTS.map(p => [p.key, picked.has(p.key)])),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: data?.error || '複製失敗', variant: 'destructive' })
        return
      }
      toast({
        title: '已複製專案',
        description: `${data.projectCode}　${data.name}。新專案為草稿，確認內容後再開案。`,
      })
      onOpenChange(false)
      router.push(`/projects/${data.id}`)
    } catch {
      toast({ title: '複製失敗，請稍後再試', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!saving) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Copy className="h-4 w-4" />複製專案
          </DialogTitle>
          <DialogDescription className="text-xs">
            以「{projectName}」為範本建立新專案。專案編號會自動產生，
            新專案一律是<b className="text-foreground">草稿</b>，確認內容後再開案。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="dup-name" className="text-xs">新專案名稱</Label>
          <Input id="dup-name" value={name} onChange={e => setName(e.target.value)} className="h-9" />
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">要一併複製的內容</div>
          <div className="rounded-lg border divide-y">
            {PARTS.map(p => (
              <label key={p.key} className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                <Checkbox className="mt-0.5" checked={picked.has(p.key)} onCheckedChange={c => toggle(p.key, !!c)} />
                <div className="min-w-0">
                  <div className="text-sm">{p.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{p.hint}</div>
                </div>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            基本資料（名稱、目標、類型、層級、期間）一律複製。
            工作紀錄、週報、延期申請屬於執行過程，不會帶到新專案。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={saving || !name.trim()} onClick={submit}>
            {saving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />複製中...</> : <><Copy className="mr-1.5 h-3.5 w-3.5" />建立複本</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
