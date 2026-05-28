import { useMemo, useState } from "react"
import rawData from "./players.json"
import Avatar from "./Avatar"
import Game from "./Game"
import Landing from "./Landing"
import type { Player, PlayersFile, Region, Role } from "./types"

const data = rawData as PlayersFile

type Mode = "landing" | "roster" | "game"

const REGIONS: (Region | "All")[] = ["All", "Americas", "EMEA", "Pacific", "CN"]
const ROLES: (Role | "All")[] = ["All", "Duelist", "Controller", "Sentinel", "Initiator"]

const regionStyles: Record<string, string> = {
  Americas: "bg-blue-950/60 text-blue-300 ring-1 ring-inset ring-blue-900/60",
  EMEA: "bg-amber-950/60 text-amber-300 ring-1 ring-inset ring-amber-900/60",
  Pacific: "bg-emerald-950/60 text-emerald-300 ring-1 ring-inset ring-emerald-900/60",
  CN: "bg-red-950/60 text-red-300 ring-1 ring-inset ring-red-900/60",
}

const roleStyles: Record<string, string> = {
  Duelist: "bg-rose-950/60 text-rose-300 ring-1 ring-inset ring-rose-900/60",
  Controller: "bg-violet-950/60 text-violet-300 ring-1 ring-inset ring-violet-900/60",
  Sentinel: "bg-teal-950/60 text-teal-300 ring-1 ring-inset ring-teal-900/60",
  Initiator: "bg-yellow-950/60 text-yellow-300 ring-1 ring-inset ring-yellow-900/60",
}

function Tag({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

function formatCompactUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  if (n > 0) return `$${n}`
  return ""
}

function PlayerCard({ p }: { p: Player }) {
  const winnings = formatCompactUSD(p.total_winnings_usd)
  const pastTeamNames = p.past_teams.map((t) => t.name).filter(Boolean)
  const pastTeamSummary = pastTeamNames.slice(0, 3).join(", ")
  const rating = p.stats?.rating?.trim()

  return (
    <div className="group rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 transition-all hover:border-red-500/50 hover:bg-zinc-900 hover:shadow-[0_0_24px_rgba(239,68,68,0.15)]">
      <div className="flex items-start gap-3">
        <Avatar
          src={p.avatar}
          name={p.name}
          hasReal={p.has_real_avatar}
          className="h-14 w-14 rounded-full shrink-0 ring-1 ring-zinc-800 group-hover:ring-red-500/40 transition"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-white truncate">{p.name}</h3>
            {p.country && (
              <span className="text-xs text-zinc-500 uppercase">{p.country}</span>
            )}
          </div>
          {p.real_name && (
            <p className="text-sm text-zinc-400 truncate">{p.real_name}</p>
          )}
          <p className="text-sm text-zinc-200 truncate mt-1">
            {p.team || <span className="italic text-zinc-600">no team</span>}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.region && (
          <Tag label={p.region} className={regionStyles[p.region] ?? "bg-zinc-800 text-zinc-300"} />
        )}
        {p.primary_role && (
          <Tag
            label={p.primary_role}
            className={roleStyles[p.primary_role] ?? "bg-zinc-800 text-zinc-300"}
          />
        )}
        {rating && (
          <Tag
            label={`Rating ${rating}`}
            className="bg-sky-950/60 text-sky-300 ring-1 ring-inset ring-sky-900/60"
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {p.agents.map((a) => (
          <span
            key={a}
            className="text-xs text-zinc-400 bg-zinc-800/70 ring-1 ring-inset ring-zinc-700/50 rounded px-1.5 py-0.5"
          >
            {a}
          </span>
        ))}
      </div>

      {(winnings || pastTeamNames.length > 0 || p.events.length > 0) && (
        <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-400 space-y-1">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {winnings && <span title="Total career winnings">💰 {winnings}</span>}
            {p.events.length > 0 && (
              <span title="Tournaments listed">🏆 {p.events.length} events</span>
            )}
            {pastTeamNames.length > 0 && (
              <span title={pastTeamNames.join(" → ")}>
                👥 {pastTeamNames.length} past teams
              </span>
            )}
          </div>
          {pastTeamSummary && (
            <p className="text-zinc-500 truncate" title={pastTeamNames.join(" → ")}>
              ex: {pastTeamSummary}
              {pastTeamNames.length > 3 && " …"}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>("landing")
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("All")
  const [role, setRole] = useState<(typeof ROLES)[number]>("All")
  const [search, setSearch] = useState("")
  const [pastTeam, setPastTeam] = useState("")

  // All hooks must run on every render — keep useMemo BEFORE any early return
  // (otherwise React errors with "Rendered fewer hooks than expected").
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pt = pastTeam.trim().toLowerCase()
    return data.players
      .filter((p) => {
        if (region !== "All" && p.region !== region) return false
        if (role !== "All" && p.primary_role !== role) return false
        if (q) {
          const inName = p.name.toLowerCase().includes(q)
          const inRealName = p.real_name.toLowerCase().includes(q)
          const inCurrentTeam = p.team.toLowerCase().includes(q)
          const inPastTeams = p.past_teams.some((t) => t.name.toLowerCase().includes(q))
          const inEvents = p.events.some(
            (e) =>
              e.event.toLowerCase().includes(q) ||
              e.team.toLowerCase().includes(q),
          )
          if (!inName && !inRealName && !inCurrentTeam && !inPastTeams && !inEvents) {
            return false
          }
        }
        if (pt) {
          const inCurrent = p.team.toLowerCase().includes(pt)
          const inPast = p.past_teams.some((t) => t.name.toLowerCase().includes(pt))
          if (!inCurrent && !inPast) return false
        }
        return true
      })
      .sort((a, b) => {
        // Players with real photos first; tie-break by name.
        if (a.has_real_avatar !== b.has_real_avatar) {
          return a.has_real_avatar ? -1 : 1
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      })
  }, [region, role, search, pastTeam])

  if (mode === "landing") {
    return (
      <Landing
        count={data.meta.count}
        version={data.meta.version}
        generatedAt={data.meta.generated_at}
        onEnterRoster={() => setMode("roster")}
        onStartGame={() => setMode("game")}
      />
    )
  }

  if (mode === "game") {
    return (
      <div className="min-h-screen bg-black text-zinc-100">
        <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto max-w-3xl px-6 py-6">
            <button
              onClick={() => setMode("landing")}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors mb-1 font-medium tracking-wide"
            >
              ← Valkb
            </button>
            <h1 className="text-2xl font-bold text-white">VCT Player Guesser — Game</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Think of a VCT pro. Answer 20 questions and I'll try to guess.
            </p>
          </div>
        </header>
        <Game players={data.players} onExit={() => setMode("roster")} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-start justify-between gap-6">
          <div>
            <button
              onClick={() => setMode("landing")}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors mb-1 font-medium tracking-wide"
            >
              ← Valkb
            </button>
            <h1 className="text-2xl font-bold text-white">VCT Player Guesser — Roster</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {data.meta.count} players · {data.meta.version} ·
              generated {new Date(data.meta.generated_at).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => setMode("game")}
            className="rounded-md bg-red-600 hover:bg-red-500 transition-colors text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-red-900/40 shrink-0"
          >
            ▶ Start guessing game
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name…"
            className="rounded border border-zinc-800 bg-zinc-900 text-zinc-100 placeholder-zinc-500 px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />

          <input
            type="text"
            value={pastTeam}
            onChange={(e) => setPastTeam(e.target.value)}
            placeholder="Team contains… (current or past, e.g. FNATIC)"
            className="rounded border border-zinc-800 bg-zinc-900 text-zinc-100 placeholder-zinc-500 px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />

          <div className="flex gap-1">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`px-3 py-1 text-sm rounded border transition-colors ${
                  region === r
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1 text-sm rounded border transition-colors ${
                  role === r
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <span className="text-sm text-zinc-500 ml-auto">
            showing {filtered.length} / {data.players.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-zinc-600 mt-12">No players match these filters.</p>
        )}
      </div>
    </div>
  )
}
