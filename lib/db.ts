import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaMariaDb({
    host: process.env.MYSQL_HOST!,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER!,
    password: process.env.MYSQL_PASSWORD!,
    database: process.env.MYSQL_DB!,
    // 連線池上限。單一頁面一次會打 5～6 支 API，每支又各跑數個查詢，5 條容易排隊。
    connectionLimit: 15,
    connectTimeout: 8000,
    // 等待取得連線的上限。刻意不要調太長——資料庫若連不上（網路不通、主機掛掉），
    //   等越久只是讓每一支 API 都卡在那裡，使用者盯著空白頁；快點失敗反而好判斷。
    acquireTimeout: 10000,
    allowPublicKeyRetrieval: true,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
