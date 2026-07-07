// ── Token storage ─────────────────────────────────────────────────────────

let _accessToken = null

export function setAccessToken(token) { _accessToken = token }
export function getAccessToken() { return _accessToken }
export function clearAccessToken() { _accessToken = null }

function authHeaders() {
  return _accessToken ? { Authorization: `Bearer ${_accessToken}` } : {}
}

// ── Auth API ──────────────────────────────────────────────────────────────

export async function register(email, password, displayName) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, displayName }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || 'Registration failed')
  return body
}

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || 'Login failed')
  return body
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  clearAccessToken()
}

export async function refreshAccessToken() {
  const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
  if (!res.ok) return null
  const body = await res.json()
  return body.access_token ?? null
}

export async function fetchMe() {
  const res = await fetch('/api/me', { headers: authHeaders(), credentials: 'include' })
  if (!res.ok) return null
  return res.json()
}

// ── Document history ──────────────────────────────────────────────────────

export async function fetchDocuments() {
  const res = await fetch('/api/documents', { headers: authHeaders(), credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load documents')
  return res.json()
}

export async function deleteDocument(docId) {
  const res = await fetch(`/api/documents/${docId}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete document')
}

// ── Existing API (now with auth headers) ─────────────────────────────────

export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: form,
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || 'Upload failed')
  return body
}

export async function fetchFlashcards(docId) {
  const res = await fetch('/api/flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ doc_id: docId }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || 'Flash card generation failed')
  return body
}

export async function fetchQuiz(docId, language = 'english') {
  const res = await fetch('/api/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ doc_id: docId, language }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || 'Quiz generation failed')
  return body
}

export async function saveQuizAttempt(docId, score, total, language) {
  const res = await fetch('/api/quiz/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ doc_id: docId, score, total, language }),
  })
  if (!res.ok) throw new Error('Failed to save quiz attempt')
}
