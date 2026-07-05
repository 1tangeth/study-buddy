import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { generateFlashcards, streamAnswer } from './ai'
import { extractText } from './extract'
import { getDoc, saveDoc } from './store'

// create express server object
export const app = express() 
// upload object setting
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// server object settings
app.use(cors())
app.use(express.json())



// Rate Limiting: don't let one user send too many requests too quickly
// rl is a notebook that records request time 
// e.g. ""upload:127.0.0.1"" , [1720000000000, 1720000005000, 1720000009000] (array of time stamps)
const rl = new Map<string, number[]>() 

// "export" allows another file to import this function
export const _resetRateLimiter = () => rl.clear() // when this function is called, it runs r1.clear() that removes every saved timestamp from the map

/**
 * Checks if whether a user is still allowed to make a request
 * @param ip 
 * @param bucket category of request e.g "upload" "ask"
 * @param max maximum number of request
 * @param windowMs time window 
 * @returns 
 */
function checkLimit(ip: string, bucket: string, max: number, windowMs: number): boolean {
  const key = `${bucket}:${ip}` // create unique key
  const now = Date.now()
  // ?? means if empty then use [] empty array instead
  // keep only recent requests that are still inside the current time window, if windowMS is 60_000, keeps request only from last 60 secs
  const hits = (rl.get(key) ?? []).filter(t => now - t < windowMs)

  // if user has too many recent requests, 1. save the cleaned-up recent hits back into r1, 2. return false do not allow thisrequest
  if (hits.length >= max) { rl.set(key, hits); return false }
  hits.push(now) // if user request under limit push the current time
  rl.set(key, hits) // save the updated request history
  return true
}

/**
 * Figure out user's IP Address
 */
function clientIp(req: express.Request): string {
  const xff = req.headers['x-forwarded-for']
  return (Array.isArray(xff) ? xff[0] : xff?.split(',')[0])?.trim() ?? req.ip ?? '?'
}

// REST API --------------------------------------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

// upload file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  // allow to make request?
  if (!checkLimit(clientIp(req), 'upload', 5, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  const file = req.file

  // empty file?
  if (!file) return res.status(400).json({ detail: 'No file provided' })

  // get file name, "upload.txt" if no name
  const name = file.originalname ?? 'upload.txt'

  // file type check
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext !== 'pdf' && ext !== 'txt') {
    return res.status(400).json({ detail: 'Only .txt and .pdf files are supported' })
  }


  try {
    // get text from file
    let text = await extractText(name, file.buffer)
    if (!text.trim()) return res.status(422).json({ detail: 'Could not extract any text from this file' })
    text = text.slice(0, 100_000)
    // save the document
    const docId = saveDoc(name, text)

    // respond with docid name char count and preview
    res.json({ doc_id: docId, filename: name, char_count: text.length, preview: text.slice(0, 300) })
  } catch (e: any) {
    res.status(422).json({ detail: e.message ?? 'Extraction failed' })
  }
})



// ask question to gemini
app.post('/api/ask', async (req, res) => {
  // check maximum number of request in current 60s window
  if (!checkLimit(clientIp(req), 'ask', 20, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  // extract information from request body
  const { doc_id, question, action = 'free' } = req.body as {
    doc_id: string
    question: string
    action?: string
  }

  if (!doc_id || !question?.trim()) {
    return res.status(400).json({ detail: 'doc_id and question are required' })
  }
  
  // get document
  const doc = getDoc(doc_id)
  if (!doc) return res.status(404).json({ detail: 'Document not found — please re-upload' })
  
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Every time the AI gives us another small piece of the answer, send that piece to the frontend immediately
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

app.post('/api/flashcards', async (req, res) => {
  if (!checkLimit(clientIp(req), 'flashcards', 3, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  const { doc_id } = req.body as { doc_id: string }
  if (!doc_id) return res.status(400).json({ detail: 'doc_id is required' })

  const doc = getDoc(doc_id)
  if (!doc) return res.status(404).json({ detail: 'Document not found — please re-upload' })

  try {
    const deck = await generateFlashcards(doc.text)
    res.json(deck)
  } catch (e: any) {
    if (e instanceof SyntaxError) {
      return res.status(422).json({ detail: 'Could not parse flash cards — please try again.' })
    }
    res.status(500).json({ detail: e.message ?? 'Flash card generation failed' })
  }
})
