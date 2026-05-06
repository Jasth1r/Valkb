"""
Enrich players.json with derived fields for the guesser frontend.

Backs up the existing file to players.json.snapshot, then writes
a new players.json that:

- Wraps records in { meta, players } with version/timestamp/count
- Infers `region` from country code (Americas / EMEA / Pacific / CN)
- Adds `roles` (list of unique Valorant roles) and `primary_role`
- Adds `has_real_avatar` boolean (False if avatar is the sil.png placeholder)
- Pulls `past_teams`, `events`, `total_winnings` from cache/players/{id}.json
  (these fields are scraped by build_players.py but not surfaced by snapshot.py)
- Drops the `_snapshot` marker

Run after build_players.py or snapshot.py.

Usage:
  python kbGuess/process.py
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

KB_DIR = Path(__file__).parent
PLAYERS_PATH = KB_DIR / "players.json"
BACKUP_PATH = KB_DIR / "players.json.snapshot"
CACHE_DIR = KB_DIR / "cache" / "players"
OVERRIDES_PATH = KB_DIR / "overrides.json"

VERSION = "v3"


# ------------------------------------------------------------------
# Country code -> VCT region
# ------------------------------------------------------------------

_EMEA = {
    # Western/Northern Europe
    "gb", "ie", "fr", "de", "it", "es", "pt", "nl", "be", "lu", "at",
    "ch", "dk", "no", "se", "fi", "is", "mt", "cy",
    # Central/Eastern Europe
    "pl", "cz", "sk", "hu", "ro", "bg", "hr", "si", "ee", "lv", "lt",
    "by", "ua", "ru", "md", "al", "mk", "rs", "ba", "me", "xk", "gr",
    # Turkey + Middle East
    "tr", "ae", "sa", "qa", "kw", "bh", "om", "il", "jo", "lb", "eg",
    "sy", "iq", "ir",
    # Caucasus / Central Asia (typically grouped with EMEA in esports)
    "kz", "ge", "am", "az", "uz", "tj", "kg", "tm",
    # Africa
    "za", "ng", "ma", "dz", "tn", "ke", "gh",
}

_AMERICAS = {
    "us", "ca", "mx",
    "gt", "hn", "sv", "ni", "cr", "pa", "do", "pr",
    "br", "ar", "cl", "co", "pe", "uy", "py", "bo", "ec", "ve",
    # Caribbean
    "sx", "bm", "jm", "tt", "bs", "bb", "cu",
}

_PACIFIC = {
    "kr", "jp", "tw", "hk", "mo",
    "vn", "th", "ph", "id", "my", "sg", "kh", "mm", "la", "bn",
    "in", "lk", "np", "bd", "pk",
    "au", "nz",
    "mn",
}

_CN = {"cn"}


def country_to_region(cc: str) -> str:
    cc = (cc or "").lower()
    if cc in _CN:
        return "CN"
    if cc in _PACIFIC:
        return "Pacific"
    if cc in _EMEA:
        return "EMEA"
    if cc in _AMERICAS:
        return "Americas"
    return ""


# ------------------------------------------------------------------
# Agent -> Valorant role
# ------------------------------------------------------------------

_AGENT_ROLE = {
    # Duelists
    "jett": "Duelist", "raze": "Duelist", "neon": "Duelist",
    "yoru": "Duelist", "phoenix": "Duelist", "reyna": "Duelist",
    "iso": "Duelist", "waylay": "Duelist",
    # Controllers
    "omen": "Controller", "viper": "Controller", "brimstone": "Controller",
    "astra": "Controller", "clove": "Controller", "harbor": "Controller",
    # Sentinels
    "cypher": "Sentinel", "killjoy": "Sentinel", "chamber": "Sentinel",
    "sage": "Sentinel", "deadlock": "Sentinel", "vyse": "Sentinel",
    # Initiators
    "sova": "Initiator", "skye": "Initiator", "kayo": "Initiator",
    "breach": "Initiator", "fade": "Initiator", "gekko": "Initiator",
    "tejo": "Initiator",
    # Unknown / new agents — left out so callers can detect missing role
    # "miks": ?, "veto": ?
}


def agents_to_roles(agents: list[str]) -> list[str]:
    """Return unique role names in order of first appearance in agents list."""
    seen: list[str] = []
    for a in agents or []:
        role = _AGENT_ROLE.get(a)
        if role and role not in seen:
            seen.append(role)
    return seen


# ------------------------------------------------------------------
# Avatar
# ------------------------------------------------------------------

_PLACEHOLDER_HINTS = ("sil.png", "/ph/")


def is_real_avatar(url: str) -> bool:
    if not url:
        return False
    return not any(h in url for h in _PLACEHOLDER_HINTS)


# ------------------------------------------------------------------
# Manual overrides (kbGuess/overrides.json)
# ------------------------------------------------------------------


def load_overrides() -> dict[str, dict]:
    """Load manual fixes / additions keyed by player id.

    Format: { "<id>": { <any subset of Player fields> }, ... }

    Applied before enrichment so derived fields (region, roles) recompute
    from overridden inputs (country, agents). Players whose id is not in
    the existing roster get added as new entries.
    """
    if not OVERRIDES_PATH.exists():
        return {}
    try:
        raw = json.loads(OVERRIDES_PATH.read_text())
        if isinstance(raw, dict):
            return {str(k): v for k, v in raw.items() if isinstance(v, dict)}
    except Exception as exc:
        print(f"  ! overrides.json parse failed: {exc}", file=sys.stderr)
    return {}


_RESET_FROM_CACHE_FIELDS = (
    "name", "real_name", "country", "avatar", "team", "team_logo", "agents",
)


def reset_stale_overrides(records: list[dict], current_overrides: dict[str, dict]) -> int:
    """
    Make process.py idempotent w.r.t. overrides.

    Records carry _overridden:true if a previous run baked override values into
    them. When overrides.json shrinks or is deleted, those values would persist
    forever without a reset. This function:
      - Drops stale custom records (overridden, no cache, not in current overrides)
      - Rebuilds cache-derived fields from cache for any _overridden record that
        still has cache (the override will be re-applied below if still present)
      - Clears the _overridden flag (apply_overrides re-stamps when applicable)
    """
    kept: list[dict] = []
    dropped = 0
    for r in records:
        if not r.get("_overridden"):
            kept.append(r)
            continue

        pid = str(r.get("id", ""))
        cache = load_cache(pid)
        if cache is None and pid not in current_overrides:
            # custom fake id from a previous override that's gone — drop
            dropped += 1
            continue

        if cache is not None:
            current_team = cache.get("current_team") or {}
            r["name"] = cache.get("name", "")
            r["real_name"] = cache.get("real_name", "")
            r["country"] = cache.get("country", "")
            r["avatar"] = cache.get("avatar", "")
            r["team"] = current_team.get("name", "")
            r["team_logo"] = current_team.get("logo", "")
            cache_agents = top_agents_from_cache(cache)
            if cache_agents:
                r["agents"] = cache_agents

        r.pop("_overridden", None)
        kept.append(r)

    records[:] = kept
    return dropped


def top_agents_from_cache(cache: dict, n: int = 3) -> list[str]:
    """Top-N agents by usage from a cache file's agent_stats."""
    seen: list[str] = []

    def _key(a: dict) -> tuple[float, int]:
        try:
            pct = float((a.get("usage_pct") or "0").rstrip("%"))
        except ValueError:
            pct = 0.0
        try:
            cnt = int((a.get("usage_count") or "0").replace(",", ""))
        except ValueError:
            cnt = 0
        return pct, cnt

    for a in sorted(cache.get("agent_stats") or [], key=_key, reverse=True):
        name = a.get("agent")
        if name and name not in seen:
            seen.append(name)
        if len(seen) >= n:
            break
    return seen


def apply_overrides(records: list[dict], overrides: dict[str, dict]) -> int:
    """Mutate `records` in place: merge overrides into matching ids,
    append new records for unknown ids. Returns count of touched records."""
    if not overrides:
        return 0

    by_id: dict[str, dict] = {}
    for r in records:
        rid = r.get("id")
        if rid:
            by_id[str(rid)] = r

    touched = 0
    for pid, fields in overrides.items():
        if pid in by_id:
            by_id[pid].update(fields)
            by_id[pid]["_overridden"] = True
        else:
            new_rec = dict(fields)
            new_rec["id"] = pid
            new_rec["_overridden"] = True
            records.append(new_rec)
        touched += 1
    return touched


# ------------------------------------------------------------------
# Cache file lookup (for past_teams / events / total_winnings)
# ------------------------------------------------------------------


def load_cache(pid: str) -> dict | None:
    p = CACHE_DIR / f"{pid}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def parse_winnings_usd(raw: str) -> int:
    """Parse '$1,234,567' -> 1234567. Returns 0 on failure."""
    if not raw:
        return 0
    m = re.search(r"\$([\d,]+)", raw)
    if not m:
        return 0
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return 0


def extract_past_teams(cache: dict) -> list[dict]:
    """Slim down cache's past_teams to just the fields the frontend needs."""
    out: list[dict] = []
    for t in cache.get("past_teams") or []:
        name = (t.get("name") or "").strip()
        if not name:
            continue
        out.append({
            "name": name,
            "tag": t.get("tag") or "",
            "dates": t.get("dates") or "",
            "logo": t.get("logo") or "",
        })
    return out


def extract_events(cache: dict) -> list[dict]:
    """Slim down cache's event_placements to the fields useful for guesser questions."""
    out: list[dict] = []
    for e in cache.get("event_placements") or []:
        event = (e.get("event") or "").strip()
        if not event:
            continue
        out.append({
            "event": event,
            "placement": e.get("placement") or "",
            "team": (e.get("team") or "").strip(),
            "date": e.get("date") or "",
            "prize": e.get("prize") or "",
        })
    return out


# ------------------------------------------------------------------
# Per-record enrichment
# ------------------------------------------------------------------


def enrich(p: dict, cache: dict | None) -> dict:
    agents = p.get("agents") or []
    roles = agents_to_roles(agents)

    past_teams: list[dict] = []
    events: list[dict] = []
    total_winnings = ""
    total_winnings_usd = 0

    if cache is not None:
        past_teams = extract_past_teams(cache)
        events = extract_events(cache)
        total_winnings = cache.get("total_winnings") or ""
        total_winnings_usd = parse_winnings_usd(total_winnings)

    out = {
        "id": p.get("id", ""),
        "name": p.get("name", ""),
        "real_name": p.get("real_name", ""),
        "country": p.get("country", ""),
        "avatar": p.get("avatar", ""),
        "has_real_avatar": is_real_avatar(p.get("avatar", "")),
        "team": p.get("team", ""),
        "team_logo": p.get("team_logo", ""),
        "region": p.get("region") or country_to_region(p.get("country", "")),
        "agents": agents,
        "roles": roles,
        "primary_role": roles[0] if roles else "",
        "stats": p.get("stats") or {"acs": "", "kd": "", "rating": "", "hs_pct": ""},
        "past_teams": p.get("past_teams") if p.get("past_teams") is not None else past_teams,
        "events": p.get("events") if p.get("events") is not None else events,
        "total_winnings": p.get("total_winnings") if p.get("total_winnings") is not None else total_winnings,
        "total_winnings_usd": p.get("total_winnings_usd") if p.get("total_winnings_usd") is not None else total_winnings_usd,
    }
    if p.get("_overridden"):
        out["_overridden"] = True
    return out


def main() -> None:
    if not PLAYERS_PATH.exists():
        print(f"No players.json at {PLAYERS_PATH}", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(PLAYERS_PATH.read_text())
    # Accept either flat array (snapshot.py / build_players.py output)
    # or already-wrapped {meta, players} (re-running process.py)
    if isinstance(raw, dict) and "players" in raw:
        records = raw["players"]
    else:
        records = raw

    shutil.copy2(PLAYERS_PATH, BACKUP_PATH)

    overrides = load_overrides()
    dropped_stale = reset_stale_overrides(records, overrides)
    overridden_count = apply_overrides(records, overrides)

    enriched = [enrich(p, load_cache(p.get("id", ""))) for p in records]
    enriched.sort(key=lambda p: p["name"].lower())

    # Coverage report
    total = len(enriched)
    region_filled = sum(1 for p in enriched if p["region"])
    role_filled = sum(1 for p in enriched if p["roles"])
    real_avatar = sum(1 for p in enriched if p["has_real_avatar"])
    with_past = sum(1 for p in enriched if p["past_teams"])
    with_events = sum(1 for p in enriched if p["events"])
    with_winnings = sum(1 for p in enriched if p["total_winnings_usd"] > 0)

    out = {
        "meta": {
            "version": VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "count": total,
            "source": (
                "vlrggapi /v2/stats top 150/region (na/eu/ap/kr/cn) "
                "+ /v2/player profiles, enriched with country->region, "
                "agent->role mappings, and past_teams/events/winnings "
                "from cache/players/{id}.json"
            ),
        },
        "players": enriched,
    }

    PLAYERS_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")

    print(f"Wrote {total} players to {PLAYERS_PATH}", file=sys.stderr)
    print(f"  region filled : {region_filled}/{total}", file=sys.stderr)
    print(f"  roles filled  : {role_filled}/{total}", file=sys.stderr)
    print(f"  real avatar   : {real_avatar}/{total}", file=sys.stderr)
    print(f"  past_teams    : {with_past}/{total}", file=sys.stderr)
    print(f"  events        : {with_events}/{total}", file=sys.stderr)
    print(f"  total_winnings: {with_winnings}/{total}", file=sys.stderr)
    print(f"  overrides     : {overridden_count} applied, {dropped_stale} stale dropped", file=sys.stderr)
    print(f"  backup at     : {BACKUP_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
