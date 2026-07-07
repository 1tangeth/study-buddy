import { useCallback, useRef, useState } from 'react'
import { getAccessToken } from '../api.js'

export function useStream() {
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef(null)

  const stream = useCallback(async ({ docId, question, action, sessionId, onSession, onDelta, onError, onDone }) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)

    try {
      const token = getAccessToken()
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ doc_id: docId, question, action, session_id: sessionId }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Request failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.session_id) onSession?.(data.session_id)
            if (data.delta) onDelta(data.delta)
            if (data.error) { onError?.(data.error); return }
            if (data.done) { onDone?.(); return }
          } catch { /* malformed SSE line — skip */ }
        }
      }
      onDone?.()
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err.message)
    } finally {
      setStreaming(false)
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [])

  return { stream, streaming, abort }
}
