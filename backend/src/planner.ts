import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import { priorityScore } from './spacedRepetition'

const gemini = createGoogleGenerativeAI({
  baseURL: process.env.GEMINI_BASE_URL ?? 'https://ai.yesttool.top/v1beta',
  apiKey: process.env.GEMINI_API_KEY ?? '',
})
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

// ── Types ─────────────────────────────────────────────────────────────────

export interface ExtractedTopic {
  name: string
  difficulty: number        // 1–5
  estimatedMinutes: number  // 20–90
}

export interface BlockInput {
  topicId: string
  date: Date
  startTime: string  // "HH:MM"
  durationMinutes: number
  type: 'study' | 'review'
}

interface TopicWithMastery {
  id: string
  name: string
  difficulty: number
  estimatedMinutes: number
  lastScore: number     // 0 if never quizzed
  nextReview: Date | null
}

// ── AI: extract topics from document text ─────────────────────────────────

export async function extractTopics(docText: string): Promise<ExtractedTopic[]> {
  const prompt = `Analyze this study document and extract the main topics a student needs to learn.

Return ONLY a valid JSON object — no markdown, no explanation — with this exact structure:
{
  "topics": [
    { "name": "Topic Name", "difficulty": 3, "estimatedMinutes": 45 }
  ]
}

Rules:
- Extract 4–8 key topics (distinct learning concepts)
- name: 2–5 words, a specific learnable concept
- difficulty: 1 (easy) to 5 (very hard), based on concept complexity
- estimatedMinutes: realistic first-study time, between 20 and 90

DOCUMENT:
${docText.slice(0, 60_000)}`

  const { text } = await generateText({ model: gemini(MODEL), prompt })

  const json = text.match(/\{[\s\S]*\}/)
  if (!json) throw new SyntaxError('Could not parse topic extraction response')
  const parsed = JSON.parse(json[0])
  if (!Array.isArray(parsed.topics)) throw new SyntaxError('Invalid topics structure')

  return parsed.topics.map((t: any) => ({
    name: String(t.name ?? 'Unnamed topic').slice(0, 100),
    difficulty: Math.min(5, Math.max(1, Number(t.difficulty) || 3)),
    estimatedMinutes: Math.min(90, Math.max(20, Number(t.estimatedMinutes) || 45)),
  }))
}

// ── Scheduling algorithm (pure code, no AI) ───────────────────────────────

function getAvailableDays(start: Date, end: Date, daysOfWeek: number[]): Date[] {
  const days: Date[] = []
  const cur = new Date(start)
  cur.setHours(0, 0, 0, 0)
  const endDate = new Date(end)
  endDate.setHours(0, 0, 0, 0)

  while (cur <= endDate) {
    if (daysOfWeek.includes(cur.getDay())) {
      days.push(new Date(cur))
    }
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function minutesToTime(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const DAY_START_MINUTES = 9 * 60  // 9:00am

export function buildSchedule(
  topics: TopicWithMastery[],
  startDate: Date,
  targetDate: Date,
  hoursPerDay: number,
  daysOfWeek: number[],
): BlockInput[] {
  const availableDays = getAvailableDays(startDate, targetDate, daysOfWeek)
  const minutesPerDay = Math.round(hoursPerDay * 60)
  const blocks: BlockInput[] = []

  // Sort by priority: difficult + weak topics first
  const sorted = [...topics].sort((a, b) =>
    priorityScore(b.difficulty, b.lastScore) - priorityScore(a.difficulty, a.lastScore)
  )

  if (sorted.length === 0 || availableDays.length === 0) return blocks

  // How many topics can fit per day given a 20-min minimum block size
  const topicsPerDay = Math.max(1, Math.min(sorted.length, Math.floor(minutesPerDay / 20)))

  for (let dayIdx = 0; dayIdx < availableDays.length; dayIdx++) {
    const day = availableDays[dayIdx]
    let used = 0

    // 1. Review blocks: topics whose nextReview falls on or before this day
    const dayMidnight = new Date(day)
    dayMidnight.setHours(0, 0, 0, 0)
    for (const topic of sorted) {
      if (!topic.nextReview) continue
      const rev = new Date(topic.nextReview)
      rev.setHours(0, 0, 0, 0)
      if (rev <= dayMidnight && minutesPerDay - used >= 20) {
        const dur = Math.min(30, minutesPerDay - used)
        blocks.push({
          topicId: topic.id,
          date: new Date(day),
          startTime: minutesToTime(DAY_START_MINUTES + used),
          durationMinutes: dur,
          type: 'review',
        })
        used += dur
      }
    }

    // 2. Study blocks: rotate through topics across days so every week repeats
    const studyTime = minutesPerDay - used
    if (studyTime < 20) continue

    // Round-robin offset ensures all topics are visited regularly across weeks
    const startIdx = (dayIdx * topicsPerDay) % sorted.length
    const timePerSlot = Math.floor(studyTime / topicsPerDay)

    for (let i = 0; i < topicsPerDay; i++) {
      const topic = sorted[(startIdx + i) % sorted.length]
      const remaining = minutesPerDay - used
      if (remaining < 20) break
      const dur = Math.max(20, Math.min(timePerSlot, remaining))
      blocks.push({
        topicId: topic.id,
        date: new Date(day),
        startTime: minutesToTime(DAY_START_MINUTES + used),
        durationMinutes: dur,
        type: 'study',
      })
      used += dur
    }
  }

  return blocks
}
