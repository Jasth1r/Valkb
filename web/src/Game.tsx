import { useState } from "react"
import Avatar from "./Avatar"
import type { Player } from "./types"
import { QUESTIONS, type Answer } from "./game/questions"
import {
  MAX_QUESTIONS,
  answerQuestion,
  confirmGuess,
  initGame,
  type GameState,
} from "./game/engine"

type Props = {
  players: Player[]
  onExit: () => void
}

export default function Game({ players, onExit }: Props) {
  const [state, setState] = useState<GameState>(() => initGame(players, QUESTIONS))

  function handleAnswer(a: Answer) {
    setState((s) => answerQuestion(s, a))
  }

  function handleGuessResponse(correct: boolean) {
    setState((s) => confirmGuess(s, correct))
  }

  function restart() {
    setState(initGame(players, QUESTIONS))
  }

  const askingPhase =
    state.status === "playing" && state.pendingQuestion !== null
  const guessingPhase = state.status === "playing" && state.guess !== null
  const noMatch =
    state.status === "lost" && state.guess === null

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onExit}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to roster
        </button>
        <span className="text-sm text-gray-500">
          Question {Math.min(state.asked.length + (askingPhase ? 1 : 0), MAX_QUESTIONS)} / {MAX_QUESTIONS}
          {" · "}
          {state.candidates.length} candidate{state.candidates.length === 1 ? "" : "s"}
        </span>
      </div>

      {askingPhase && state.pendingQuestion && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
            {state.pendingQuestion.category}
          </p>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {state.pendingQuestion.text}
          </h2>
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer("yes")}
              className="flex-1 rounded bg-green-600 text-white font-medium py-2 hover:bg-green-700"
            >
              Yes
            </button>
            <button
              onClick={() => handleAnswer("no")}
              className="flex-1 rounded bg-red-600 text-white font-medium py-2 hover:bg-red-700"
            >
              No
            </button>
            <button
              onClick={() => handleAnswer("unsure")}
              className="flex-1 rounded bg-gray-200 text-gray-700 font-medium py-2 hover:bg-gray-300"
            >
              Not sure
            </button>
          </div>
        </div>
      )}

      {guessingPhase && state.guess && (
        <GuessCard
          guess={state.guess}
          questionsAsked={state.asked.length}
          onConfirm={handleGuessResponse}
        />
      )}

      {noMatch && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm text-center">
          <p className="text-lg text-gray-700 mb-4">
            I'm out of guesses — your answers don't match anyone in my roster.
          </p>
          <button
            onClick={restart}
            className="rounded bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800"
          >
            Try again
          </button>
        </div>
      )}

      {(state.status === "won" || (state.status === "lost" && state.guess)) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm text-center">
          <p className="text-lg text-gray-700 mb-2">
            {state.status === "won"
              ? `🎉 Got it in ${state.asked.length} questions!`
              : state.guess
                ? `I gave up — was it really not ${state.guess.name}?`
                : ""}
          </p>
          <button
            onClick={restart}
            className="mt-4 rounded bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800"
          >
            New game
          </button>
        </div>
      )}

      <AskedLog asked={state.asked} />
    </div>
  )
}

function GuessCard({
  guess,
  questionsAsked,
  onConfirm,
}: {
  guess: Player
  questionsAsked: number
  onConfirm: (correct: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500 mb-3">
        After {questionsAsked} question{questionsAsked === 1 ? "" : "s"}, my guess is…
      </p>
      <div className="flex items-center gap-4 mb-6">
        <Avatar
          src={guess.avatar}
          name={guess.name}
          hasReal={guess.has_real_avatar}
          className="h-20 w-20 rounded-full shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold">{guess.name}</h2>
          {guess.real_name && (
            <p className="text-sm text-gray-500">{guess.real_name}</p>
          )}
          <p className="text-sm text-gray-700 mt-1">
            {guess.team || "(no current team)"} · {guess.region || "—"} ·{" "}
            {guess.primary_role || "—"}
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => onConfirm(true)}
          className="flex-1 rounded bg-green-600 text-white font-medium py-2 hover:bg-green-700"
        >
          Yes — that's the player!
        </button>
        <button
          onClick={() => onConfirm(false)}
          className="flex-1 rounded bg-red-600 text-white font-medium py-2 hover:bg-red-700"
        >
          No, not them
        </button>
      </div>
    </div>
  )
}

function AskedLog({ asked }: { asked: AskedTurn[] }) {
  if (asked.length === 0) return null
  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">History</h3>
      <ol className="space-y-1 text-sm">
        {asked.map((t, i) => (
          <li key={t.question.id} className="flex gap-3">
            <span className="text-gray-400 w-6 tabular-nums">#{i + 1}</span>
            <span className="text-gray-700 flex-1">{t.question.text}</span>
            <span
              className={
                t.answer === "yes"
                  ? "text-green-700 font-medium"
                  : t.answer === "no"
                    ? "text-red-700 font-medium"
                    : "text-gray-500"
              }
            >
              {t.answer}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

type AskedTurn = GameState["asked"][number]
