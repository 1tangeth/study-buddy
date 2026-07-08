import { useEffect, useState } from 'react'
import { fetchPlanWeek, fetchStudyPlans, reschedulePlan } from '../api.js'
import CreatePlanModal from '../components/CreatePlanModal.jsx'
import WeekCalendar from '../components/WeekCalendar.jsx'

export default function PlannerPage({ documents }) {
  const [plans, setPlans] = useState([])
  const [activePlanId, setActivePlanId] = useState(null)
  const [weekDate, setWeekDate] = useState(new Date())
  const [weekData, setWeekData] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [weekLoading, setWeekLoading] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPlans()
  }, [])

  useEffect(() => {
    if (activePlanId) loadWeek()
  }, [activePlanId, weekDate])

  async function loadPlans() {
    setLoading(true)
    try {
      const data = await fetchStudyPlans()
      setPlans(data)
      if (data.length > 0 && !activePlanId) setActivePlanId(data[0].id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadWeek() {
    setWeekLoading(true)
    try {
      const data = await fetchPlanWeek(activePlanId, weekDate)
      setWeekData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setWeekLoading(false)
    }
  }

  function handleWeekChange(deltaDays) {
    setWeekDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + deltaDays)
      return d
    })
  }

  function handleBlockToggle(updatedBlock) {
    // completed blocks disappear immediately from the calendar
    setWeekData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        blocks: prev.blocks.filter(b => b.id !== updatedBlock.id),
      }
    })
  }

  async function handleReschedule() {
    if (!activePlanId || rescheduling) return
    setRescheduling(true)
    try {
      await reschedulePlan(activePlanId)
      await loadWeek()
    } catch (e) {
      setError(e.message)
    } finally {
      setRescheduling(false)
    }
  }

  function handlePlanCreated() {
    setShowModal(false)
    loadPlans()
  }

  const activePlan = plans.find(p => p.id === activePlanId)

  if (loading) {
    return (
      <div className="planner-loading">
        <div className="planner-spinner" />
        <p>Loading your study plans…</p>
      </div>
    )
  }

  return (
    <div className="planner-page">
      {/* Planner top bar */}
      <div className="planner-topbar">
        <div className="planner-plan-selector">
          {plans.length > 0 ? (
            <select
              className="plan-select"
              value={activePlanId ?? ''}
              onChange={e => setActivePlanId(e.target.value)}
            >
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : (
            <span className="no-plans-text">No study plans yet</span>
          )}
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + New Plan
          </button>
        </div>

        {activePlan && (
          <div className="planner-plan-meta">
            <span className="plan-meta-item">
              {activePlan.completedBlocks} / {activePlan.totalBlocks} sessions done
            </span>
            <span className="plan-meta-item plan-meta-sep">·</span>
            <span className="plan-meta-item">
              Target: {new Date(activePlan.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button
              className="btn-secondary reschedule-btn"
              onClick={handleReschedule}
              disabled={rescheduling}
              title="Re-run AI scheduling from today using your latest quiz scores"
            >
              {rescheduling ? 'Rescheduling…' : '↺ Reschedule'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="planner-error">{error}</p>}

      {/* Calendar */}
      {activePlanId ? (
        weekLoading ? (
          <div className="planner-loading">
            <div className="planner-spinner" />
          </div>
        ) : weekData ? (
          <WeekCalendar
            weekStart={weekDate}
            blocks={weekData.blocks}
            onWeekChange={handleWeekChange}
            onBlockToggle={handleBlockToggle}
          />
        ) : null
      ) : (
        <div className="planner-empty">
          <p>Create your first study plan to get started.</p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + New Plan
          </button>
        </div>
      )}

      {showModal && (
        <CreatePlanModal
          documents={documents}
          onCreated={handlePlanCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
