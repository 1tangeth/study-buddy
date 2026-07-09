import { useState } from 'react'
import WeekCalendar from '../components/WeekCalendar.jsx'

export default function PlannerPage() {
  const [weekDate, setWeekDate] = useState(new Date())

  function handleWeekChange(delta) {
    setWeekDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + delta)
      return d
    })
  }

  return (
    <div className="planner-page">
      <WeekCalendar weekDate={weekDate} onWeekChange={handleWeekChange} />
    </div>
  )
}
