import { updateBlock } from '../api.js'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Returns Monday of the week containing `date`
function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  d.setDate(d.getDate() - ((day + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isoDate(date) {
  return date.toISOString().split('T')[0]
}

function parseTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Convert "HH:MM" to 12h label
function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'am' : 'pm'
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, '0')}${suffix}`
}

const HOUR_LABELS = Array.from({ length: 15 }, (_, i) => i + 7) // 7am–9pm
const DAY_START = 7 * 60  // 7:00am
const DAY_END   = 21 * 60 // 9:00pm
const GRID_MINUTES = DAY_END - DAY_START  // 840 min

function topPct(startHhmm) {
  const mins = parseTime(startHhmm)
  return ((mins - DAY_START) / GRID_MINUTES) * 100
}

function heightPct(durationMinutes) {
  return (durationMinutes / GRID_MINUTES) * 100
}

const TYPE_COLORS = {
  study: 'block-study',
  review: 'block-review',
}

export default function WeekCalendar({ weekStart, blocks, onWeekChange, onBlockToggle }) {
  const monday = getMondayOf(weekStart)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  // Index blocks by day ISO string
  const byDay = {}
  for (const b of blocks) {
    const key = isoDate(new Date(b.date))
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(b)
  }

  const today = isoDate(new Date())

  async function handleToggle(block) {
    try {
      const updated = await updateBlock(block.id, true) // one-way: mark done
      onBlockToggle(updated)
    } catch { /* ignore */ }
  }

  return (
    <div className="week-calendar">
      {/* Week nav header */}
      <div className="wc-nav">
        <button className="wc-nav-btn" onClick={() => onWeekChange(-7)}>‹ Prev</button>
        <span className="wc-week-label">
          {monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' – '}
          {addDays(monday, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button className="wc-nav-btn" onClick={() => onWeekChange(7)}>Next ›</button>
      </div>

      {/* Day header row */}
      <div className="wc-grid">
        <div className="wc-time-col" />
        {weekDays.map((d, i) => (
          <div
            key={i}
            className={`wc-day-header${isoDate(d) === today ? ' today' : ''}`}
          >
            <span className="wc-day-name">{DAY_NAMES[i]}</span>
            <span className="wc-day-num">{d.getDate()}</span>
          </div>
        ))}

        {/* Time labels + day columns */}
        <div className="wc-time-col">
          {HOUR_LABELS.map(h => (
            <div key={h} className="wc-hour-label" style={{ top: `${((h * 60 - DAY_START) / GRID_MINUTES) * 100}%` }}>
              {h % 12 || 12}{h < 12 ? 'am' : 'pm'}
            </div>
          ))}
        </div>

        {weekDays.map((d, i) => {
          const key = isoDate(d)
          const dayBlocks = (byDay[key] ?? []).filter(b => !b.completed)
          return (
            <div key={i} className={`wc-day-col${isoDate(d) === today ? ' today' : ''}`}>
              {/* Hour grid lines */}
              {HOUR_LABELS.map(h => (
                <div
                  key={h}
                  className="wc-hour-line"
                  style={{ top: `${((h * 60 - DAY_START) / GRID_MINUTES) * 100}%` }}
                />
              ))}

              {/* Study/review blocks */}
              {dayBlocks.map(b => (
                <div
                  key={b.id}
                  className={`wc-block ${TYPE_COLORS[b.type] ?? 'block-study'}`}
                  style={{
                    top: `${topPct(b.startTime)}%`,
                    height: `${Math.max(heightPct(b.durationMinutes), 2)}%`,
                  }}
                  title={`${b.topic?.name ?? 'Topic'} — ${formatTime(b.startTime)} (${b.durationMinutes}min)`}
                  onClick={() => handleToggle(b)}
                >
                  <span className="block-type-badge">{b.type}</span>
                  <span className="block-topic">{b.topic?.name ?? 'Topic'}</span>
                  <span className="block-doc">{b.topic?.document?.filename ?? ''}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
