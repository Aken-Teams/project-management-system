import { NextRequest, NextResponse } from 'next/server'

interface SubtaskEntry {
  title: string
  progress: number
  content: string
}

// ─── POST /api/ai/summarize ──────────────────────────────
// Summarizes subtask work logs into a parent task work log.
// Uses DeepSeek API if DEEPSEEK_API_KEY is set, otherwise
// falls back to a simple text-based summary.

export async function POST(request: NextRequest) {
  try {
    const { entries, taskTitle } = (await request.json()) as {
      entries: SubtaskEntry[]
      taskTitle: string
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: '沒有子任務紀錄' }, { status: 400 })
    }

    const apiKey = process.env.DEEPSEEK_API_KEY
    if (apiKey) {
      const prompt = `你是一位專案管理助理。以下是任務「${taskTitle}」的子任務工作紀錄，請幫我彙整成一段簡潔的父任務工作摘要（使用繁體中文，100字以內）：\n\n${entries.map(e => `- ${e.title}（進度 ${e.progress}%）：${e.content}`).join('\n')}`

      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.3,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const summary = data.choices?.[0]?.message?.content?.trim()
        if (summary) {
          return NextResponse.json({ summary })
        }
      }
    }

    // Fallback: simple text-based summary
    const totalProgress = entries.reduce((sum, e) => sum + e.progress, 0)
    const avgProgress = Math.round(totalProgress / entries.length)
    const summary = `【子任務彙整】整體進度 ${avgProgress}%\n\n` +
      entries.map(e => `• ${e.title}（${e.progress}%）— ${e.content}`).join('\n')

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('AI summarize error:', error)
    return NextResponse.json({ error: '彙整失敗' }, { status: 500 })
  }
}
