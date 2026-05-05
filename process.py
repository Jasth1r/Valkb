"""
Enrich players.json with derived fields for the guesser frontend.

Backs up the existing file to players.json.snapshot, then writes
a new players.json that:

- Wraps records in { meta, players } with version/timestamp/count
- Infers `region` from country code (Americas / EMEA / Pacific / CN)
- Adds `roles` (list of unique Valorant roles) and `primary_role`
- Adds `has_real_avatar` boolean (False if avatar is the sil.png placeholder)
- Drops the `_snapshot` marker

Run after build_players.py or snapshot.py.

Usage:
  python kbGuess/process.py
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

KB_DIR = Path(__file__).parent
PLAYERS_PATH = KB_DIR / "players.json"
BACKUP_PATH = KB_DIR / "players.json.snapshot"

VERSION = "v1"


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
# Per-record enrichment
# ------------------------------------------------------------------


def enrich(p: dict) -> dict:
    agents = p.get("agents") or []
    roles = agents_to_roles(agents)
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
    }
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

    enriched = [enrich(p) for p in records]
    enriched.sort(key=lambda p: p["name"].lower())

    # Coverage report
    total = len(enriched)
    region_filled = sum(1 for p in enriched if p["region"])
    role_filled = sum(1 for p in enriched if p["roles"])
    real_avatar = sum(1 for p in enriched if p["has_real_avatar"])

    out = {
        "meta": {
            "version": VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "count": total,
            "source": (
                "vlrggapi /v2/stats top 150/region (na/eu/ap/kr/cn) "
                "+ /v2/player profiles, enriched with country->region "
                "and agent->role mappings"
            ),
        },
        "players": enriched,
    }

    PLAYERS_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")

    print(f"Wrote {total} players to {PLAYERS_PATH}", file=sys.stderr)
    print(f"  region filled: {region_filled}/{total}", file=sys.stderr)
    print(f"  roles filled : {role_filled}/{total}", file=sys.stderr)
    print(f"  real avatar  : {real_avatar}/{total}", file=sys.stderr)
    print(f"  backup at    : {BACKUP_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
