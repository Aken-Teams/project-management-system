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

/**
 * capexPaidTotal / capexPurchaseTotal 需要的欄位。
 *
 * 一定要用這個常數去 select，不要在各自的查詢裡手抄。
 *   先前看板／儀表板／報告三處各抄一份，而且都漏了 *Paid 與 *Pct：
 *   - 漏 depositPaid → 退回看「有沒有付款日」。已排定付款日但還沒付的被當成已付（高估），
 *     勾了已付款卻沒填日期的被當成沒付（低估）。兩個方向的錯同時存在。
 *   - 漏 depositPct  → 只填比例沒填金額的匯入資料一律算 0。
 *   實際踩過：RD-2026-001 看板顯示 48.9M，正確值 16.1M（高估 32.8M）；
 *            RD-2026-017/018 顯示 0，正確值 3.3M / 2.9M。
 */
export const CAPEX_BUDGET_SELECT = {
  orderAmount: true,
  depositPaid: true, depositAmount: true, depositPct: true, depositPayDate: true,
  deliveryPaid: true, deliveryAmount: true, deliveryPct: true, deliveryPayDate: true,
  acceptancePaid: true, acceptanceAmount: true, acceptancePct: true, acceptancePayDate: true,
} as const

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
 * 看板／詳情／報告／儀表板的金錢卡：**已採購 ÷ 預算**。
 *
 * 為什麼不是「已付款 ÷ 已採購」（客戶決策 2026-10-29）：
 *   ① 採購了還沒付款是正常的——訂/交/檢本來就分期付，那個比例反映的是付款排程，
 *      不是專案狀況，PM 看了不知道要做什麼。
 *   ② 分母用「已採購」會跟著自己移動：下單越多分母越大，百分比反而可能往下掉，
 *      根本不能拿來追蹤或跨專案比較。
 *   ③ 實際踩過：RD-2026-014 預算 28.7M 只下單 0.1M，卻因為那 0.1M 付清了而顯示 100%；
 *      RD-2026-018 預算 6.6M 全額下單（真的該警示）卻只顯示 44%。兩個都指反方向。
 *   改成「已採購 ÷ 預算」之後基準固定，超過 100% 就是真的超出預算。
 *
 * 分母優先用設備清單的預估支出合計；沒有清單時退回專案預算欄位。
 * 付款進度不消失，移到投資報酬頁的「已付款」那一格。
 */
export function computeBudgetVsPurchase(
  items: CapexBudgetInput[] | undefined | null,
  baseline: { estimatedTotal: number; projectBudget: number },
): { purchased: number; budget: number } {
  return {
    purchased: items ? capexPurchaseTotal(items) : 0,
    budget: baseline.estimatedTotal > 0 ? baseline.estimatedTotal : baseline.projectBudget,
  }
}
