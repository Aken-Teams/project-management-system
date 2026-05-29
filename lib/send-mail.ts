import https from 'https'
import http from 'http'
import { NextRequest } from 'next/server'

const AD_URL = process.env.AD_URL ?? ''
const AD_API = process.env.AD_API ?? ''

/**
 * Parse a NextRequest body as UTF-8 JSON.
 * Workaround for Next.js request.json() mishandling non-ASCII on Windows.
 */
export async function parseJsonUtf8<T = unknown>(request: NextRequest): Promise<T> {
  const buf = Buffer.from(await request.arrayBuffer())
  return JSON.parse(buf.toString('utf-8'))
}

interface MailPayload {
  to: string[]
  cc?: string[]
  subject: string
  body: string
  is_html?: boolean
  attachments?: { filename: string; content: string; cid?: string }[]
}

/**
 * Send email via AD mail API using Node.js native https module.
 * This avoids encoding issues with fetch/undici on Windows.
 */
export function sendMail(payload: MailPayload): Promise<{ success: boolean; message?: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${AD_URL}/ldap/api/v1/mail/send`)
    const isHttps = url.protocol === 'https:'
    const mod = isHttps ? https : http

    const bodyBytes = Buffer.from(JSON.stringify(payload), 'utf-8')

    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': bodyBytes.length,
          'X-API-Key': AD_API,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8')
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body))
            } catch {
              resolve({ success: true, message: body })
            }
          } else {
            reject(new Error(`Mail API error ${res.statusCode}: ${body}`))
          }
        })
      },
    )

    req.on('error', reject)
    req.write(bodyBytes)
    req.end()
  })
}
