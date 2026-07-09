import { useEffect, useState } from 'react'
import { createCalendarEvent, deleteCalendarEvent, fetchCalendarWeek, updateCalendarEvent } from '../api.js'

const HOUR_START = 7
const HOUR_END = 22
const HOUR_PX = 64        // pixels per hour (= pixels per minute × 60)
const TOTAL_H = (HOUR_END - HOUR_START) * HOUR_PX  // 960px

const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START)
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getMondayOf(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

// "HH:MM" → px from top of grid
function timeToY(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return ((h * 60 + m) - HOUR_START * 60) * (HOUR_PX / 60)
}

// px from top of grid → "HH:MM" snapped to 15 min
function yToTime(y) {
  const totalMin = HOUR_START * 60 + Math.max(0, y) * (60 / HOUR_PX)
  const snapped = Math.round(totalMin / 15) * 15
  const clamped = Math.min(snapped, HOUR_END * 60 - 60)
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmt(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`
}

export default function WeekCalendar({ weekDate, onWeekChange }) {
  const monday = getMondayOf(weekDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const today = isoDate(new Date())

  const [events, setEvents] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  useEffect(() => {
    fetchCalendarWeek(monday).then(setEvents).catch(() => {})
  }, [monday.toISOString()])

  // Group events by day
  const byDay = {}
  for (const ev of events) {
    const key = isoDate(new Date(ev.date))
    ;(byDay[key] ??= []).push(ev)
  }

  async function handleColClick(e, day) {
    if (e.target.closest('.wc-ev')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const startTime = yToTime(y)
    const dateStr = isoDate(day)

    // Optimistic add
    const tempId = `tmp-${Date.now()}`
    const tempEv = { id: tempId, title: 'Study', date: day.toISOString(), startTime, durationMinutes: 60 }
    setEvents(prev => [...prev, tempEv])
    setEditingId(tempId)
    setEditTitle('Study')

    try {
      const created = await createCalendarEvent({ date: dateStr, startTime })
      setEvents(prev => prev.map(ev => ev.id === tempId ? created : ev))
      setEditingId(created.id)
    } catch {
      setEvents(prev => prev.filter(ev => ev.id !== tempId))
      setEditingId(null)
    }
  }

  async function handleSave(ev) {
    const title = editTitle.trim() || 'Study'
    setEditingId(null)
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, title } : e))
    if (!ev.id.startsWith('tmp-')) {
      await updateCalendarEvent(ev.id, { title }).catch(() => {})
    }
  }

  async function handleDelete(e, evId) {
    e.stopPropagation()
    setEvents(prev => prev.filter(ev => ev.id !== evId))
    setEditingId(null)
    if (!evId.startsWith('tmp-')) {
      await deleteCalendarEvent(evId).catch(() => {})
    }
  }

  return (
    <div className="wc-outer">
      {/* Week navigation */}
      <div className="wc-nav">
        <button className="wc-nav-btn" onClick={() => onWeekChange(-7)}>‹ Prev</button>
        <span className="wc-week-label">
          {monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' – '}
          {addDays(monday, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button className="wc-nav-btn" onClick={() => onWeekChange(7)}>Next ›</button>
      </div>

      <div className="wc-scroll-wrap">
        {/* Sticky day-name header */}
        <div className="wc-header-row">
          <div className="wc-gutter-head" />
          {weekDays.map((d, i) => (
            <div key={i} className={`wc-day-head${isoDate(d) === today ? ' today' : ''}`}>
              <span className="wc-dn">{DAY_NAMES[i]}</span>
              <span className="wc-dd">{d.getDate()}</span>
            </div>
          ))}
        </div>

        {/* Scrollable time grid */}
        <div className="wc-scroll-body">
          <div className="wc-grid-wrap" style={{ height: `${TOTAL_H}px` }}>
            {/* Hour labels gutter */}
            <div className="wc-gutter">
              {HOURS.map(h => (
                <div
                  key={h}
                  className="wc-hr-label"
                  style={{ top: `${(h - HOUR_START) * HOUR_PX}px` }}
                >
                  {h % 12 || 12}{h < 12 ? 'am' : 'pm'}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((d, i) => {
              const key = isoDate(d)
              const dayEvs = byDay[key] ?? []
              return (
                <div
                  key={i}
                  className={`wc-col${isoDate(d) === today ? ' today' : ''}`}
                  onClick={e => handleColClick(e, d)}
                >
                  {/* Horizontal hour lines */}
                  {HOURS.map(h => (
                    <div
                      key={h}
                      className="wc-hr-line"
                      style={{ top: `${(h - HOUR_START) * HOUR_PX}px` }}
                    />
                  ))}

                  {/* Events */}
                  {dayEvs.map(ev => {
                    const isEditing = editingId === ev.id
                    const shortBlock = ev.durationMinutes * (HOUR_PX / 60) < 36
                    return (
                      <div
                        key={ev.id}
                        className={`wc-ev${shortBlock ? ' short' : ''}`}
                        style={{
                          top: `${timeToY(ev.startTime)}px`,
                          height: `${Math.max(ev.durationMinutes * (HOUR_PX / 60), 24)}px`,
                        }}
                        title={`${ev.title} · ${fmt(ev.startTime)}`}
                        onClick={e => {
                          e.stopPropagation()
                          if (!isEditing) { setEditingId(ev.id); setEditTitle(ev.title) }
                        }}
                      >
                        <button
                          className="ev-del"
                          onClick={e => handleDelete(e, ev.id)}
                          title="Delete"
                        >
                          ×
                        </button>

                        {isEditing ? (
                          <input
                            className="ev-input"
                            autoFocus
                            value={editTitle}
                            placeholder="Study topic…"
                            onChange={e => setEditTitle(e.target.value)}
                            onBlur={() => handleSave(ev)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); handleSave(ev) }
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <span className="ev-title">{ev.title}</span>
                            {!shortBlock && <span className="ev-time">{fmt(ev.startTime)}</span>}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
