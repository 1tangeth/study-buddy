// Live integration test — hits the real Gemini API, no mocks.
// Run with: npm run test:live
import 'dotenv/config'

import { describe, expect, it } from 'vitest'
import { streamAnswer } from '../src/ai'

const SAMPLE_DOC = `
Bayes' Theorem: P(A|B) = P(B|A) * P(A) / P(B)

Variables:
- P(A|B): probability of A given B (posterior)
- P(B|A): probability of B given A (likelihood)
- P(A): prior probability of A
- P(B): marginal probability of B

Example: A test is 99% accurate. 1% of the population has the disease.
If someone tests positive, what is the probability they actually have it?
P(disease | positive) = (0.99 * 0.01) / ((0.99 * 0.01) + (0.01 * 0.99)) = 0.5
`

describe('Gemini live integration', () => {
  it('streams a real response for an explain action', async () => {
    const chunks: string[] = []

    console.log('\n── Gemini response (streaming) ──────────────────')

    for await (const delta of streamAnswer(SAMPLE_DOC, 'Explain Bayes theorem simply', 'explain')) {
      chunks.push(delta)
      process.stdout.write(delta)
    }

    console.log('\n─────────────────────────────────────────────────\n')

    const fullResponse = chunks.join('')

    expect(fullResponse.length, 'Response should have content').toBeGreaterThan(50)
    expect(chunks.length, 'Should have received multiple stream chunks').toBeGreaterThan(1)
    expect(fullResponse.toLowerCase()).toMatch(/bayes|probability|theorem/)
  }, 30_000)

  it('streams a real response for a quiz action', async () => {
    const chunks: string[] = []

    console.log('\n── Gemini quiz response (streaming) ─────────────')

    for await (const delta of streamAnswer(SAMPLE_DOC, 'Generate practice questions', 'quiz')) {
      chunks.push(delta)
      process.stdout.write(delta)
    }

    console.log('\n─────────────────────────────────────────────────\n')

    const fullResponse = chunks.join('')

    expect(fullResponse.length).toBeGreaterThan(50)
    expect(fullResponse.toLowerCase()).toMatch(/question|\?|probability/)
  }, 30_000)
})
