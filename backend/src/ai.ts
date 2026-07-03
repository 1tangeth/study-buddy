import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, streamText } from 'ai'


// from google's ai-sdk , create gemini object with baseURL and apiKey
const gemini = createGoogleGenerativeAI({
  baseURL: process.env.GEMINI_BASE_URL ?? 'https://ai.yesttool.top/v1beta',
  apiKey: process.env.GEMINI_API_KEY ?? '',
})

// load gemini-2.5-flash model
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'



// Map that maps keyword to a prompt
const SYSTEM_PROMPTS: Record<string, string> = {
  explain:
    'You are a patient tutor. The student is confused. Explain the key concepts simply — lead with the core insight, use analogies, avoid jargon. Base your answer only on the provided document.',
  summarize:
    'You are a study assistant. Summarize the document concisely using bullet points. Group related ideas. Capture every major concept.',
  quiz:
    'You are a quiz generator. Create 5 practice questions based on the document. Mix multiple choice and short answer. Put all answers in a clearly labeled section at the end.',
  formula:
    'You are a math tutor. Extract every formula from the document. For each one: state it, explain what each variable means, and give the intuition behind it — not just notation. Focus especially on probability formulas.',
  example:
    'You are a problem creator. Create a worked example problem based on the document content. Show a clear step-by-step solution. Make it realistic and non-trivial.',
  free: "You are a helpful study assistant. Answer the user's question based only on the provided document. Be clear and concise. If the answer isn't in the document, say so.",
}

const QUIZ_PROMPT = `You are a quiz generator. Generate exactly 5 quiz questions based on the provided document.

IMPORTANT: Return ONLY a valid JSON object — no markdown formatting, no code blocks, no explanation. Just raw JSON.

Required JSON structure:
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option B",
      "explanation": "Brief explanation of why this is correct."
    },
    {
      "id": 2,
      "type": "short_answer",
      "question": "Question text here?",
      "answer": "Concise expected answer.",
      "explanation": "Brief explanation."
    }
  ]
}

Rules:
- Include at least 2 multiple_choice and at least 2 short_answer questions
- For multiple_choice: exactly 4 options; answer must match one option verbatim
- For short_answer: answer should be 1-3 sentences max
- explanation: 1-2 sentences explaining the correct answer
- Base all questions strictly on the provided document content`

// maximum imput characters
const MAX_DOC_CHARS = 80_000

// Other file can import and use this function
// this function streams an AI answer piece by piece
// yield multiple pieces of text when they arrive
export async function* streamAnswer(
  docText: string,
  question: string,
  action: string,
): AsyncGenerator<string> {
  const system = SYSTEM_PROMPTS[action] ?? SYSTEM_PROMPTS.free
  const truncated = docText.slice(0, MAX_DOC_CHARS)


  // build result from the gemini
  const result = streamText({
    model: gemini(MODEL),
    system,
    messages: [
      { role: 'user', content: `Document:\n\n${truncated}\n\n---\n\nUser: ${question}` },
    ],
    maxTokens: 8192,
    temperature: 0.7,
  })



  /**
   * await the result from Gemini
   * if reusllt is text, yield(pause execution and returns text data)
   * 
   */
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      yield part.textDelta
    } else if (part.type === 'error') {
      throw new Error(String((part as any).error ?? 'Unknown streaming error'))
    }
  }
}

export interface QuizQuestion {
  id: number
  type: 'multiple_choice' | 'short_answer'
  question: string
  options?: string[]
  answer: string
  explanation: string
}

export interface QuizData {
  questions: QuizQuestion[]
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}

export async function generateQuiz(docText: string): Promise<QuizData> {
  const truncated = docText.slice(0, MAX_DOC_CHARS)

  const { text } = await generateText({
    model: gemini(MODEL),
    system: QUIZ_PROMPT,
    messages: [{ role: 'user', content: `Document:\n\n${truncated}` }],
    maxTokens: 4096,
    temperature: 0.7,
  })

  return JSON.parse(extractJSON(text)) as QuizData
}
