import type { NotificationType } from '@/lib/notification-store'

/**
 * 依通知類型決定點擊後導向的頁面。
 *
 * 重點：有些通知（未上傳週報、週報已送出）是「跨專案彙總、per-user」發送，
 * DB 上沒有 project_id，不能只靠 projectId 導覽，否則會變成「沒有連結」。
 * 這裡改以「類型語意」決定目的地：
 *   - 報告審核（R主管要審） → 我的任務 › 審查報告
 *   - 確認完成（A 要確認）   → 我的任務 › 當責
 *   - 週報相關（我要補寫）   → 我的任務 › 我的任務週報
 *   - 其餘（跟單一專案有關）  → 專案詳細
 *
 * 回傳 null 表示沒有適合的導覽目標（極少數無專案的雜項通知）。
 */
export function notificationHref(n: { type: NotificationType; projectId?: string }): string | null {
  const pid = n.projectId
  switch (n.type) {
    // R主管要審的報告 → 審查報告分頁
    case 'report-review-needed':
      return '/my-tasks?role=REVIEW'
    // A 要處理的：確認完成、追主管審核逾期 → 當責分頁
    case 'report-done-review':
    case 'report-review-overdue':
      return '/my-tasks?role=A'
    // 未上傳週報 → 我的任務週報（去補寫）
    case 'weekly-upload-missing':
      return '/my-tasks?role=MY'
    // 週報已送出 / 報告已進更新紀錄 → 專案更新紀錄分頁；沒專案就回我的任務週報
    case 'weekly-report-ready':
    case 'report-published':
      return pid ? `/projects/${pid}?tab=updates` : '/my-tasks?role=MY'
    // 其餘（任務指派、延期、逾期、支援、工作紀錄）→ 專案詳細
    default:
      return pid ? `/projects/${pid}` : null
  }
}
