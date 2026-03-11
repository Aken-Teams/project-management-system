export async function register() {
  // 只在 Node.js runtime 執行（不在 Edge runtime）
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // 延遲 3 秒，等 DB 連線初始化完成
  await new Promise(r => setTimeout(r, 3000))

  try {
    const { prisma } = await import('@/lib/db')
    const { schedule } = await import('node-cron')

    const baseUrl = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
    const authHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {}),
    }

    // 每小時整點觸發，路由內部自行從 DB 讀取排程設定並判斷是否執行
    // 這樣管理員在後台修改時間後，下一個整點即生效，不需重啟 App
    schedule('0 * * * *', async () => {
      await Promise.allSettled([
        fetch(`${baseUrl}/api/cron/weekly-notification`, { method: 'POST', headers: authHeaders })
          .then(r => r.json()).then(d => { if (!d.skipped) console.log('[Cron] 通知:', d) })
          .catch(e => console.error('[Cron] 通知失敗:', e)),
        fetch(`${baseUrl}/api/cron/weekly-report`, { method: 'POST', headers: authHeaders })
          .then(r => r.json()).then(d => { if (!d.skipped) console.log('[Cron] 報告:', d) })
          .catch(e => console.error('[Cron] 報告失敗:', e)),
      ])
    })

    console.log(`[Cron] 排程已啟動，每小時整點檢查 DB 設定（${baseUrl}）`)
  } catch (e) {
    console.error('[Cron] 排程初始化失敗:', e)
  }
}
