/**
 * 資料遷移腳本：PostgreSQL → MySQL
 * 用法：npx tsx scripts/migrate-pg-to-mysql.ts
 */
import 'dotenv/config'
import { Pool } from 'pg'
import mysql from 'mysql2/promise'

const PG_URL =
  'postgresql://pm_admin:pm_secret_2026@ai-pms-db.theaken.com:65535/project_management'

// 依照 FK 依賴順序排列（parent 先於 child）
const TABLES: string[] = [
  'users',
  'project_code_sequences',
  'projects',
  'project_team_members',
  'milestones',
  'milestone_baselines',
  'tasks',               // self-ref (parent_id)，靠 FK_CHECKS=0 解決
  'task_dependencies',
  'task_logs',
  'risks',
  'weekly_updates',
  'milestone_updates',
  'delay_requests',
  'affected_milestones',
  'notifications',
  'project_drafts',
  'share_links',
]

async function main() {
  // ── 連線 ────────────────────────────────────────────
  const pg = new Pool({ connectionString: PG_URL })

  const my = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    database: process.env.MYSQL_DB,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    dateStrings: false,   // 讓 mysql2 回傳 Date 物件
    timezone: '+00:00',   // 統一 UTC
  })

  try {
    console.log('🚀  開始遷移 PostgreSQL → MySQL\n')

    // 關閉外鍵檢查，方便批量寫入
    await my.execute('SET FOREIGN_KEY_CHECKS = 0')
    await my.execute("SET time_zone = '+00:00'")

    // ── 逐表遷移 ────────────────────────────────────
    for (const table of TABLES) {
      // 先清空 MySQL 目標表（避免重複執行時衝突）
      await my.execute(`DELETE FROM \`${table}\``)

      // 從 PostgreSQL 讀取全部資料
      const { rows, rowCount } = await pg.query(`SELECT * FROM "${table}"`)

      if (!rowCount || rows.length === 0) {
        console.log(`  ⬜  ${table.padEnd(32)} 0 筆（略過）`)
        continue
      }

      const columns = Object.keys(rows[0])
      const colList = columns.map((c) => `\`${c}\``).join(', ')
      const placeholders = columns.map(() => '?').join(', ')
      const sql = `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`

      let inserted = 0
      for (const row of rows) {
        const values = columns.map((col) => {
          const v = row[col]
          if (v === null || v === undefined) return null
          // JSONB / object → JSON 字串
          if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v)
          return v
        })

        await my.execute(sql, values)
        inserted++
      }

      console.log(`  ✅  ${table.padEnd(32)} ${inserted} 筆`)
    }

    // 重新開啟外鍵檢查
    await my.execute('SET FOREIGN_KEY_CHECKS = 1')

    console.log('\n🎉  遷移完成！')
  } catch (err) {
    await my.execute('SET FOREIGN_KEY_CHECKS = 1').catch(() => {})
    console.error('\n❌  遷移失敗：', err)
    process.exit(1)
  } finally {
    await pg.end()
    await my.end()
  }
}

main()
