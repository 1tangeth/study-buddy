import { useEffect, useRef, useState } from 'react'
import { marked } from './lib/md.js'
import 'katex/dist/katex.min.css'
import './App.css'
import { deleteDocument, fetchActiveSession, fetchDocuments, fetchFlashcards, fetchQuiz, uploadFile } from './api.js'
import AuthPage from './components/AuthPage.jsx'
import FlashCards from './components/FlashCards.jsx'
import QuizMode from './components/QuizMode.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { useStream } from './hooks/useStream.js'

const ACTIONS = [
  { id: 'explain',   label: 'Explain Simply',    prompt: 'Explain the key concepts from this document simply.' },
  { id: 'summarize', label: 'Summarize',          prompt: 'Summarize this document.' },
  { id: 'quiz',      label: 'Practice Questions', prompt: 'Generate 5 practice questions based on this document.' },
  { id: 'formula',   label: 'Formula Cues',       prompt: 'Extract and explain all the key formulas from this document.' },
  { id: 'example',   label: 'Example Problem',    prompt: 'Create a worked example problem based on this document.' },
]

export default function App() {
  const { user, logout } = useAuth()

  if (user === undefined) {
    return <div className="auth-loading"><div className="auth-spinner" /></div>
  }
  if (user === null) {
    return <AuthPage />
  }

  return <AuthenticatedApp user={user} onLogout={logout} />
}

function AuthenticatedApp({ user, onLogout }) {
  const [doc, setDoc] = useState(null)
  const [docHistory, setDocHistory] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [flashData, setFlashData] = useState(null)
  const [flashLoading, setFlashLoading] = useState(false)
  const [flashError, setFlashError] = useState('')
  const [quizData, setQuizData] = useState(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState('')
  const [quizLang, setQuizLang] = useState('english')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const { stream, streaming } = useStream()

  useEffect(() => {
    loadDocHistory()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadDocHistory() {
    try {
      const docs = await fetchDocuments()
      setDocHistory(docs)
    } catch { /* silently ignore */ }
  }

  async function handleSelectDoc(histDoc) {
    setDoc({
      doc_id: histDoc.id,
      filename: histDoc.filename,
      char_count: histDoc.charCount,
      preview: histDoc.preview,
    })
    setFlashData(null)
    setFlashError('')
    setQuizData(null)
    setQuizError('')

    // restore the most recent chat session for this document
    const session = await fetchActiveSession(histDoc.id)
    if (session) {
      setSessionId(session.sessionId)
      setMessages(session.messages.map(m => ({ role: m.role, content: m.content })))
    } else {
      setSessionId(null)
      setMessages([])
    }
    inputRef.current?.focus()
  }

  async function handleDeleteDoc(e, docId) {
    e.stopPropagation()
    try {
      await deleteDocument(docId)
      setDocHistory(prev => prev.filter(d => d.id !== docId))
      if (doc?.doc_id === docId) {
        setDoc(null)
        setMessages([])
        setFlashData(null)
        setQuizData(null)
      }
    } catch { /* ignore */ }
  }

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const result = await uploadFile(file)
      setDoc(result)
      setSessionId(null)
      setMessages([])
      setFlashData(null)
      setFlashError('')
      setQuizData(null)
      setQuizError('')
      inputRef.current?.focus()
      loadDocHistory()
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleFlashCards() {
    if (!doc || flashLoading || streaming) return
    setFlashLoading(true)
    setFlashError('')
    try {
      const data = await fetchFlashcards(doc.doc_id)
      setFlashData(data)
    } catch (e) {
      setFlashError(e.message)
    } finally {
      setFlashLoading(false)
    }
  }

  async function handleQuizMe() {
    if (!doc || quizLoading || streaming) return
    setQuizLoading(true)
    setQuizError('')
    try {
      const data = await fetchQuiz(doc.doc_id, quizLang)
      setQuizData(data)
    } catch (e) {
      setQuizError(e.message)
    } finally {
      setQuizLoading(false)
    }
  }

  function sendMessage(question, action = 'free', displayLabel = null) {
    if (!doc || !question.trim() || streaming) return
    const userMsg = { role: 'user', content: displayLabel ?? question }
    const aiMsg = { role: 'assistant', content: '', pending: true }
    setMessages(prev => [...prev, userMsg, aiMsg])
    setInput('')

    stream({
      docId: doc.doc_id,
      question,
      action,
      sessionId,
      onSession: id => setSessionId(id),
      onDelta: delta =>
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, content: last.content + delta, pending: false }
          return next
        }),
      onError: msg =>
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], content: `Error: ${msg}`, error: true, pending: false }
          return next
        }),
    })
  }

  const anyModeActive = flashData || flashLoading || quizData || quizLoading

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">Study Buddy</h1>
          <div className="user-menu">
            <span className="user-name">{user.displayName || user.email}</span>
            <button className="logout-btn" onClick={onLogout}>Log out</button>
          </div>
        </div>

        <UploadZone
          uploading={uploading}
          dragOver={dragOver}
          onUpload={handleUpload}
          onDragOver={setDragOver}
        />

        {uploadError && <p className="upload-error">{uploadError}</p>}

        {docHistory.length > 0 && (
          <div className="doc-history">
            <p className="doc-history-label">My Documents</p>
            <ul className="doc-history-list">
              {docHistory.map(d => (
                <li
                  key={d.id}
                  className={`doc-history-item${doc?.doc_id === d.id ? ' active' : ''}`}
                  onClick={() => handleSelectDoc(d)}
                  title={d.filename}
                >
                  <span className="dh-icon">📄</span>
                  <div className="dh-details">
                    <span className="dh-name">{d.filename}</span>
                    <span className="dh-meta">{d.charCount.toLocaleString()} chars</span>
                  </div>
                  <button
                    className="dh-delete"
                    onClick={e => handleDeleteDoc(e, d.id)}
                    title="Delete document"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="lang-selector">
          <label className="lang-label" htmlFor="quiz-lang">My language</label>
          <select
            id="quiz-lang"
            className="lang-select"
            value={quizLang}
            onChange={e => setQuizLang(e.target.value)}
          >
            <option value="english">English</option>
            <option value="japanese">Japanese</option>
            <option value="korean">Korean</option>
            <option value="chinese">Chinese</option>
            <option value="spanish">Spanish</option>
            <option value="french">French</option>
          </select>
        </div>
      </aside>

      <main className="chat-panel">
        {quizLoading && (
          <div className="quiz-loading">
            <div className="quiz-spinner" />
            <p>Generating your quiz…</p>
            <p className="quiz-loading-sub">This may take a few seconds</p>
          </div>
        )}

        {quizData && !quizLoading && (
          <QuizMode quiz={quizData} onExit={() => { setQuizData(null); setQuizError('') }} />
        )}

        {flashLoading && !quizData && !quizLoading && (
          <div className="fc-loading">
            <div className="fc-spinner" />
            <p>Generating flash cards…</p>
            <p className="fc-loading-sub">This may take a few seconds</p>
          </div>
        )}

        {flashData && !flashLoading && !quizData && !quizLoading && (
          <FlashCards deck={flashData} onExit={() => { setFlashData(null); setFlashError('') }} />
        )}

        {!anyModeActive && (
          <>
            <div className="messages" role="log">
              {messages.length === 0 && (
                <div className="empty-state">
                  {doc
                    ? <>Choose an action below or type your question.</>
                    : <>Upload a <strong>.pdf</strong> or <strong>.txt</strong> file to get started.</>}
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}${msg.error ? ' error' : ''}`}>
                  <div className="bubble">
                    {msg.role === 'assistant'
                      ? <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content || '') }} />
                      : msg.content}
                    {msg.pending && <span className="cursor" aria-hidden="true" />}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="input-area">
              <div className="actions-row">
                {ACTIONS.map(a => (
                  <button
                    key={a.id}
                    className="action-btn"
                    disabled={!doc || streaming}
                    onClick={() => sendMessage(a.prompt, a.id, a.label)}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  className="action-btn flash-cards-btn"
                  disabled={!doc || streaming || flashLoading}
                  onClick={handleFlashCards}
                >
                  Flash Cards
                </button>
                <button
                  className="action-btn quiz-me-btn"
                  disabled={!doc || streaming || quizLoading}
                  onClick={handleQuizMe}
                >
                  Quiz Me
                </button>
              </div>
              {flashError && <p className="fc-error">{flashError}</p>}
              {quizError && <p className="quiz-error">{quizError}</p>}

              <div className="input-row">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(input) }}
                  placeholder={doc ? 'Ask anything about your document…' : 'Upload a document first'}
                  disabled={!doc || streaming}
                  aria-label="Question input"
                />
                <button
                  className="send-btn"
                  onClick={() => sendMessage(input)}
                  disabled={!doc || !input.trim() || streaming}
                >
                  {streaming ? '…' : 'Ask'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function UploadZone({ uploading, dragOver, onUpload, onDragOver }) {
  const inputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault()
    onDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onUpload(file)
  }

  return (
    <div
      className={`upload-zone${dragOver ? ' drag-over' : ''}${uploading ? ' uploading' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); onDragOver(true) }}
      onDragLeave={() => onDragOver(false)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="Upload document"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt"
        style={{ display: 'none' }}
        onChange={e => onUpload(e.target.files?.[0])}
      />
      <span className="upload-icon">{uploading ? '⏳' : '⬆️'}</span>
      <span>{uploading ? 'Uploading…' : 'Drop PDF or .txt here'}</span>
      {!uploading && <span className="upload-hint">or click to browse</span>}
    </div>
  )
}
