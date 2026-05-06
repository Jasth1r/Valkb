import type { Player } from "../types"
import type { Answer, Question } from "./questions"

export type AskedTurn = { question: Question; answer: Answer }

export type GameState = {
  candidates: Player[]
  /** Finalized turns — each has a user answer. */
  asked: AskedTurn[]
  remainingQuestions: Question[]
  /** The question currently being asked. Null when guessing or game over. */
  pendingQuestion: Question | null
  status: "playing" | "won" | "lost"
  /** When set, the engine wants the user to confirm whether this is their target. */
  guess: Player | null
}

export const MAX_QUESTIONS = 20

function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------
//
// User knows the truth for THEIR target. If they say "yes", we keep
// candidates that would say yes OR unsure (data missing on our side
// doesn't rule them out). Symmetric for "no". For user "unsure", we
// keep everything.
//
function applyAnswer(
  candidates: Player[],
  question: Question,
  answer: Answer,
): Player[] {
  if (answer === "unsure") return candidates
  return candidates.filter((p) => {
    const verdict = question.predicate(p)
    if (verdict === "unsure") return true
    return verdict === answer
  })
}

// ---------------------------------------------------------------
// Question scoring (information gain proxy)
// ---------------------------------------------------------------

/** Expected size (log) of remaining candidate pool after asking this Q.
 *  Lower is better. */
function expectedRemainingEntropy(q: Question, candidates: Player[]): number {
  let yes = 0
  let no = 0
  let unsure = 0
  for (const p of candidates) {
    const v = q.predicate(p)
    if (v === "yes") yes++
    else if (v === "no") no++
    else unsure++
  }
  const total = candidates.length
  if (total === 0) return 0

  // Treat unsure-on-our-side as "could go either way" → split evenly.
  const pYes = (yes + unsure / 2) / total
  const pNo = (no + unsure / 2) / total

  // After "yes": remaining candidates = yes + unsure (we keep unsure too).
  const remYes = yes + unsure
  const remNo = no + unsure

  const log2 = (n: number) => (n > 0 ? Math.log2(n) : 0)
  return pYes * log2(remYes) + pNo * log2(remNo)
}

function pickNextQuestion(
  candidates: Player[],
  pool: Question[],
  askedCount = 0,
): Question | null {
  if (candidates.length <= 1) return null
  if (pool.length === 0) return null

  let bestScore = Infinity
  const viable: Array<{ question: Question; score: number }> = []

  for (const q of pool) {
    let yes = 0
    let no = 0
    for (const p of candidates) {
      const v = q.predicate(p)
      if (v === "yes") yes++
      else if (v === "no") no++
    }
    // A question that gives the same answer for everyone (or only "unsure"
    // and one other) can't narrow the pool — skip it.
    if (yes === 0 || no === 0) continue

    let score = expectedRemainingEntropy(q, candidates)

    // Region questions are useful, but opening with them every time gets stale.
    if (askedCount === 0 && q.category === "region") {
      score += 0.35
    }

    viable.push({ question: q, score })
    if (score < bestScore) bestScore = score
  }

  if (viable.length === 0) return null

  // Pick from the best few near-ties so runs feel less scripted.
  const nearBest = viable.filter(({ score }) => score <= bestScore + 0.12)
  const chosen = nearBest[Math.floor(Math.random() * nearBest.length)] ?? viable[0]
  return chosen.question
}

function pickGuessCandidate(candidates: Player[]): Player | null {
  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => {
    if (a.has_real_avatar !== b.has_real_avatar) {
      return Number(b.has_real_avatar) - Number(a.has_real_avatar)
    }
    return a.name.localeCompare(b.name)
  })

  return sorted[0] ?? null
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export function initGame(allPlayers: Player[], allQuestions: Question[]): GameState {
  const candidates = [...allPlayers]
  const pool = shuffled(allQuestions)
  const first = pickNextQuestion(candidates, pool, 0)
  return {
    candidates,
    asked: [],
    remainingQuestions: first ? pool.filter((q) => q.id !== first.id) : pool,
    pendingQuestion: first,
    status: "playing",
    guess: first ? null : pickGuessCandidate(candidates),
  }
}

/** User answered the current pendingQuestion. Filter, check status, and
 *  either queue the next question or surface a guess. */
export function answerQuestion(state: GameState, answer: Answer): GameState {
  if (state.status !== "playing" || !state.pendingQuestion) return state

  const finalizedTurn: AskedTurn = { question: state.pendingQuestion, answer }
  const newAsked = [...state.asked, finalizedTurn]
  const newCandidates = applyAnswer(state.candidates, state.pendingQuestion, answer)

  // Terminal cases
  if (newCandidates.length === 0) {
    return {
      ...state,
      asked: newAsked,
      candidates: newCandidates,
      pendingQuestion: null,
      status: "lost",
      guess: null,
    }
  }
  if (newCandidates.length === 1) {
    return {
      ...state,
      asked: newAsked,
      candidates: newCandidates,
      pendingQuestion: null,
      guess: pickGuessCandidate(newCandidates),
    }
  }
  if (newAsked.length >= MAX_QUESTIONS) {
    return {
      ...state,
      asked: newAsked,
      candidates: newCandidates,
      pendingQuestion: null,
      guess: pickGuessCandidate(newCandidates),
    }
  }

  // Still playing — queue the next question.
  const next = pickNextQuestion(newCandidates, state.remainingQuestions, newAsked.length)
  if (!next) {
    // No question can split the pool further — fall back to a best guess.
    return {
      ...state,
      asked: newAsked,
      candidates: newCandidates,
      pendingQuestion: null,
      guess: pickGuessCandidate(newCandidates),
    }
  }

  return {
    ...state,
    asked: newAsked,
    candidates: newCandidates,
    pendingQuestion: next,
    remainingQuestions: state.remainingQuestions.filter((q) => q.id !== next.id),
  }
}

export function confirmGuess(state: GameState, correct: boolean): GameState {
  if (correct) {
    return {
      ...state,
      status: "won",
    }
  }

  if (!state.guess) {
    return {
      ...state,
      status: "lost",
    }
  }

  const remainingCandidates = state.candidates.filter((p) => p.id !== state.guess?.id)

  if (remainingCandidates.length === 0) {
    return {
      ...state,
      candidates: [],
      guess: null,
      pendingQuestion: null,
      status: "lost",
    }
  }

  if (remainingCandidates.length === 1) {
    return {
      ...state,
      candidates: remainingCandidates,
      guess: pickGuessCandidate(remainingCandidates),
      pendingQuestion: null,
      status: "playing",
    }
  }

  if (state.asked.length >= MAX_QUESTIONS) {
    return {
      ...state,
      candidates: remainingCandidates,
      guess: pickGuessCandidate(remainingCandidates),
      pendingQuestion: null,
      status: "playing",
    }
  }

  const next = pickNextQuestion(
    remainingCandidates,
    state.remainingQuestions,
    state.asked.length,
  )

  return {
    ...state,
    candidates: remainingCandidates,
    guess: next ? null : pickGuessCandidate(remainingCandidates),
    pendingQuestion: next,
    remainingQuestions: next
      ? state.remainingQuestions.filter((q) => q.id !== next.id)
      : state.remainingQuestions,
    status: "playing",
  }
}
