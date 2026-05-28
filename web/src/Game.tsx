import { useState } from "react"
import Avatar from "./Avatar"
import type { Player } from "./types"
import { QUESTIONS, type Answer } from "./game/questions"
import {
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
          className="text-sm text-zinc-500 hover:text-red-400 transition-colors"
        >
          ← Back to roster
        </button>
        <span className="text-xs text-zinc-600 tabular-nums">
          {state.asked.length} / 20
        </span>
      </div>

      {askingPhase && state.pendingQuestion && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-6 shadow-[0_0_24px_rgba(239,68,68,0.08)]">
          <p className="text-xs uppercase tracking-wider text-red-400/80 mb-2 font-medium">
            {state.pendingQuestion.category}
          </p>
          <h2 className="text-xl font-semibold text-white mb-6 leading-snug">
            {state.pendingQuestion.text}
          </h2>
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer("yes")}
              className="flex-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 transition-colors shadow-lg shadow-emerald-900/30"
            >
              Yes
            </button>
            <button
              onClick={() => handleAnswer("no")}
              className="flex-1 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 transition-colors shadow-lg shadow-red-900/40"
            >
              No
            </button>
            <button
              onClick={() => handleAnswer("unsure")}
              className="flex-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold py-2.5 transition-colors border border-zinc-700"
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-6 text-center">
          <p className="text-lg text-zinc-200 mb-4">
            I'm out of guesses — your answers don't match anyone in my roster.
          </p>
          <button
            onClick={restart}
            className="rounded-md bg-red-600 hover:bg-red-500 text-white px-5 py-2 text-sm font-semibold transition-colors shadow-lg shadow-red-900/40"
          >
            Try again
          </button>
        </div>
      )}

      {(state.status === "won" || (state.status === "lost" && state.guess)) && (
        <div
          className={`rounded-lg border p-6 text-center ${
            state.status === "won"
              ? "border-red-500/40 bg-zinc-900/70 shadow-[0_0_32px_rgba(239,68,68,0.18)]"
              : "border-zinc-800 bg-zinc-900/70"
          }`}
        >
          <p className="text-lg text-zinc-100 mb-2">
            {state.status === "won"
              ? `🎉 Got it in ${state.asked.length} questions!`
              : state.guess
                ? `I gave up — was it really not ${state.guess.name}?`
                : ""}
          </p>
          <button
            onClick={restart}
            className="mt-4 rounded-md bg-red-600 hover:bg-red-500 text-white px-5 py-2 text-sm font-semibold transition-colors shadow-lg shadow-red-900/40"
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
  const rating = guess.stats?.rating?.trim()

  return (
    <div className="rounded-lg border border-red-500/40 bg-zinc-900/70 p-6 shadow-[0_0_32px_rgba(239,68,68,0.18)]">
      <p className="text-sm text-zinc-400 mb-3">
        After {questionsAsked} question{questionsAsked === 1 ? "" : "s"}, my guess is…
      </p>
      <div className="flex items-center gap-4 mb-6">
        <Avatar
          src={guess.avatar}
          name={guess.name}
          hasReal={guess.has_real_avatar}
          className="h-20 w-20 rounded-full shrink-0 ring-2 ring-red-500/40"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-white">{guess.name}</h2>
          {guess.real_name && (
            <p className="text-sm text-zinc-500">{guess.real_name}</p>
          )}
          <p className="text-sm text-zinc-300 mt-1">
            {guess.team || (
              <span className="italic text-zinc-500">no current team</span>
            )}{" "}
            · {guess.region || "—"} · {guess.primary_role || "—"}
          </p>
          {rating && (
            <p className="text-sm text-zinc-500 mt-1">Rating {rating}</p>
          )}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => onConfirm(true)}
          className="flex-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 transition-colors shadow-lg shadow-emerald-900/30"
        >
          Yes — that's the player!
        </button>
        <button
          onClick={() => onConfirm(false)}
          className="flex-1 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 transition-colors shadow-lg shadow-red-900/40"
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
    <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
        History
      </h3>
      <ol className="space-y-1.5 text-sm">
        {asked.map((t, i) => (
          <li key={t.question.id} className="flex gap-3 items-baseline">
            <span className="text-zinc-600 w-6 tabular-nums text-xs">
              #{i + 1}
            </span>
            <span className="text-zinc-300 flex-1">{t.question.text}</span>
            <span
              className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
                t.answer === "yes"
                  ? "bg-emerald-950/60 text-emerald-300 ring-1 ring-inset ring-emerald-900/60"
                  : t.answer === "no"
                    ? "bg-red-950/60 text-red-300 ring-1 ring-inset ring-red-900/60"
                    : "bg-zinc-800/70 text-zinc-400 ring-1 ring-inset ring-zinc-700/50"
              }`}
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
