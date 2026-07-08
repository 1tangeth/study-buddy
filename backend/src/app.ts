import { createHash } from 'crypto'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { generateFlashcards, generateQuiz, streamAnswer } from './ai'
import { hashPassword, signAccessToken, signRefreshToken, verifyPassword, verifyRefreshToken } from './auth'
import { db } from './db'
import { extractText } from './extract'
import { type AuthRequest, requireAuth } from './middleware/requireAuth'
import { getDoc, saveDoc } from './store'

export const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Rate Limiting
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

async function getOrLoadDoc(docId: string, userId: string) {
  let doc = getDoc(docId)
  if (!doc) {
    const dbDoc = await db.document.findUnique({ where: { id: docId } })
    if (!dbDoc || dbDoc.userId !== userId) return null
    saveDoc(dbDoc.filename, dbDoc.text, dbDoc.id)
    doc = getDoc(docId)!
  }
  return doc
}

function setRefreshCookie(res: express.Response, token: string) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh',
  })
}

// ── Health ────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

// ── Auth ──────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { email, password, displayName } = req.body as {
    email?: string
    password?: string
    displayName?: string
  }

  if (!email?.trim() || !password?.trim()) {
    return res.status(400).json({ detail: 'email and password are required' })
  }
  if (password.length < 8) {
    return res.status(400).json({ detail: 'Password must be at least 8 characters' })
  }

  try {
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return res.status(409).json({ detail: 'Email already in use' })

    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        displayName: displayName?.trim() || null,
      },
    })

    const accessToken = signAccessToken(user.id)
    const refreshToken = signRefreshToken(user.id)
    setRefreshCookie(res, refreshToken)

    res.status(201).json({
      access_token: accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    })
  } catch (e: any) {
    res.status(500).json({ detail: e.message ?? 'Registration failed' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email?.trim() || !password?.trim()) {
    return res.status(400).json({ detail: 'email and password are required' })
  }

  try {
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ detail: 'Invalid email or password' })
    }

    const accessToken = signAccessToken(user.id)
    const refreshToken = signRefreshToken(user.id)
    setRefreshCookie(res, refreshToken)

    res.json({
      access_token: accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    })
  } catch (e: any) {
    res.status(500).json({ detail: e.message ?? 'Login failed' })
  }
})

app.post('/api/auth/refresh', (req, res) => {
  const token = req.cookies?.refresh_token
  if (!token) return res.status(401).json({ detail: 'No refresh token' })

  try {
    const { sub } = verifyRefreshToken(token)
    const accessToken = signAccessToken(sub)
    const newRefresh = signRefreshToken(sub)
    setRefreshCookie(res, newRefresh)
    res.json({ access_token: accessToken })
  } catch {
    res.status(401).json({ detail: 'Refresh token expired or invalid' })
  }
})

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' })
  res.json({ ok: true })
})

app.get('/api/me', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, createdAt: true },
  })
  if (!user) return res.status(404).json({ detail: 'User not found' })
  res.json(user)
})

// ── Documents (history) ───────────────────────────────────────────────────

app.get('/api/documents', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest
  const docs = await db.document.findMany({
    where: { userId },
    select: { id: true, filename: true, charCount: true, createdAt: true, text: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(docs.map(d => ({
    id: d.id,
    filename: d.filename,
    charCount: d.charCount,
    createdAt: d.createdAt,
    preview: d.text.slice(0, 300),
  })))
})

app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest
  const doc = await db.document.findUnique({ where: { id: req.params.id } })
  if (!doc || doc.userId !== userId) return res.status(404).json({ detail: 'Document not found' })
  await db.document.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

app.get('/api/documents/:id/active-session', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest
  const doc = await db.document.findUnique({ where: { id: req.params.id } })
  if (!doc || doc.userId !== userId) return res.status(404).json({ detail: 'Document not found' })

  const session = await db.chatSession.findFirst({
    where: { documentId: req.params.id, userId },
    orderBy: { lastActive: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  })

  if (!session) return res.json(null)
  res.json({ sessionId: session.id, messages: session.messages })
})

app.get('/api/documents/:id/sessions', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest
  const doc = await db.document.findUnique({ where: { id: req.params.id } })
  if (!doc || doc.userId !== userId) return res.status(404).json({ detail: 'Document not found' })

  const sessions = await db.chatSession.findMany({
    where: { documentId: req.params.id },
    orderBy: { lastActive: 'desc' },
    select: { id: true, createdAt: true, lastActive: true },
  })
  res.json(sessions)
})

app.get('/api/sessions/:id/messages', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest
  const session = await db.chatSession.findUnique({ where: { id: req.params.id } })
  if (!session || session.userId !== userId) return res.status(404).json({ detail: 'Session not found' })

  const messages = await db.message.findMany({
    where: { sessionId: req.params.id },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, action: true, createdAt: true },
  })
  res.json(messages)
})

// ── Upload ────────────────────────────────────────────────────────────────

app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!checkLimit(clientIp(req), 'upload', 5, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  const { userId } = req as AuthRequest
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

    const contentHash = createHash('sha256').update(text).digest('hex')

    const existing = await db.document.findFirst({
      where: { userId, contentHash },
      select: { id: true, filename: true },
    })
    if (existing) {
      return res.status(409).json({
        detail: `You already uploaded this document as "${existing.filename}".`,
        existing_doc_id: existing.id,
        existing_filename: existing.filename,
      })
    }

    // save to DB under this user
    const dbDoc = await db.document.create({
      data: { userId, filename: name, text, charCount: text.length, contentHash },
    })

    // also cache in memory for the current session
    saveDoc(name, text, dbDoc.id)

    res.json({ doc_id: dbDoc.id, filename: name, char_count: text.length, preview: text.slice(0, 300) })
  } catch (e: any) {
    res.status(422).json({ detail: e.message ?? 'Extraction failed' })
  }
})

// ── Ask (chat) ────────────────────────────────────────────────────────────

app.post('/api/ask', requireAuth, async (req, res) => {
  if (!checkLimit(clientIp(req), 'ask', 20, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  const { userId } = req as AuthRequest
  const { doc_id, question, action = 'free', session_id } = req.body as {
    doc_id: string
    question: string
    action?: string
    session_id?: string
  }

  if (!doc_id || !question?.trim()) {
    return res.status(400).json({ detail: 'doc_id and question are required' })
  }

  // load doc from memory cache, fall back to DB
  let doc = getDoc(doc_id)
  if (!doc) {
    const dbDoc = await db.document.findUnique({ where: { id: doc_id } })
    if (!dbDoc || dbDoc.userId !== userId) {
      return res.status(404).json({ detail: 'Document not found — please re-upload' })
    }
    saveDoc(dbDoc.filename, dbDoc.text, dbDoc.id)
    doc = getDoc(doc_id)!
  }

  // resolve or create a chat session
  let sessionId = session_id
  if (sessionId) {
    // update last_active on existing session
    await db.chatSession.updateMany({
      where: { id: sessionId, userId },
      data: { lastActive: new Date() },
    })
  } else {
    const session = await db.chatSession.create({
      data: { userId, documentId: doc_id },
    })
    sessionId = session.id
  }

  // save the user message
  await db.message.create({
    data: { sessionId, role: 'user', content: question, action },
  })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  // send the new session_id on first turn so frontend can include it in follow-up requests
  res.write(`data: ${JSON.stringify({ session_id: sessionId })}\n\n`)
  res.flushHeaders()

  let assistantContent = ''
  try {
    for await (const delta of streamAnswer(doc.text, question, action)) {
      assistantContent += delta
      res.write(`data: ${JSON.stringify({ delta })}\n\n`)
    }
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`)
  }

  // save the assistant reply
  if (assistantContent) {
    await db.message.create({
      data: { sessionId, role: 'assistant', content: assistantContent, action },
    })
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  res.end()
})

// ── Flash Cards ───────────────────────────────────────────────────────────

app.post('/api/flashcards', requireAuth, async (req, res) => {
  if (!checkLimit(clientIp(req), 'flashcards', 3, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  const { userId } = req as AuthRequest
  const { doc_id } = req.body as { doc_id: string }
  if (!doc_id) return res.status(400).json({ detail: 'doc_id is required' })

  const doc = await getOrLoadDoc(doc_id, userId)
  if (!doc) return res.status(404).json({ detail: 'Document not found' })

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

// ── Quiz ──────────────────────────────────────────────────────────────────

app.post('/api/quiz', requireAuth, async (req, res) => {
  if (!checkLimit(clientIp(req), 'quiz', 3, 60_000)) {
    return res.status(429).json({ detail: 'rate_limited' })
  }

  const { userId } = req as AuthRequest
  const { doc_id, language = 'english' } = req.body as { doc_id: string; language?: string }
  if (!doc_id) return res.status(400).json({ detail: 'doc_id is required' })

  const doc = await getOrLoadDoc(doc_id, userId)
  if (!doc) return res.status(404).json({ detail: 'Document not found' })

  try {
    const quiz = await generateQuiz(doc.text, language)
    res.json({ ...quiz, _meta: { userId, documentId: doc_id, language } })
  } catch (e: any) {
    if (e instanceof SyntaxError) {
      return res.status(422).json({ detail: 'Could not parse quiz — please try again.' })
    }
    res.status(500).json({ detail: e.message ?? 'Quiz generation failed' })
  }
})

// save quiz score after user finishes
app.post('/api/quiz/attempt', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest
  const { doc_id, score, total, language = 'english' } = req.body as {
    doc_id: string; score: number; total: number; language?: string
  }
  if (!doc_id || score == null || total == null) {
    return res.status(400).json({ detail: 'doc_id, score, and total are required' })
  }
  const attempt = await db.quizAttempt.create({
    data: { userId, documentId: doc_id, score, total, language },
  })
  res.status(201).json(attempt)
})
