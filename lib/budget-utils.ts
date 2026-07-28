/**
 * 預算卡數字計算：以採購明細(capex)為主，呈現「目前付出 / 實際採購」。
 *
 * 背景：頂部/報告/儀表板/看板的「預算」數字原本讀舊的 budgetItems.actualCost，
 * 但實際付款金額都記在 capex 採購明細的訂/交/檢分期裡（有付款日者才算已付出），
 * 導致分子恆為 0。此工具統一計算，四處共用避免分歧。
 */

export interface CapexBudgetInput {
  orderAmount?: number | null
  depositPct?: number | null
  depositAmount?: number | null
  depositPayDate?: unknown // Date | string | null 皆可
  depositPaid?: boolean | null
  deliveryPct?: number | null
  deliveryAmount?: number | null
  deliveryPayDate?: unknown
  deliveryPaid?: boolean | null
  acceptancePct?: number | null
  acceptanceAmount?: number | null
  acceptancePayDate?: unknown
  acceptancePaid?: boolean | null
}

/** 實際採購 = 各明細訂購金額(orderAmount)加總 */
export function capexPurchaseTotal(items: CapexBudgetInput[]): number {
  return items.reduce((s, i) => s + (i.orderAmount ?? 0), 0)
}

/** 目前付出 = 訂/交/檢「已付款」的分期金額加總（以「已付款」勾選為準；相容舊資料：無勾選欄位時退回看有無付款日）。
 *  金額欄位缺漏時，以「訂購總額 × 比例」回推（相容只填比例、沒填金額的匯入資料，否則分子誤為 0）。*/
export function capexPaidTotal(items: CapexBudgetInput[]): number {
  return items.reduce((s, i) => {
    const order = i.orderAmount ?? 0
    const part = (paid: boolean, amount: number | null | undefined, pct: number | null | undefined) =>
      paid ? (amount ?? (pct != null ? order * pct : 0)) : 0
    return s + part(i.depositPaid ?? !!i.depositPayDate, i.depositAmount, i.depositPct)
      + part(i.deliveryPaid ?? !!i.deliveryPayDate, i.deliveryAmount, i.deliveryPct)
      + part(i.acceptancePaid ?? !!i.acceptancePayDate, i.acceptanceAmount, i.acceptancePct)
  }, 0)
}

/**
 * 有採購明細(實際採購>0)時 → { used: 已付款, denom: 實際採購 }；
 * 否則回傳 fallback（沒有採購明細的舊專案沿用舊預算表數字）。
 */
export function computeCapexBudget(
  items: CapexBudgetInput[] | undefined | null,
  fallback: { used: number; denom: number },
): { used: number; denom: number } {
  const purchase = items ? capexPurchaseTotal(items) : 0
  if (purchase <= 0) return fallback
  return { used: capexPaidTotal(items!), denom: purchase }
}
