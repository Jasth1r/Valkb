import WarpBackground from "./WarpBackground"

type Props = {
  count: number
  version: string
  generatedAt: string
  onEnterRoster: () => void
  onStartGame: () => void
}

export default function Landing({
  count,
  version,
  generatedAt,
  onEnterRoster,
  onStartGame,
}: Props) {
  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "#000",
        overflow: "hidden",
      }}
    >
      <WarpBackground />

      <div
        style={{ position: "relative", zIndex: 10 }}
        className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-white"
      >
        <h1 className="text-6xl sm:text-7xl font-bold tracking-tight drop-shadow-[0_2px_24px_rgba(255,40,40,0.35)]">
          Valkb
        </h1>
        <p className="mt-3 text-lg sm:text-xl text-gray-300">
          VCT Player Guesser — 20 questions, {count} pros.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onStartGame}
            className="rounded-md bg-red-600 hover:bg-red-500 transition-colors px-6 py-3 text-base font-semibold text-white shadow-lg shadow-red-900/40"
          >
            ▶ Start guessing game
          </button>
          <button
            onClick={onEnterRoster}
            className="rounded-md border border-white/30 hover:border-white/60 hover:bg-white/5 transition-colors px-6 py-3 text-base font-medium text-white"
          >
            Browse roster
          </button>
        </div>

        <p className="mt-12 text-xs text-gray-500">
          {version} · generated {new Date(generatedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
