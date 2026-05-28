'use client'

import { useState, useEffect, useMemo } from 'react'
import { Package, DollarSign, CalendarDays, CreditCard, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useToast } from '@/hooks/use-toast'
import type { CapexItemData, BudgetItemRef } from '@/components/capex-table'

const EQUIPMENT_CATEGORIES = ['固定資產_設備', '固定資產_模具', '固定資產_工程', '雜項_消耗品']
const CURRENCIES = ['TWD', 'JPY', 'USD', 'RMB']
const PAYMENT_STATUSES = ['未付款', '部分付款', '已付清']
const fmtNT = (n: number | null) => n != null ? `NT$ ${Math.round(n).toLocaleString('zh-TW')}` : '-'

function emptyItem(budgetItemId?: string | null): CapexItemData {
  return {
    budgetItemId: budgetItemId ?? null,
    equipmentCategory: '', station: '', supplier: '',
    issueDate: null, poNumber: '', partNumber: '',
    masterSummary: '', partDescription: '', unit: '', currency: 'TWD',
    quantity: 1, originalPrice: null, twdPrice: null, orderAmount: null,
    deliveryDate: null, bpmAcceptanceDate: null,
    depositPct: null, deliveryPct: null, acceptancePct: null,
    depositAmount: null, depositPayDate: null,
    deliveryAmount: null, deliveryPayDate: null,
    acceptanceAmount: null, acceptancePayDate: null,
    paymentStatus: '',
  }
}

interface CapexItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  budgetItems: BudgetItemRef[]
  item: CapexItemData | null
  defaultBudgetItemId?: string | null
  onSaved: () => void
}

export function CapexItemDialog({
  open, onOpenChange, projectId, budgetItems,
  item, defaultBudgetItemId, onSaved,
}: CapexItemDialogProps) {
  const [draft, setDraft] = useState<CapexItemData>(() =>
    item ? { ...item } : emptyItem(defaultBudgetItemId)
  )
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setDraft(item ? { ...item } : emptyItem(defaultBudgetItemId))
    }
  }, [open, item, defaultBudgetItemId])

  const updateField = (field: keyof CapexItemData, value: unknown) => {
    setDraft(prev => {
      const updated = { ...prev, [field]: value }
      if (field === 'twdPrice' || field === 'quantity') {
        const price = field === 'twdPrice' ? (value as number) : prev.twdPrice
        const qty = field === 'quantity' ? (value as number) : prev.quantity
        if (price != null && qty > 0) updated.orderAmount = price * qty
      }
      if (field === 'depositPct' || field === 'deliveryPct' || field === 'acceptancePct' || field === 'orderAmount') {
        const amt = field === 'orderAmount' ? (value as number) : updated.orderAmount
        if (amt != null) {
          if (updated.depositPct != null) updated.depositAmount = amt * updated.depositPct
          if (updated.deliveryPct != null) updated.deliveryAmount = amt * updated.deliveryPct
          if (updated.acceptancePct != null) updated.acceptanceAmount = amt * updated.acceptancePct
        }
      }
      return updated
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (item?.id) {
        const res = await fetch(`/api/projects/${projectId}/capex/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        })
        if (!res.ok) throw new Error()
      } else {
        const res = await fetch(`/api/projects/${projectId}/capex`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        })
        if (!res.ok) throw new Error()
      }
      toast({ title: '儲存成功', description: item?.id ? '明細已更新' : '明細已新增' })
      onSaved()
      onOpenChange(false)
    } catch {
      toast({ title: '儲存失敗', description: '請稍後再試', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Helpers
  const chInput = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    updateField(field, e.target.value)
  const chNum = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    updateField(field, e.target.value === '' ? null : parseFloat(e.target.value))
  const chInt = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    updateField(field, e.target.value === '' ? 0 : parseInt(e.target.value))
  const chPct = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    updateField(field, e.target.value === '' ? null : parseInt(e.target.value) / 100)
  const chDate = (field: keyof CapexItemData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    updateField(field, e.target.value || null)

  // Accordion trigger summaries
  const basicSummary = [draft.supplier, draft.poNumber].filter(Boolean).join(' · ')
  const dateSummary = [draft.issueDate, draft.deliveryDate].filter(Boolean).join(' ~ ')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{item?.id ? '編輯採購明細' : '新增採購明細'}</DialogTitle>
          {item?.partDescription && (
            <DialogDescription>{item.partDescription}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-1">
          {/* Budget item selector — most prominent */}
          <div className="p-3 bg-muted/50 rounded-lg border">
            <Label className="text-sm font-medium mb-1.5 block">
              連結預估項目
              <span className="text-muted-foreground text-xs font-normal ml-1">
                選擇此明細所屬的預算項目
              </span>
            </Label>
            <Select
              value={draft.budgetItemId || '_none'}
              onValueChange={v => updateField('budgetItemId', v === '_none' ? null : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="選擇預估項目..." />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto" position="popper" sideOffset={4}>
                <SelectItem value="_none">不連結（其他採購項目）</SelectItem>
                {budgetItems.map((bi, biIdx) => (
                  <SelectItem key={bi.id || `_bi_${biIdx}`} value={bi.id || `_bi_${biIdx}`}>
                    <span className="flex items-center gap-2">
                      {[bi.station, bi.vendor, bi.equipment].filter(Boolean).join(' / ') || `項目 ${biIdx + 1}`}
                      {bi.estimatedCost != null && (
                        <span className="text-muted-foreground text-xs">
                          預估 {fmtNT(bi.estimatedCost)}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Accordion form sections */}
          <Accordion type="multiple" defaultValue={['basic', 'amount']} className="w-full">
            {/* Section 1: Basic info */}
            <AccordionItem value="basic">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  設備基本資訊
                  {basicSummary && (
                    <span className="text-xs text-muted-foreground font-normal ml-1">{basicSummary}</span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="設備類別">
                      <Select value={draft.equipmentCategory || '_empty'} onValueChange={v => updateField('equipmentCategory', v === '_empty' ? '' : v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="選擇" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_empty" className="text-xs">-</SelectItem>
                          {EQUIPMENT_CATEGORIES.map(c => (
                            <SelectItem key={c} value={c} className="text-xs">{c.replace('固定資產_', '')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="供應商">
                      <Input className="h-8 text-xs" value={draft.supplier} onChange={chInput('supplier')} />
                    </Field>
                    <Field label="採購單號 (PO)">
                      <Input className="h-8 text-xs" value={draft.poNumber} onChange={chInput('poNumber')} />
                    </Field>
                    <Field label="料號">
                      <Input className="h-8 text-xs" value={draft.partNumber} onChange={chInput('partNumber')} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="主檔摘要">
                      <Input className="h-8 text-xs" value={draft.masterSummary} onChange={chInput('masterSummary')} />
                    </Field>
                    <Field label="料號摘要" className="md:col-span-2">
                      <Input className="h-8 text-xs" value={draft.partDescription} onChange={chInput('partDescription')} />
                    </Field>
                    <Field label="站別">
                      <Input className="h-8 text-xs" value={draft.station} onChange={chInput('station')} />
                    </Field>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Amount */}
            <AccordionItem value="amount">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                <span className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  金額與數量
                  {draft.orderAmount != null && (
                    <Badge variant="secondary" className="ml-1 text-xs font-normal">
                      {fmtNT(draft.orderAmount)}
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-1">
                  <Field label="單位">
                    <Input className="h-8 text-xs" value={draft.unit} onChange={chInput('unit')} placeholder="SET" />
                  </Field>
                  <Field label="幣別">
                    <Select value={draft.currency} onValueChange={v => updateField('currency', v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="數量">
                    <Input className="h-8 text-xs text-right" type="number" value={draft.quantity || ''} onChange={chInt('quantity')} />
                  </Field>
                  <Field label="原幣議價">
                    <Input className="h-8 text-xs text-right" type="number" value={draft.originalPrice ?? ''} onChange={chNum('originalPrice')} />
                  </Field>
                  <Field label="台幣議價">
                    <Input className="h-8 text-xs text-right" type="number" value={draft.twdPrice ?? ''} onChange={chNum('twdPrice')} />
                  </Field>
                  <Field label="訂單金額">
                    <div className="h-8 flex items-center text-xs font-semibold text-right justify-end px-2 bg-muted/50 rounded-md border">
                      {fmtNT(draft.orderAmount)}
                    </div>
                  </Field>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 3: Dates */}
            <AccordionItem value="dates">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  日期資訊
                  {dateSummary && (
                    <span className="text-xs text-muted-foreground font-normal ml-1">{dateSummary}</span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                  <Field label="開立日期">
                    <Input className="h-8 text-xs" type="date" value={draft.issueDate ?? ''} onChange={chDate('issueDate')} />
                  </Field>
                  <Field label="設備入廠日">
                    <Input className="h-8 text-xs" type="date" value={draft.deliveryDate ?? ''} onChange={chDate('deliveryDate')} />
                  </Field>
                  <Field label="BPM 固資驗收">
                    <Input className="h-8 text-xs" type="date" value={draft.bpmAcceptanceDate ?? ''} onChange={chDate('bpmAcceptanceDate')} />
                  </Field>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 4: Payment schedule */}
            <AccordionItem value="payment" className="border-b-0">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  付款排程
                  {draft.paymentStatus && (
                    <PaymentBadge status={draft.paymentStatus} />
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-3 gap-3">
                    <PaymentBlock
                      title="訂金"
                      pct={draft.depositPct}
                      amount={draft.depositAmount}
                      payDate={draft.depositPayDate}
                      onPctChange={chPct('depositPct')}
                      onDateChange={chDate('depositPayDate')}
                    />
                    <PaymentBlock
                      title="交機/完工"
                      pct={draft.deliveryPct}
                      amount={draft.deliveryAmount}
                      payDate={draft.deliveryPayDate}
                      onPctChange={chPct('deliveryPct')}
                      onDateChange={chDate('deliveryPayDate')}
                    />
                    <PaymentBlock
                      title="驗收"
                      pct={draft.acceptancePct}
                      amount={draft.acceptanceAmount}
                      payDate={draft.acceptancePayDate}
                      onPctChange={chPct('acceptancePct')}
                      onDateChange={chDate('acceptancePayDate')}
                    />
                  </div>
                  <div className="w-40">
                    <Field label="付款狀態">
                      <Select value={draft.paymentStatus || '_empty'} onValueChange={v => updateField('paymentStatus', v === '_empty' ? '' : v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_empty" className="text-xs">-</SelectItem>
                          {PAYMENT_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="h-4 w-4 mr-1" /> 取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? '儲存中...' : '儲存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Helpers ───

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-0.5 block">{label}</Label>
      {children}
    </div>
  )
}

function PaymentBlock({ title, pct, amount, payDate, onPctChange, onDateChange }: {
  title: string
  pct: number | null
  amount: number | null
  payDate: string | null
  onPctChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="space-y-2 p-2 bg-muted/30 rounded-md">
      <div className="text-xs font-medium">{title}</div>
      <div className="grid grid-cols-2 gap-1">
        <Field label="%">
          <Input className="h-7 text-xs text-right" type="number" min={0} max={100}
            value={pct != null ? Math.round(pct * 100) : ''} onChange={onPctChange} />
        </Field>
        <Field label="金額">
          <div className="h-7 flex items-center text-xs text-right justify-end px-1 bg-background rounded">
            {fmtNT(amount)}
          </div>
        </Field>
      </div>
      <Field label="付款日">
        <Input className="h-7 text-xs" type="date" value={payDate ?? ''} onChange={onDateChange} />
      </Field>
    </div>
  )
}

function PaymentBadge({ status }: { status: string }) {
  if (!status) return null
  const variant = status === '已付清' ? 'default' : status === '部分付款' ? 'secondary' : 'outline'
  return <Badge variant={variant} className="text-xs">{status}</Badge>
}
