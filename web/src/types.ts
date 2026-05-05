export type Region = "EMEA" | "Pacific" | "Americas" | "CN" | ""
export type Role = "Duelist" | "Controller" | "Sentinel" | "Initiator" | ""

export type PastTeam = {
  name: string
  tag: string       // e.g. "stand-in", "inactive"
  dates: string     // e.g. "March 2022 — October 2025"
  logo: string
}

export type EventPlacement = {
  event: string
  placement: string // e.g. "1st", "Top 4", "5th–6th"
  team: string
  date: string      // year, e.g. "2024"
  prize: string     // e.g. "$200,000"
}

export type Player = {
  id: string
  name: string
  real_name: string
  country: string
  avatar: string
  has_real_avatar: boolean
  team: string
  team_logo: string
  region: Region
  agents: string[]
  roles: Role[]
  primary_role: Role
  stats: {
    acs: string
    kd: string
    rating: string
    hs_pct: string
  }
  past_teams: PastTeam[]
  events: EventPlacement[]
  total_winnings: string       // raw "$1,234,567"
  total_winnings_usd: number   // parsed integer (0 if missing)
}

export type PlayersFile = {
  meta: {
    version: string
    generated_at: string
    count: number
    source: string
  }
  players: Player[]
}
