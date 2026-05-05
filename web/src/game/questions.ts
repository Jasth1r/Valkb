import type { Player } from "../types"

export type Answer = "yes" | "no" | "unsure"

export type Question = {
  id: string
  text: string
  category: "region" | "role" | "country" | "agent" | "team" | "event" | "winnings"
  /** Predicate over a player. "unsure" means our data is missing the field
   *  and we cannot confidently say yes or no. */
  predicate: (p: Player) => Answer
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const teamMatches = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase())

const evMatches = (events: Player["events"], pattern: RegExp, placement?: string) =>
  events.some(
    (e) =>
      pattern.test(e.event) && (placement === undefined || e.placement === placement),
  )

const yn = (b: boolean): Answer => (b ? "yes" : "no")

// ---------------------------------------------------------------
// Region (4) — earliest, biggest cuts
// ---------------------------------------------------------------

const region: Question[] = (["EMEA", "Pacific", "Americas", "CN"] as const).map((r) => ({
  id: `region_${r.toLowerCase()}`,
  text: `Is the player from the ${r} region?`,
  category: "region" as const,
  predicate: (p) => (!p.region ? "unsure" : yn(p.region === r)),
}))

// ---------------------------------------------------------------
// Role (4)
// ---------------------------------------------------------------

const roles: Question[] = (["Duelist", "Controller", "Sentinel", "Initiator"] as const).map(
  (r) => ({
    id: `role_${r.toLowerCase()}`,
    text: `Does the player primarily play ${r}?`,
    category: "role" as const,
    predicate: (p) => (!p.primary_role ? "unsure" : yn(p.primary_role === r)),
  }),
)

// ---------------------------------------------------------------
// Country (top 12 by frequency)
// ---------------------------------------------------------------

const COUNTRIES: Array<[string, string]> = [
  ["tr", "Turkey"],
  ["us", "the United States"],
  ["kr", "South Korea"],
  ["fr", "France"],
  ["de", "Germany"],
  ["ru", "Russia"],
  ["vn", "Vietnam"],
  ["cn", "China"],
  ["br", "Brazil"],
  ["gb", "the United Kingdom"],
  ["th", "Thailand"],
  ["ph", "the Philippines"],
]

const countries: Question[] = COUNTRIES.map(([code, name]) => ({
  id: `country_${code}`,
  text: `Is the player from ${name}?`,
  category: "country" as const,
  predicate: (p) =>
    !p.country || p.country === "un" ? "unsure" : yn(p.country === code),
}))

// ---------------------------------------------------------------
// Main agent — top 12 by frequency in the dataset
// ---------------------------------------------------------------

const AGENTS = [
  "jett",
  "raze",
  "omen",
  "sova",
  "viper",
  "neon",
  "cypher",
  "yoru",
  "killjoy",
  "astra",
  "fade",
  "breach",
]

const agents: Question[] = AGENTS.map((a) => ({
  id: `agent_${a}`,
  text: `Is ${a[0].toUpperCase() + a.slice(1)} one of the player's main agents?`,
  category: "agent" as const,
  predicate: (p) => (!p.agents.length ? "unsure" : yn(p.agents.includes(a))),
}))

// ---------------------------------------------------------------
// Teams — current OR past, "famous" orgs across all regions
// ---------------------------------------------------------------

const TEAMS = [
  "FNATIC",
  "Sentinels",
  "Paper Rex",
  "DRX",
  "LOUD",
  "T1",
  "G2",
  "NAVI",
  "Team Vitality",
  "EDward Gaming",
  "100 Thieves",
  "OpTic Gaming",
  "Team Liquid",
  "Karmine Corp",
  "Bilibili Gaming",
]

const teams: Question[] = TEAMS.map((name) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_")
  return {
    id: `team_${slug}`,
    text: `Has the player ever played for ${name} (current or past)?`,
    category: "team" as const,
    predicate: (p) => {
      const onCurrent = !!p.team && teamMatches(p.team, name)
      if (onCurrent) return "yes"
      const onPast = p.past_teams.some((t) => teamMatches(t.name, name))
      if (onPast) return "yes"
      // Partial-record players (no cache) lack past_teams entirely
      if (p.past_teams.length === 0 && !p.team) return "unsure"
      if (p.past_teams.length === 0) return "unsure"
      return "no"
    },
  }
})

// ---------------------------------------------------------------
// Events / achievements
// ---------------------------------------------------------------

// Champions = the year-end VCT tournament. Exclude "Kickoff Champions" etc.
const isChampions = (event: string) =>
  /champions/i.test(event) && !/kickoff|masters/i.test(event)
// Masters = mid-year LAN events, named "Masters <city>"
const isMasters = (event: string) => /masters/i.test(event)

const events: Question[] = [
  {
    id: "event_champions_attended",
    text: "Has the player ever competed at VCT Champions?",
    category: "event",
    predicate: (p) => {
      if (p.events.length === 0) return "unsure"
      return yn(p.events.some((e) => isChampions(e.event)))
    },
  },
  {
    id: "event_champions_won",
    text: "Has the player won VCT Champions (1st place)?",
    category: "event",
    predicate: (p) => {
      if (p.events.length === 0) return "unsure"
      return yn(p.events.some((e) => isChampions(e.event) && e.placement === "1st"))
    },
  },
  {
    id: "event_masters_attended",
    text: "Has the player ever competed at a VCT Masters event?",
    category: "event",
    predicate: (p) => {
      if (p.events.length === 0) return "unsure"
      return yn(p.events.some((e) => isMasters(e.event)))
    },
  },
  {
    id: "event_masters_won",
    text: "Has the player won a VCT Masters event (1st place)?",
    category: "event",
    predicate: (p) => {
      if (p.events.length === 0) return "unsure"
      return yn(evMatches(p.events, /masters/i, "1st"))
    },
  },
]

// ---------------------------------------------------------------
// Career winnings tiers
// ---------------------------------------------------------------

const winnings: Question[] = [
  {
    id: "winnings_10k",
    text: "Are the player's career winnings over $10,000?",
    category: "winnings",
    predicate: (p) => (p.total_winnings_usd === 0 ? "unsure" : yn(p.total_winnings_usd > 10_000)),
  },
  {
    id: "winnings_50k",
    text: "Are the player's career winnings over $50,000?",
    category: "winnings",
    predicate: (p) => (p.total_winnings_usd === 0 ? "unsure" : yn(p.total_winnings_usd > 50_000)),
  },
  {
    id: "winnings_200k",
    text: "Are the player's career winnings over $200,000?",
    category: "winnings",
    predicate: (p) => (p.total_winnings_usd === 0 ? "unsure" : yn(p.total_winnings_usd > 200_000)),
  },
]

// ---------------------------------------------------------------
// Export the full pool
// ---------------------------------------------------------------

export const QUESTIONS: Question[] = [
  ...region,
  ...roles,
  ...countries,
  ...agents,
  ...teams,
  ...events,
  ...winnings,
]
