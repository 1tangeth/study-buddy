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

// Step 1 — lightweight classification (uses only the first ~6k chars, fast)
const DOC_ANALYSIS_PROMPT = `Classify this document for flash card generation purposes.

Return ONLY a JSON object — no markdown, no commentary:
{"type":"<vocabulary|math|essay|coding|mixed>","reason":"<one sentence>"}

Type definitions:
- "vocabulary": language learning content, word/phrase lists, foreign-language definitions
- "math": formulas, equations, theorems, quantitative concepts (probability, stats, physics, etc.)
- "essay": articles, notes, textbook prose, conceptual explanations without heavy math
- "coding": programming problems, algorithms, data structures, LeetCode-style content
- "mixed": clearly combines two or more of the above`

// Step 2 — type-specific generation prompts
type DocType = 'vocabulary' | 'math' | 'essay' | 'coding' | 'mixed'

const FLASHCARD_PROMPTS: Record<DocType, string> = {
  vocabulary: `Generate exactly 10 vocabulary flash cards from the document.
- front: word or phrase in the source language
- back: English translation + romanization or pronunciation guide if applicable
Both front and back may use inline LaTeX ($...$) if the term contains symbols.
Return ONLY raw JSON: {"cards":[{"front":"...","back":"..."}]}`,

  math: `Generate exactly 10 math flash cards from the document, mixing these two types:
- Formula card — front: plain-English name of the formula or theorem (e.g. "Bayes' Theorem"); back: formula in LaTeX using $...$ notation, plus a one-line legend for each variable
- Problem-pattern card — front: short example problem or "Given X, find Y" (may include LaTeX $...$); back: the formula or step-by-step logic to solve it
Both front and back may use inline LaTeX ($...$) and markdown (**bold**, bullet points).
Return ONLY raw JSON: {"cards":[{"front":"...","back":"..."}]}`,

  essay: `Generate exactly 10 concept flash cards from the document.
- front: key topic name, concept, or a focused question about a main idea
- back: concise explanation in 2-4 sentences; may use **bold** and bullet points
Return ONLY raw JSON: {"cards":[{"front":"...","back":"..."}]}`,

  coding: `Generate exactly 10 algorithm flash cards from the document.
- front: problem name, pattern description, or "How do you [accomplish X]?"
- back: algorithm approach with key steps, data structures used, and time/space complexity in O(...) notation; may use **bold** and bullet points
Return ONLY raw JSON: {"cards":[{"front":"...","back":"..."}]}`,

  mixed: `Generate exactly 10 flash cards from the document, adapting each card to its piece of content:
- vocabulary content → front: term in source language; back: translation + pronunciation
- math content → front: formula name or problem pattern (inline LaTeX $...$); back: formula $...$ + variable legend
- concept/essay content → front: topic or key question; back: 2-3 sentence explanation
- coding content → front: problem or pattern; back: algorithm + O(...) complexity
Both front and back may use inline LaTeX ($...$) and markdown.
Return ONLY raw JSON: {"cards":[{"front":"...","back":"..."}]}`,
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

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}

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

// ── Flash Cards ──────────────────────────────────────��─────────────────────

export interface Flashcard {
  front: string
  back: string
}

export interface FlashcardDeck {
  cards: Flashcard[]
}

export async function generateFlashcards(docText: string): Promise<FlashcardDeck> {
  const truncated = docText.slice(0, MAX_DOC_CHARS)

  // Step 1: classify the document (uses only the first 6k chars — fast)
  let docType: DocType = 'essay'
  try {
    const { text: analysisText } = await generateText({
      model: gemini(MODEL),
      system: DOC_ANALYSIS_PROMPT, // this is whats asked
      messages: [{ role: 'user', content: `Document:\n\n${truncated.slice(0, 6_000)}` }],
      maxTokens: 128,
      temperature: 0.2,
    })
    const analysis = JSON.parse(extractJSON(analysisText))
    if (analysis.type && analysis.type in FLASHCARD_PROMPTS) {
      docType = analysis.type as DocType
    }
  } catch {
    // fallback to 'essay' on any parsing failure
  }

  // Step 2: generate cards with the type-specific prompt
  const { text } = await generateText({
    model: gemini(MODEL),
    system: FLASHCARD_PROMPTS[docType],
    messages: [{ role: 'user', content: `Document:\n\n${truncated}` }],
    maxTokens: 4096,
    temperature: 0.7,
  })

  return JSON.parse(extractJSON(text)) as FlashcardDeck
}

// ── Quiz ───────────────────────────────────────────────────────────────────

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

const LANGUAGE_NAMES: Record<string, string> = {
  english: 'English',
  japanese: 'Japanese',
  korean: 'Korean',
  chinese: 'Chinese',
  spanish: 'Spanish',
  french: 'French',
}

// If not written in preferred language, write all question both in preferred language and document language
// if already in preferred language, just write in preferred language only
function bilingualInstruction(preferredLang: string): string {
  const preferred = LANGUAGE_NAMES[preferredLang] ?? 'English'
  return `

LANGUAGE REQUIREMENT:
1. Detect the language of the provided document.
2. If the document is NOT written in ${preferred}: write ALL quiz fields (question, options, answer, explanation) bilingually — ${preferred} text first, then the document's original language text in parentheses. Example: "What is the formula for velocity? (속도의 공식은 무엇입니까?)"
3. If the document IS already in ${preferred}: write all content in ${preferred} only — no bilingual format needed.
For multiple_choice: the "answer" field must be character-for-character identical to one of the "options" strings (including bilingual format if used).`
}

export async function generateQuiz(docText: string, language = 'english'): Promise<QuizData> {
  const truncated = docText.slice(0, MAX_DOC_CHARS)
  const system = QUIZ_PROMPT + bilingualInstruction(language)

  const { text } = await generateText({
    model: gemini(MODEL),
    system,
    messages: [{ role: 'user', content: `Document:\n\n${truncated}` }],
    maxTokens: 4096,
    temperature: 0.7,
  })

  return JSON.parse(extractJSON(text)) as QuizData
}
