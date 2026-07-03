import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import 'katex/dist/katex.min.css'
import './App.css'
import { uploadFile } from './api.js'

marked.use(markedKatex({ throwOnError: false, nonStandard: true }))
marked.use({ breaks: true })
import { useStream } from './hooks/useStream.js'

const ACTIONS = [
  { id: 'explain',   label: 'Explain Simply',       prompt: 'Explain the key concepts from this document simply.' },
  { id: 'summarize', label: 'Summarize',             prompt: 'Summarize this document.' },
  { id: 'quiz',      label: 'Practice Questions',    prompt: 'Generate 5 practice questions based on this document.' },
  { id: 'formula',   label: 'Formula Cues',          prompt: 'Extract and explain all the key formulas from this document.' },
  { id: 'example',   label: 'Example Problem',       prompt: 'Create a worked example problem based on this document.' },
]

export default function App() {
  const [doc, setDoc] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const { stream, streaming } = useStream()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const result = await uploadFile(file)
      setDoc(result)
      setMessages([])
      inputRef.current?.focus()
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
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

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="logo">Study Buddy</h1>

        <UploadZone
          uploading={uploading}
          dragOver={dragOver}
          onUpload={handleUpload}
          onDragOver={setDragOver}
        />

        {uploadError && <p className="upload-error">{uploadError}</p>}

        {doc && (
          <div className="doc-card">
            <div className="doc-icon">📄</div>
            <div className="doc-details">
              <span className="doc-name" title={doc.filename}>{doc.filename}</span>
              <span className="doc-meta">{doc.char_count.toLocaleString()} characters</span>
            </div>
          </div>
        )}

        {doc && (
          <div className="doc-preview">
            <p className="preview-label">Preview</p>
            <p className="preview-text">{doc.preview}…</p>
          </div>
        )}
      </aside>

      <main className="chat-panel">
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
          </div>

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
