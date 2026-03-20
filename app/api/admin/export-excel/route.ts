import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import ExcelJS from 'exceljs'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

const STATUS_TEXT: Record<string, string> = { green: '正常', yellow: '注意', red: '風險' }
const TIERS = ['T1', 'T2', 'T3', 'CIP'] as const

/** Compute project status from tasks, same logic as project-transformer.ts */
function computeProjectStatus(
  tasks: { status: string; endDate: Date }[],
  projectEndDate: Date,
): 'green' | 'yellow' | 'red' {
  if (tasks.length === 0) return 'green'
  const today = new Date().toISOString().split('T')[0]
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.endDate.toISOString().split('T')[0] < today)
  const blockedTasks = tasks.filter(t => t.status === 'blocked')
  const doneTasks = tasks.filter(t => t.status === 'done')
  if (doneTasks.length === tasks.length) return 'green'
  const overdueRatio = overdueTasks.length / tasks.length
  const blockedRatio = blockedTasks.length / tasks.length
  const projectEnd = projectEndDate.toISOString().split('T')[0]
  if (overdueRatio > 0.3 || blockedRatio > 0.2 || (projectEnd < today && doneTasks.length < tasks.length)) return 'red'
  if (overdueTasks.length > 0 || blockedTasks.length > 0) return 'yellow'
  return 'green'
}

// Column definitions matching the template
const COLUMNS = [
  { header: '專案燈號', width: 10 },
  { header: '層別', width: 8 },
  { header: '專案類別', width: 12 },
  { header: '專案名稱', width: 23 },
  { header: '專案名稱', width: 22 },
  { header: '專案負責部門', width: 13 },
  { header: '專案負責人', width: 11 },
  { header: '專案目標', width: 37 },
  { header: '當前進度', width: 64 },
  { header: '專案成員', width: 27 },
  { header: '專案範疇', width: 23 },
  { header: 'KPI 指標', width: 16 },
  { header: '預計起訖時間', width: 19 },
  { header: '里程碑呈現', width: 39 },
  { header: '主要風險與應對', width: 23 },
  { header: '備註', width: 9 },
]

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF356854' } }
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: '微軟正黑體' }
const DATA_FONT: Partial<ExcelJS.Font> = { size: 10, name: '微軟正黑體' }
const BORDER_STYLE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: '待辦', in_progress: '進行中', done: '完成', blocked: '阻塞',
}

/** Use DeepSeek/OpenAI to summarize raw progress data into structured text */
async function aiSummarizeProgress(projectName: string, rawData: string): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const openaiKey = process.env.OPENAI_KEY

  const prompt = `你是一位專案管理報告助理。以下是專案「${projectName}」的原始進度資料，包含里程碑、任務及工作日誌紀錄。

請將這些資料整理成結構化的「當前進度」摘要，格式參考：
- 以里程碑為主要分類，用【里程碑名稱】標記
- 每個里程碑下列出關鍵任務的進展
- 用編號列表（1. 2. 3.）呈現重點
- 只保留關鍵資訊，去除冗餘內容
- 使用繁體中文
- 不要加任何前言後語，直接輸出整理後的進度

原始資料：
${rawData}`

  try {
    if (apiKey) {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
          temperature: 0.2,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        return data.choices?.[0]?.message?.content?.trim() || null
      }
    }

    if (openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
          temperature: 0.2,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        return data.choices?.[0]?.message?.content?.trim() || null
      }
    }
  } catch (e) {
    console.error(`AI summarize failed for ${projectName}:`, e)
  }
  return null
}

export async function GET(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Build date filter for task logs
  const logDateFilter: Record<string, unknown> = {}
  if (from) logDateFilter.gte = new Date(from)
  if (to) logDateFilter.lte = new Date(to)
  const hasDateFilter = Object.keys(logDateFilter).length > 0

  // Fetch projects with comprehensive data for progress
  const projects = await prisma.project.findMany({
    where: { projectTier: { not: null } },
    include: {
      owner: { select: { name: true } },
      teamMembers: { include: { user: { select: { name: true } } } },
      milestones: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true, dueDate: true, status: true, progress: true,
          tasks: {
            select: {
              id: true, title: true, status: true, progress: true, endDate: true,
              taskLogs: {
                where: hasDateFilter ? { logDate: logDateFilter } : undefined,
                orderBy: { logDate: 'desc' },
                take: 3,
                select: { content: true, logDate: true, nextPlans: true },
              },
              children: {
                select: {
                  title: true, status: true, progress: true,
                  taskLogs: {
                    where: hasDateFilter ? { logDate: logDateFilter } : undefined,
                    orderBy: { logDate: 'desc' },
                    take: 2,
                    select: { content: true, logDate: true },
                  },
                },
              },
            },
          },
        },
      },
      risks: { select: { title: true, description: true, mitigation: true } },
      tasks: {
        where: { parentId: null },
        select: { status: true, endDate: true },
      },
      weeklyUpdates: {
        orderBy: { weekOf: 'desc' },
        take: 1,
        select: {
          overallNotes: true, keyAchievements: true, blockers: true, nextWeekPlan: true,
          milestoneUpdates: {
            select: { notes: true, progress: true, milestone: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: [{ projectTier: 'asc' }, { createdAt: 'asc' }],
  })

  const typeConfigs = await prisma.projectTypeConfig.findMany()
  const typeLabel = new Map(typeConfigs.map(t => [t.key, t.label]))

  // Build raw progress data per project and run AI summarization in parallel
  const progressMap = new Map<string, string>()

  const aiTasks = projects.map(async (p) => {
    // Build raw progress data from milestones → tasks → task logs
    const rawParts: string[] = []

    for (const ms of p.milestones) {
      rawParts.push(`## 里程碑: ${ms.name} (進度${ms.progress}%, 狀態:${TASK_STATUS_LABEL[ms.status] ?? ms.status}, 到期:${formatDate(ms.dueDate)})`)

      for (const task of ms.tasks) {
        const taskStatusLabel = TASK_STATUS_LABEL[task.status] ?? task.status
        rawParts.push(`  - 任務: ${task.title} (進度${task.progress}%, ${taskStatusLabel})`)

        // Task logs (most recent)
        for (const log of task.taskLogs) {
          const logDate = log.logDate.toISOString().split('T')[0]
          rawParts.push(`    [${logDate}] ${log.content}`)
          if (log.nextPlans) {
            try {
              const plans = JSON.parse(log.nextPlans) as { content: string }[]
              if (plans.length > 0) rawParts.push(`    下一步: ${plans.map(pl => pl.content).join('; ')}`)
            } catch { /* ignore */ }
          }
        }

        // Subtask logs
        for (const child of task.children) {
          const childStatus = TASK_STATUS_LABEL[child.status] ?? child.status
          rawParts.push(`    - 子任務: ${child.title} (${child.progress}%, ${childStatus})`)
          for (const log of child.taskLogs) {
            rawParts.push(`      [${log.logDate.toISOString().split('T')[0]}] ${log.content}`)
          }
        }
      }
    }

    // Also include weekly update data
    const wu = p.weeklyUpdates[0]
    if (wu) {
      if (wu.keyAchievements) rawParts.push(`\n關鍵成果: ${wu.keyAchievements}`)
      if (wu.overallNotes) rawParts.push(`整體說明: ${wu.overallNotes}`)
      if (wu.blockers) rawParts.push(`阻礙: ${wu.blockers}`)
      if (wu.nextWeekPlan) rawParts.push(`下週計畫: ${wu.nextWeekPlan}`)
      for (const mu of wu.milestoneUpdates) {
        if (mu.notes) rawParts.push(`[週報-${mu.milestone.name}] ${mu.notes}`)
      }
    }

    const rawData = rawParts.join('\n')
    if (!rawData.trim()) {
      progressMap.set(p.id, '')
      return
    }

    // Try AI summarization
    const aiSummary = await aiSummarizeProgress(p.name, rawData)
    progressMap.set(p.id, aiSummary || rawData)
  })

  await Promise.all(aiTasks)

  // Create workbook
  const wb = new ExcelJS.Workbook()
  wb.creator = '專案管理系統'
  wb.created = new Date()

  for (const tier of TIERS) {
    const tierProjects = projects.filter(p => p.projectTier === tier)
    const ws = wb.addWorksheet(tier)
    ws.columns = COLUMNS.map(c => ({ width: c.width }))

    // Header row
    const headerRow = ws.addRow(COLUMNS.map(c => c.header))
    headerRow.height = 14
    headerRow.eachCell((cell) => {
      cell.font = HEADER_FONT
      cell.fill = HEADER_FILL
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = BORDER_STYLE
    })

    if (tierProjects.length === 0) {
      const emptyRow = ws.addRow(['目前沒有此層級的專案'])
      emptyRow.getCell(1).font = DATA_FONT
      ws.mergeCells(2, 1, 2, 16)
      emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      continue
    }

    let currentMergeStart = 2

    for (let i = 0; i < tierProjects.length; i++) {
      const p = tierProjects[i]

      const progressText = progressMap.get(p.id) || ''

      // Build milestone text
      const milestoneText = p.milestones
        .map(m => {
          const statusIcon = m.status === 'done' ? '✓' : m.status === 'in_progress' ? '▶' : '○'
          return `${statusIcon} ${m.name} (${formatDate(m.dueDate)})`
        })
        .join('\n')

      // Build risk text
      const riskText = p.risks
        .map(r => {
          const parts = [r.title]
          if (r.description) parts.push(r.description)
          if (r.mitigation) parts.push(`應對：${r.mitigation}`)
          return parts.join('\n')
        })
        .join('\n\n')

      const memberNames = p.teamMembers.map(m => m.user.name).join('、')
      const dateRange = `${formatDate(p.startDate)}~${formatDate(p.endDate)}`
      const category = typeLabel.get(p.projectType) ?? p.projectType
      const computedStatus = computeProjectStatus(p.tasks, p.endDate)

      const rowData = [
        `(${STATUS_TEXT[computedStatus] ?? computedStatus})`,
        tier,
        category,
        p.name,
        p.name,
        '',
        p.owner.name,
        p.objective || '',
        progressText,
        memberNames,
        p.scope || '',
        p.smartMeasurable || p.roi || '',
        dateRange,
        milestoneText,
        riskText,
        '',
      ]

      const dataRow = ws.addRow(rowData)
      dataRow.eachCell((cell) => {
        cell.font = DATA_FONT
        cell.alignment = { vertical: 'middle', wrapText: true }
        cell.border = BORDER_STYLE
      })
      dataRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      dataRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

      // Status cell background color
      const statusCell = dataRow.getCell(1)
      if (computedStatus === 'green') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }
      } else if (computedStatus === 'yellow') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } }
      } else if (computedStatus === 'red') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }
      }
      statusCell.alignment = { horizontal: 'center', vertical: 'middle' }

      // White background for data cells
      for (let c = 2; c <= 16; c++) {
        const cell = dataRow.getCell(c)
        if (!cell.fill || (cell.fill as { pattern?: string }).pattern !== 'solid') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        }
      }

      // Merge B and D columns for consecutive rows with same project name
      const rowNum = i + 2
      const nextP = tierProjects[i + 1]
      if (!nextP || nextP.name !== p.name) {
        if (currentMergeStart < rowNum) {
          ws.mergeCells(currentMergeStart, 2, rowNum, 2)
          ws.mergeCells(currentMergeStart, 4, rowNum, 4)
        }
        currentMergeStart = rowNum + 1
      }
    }

    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]
  }

  const buffer = await wb.xlsx.writeBuffer()
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const filename = `專案清單_${dateStr}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
