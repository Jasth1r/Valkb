"""
Build a partial players.json from cached profiles only — no network.

Use this to scaffold the frontend while build_players.py is still running
or rate-limited. The full build will overwrite players.json with a
superset (adds ACS/KD/Rating/HS% + region label + any new players).

Usage:
  python kbGuess/snapshot.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

KB_DIR = Path(__file__).parent
CACHE_DIR = KB_DIR / "cache" / "players"
OUT_PATH = KB_DIR / "players.json"


def _to_int(s: str) -> int:
    try:
        return int(s.replace(",", ""))
    except (ValueError, AttributeError):
        return 0


def _to_float(s: str) -> float:
    try:
        return float(s)
    except (ValueError, AttributeError):
        return 0.0


def top_agents(agent_stats: list[dict], n: int = 3) -> list[str]:
    def key(a: dict) -> tuple[float, int]:
        pct = _to_float(a.get("usage_pct", "0").rstrip("%"))
        cnt = _to_int(a.get("usage_count", "0"))
        return (pct, cnt)

    return [a["agent"] for a in sorted(agent_stats, key=key, reverse=True)[:n] if a.get("agent")]


def assemble(pid: str, detail: dict) -> dict:
    current_team = detail.get("current_team") or {}
    return {
        "id": pid,
        "name": detail.get("name", ""),
        "real_name": detail.get("real_name", ""),
        "country": detail.get("country", ""),
        "avatar": detail.get("avatar", ""),
        "team": current_team.get("name", ""),
        "team_logo": current_team.get("logo", ""),
        "region": "",         # stats-derived; filled in by full build
        "region_key": "",
        "agents": top_agents(detail.get("agent_stats") or [], n=3),
        "stats": {            # filled in by full build from /v2/stats row
            "acs": "",
            "kd": "",
            "rating": "",
            "hs_pct": "",
        },
        "_snapshot": True,
    }


def main() -> None:
    if not CACHE_DIR.exists():
        print(f"No cache at {CACHE_DIR}", file=sys.stderr)
        sys.exit(1)

    players: list[dict] = []
    for path in sorted(CACHE_DIR.glob("*.json")):
        try:
            detail = json.loads(path.read_text())
        except Exception as exc:
            print(f"  ! skip {path.name}: {exc}", file=sys.stderr)
            continue
        pid = path.stem
        players.append(assemble(pid, detail))

    players.sort(key=lambda p: p["name"].lower())
    OUT_PATH.write_text(json.dumps(players, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(players)} players to {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
