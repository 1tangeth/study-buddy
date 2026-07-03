import { useState } from 'react'

export default function QuizMode({ quiz, onExit }) {
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [selfGrade, setSelfGrade] = useState(null)
  const [scores, setScores] = useState({})

  const questions = quiz.questions
  const total = questions.length

  function recordScore(qIdx, correct) {
    setScores(prev => ({ ...prev, [qIdx]: correct }))
  }

  function handleMCQSubmit() {
    recordScore(idx, selected === questions[idx].answer)
    setSubmitted(true)
  }

  function handleShortSubmit() {
    setSubmitted(true)
  }

  function handleSelfGrade(correct) {
    recordScore(idx, correct)
    setSelfGrade(correct)
  }

  function handleNext() {
    setIdx(i => i + 1)
    setSelected(null)
    setInputVal('')
    setSubmitted(false)
    setSelfGrade(null)
  }

  if (idx >= total) {
    const correctCount = Object.values(scores).filter(Boolean).length
    return (
      <ScoreScreen
        score={correctCount}
        total={total}
        questions={questions}
        scores={scores}
        onExit={onExit}
      />
    )
  }

  const q = questions[idx]
  const isMCQ = q.type === 'multiple_choice'
  const canSubmit = isMCQ ? !!selected : !!inputVal.trim()
  const showNext = submitted && (isMCQ || selfGrade !== null)

  return (
    <div className="quiz-mode">
      <div className="quiz-header">
        <span className="quiz-label">Quiz</span>
        <span className="quiz-counter">{idx + 1} / {total}</span>
        <button className="quiz-exit-btn" onClick={onExit}>Exit</button>
      </div>

      <div className="quiz-progress-bar">
        <div className="quiz-progress-fill" style={{ width: `${(idx / total) * 100}%` }} />
      </div>

      <div className="quiz-body">
        <p className="quiz-question">{q.question}</p>

        {isMCQ ? (
          <div className="mcq-options">
            {q.options.map(opt => {
              let cls = 'mcq-opt'
              if (submitted) {
                if (opt === q.answer) cls += ' opt-correct'
                else if (opt === selected) cls += ' opt-wrong'
              } else if (opt === selected) {
                cls += ' opt-selected'
              }
              return (
                <button
                  key={opt}
                  className={cls}
                  disabled={submitted}
                  onClick={() => setSelected(opt)}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        ) : (
          <textarea
            className="short-answer-input"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            disabled={submitted}
            placeholder="Type your answer here…"
            rows={4}
          />
        )}

        {!submitted && (
          <button
            className="quiz-check-btn"
            disabled={!canSubmit}
            onClick={isMCQ ? handleMCQSubmit : handleShortSubmit}
          >
            Check Answer
          </button>
        )}

        {submitted && (
          <div className="quiz-reveal">
            {isMCQ ? (
              <p className={`verdict ${selected === q.answer ? 'verdict-correct' : 'verdict-wrong'}`}>
                {selected === q.answer
                  ? '✓ Correct!'
                  : `✗ Incorrect — correct answer: ${q.answer}`}
              </p>
            ) : (
              <>
                <div className="reveal-answer">
                  <strong>Answer:</strong> {q.answer}
                </div>
                {selfGrade === null ? (
                  <div className="self-grade">
                    <p className="self-grade-label">Did you get it right?</p>
                    <div className="self-grade-btns">
                      <button className="grade-yes" onClick={() => handleSelfGrade(true)}>✓ Yes</button>
                      <button className="grade-no" onClick={() => handleSelfGrade(false)}>✗ No</button>
                    </div>
                  </div>
                ) : (
                  <p className={`verdict ${selfGrade ? 'verdict-correct' : 'verdict-wrong'}`}>
                    {selfGrade ? '✓ Marked correct' : '✗ Marked incorrect'}
                  </p>
                )}
              </>
            )}
            <p className="reveal-explanation">{q.explanation}</p>
            {showNext && (
              <button className="quiz-next-btn" onClick={handleNext}>
                {idx + 1 < total ? 'Next Question →' : 'See Results'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreScreen({ score, total, questions, scores, onExit }) {
  const pct = Math.round((score / total) * 100)
  const message =
    pct >= 80 ? 'Great job!' :
    pct >= 60 ? 'Good effort — review the missed ones.' :
    'Keep studying — you\'ve got this!'

  return (
    <div className="score-screen">
      <div className="score-hero">
        <div className="score-ring">
          <span className="score-frac">{score}/{total}</span>
          <span className="score-pct">{pct}%</span>
        </div>
        <p className="score-message">{message}</p>
      </div>

      <div className="score-breakdown">
        {questions.map((q, i) => (
          <div key={q.id} className={`score-row ${scores[i] ? 'row-correct' : 'row-wrong'}`}>
            <span className="row-icon">{scores[i] ? '✓' : '✗'}</span>
            <span className="row-q">{q.question}</span>
          </div>
        ))}
      </div>

      <button className="back-to-chat-btn" onClick={onExit}>Back to Chat</button>
    </div>
  )
}
