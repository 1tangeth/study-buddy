import { readFileSync } from 'fs'
import { resolve } from 'path'
import request from 'supertest'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// vi.mock is hoisted above imports by vitest, so this runs before app.ts loads
vi.mock('../src/ai', () => ({
  streamAnswer: async function* () {
    yield 'Bayes theorem is '
    yield 'a foundational rule in probability.'
  },
}))

// Static import — works correctly with vi.mock hoisting
import { _resetRateLimiter, app } from '../src/app'

const SAMPLE_TXT = readFileSync(resolve(__dirname, 'fixtures/sample.txt'))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSSE(raw: string): Array<Record<string, unknown>> {
  return raw
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)))
}

async function uploadSample(): Promise<string> {
  const res = await request(app)
    .post('/api/upload')
    .attach('file', SAMPLE_TXT, 'sample.txt')
  if (!res.body.doc_id) throw new Error(`Upload failed: ${JSON.stringify(res.body)}`)
  return res.body.doc_id as string
}

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns { ok: true }', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

// ─── Upload ───────────────────────────────────────────────────────────────────

describe('POST /api/upload', () => {
  it('accepts a .txt file and returns doc metadata', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', SAMPLE_TXT, 'sample.txt')

    expect(res.status).toBe(200)
    expect(res.body.doc_id).toBeTruthy()
    expect(res.body.filename).toBe('sample.txt')
    expect(res.body.char_count).toBeGreaterThan(0)
    expect(res.body.preview).toContain('Probability')
  })

  it('rejects unsupported file types', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.from('some content'), 'notes.docx')

    expect(res.status).toBe(400)
    expect(res.body.detail).toMatch(/txt.*pdf|pdf.*txt/i)
  })

  it('rejects whitespace-only files', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.from('   \n\n  '), 'empty.txt')

    expect(res.status).toBe(422)
  })

  it('rejects requests with no file', async () => {
    const res = await request(app).post('/api/upload')
    expect(res.status).toBe(400)
  })

  it('truncates files over 100k chars', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.from('a'.repeat(200_000)), 'big.txt')

    expect(res.status).toBe(200)
    expect(res.body.char_count).toBe(100_000)
  })
})

// ─── Ask ─────────────────────────────────────────────────────────────────────

describe('POST /api/ask', () => {
  let docId: string

  beforeAll(async () => {
    _resetRateLimiter()
    docId = await uploadSample()
  })

  it('streams SSE events and ends with done:true', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ doc_id: docId, question: 'Explain Bayes theorem', action: 'explain' })
      .buffer(true)
      .parse((res, callback) => {
        let raw = ''
        res.on('data', (chunk: Buffer) => { raw += chunk.toString() })
        res.on('end', () => callback(null, raw))
      })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/event-stream/)

    const events = parseSSE(res.body as string)
    const deltas = events.filter(e => 'delta' in e)
    const done   = events.find(e => e.done === true)

    expect(deltas.length).toBeGreaterThan(0)
    expect(done).toBeDefined()

    const fullText = deltas.map(e => e.delta).join('')
    expect(fullText).toContain('Bayes')
  })

  it('returns 404 for an unknown doc_id', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ doc_id: 'does-not-exist', question: 'What is this?', action: 'free' })

    expect(res.status).toBe(404)
    expect(res.body.detail).toMatch(/not found/i)
  })

  it('returns 400 when question is empty', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ doc_id: docId, question: '   ', action: 'free' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when doc_id is missing', async () => {
    const res = await request(app)
      .post('/api/ask')
      .send({ question: 'What is Bayes theorem?' })

    expect(res.status).toBe(400)
  })

  it('works with all supported actions', async () => {
    const actions = ['explain', 'summarize', 'quiz', 'formula', 'example', 'free']

    for (const action of actions) {
      const res = await request(app)
        .post('/api/ask')
        .send({ doc_id: docId, question: 'Test', action })
        .buffer(true)
        .parse((res, callback) => {
          let raw = ''
          res.on('data', (c: Buffer) => { raw += c.toString() })
          res.on('end', () => callback(null, raw))
        })

      expect(res.status, `action "${action}" should return 200`).toBe(200)
      expect(parseSSE(res.body as string).some(e => e.done), `action "${action}" should have done event`).toBe(true)
    }
  })
})
