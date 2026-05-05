import { useMemo, useState } from "react"
import rawData from "../../players.json"
import Avatar from "./Avatar"
import Game from "./Game"
import type { Player, PlayersFile, Region, Role } from "./types"

const data = rawData as PlayersFile

type Mode = "roster" | "game"

const REGIONS: (Region | "All")[] = ["All", "Americas", "EMEA", "Pacific", "CN"]
const ROLES: (Role | "All")[] = ["All", "Duelist", "Controller", "Sentinel", "Initiator"]

const regionStyles: Record<string, string> = {
  Americas: "bg-blue-100 text-blue-800",
  EMEA: "bg-amber-100 text-amber-800",
  Pacific: "bg-green-100 text-green-800",
  CN: "bg-rose-100 text-rose-800",
}

const roleStyles: Record<string, string> = {
  Duelist: "bg-red-100 text-red-800",
  Controller: "bg-purple-100 text-purple-800",
  Sentinel: "bg-emerald-100 text-emerald-800",
  Initiator: "bg-yellow-100 text-yellow-800",
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

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <Avatar
          src={p.avatar}
          name={p.name}
          hasReal={p.has_real_avatar}
          className="h-14 w-14 rounded-full shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
            {p.country && (
              <span className="text-xs text-gray-500 uppercase">{p.country}</span>
            )}
          </div>
          {p.real_name && (
            <p className="text-sm text-gray-500 truncate">{p.real_name}</p>
          )}
          <p className="text-sm text-gray-700 truncate mt-1">
            {p.team || <span className="italic text-gray-400">no team</span>}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.region && (
          <Tag label={p.region} className={regionStyles[p.region] ?? "bg-gray-100 text-gray-800"} />
        )}
        {p.primary_role && (
          <Tag
            label={p.primary_role}
            className={roleStyles[p.primary_role] ?? "bg-gray-100 text-gray-800"}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {p.agents.map((a) => (
          <span
            key={a}
            className="text-xs text-gray-600 bg-gray-100 rounded px-1.5 py-0.5"
          >
            {a}
          </span>
        ))}
      </div>

      {(winnings || pastTeamNames.length > 0 || p.events.length > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-1">
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
            <p className="text-gray-500 truncate" title={pastTeamNames.join(" → ")}>
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
  const [mode, setMode] = useState<Mode>("roster")
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
        if (q && !p.name.toLowerCase().includes(q) && !p.real_name.toLowerCase().includes(q))
          return false
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

  if (mode === "game") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-3xl px-6 py-6">
            <h1 className="text-2xl font-bold">VCT Player Guesser — Game</h1>
            <p className="text-sm text-gray-500 mt-1">
              Think of a VCT pro. Answer 20 questions and I'll try to guess.
            </p>
          </div>
        </header>
        <Game players={data.players} onExit={() => setMode("roster")} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold">VCT Player Guesser — Roster</h1>
            <p className="text-sm text-gray-500 mt-1">
              {data.meta.count} players · {data.meta.version} ·
              generated {new Date(data.meta.generated_at).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => setMode("game")}
            className="rounded bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 shrink-0"
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
            className="rounded border border-gray-300 px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="text"
            value={pastTeam}
            onChange={(e) => setPastTeam(e.target.value)}
            placeholder="Team contains… (current or past, e.g. FNATIC)"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex gap-1">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`px-3 py-1 text-sm rounded border ${
                  region === r
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
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
                className={`px-3 py-1 text-sm rounded border ${
                  role === r
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <span className="text-sm text-gray-500 ml-auto">
            showing {filtered.length} / {data.players.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-gray-400 mt-12">No players match these filters.</p>
        )}
      </div>
    </div>
  )
}
