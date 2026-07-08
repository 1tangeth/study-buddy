// SM-2 spaced repetition algorithm

export interface MasteryState {
  interval: number    // days until next review
  easeFactor: number  // default 2.5
  repetitions: number
}

export interface MasteryUpdate extends MasteryState {
  nextReview: Date
}

/** Compute updated mastery state from a quiz score (0–100). */
export function updateMastery(state: MasteryState, score: number): MasteryUpdate {
  const { interval, easeFactor, repetitions } = state

  let newInterval: number
  let newEase = easeFactor
  let newReps = repetitions

  if (score >= 80) {
    // Good recall — extend interval
    newReps = repetitions + 1
    newInterval = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.round(interval * easeFactor)
    newEase = Math.max(1.3, easeFactor + 0.1)
  } else if (score >= 60) {
    // Partial recall — slow growth
    newReps = repetitions + 1
    newInterval = Math.max(1, Math.round(interval * 1.2))
    newEase = Math.max(1.3, easeFactor - 0.05)
  } else {
    // Poor recall — reset
    newReps = 0
    newInterval = 1
    newEase = Math.max(1.3, easeFactor - 0.2)
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + newInterval)
  nextReview.setHours(0, 0, 0, 0)

  return { interval: newInterval, easeFactor: newEase, repetitions: newReps, nextReview }
}

/** Initial mastery state for a brand-new topic. */
export function initialMastery(): MasteryState {
  return { interval: 1, easeFactor: 2.5, repetitions: 0 }
}

/** Priority score — higher = needs more attention. */
export function priorityScore(difficulty: number, lastScore: number): number {
  return difficulty * (1 - lastScore / 100)
}
