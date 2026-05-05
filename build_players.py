"""
Build players.json for the VCT player guesser.

Reads from a locally running vlrggapi instance:
  - /v2/stats?region={r}&timespan=all   -> ACS / K-D / Rating / HS% / IDs per region
  - /v2/player?id={id}&timespan=all     -> name, country, avatar, current team, agents

Dedupes across regions (a player can appear in multiple region tables; we keep
the row from the region with the most rounds played — their primary home).

Player profile responses are cached on disk under kbGuess/cache/players/{id}.json
so re-runs only re-fetch IDs that previously failed. vlr.gg rate-limits hard,
so expect partial failures on the first run; just re-run the script until
coverage is acceptable.

Usage:
  python kbGuess/build_players.py
  python kbGuess/build_players.py --limit-per-region 150
  python kbGuess/build_players.py --concurrency 2
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx

API_BASE = "http://127.0.0.1:3001"

REGIONS: dict[str, str] = {
    "na": "Americas",
    "eu": "EMEA",
    "ap": "Pacific",
    "kr": "Pacific",
    "cn": "CN",
}

KB_DIR = Path(__file__).parent
OUT_PATH = KB_DIR / "players.json"
CACHE_DIR = KB_DIR / "cache" / "players"


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


async def fetch_region_stats(client: httpx.AsyncClient, region_key: str) -> list[dict]:
    """Fetch region stats with retries — vlrggapi's stats cache may be cold,
    forcing it to scrape vlr.gg, which can take 30-90s under rate-limiting."""
    url = f"{API_BASE}/v2/stats"
    last_exc: Exception | None = None
    for attempt in range(1, 4):
        try:
            r = await client.get(
                url,
                params={"region": region_key, "timespan": "all"},
                timeout=180,
            )
            r.raise_for_status()
            return r.json()["data"]["segments"]
        except (httpx.ReadTimeout, httpx.RemoteProtocolError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            wait = 10 * attempt
            print(
                f"  ! stats {region_key} attempt {attempt} failed ({type(exc).__name__}); "
                f"retrying in {wait}s",
                file=sys.stderr,
            )
            await asyncio.sleep(wait)
    raise RuntimeError(f"stats {region_key} failed after 3 attempts: {last_exc!r}")


def cache_path(player_id: str) -> Path:
    return CACHE_DIR / f"{player_id}.json"


def load_cached(player_id: str) -> dict | None:
    p = cache_path(player_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def save_cached(player_id: str, detail: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path(player_id).write_text(json.dumps(detail, ensure_ascii=False))


async def fetch_player(client: httpx.AsyncClient, player_id: str) -> tuple[dict | None, str | None]:
    """Returns (detail, error_string). detail is None on failure."""
    url = f"{API_BASE}/v2/player"
    try:
        r = await client.get(url, params={"id": player_id, "timespan": "all"}, timeout=90)
        r.raise_for_status()
        segs = r.json()["data"]["segments"]
        return (segs[0] if segs else None), None
    except httpx.HTTPStatusError as exc:
        return None, f"HTTP {exc.response.status_code}"
    except httpx.ReadTimeout:
        return None, "ReadTimeout"
    except httpx.HTTPError as exc:
        return None, type(exc).__name__
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc!r}"


def top_agents(agent_stats: list[dict], n: int = 3) -> list[str]:
    def key(a: dict) -> tuple[float, int]:
        pct = _to_float(a.get("usage_pct", "0").rstrip("%"))
        cnt = _to_int(a.get("usage_count", "0"))
        return (pct, cnt)

    return [a["agent"] for a in sorted(agent_stats, key=key, reverse=True)[:n] if a.get("agent")]


def merge_stats_rows(rows_by_region: dict[str, list[dict]]) -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for region_key, rows in rows_by_region.items():
        for row in rows:
            pid = row.get("player_id", "")
            if not pid:
                continue
            existing = merged.get(pid)
            current_rounds = _to_int(row.get("rounds_played", "0"))
            if existing is None or current_rounds > _to_int(existing["_row"].get("rounds_played", "0")):
                merged[pid] = {"_row": row, "_region_key": region_key}
    return merged


def assemble_record(pid: str, row: dict, region_key: str, detail: dict | None) -> dict:
    if detail is None:
        return {
            "id": pid,
            "name": row.get("player", ""),
            "real_name": "",
            "country": "",
            "avatar": "",
            "team": row.get("org", ""),
            "team_logo": "",
            "region": REGIONS[region_key],
            "region_key": region_key,
            "agents": (row.get("agents") or [])[:3],
            "stats": {
                "acs": row.get("average_combat_score", ""),
                "kd": row.get("kill_deaths", ""),
                "rating": row.get("rating", ""),
                "hs_pct": row.get("headshot_percentage", ""),
            },
            "_partial": True,
        }

    current_team = detail.get("current_team") or {}
    agents = top_agents(detail.get("agent_stats") or [], n=3) or (row.get("agents") or [])[:3]

    return {
        "id": pid,
        "name": detail.get("name") or row.get("player", ""),
        "real_name": detail.get("real_name", ""),
        "country": detail.get("country", ""),
        "avatar": detail.get("avatar", ""),
        "team": current_team.get("name") or row.get("org", ""),
        "team_logo": current_team.get("logo", ""),
        "region": REGIONS[region_key],
        "region_key": region_key,
        "agents": agents,
        "stats": {
            "acs": row.get("average_combat_score", ""),
            "kd": row.get("kill_deaths", ""),
            "rating": row.get("rating", ""),
            "hs_pct": row.get("headshot_percentage", ""),
        },
    }


async def build(limit_per_region: int | None, concurrency: int) -> None:
    started = time.time()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient() as client:
        # 1. Stats per region
        print("Fetching region stats...", file=sys.stderr)
        region_rows: dict[str, list[dict]] = {}
        for region_key in REGIONS:
            rows = await fetch_region_stats(client, region_key)
            if limit_per_region is not None:
                rows = rows[:limit_per_region]
            region_rows[region_key] = rows
            print(f"  {region_key}: {len(rows)} rows", file=sys.stderr)

        merged = merge_stats_rows(region_rows)
        print(f"Unique players: {len(merged)}", file=sys.stderr)

        # 2. Determine cache hits vs misses
        cached: dict[str, dict] = {}
        to_fetch: list[str] = []
        for pid in merged:
            d = load_cached(pid)
            if d is not None:
                cached[pid] = d
            else:
                to_fetch.append(pid)
        print(
            f"Cache: {len(cached)} hit, {len(to_fetch)} to fetch",
            file=sys.stderr,
        )

        # 3. Fetch missing details with adaptive backoff
        sem = asyncio.Semaphore(concurrency)
        fetched: dict[str, dict] = {}
        failures: list[tuple[str, str]] = []
        consecutive_fails = 0
        backoff_s = 0.0
        lock = asyncio.Lock()
        done = 0

        async def one(pid: str) -> None:
            nonlocal consecutive_fails, backoff_s, done
            async with sem:
                # Apply current backoff before issuing
                if backoff_s > 0:
                    await asyncio.sleep(backoff_s)

                detail, err = await fetch_player(client, pid)

                async with lock:
                    done += 1
                    if detail is not None:
                        save_cached(pid, detail)
                        fetched[pid] = detail
                        consecutive_fails = 0
                        # Halve backoff on success — recovers fast once vlr.gg lets us through
                        backoff_s = backoff_s / 2 if backoff_s > 0.5 else 0.0
                    else:
                        failures.append((pid, err or "unknown"))
                        consecutive_fails += 1
                        # 2s on first fail, doubling, capped at 8s per request
                        backoff_s = min(8.0, max(2.0, backoff_s * 2 if backoff_s > 0 else 2.0))
                        if consecutive_fails == 5:
                            print(
                                "  ! 5 consecutive failures — sleeping 60s for upstream recovery",
                                file=sys.stderr,
                            )
                            await asyncio.sleep(60)
                            consecutive_fails = 0
                            backoff_s = 2.0

                    if done % 25 == 0 or done == len(to_fetch):
                        elapsed = time.time() - started
                        ok = len(fetched)
                        bad = len(failures)
                        print(
                            f"  {done}/{len(to_fetch)}  ok={ok}  fail={bad}  "
                            f"backoff={backoff_s:.1f}s  ({elapsed:.0f}s)",
                            file=sys.stderr,
                        )

        if to_fetch:
            await asyncio.gather(*(one(p) for p in to_fetch))

    # 4. Build final records
    all_details = {**cached, **fetched}
    players: list[dict] = []
    partial = 0
    for pid, info in merged.items():
        detail = all_details.get(pid)
        rec = assemble_record(pid, info["_row"], info["_region_key"], detail)
        if rec.get("_partial"):
            partial += 1
        players.append(rec)

    players.sort(key=lambda p: (p["region"], p["name"].lower()))
    OUT_PATH.write_text(json.dumps(players, indent=2, ensure_ascii=False) + "\n")

    elapsed = time.time() - started
    print(
        f"\nWrote {len(players)} players to {OUT_PATH}",
        file=sys.stderr,
    )
    print(
        f"  full details: {len(players) - partial}    partial (stats-only): {partial}",
        file=sys.stderr,
    )
    print(f"  elapsed: {elapsed:.1f}s", file=sys.stderr)
    if failures:
        print(f"  fetch failures this run: {len(failures)}", file=sys.stderr)
        # Show breakdown
        by_err: dict[str, int] = {}
        for _, err in failures:
            by_err[err] = by_err.get(err, 0) + 1
        for err, n in sorted(by_err.items(), key=lambda x: -x[1]):
            print(f"    {err}: {n}", file=sys.stderr)
        print(
            "\n  Re-run the script to retry. Successful fetches are cached "
            f"in {CACHE_DIR.relative_to(KB_DIR.parent)}.",
            file=sys.stderr,
        )


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--limit-per-region", type=int, default=None,
                   help="Cap rows fetched from each region (top by rating).")
    p.add_argument("--concurrency", type=int, default=2,
                   help="Concurrent player-detail requests (default: 2).")
    args = p.parse_args()
    asyncio.run(build(args.limit_per_region, args.concurrency))


if __name__ == "__main__":
    main()
