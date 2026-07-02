import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { streamAnswer } from './ai'
import { extractText } from './extract'
import { getDoc, saveDoc } from './store'

export const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

app.use(cors())
app.use(express.json())

const rl = new Map<string, number[]>()

export const _resetRateLimiter = () => rl.clear()

function checkLimit(ip: string, bucket: string, max: number, windowMs: number): boolean {
  const key = `${bucket}:${ip}`
  const now = Date.now()
  const hits = (rl.get(key) ?? []).filter(t => now - t < windowMs)
  if (hits.length >= max) { rl.set(key, hits); return false }
  hits.push(now)
  rl.set(key, hits)
  return true
}

function clientIp(req: express.Request): string {
  const xff = req.headers['x-forwarded-for']
  return (Array.isArray(xff) ? xff[0] : xff?.split(',')[0])?.trim() ?? req.ip ?? '?'
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!checkLimit(clientIp(req), 'upload', 5, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  const file = req.file
  if (!file) return res.status(400).json({ detail: 'No file provided' })

  const name = file.originalname ?? 'upload.txt'
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext !== 'pdf' && ext !== 'txt') {
    return res.status(400).json({ detail: 'Only .txt and .pdf files are supported' })
  }

  try {
    let text = await extractText(name, file.buffer)
    if (!text.trim()) return res.status(422).json({ detail: 'Could not extract any text from this file' })
    text = text.slice(0, 100_000)
    const docId = saveDoc(name, text)
    res.json({ doc_id: docId, filename: name, char_count: text.length, preview: text.slice(0, 300) })
  } catch (e: any) {
    res.status(422).json({ detail: e.message ?? 'Extraction failed' })
  }
})

app.post('/api/ask', async (req, res) => {
  if (!checkLimit(clientIp(req), 'ask', 20, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  const { doc_id, question, action = 'free' } = req.body as {
    doc_id: string
    question: string
    action?: string
  }

  if (!doc_id || !question?.trim()) {
    return res.status(400).json({ detail: 'doc_id and question are required' })
  }

  const doc = getDoc(doc_id)
  if (!doc) return res.status(404).json({ detail: 'Document not found — please re-upload' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    for await (const delta of streamAnswer(doc.text, question, action)) {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`)
    }
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`)
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  res.end()
})
