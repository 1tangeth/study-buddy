import { useEffect, useState } from 'react'
import { marked } from '../lib/md.js'

export default function FlashCards({ deck, onExit }) {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const cards = deck.cards
  const total = cards.length
  const card = cards[idx]

  function goTo(newIdx) {
    setFlipped(false)
    setIdx(newIdx)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowRight' && idx < total - 1) goTo(idx + 1)
      if (e.key === 'ArrowLeft' && idx > 0) goTo(idx - 1)
      if (e.key === ' ') { e.preventDefault(); setFlipped(f => !f) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, total])

  return (
    <div className="flashcards-mode">
      <div className="fc-header">
        <span className="fc-label">Flash Cards</span>
        <span className="fc-counter">{idx + 1} / {total}</span>
        <button className="fc-exit-btn" onClick={onExit}>Exit</button>
      </div>

      <div className="fc-progress-bar">
        <div className="fc-progress-fill" style={{ width: `${((idx + 1) / total) * 100}%` }} />
      </div>

      <div className="fc-body">
        <div
          className="fc-card-wrapper"
          onClick={() => setFlipped(f => !f)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setFlipped(f => !f)}
          aria-label={flipped ? 'Card back — click to show front' : 'Card front — click to flip'}
        >
          <div className={`fc-card${flipped ? ' fc-flipped' : ''}`}>
            <div className="fc-face fc-front">
              <span className="fc-side-label">front</span>
              <div className="fc-text">{card.front}</div>
              <span className="fc-tap-hint">click to flip</span>
            </div>
            <div className="fc-face fc-back">
              <span className="fc-side-label">back</span>
              <div
                className="fc-text md"
                dangerouslySetInnerHTML={{ __html: marked.parse(card.back || '') }}
              />
            </div>
          </div>
        </div>

        <div className="fc-controls">
          <button
            className="fc-nav-btn"
            disabled={idx === 0}
            onClick={e => { e.stopPropagation(); goTo(idx - 1) }}
          >
            ← Prev
          </button>
          <button
            className="fc-flip-btn"
            onClick={e => { e.stopPropagation(); setFlipped(f => !f) }}
          >
            {flipped ? 'Show Front' : 'Flip ↗'}
          </button>
          <button
            className="fc-nav-btn"
            disabled={idx === total - 1}
            onClick={e => { e.stopPropagation(); goTo(idx + 1) }}
          >
            Next →
          </button>
        </div>

        <p className="fc-keyboard-hint">← → to navigate · Space to flip</p>
      </div>
    </div>
  )
}
