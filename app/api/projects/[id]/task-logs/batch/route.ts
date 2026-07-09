import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncTaskProgressFromLogs, syncMilestoneStatus } from '@/lib/sync-milestone-status'
import { notifyRecordUploadedToAccountable } from '@/lib/notifications'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/task-logs/batch — Batch create/update task logs ───

interface BatchEntry {
  logDate: string
  content: string
  existingLogId?: string  // if set, update instead of create
  attachments?: { name: string; url: string; type: 'image' | 'file' }[]
}

interface BatchBody {
  taskId: string
  userId: string
  weekOf?: string          // 填報週（Monday YYYY-MM-DD）；讓 A 依填報週看到 R 的報告
  entries: BatchEntry[]
  nextPlans?: { date?: string; content: string }[]
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: BatchBody = await request.json()

    if (!body.taskId || !body.userId || !body.entries?.length) {
      return NextResponse.json({ error: '必填欄位不完整' }, { status: 400 })
    }

    const task = await prisma.task.findFirst({
      where: { id: body.taskId, projectId: id },
    })
    if (!task) {
      return NextResponse.json({ error: '找不到該任務' }, { status: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true },
    })
    if (!user) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    }

    const validPlans = body.nextPlans?.filter(p => p.content.trim()) || []

    // Process entries: create new or update existing
    const results = await prisma.$transaction(async (tx) => {
      const created: string[] = []
      const updated: string[] = []

      for (const entry of body.entries) {
        if (!entry.content.trim()) continue

        const attachmentsJson = entry.attachments?.length
          ? JSON.stringify(entry.attachments)
          : undefined

        if (entry.existingLogId) {
          // Update existing log
          await tx.taskLog.update({
            where: { id: entry.existingLogId },
            data: {
              content: entry.content.trim(),
              logDate: new Date(entry.logDate),
              lastEditedBy: user.name,
              ...(body.weekOf ? { weekOf: body.weekOf } : {}),
              ...(attachmentsJson !== undefined ? { attachments: attachmentsJson } : {}),
            },
          })
          updated.push(entry.existingLogId)
        } else {
          // 同一任務+同一天+同一作者才視為同一筆（A 與 R 各自獨立，不互相覆蓋）
          const existing = await tx.taskLog.findFirst({
            where: {
              taskId: body.taskId,
              logDate: new Date(entry.logDate),
              authorId: user.id,
            },
          })

          if (existing) {
            // 同一天同作者視為同一筆：附件用「合併」(舊 ∪ 新，以 url 去重)，
            // 避免使用者同一天開兩列時，後寫的那列把前一列附件蓋掉。
            let mergedAttachmentsJson = attachmentsJson
            if (entry.attachments?.length) {
              type Att = { name: string; url: string; type: 'image' | 'file' }
              const oldAtts: Att[] = existing.attachments ? JSON.parse(existing.attachments) : []
              const merged: Att[] = [...oldAtts]
              for (const a of entry.attachments) {
                if (!merged.some(o => o.url === a.url)) merged.push(a)
              }
              mergedAttachmentsJson = JSON.stringify(merged)
            }
            await tx.taskLog.update({
              where: { id: existing.id },
              data: {
                content: entry.content.trim(),
                lastEditedBy: user.name,
                ...(body.weekOf ? { weekOf: body.weekOf } : {}),
                ...(mergedAttachmentsJson !== undefined ? { attachments: mergedAttachmentsJson } : {}),
              },
            })
            updated.push(existing.id)
          } else {
            const log = await tx.taskLog.create({
              data: {
                taskId: body.taskId,
                projectId: id,
                authorId: user.id,
                logDate: new Date(entry.logDate),
                content: entry.content.trim(),
                ...(body.weekOf ? { weekOf: body.weekOf } : {}),
                ...(attachmentsJson !== undefined ? { attachments: attachmentsJson } : {}),
              },
            })
            created.push(log.id)
          }
        }
      }

      // Attach nextPlans to the latest entry (by date)
      if (validPlans.length > 0) {
        const sortedEntries = body.entries
          .filter(e => e.content.trim())
          .sort((a, b) => b.logDate.localeCompare(a.logDate))
        const latestDate = sortedEntries[0]?.logDate
        if (latestDate) {
          const latestLog = await tx.taskLog.findFirst({
            where: { taskId: body.taskId, logDate: new Date(latestDate), authorId: user.id },
          })
          if (latestLog) {
            await tx.taskLog.update({
              where: { id: latestLog.id },
              data: { nextPlans: JSON.stringify(validPlans) },
            })
          }
        }
      }

      return { created: created.length, updated: updated.length }
    })

    // Sync task progress & milestone
    const allLogs = await prisma.taskLog.findMany({
      where: { taskId: body.taskId },
      select: { taskId: true, logDate: true },
    })
    await syncTaskProgressFromLogs([task], allLogs)
    await syncMilestoneStatus(task.milestoneId, id)

    // R（或任何非 A 的成員）送出工作紀錄 → 通知該專案當責 A（去重見 notifyRecordUploadedToAccountable）
    if (results.created + results.updated > 0) {
      const proj = await prisma.project.findUnique({ where: { id }, select: { name: true } })
      await notifyRecordUploadedToAccountable({
        projectId: id,
        projectName: proj?.name || '專案',
      })
    }

    return NextResponse.json({
      success: true,
      created: results.created,
      updated: results.updated,
      message: `已儲存 ${results.created + results.updated} 筆工作紀錄`,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to batch save task logs:', error)
    return NextResponse.json({ error: '批次儲存工作紀錄失敗' }, { status: 500 })
  }
}
