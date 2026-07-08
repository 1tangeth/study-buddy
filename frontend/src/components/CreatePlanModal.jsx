import { useState } from 'react'
import { createStudyPlan } from '../api.js'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function weeksLater(n) {
  const d = new Date()
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().split('T')[0]
}

export default function CreatePlanModal({ documents, onCreated, onClose }) {
  const [name, setName] = useState('')
  const [selectedDocs, setSelectedDocs] = useState([])
  const [startDate, setStartDate] = useState(todayStr())
  const [targetDate, setTargetDate] = useState(weeksLater(4))
  const [hoursPerDay, setHoursPerDay] = useState(2)
  const [daysOfWeek, setDaysOfWeek] = useState([1, 2, 3, 4, 5]) // Mon–Fri
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleDoc(id) {
    setSelectedDocs(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
  }

  function toggleDay(d) {
    setDaysOfWeek(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Plan name is required')
    if (selectedDocs.length === 0) return setError('Select at least one document')
    if (daysOfWeek.length === 0) return setError('Select at least one study day')
    if (startDate >= targetDate) return setError('Target date must be after start date')

    setLoading(true)
    setError('')
    try {
      const result = await createStudyPlan({
        name: name.trim(),
        docIds: selectedDocs,
        startDate,
        targetDate,
        hoursPerDay: Number(hoursPerDay),
        daysOfWeek,
      })
      onCreated(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Study Plan</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label className="field-label">Plan name</label>
          <input
            className="field-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Midterm Prep"
            required
          />

          <label className="field-label">Documents to study</label>
          <div className="doc-checklist">
            {documents.length === 0 && <p className="no-docs">No documents uploaded yet.</p>}
            {documents.map(d => (
              <label key={d.id} className={`doc-check-item${selectedDocs.includes(d.id) ? ' checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedDocs.includes(d.id)}
                  onChange={() => toggleDoc(d.id)}
                />
                <span className="dci-name">{d.filename}</span>
              </label>
            ))}
          </div>

          <div className="date-row">
            <div className="date-field">
              <label className="field-label">Start date</label>
              <input
                type="date"
                className="field-input"
                value={startDate}
                min={todayStr()}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="date-field">
              <label className="field-label">Target date</label>
              <input
                type="date"
                className="field-input"
                value={targetDate}
                min={startDate}
                onChange={e => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <label className="field-label">Hours per study day: <strong>{hoursPerDay}h</strong></label>
          <input
            type="range"
            min="0.5"
            max="8"
            step="0.5"
            value={hoursPerDay}
            onChange={e => setHoursPerDay(e.target.value)}
            className="hours-slider"
          />

          <label className="field-label">Study days</label>
          <div className="day-picker">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                className={`day-btn${daysOfWeek.includes(i) ? ' active' : ''}`}
                onClick={() => toggleDay(i)}
              >
                {label}
              </button>
            ))}
          </div>

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating plan…' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
