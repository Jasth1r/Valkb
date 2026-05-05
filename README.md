# Valkb — VCT Player Guesser

A 20-Questions style guessing game for Valorant Champions Tour pros. Think of a
player; the engine asks yes/no questions and tries to guess who you have in
mind in under 20 turns.

Live on [github.com/Jasth1r/Valkb](https://github.com/Jasth1r/Valkb).

## How to play

1. From the repo root: `cd web && npm install && npm run dev`, open http://localhost:5173/
2. Browse the roster (671 players, filter by region / role / team) **or** click
   **Start guessing game** in the top right
3. Pick a real VCT pro in your head — anyone from the roster
4. Answer each question with **Yes**, **No**, or **Not sure**
5. The engine narrows the candidate pool every turn. When it's down to one
   (or hits 20 questions), it makes a guess. You confirm Yes/No

The question pool covers seven categories:
**region** (Americas / EMEA / Pacific / CN), **role** (Duelist / Controller /
Sentinel / Initiator), **country**, **main agent**, **team** (current or past),
**event** (Champions / Masters), **career winnings** ($10K / $50K / $200K
tiers). The engine picks the next question by maximising information gain
over the remaining candidates.

## Data pipeline

The roster is built from the public scraper [vlrggapi](https://github.com/axsddlr/vlrggapi)
(itself a wrapper around [vlr.gg](https://www.vlr.gg/)). All scraping runs
locally — no external API key, no public deployment.

```
vlr.gg  ─▶  vlrggapi (local FastAPI)  ─▶  build_players.py  ─▶  cache/players/{id}.json
                                                              │
                                                              ▼
                                              process.py  +  overrides.json
                                                              │
                                                              ▼
                                                      players.json  ──▶  web/
```

### One-time setup

Clone the scraper backend somewhere alongside this repo:

```bash
git clone https://github.com/axsddlr/vlrggapi
cd vlrggapi
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Install Python deps for this repo's scripts (httpx is the only runtime dep):

```bash
cd Valkb
python3.13 -m venv .venv
.venv/bin/pip install httpx
```

### Refreshing the dataset

Two terminals:

**Terminal A — vlrggapi server (keep running):**

```bash
cd vlrggapi
.venv/bin/python main.py      # serves /v2/stats and /v2/player on :3001
```

**Terminal B — pull players, then enrich:**

```bash
cd Valkb
.venv/bin/python build_players.py --limit-per-region 150
.venv/bin/python process.py
```

`build_players.py` fetches the top-150 players per region (na / eu / ap / kr /
cn) from `/v2/stats`, dedupes across regions, then pulls each player's full
profile from `/v2/player`. Successful profiles are cached on disk under
`cache/players/{id}.json` so re-runs only retry IDs that previously failed.

`process.py` reads `players.json`, resets any stale overrides, pulls
`past_teams` / `events` / `total_winnings` from cache, applies any
`overrides.json` (manual fixes / additions), derives `region` / `roles` /
`primary_role` / `has_real_avatar`, and writes the final `players.json` that
the frontend consumes.

> **Note on rate-limiting:** vlr.gg throttles aggressively. The first cold
> run typically completes 70–80 % of player profiles; the rest fail with
> `503` or `ReadTimeout`. Re-run `build_players.py` after a short cooldown
> to retry only the failed IDs (cache hits skip).

### Manual fixes / additions

Create `overrides.json` at the repo root to patch existing players or add ones
not in the scrape (retired pros, custom entries). See [overrides.example.json](overrides.example.json)
for the schema. Overrides survive every script re-run.

```json
{
  "12345": { "country": "kr", "real_name": "Better Real Name" },
  "custom_hiko": {
    "name": "Hiko",
    "country": "us",
    "team": "100 Thieves (retired)",
    "agents": ["sage", "killjoy", "cypher"]
  }
}
```

After editing, run `process.py` again.

## Tech stack

- **Frontend:** React 19, Vite 8, Tailwind CSS v4, TypeScript
- **Data scripts:** Python 3.13, httpx, asyncio
- **Source:** [vlr.gg](https://www.vlr.gg/) via [axsddlr/vlrggapi](https://github.com/axsddlr/vlrggapi)

## Credits

Massive shout-out to **[axsddlr/vlrggapi](https://github.com/axsddlr/vlrggapi)** —
this project would not exist without it. The entire roster (names, agents,
team history, tournament placements, prize winnings) is sourced from
[vlr.gg](https://www.vlr.gg/) through that scraper.

If you find this useful, **please star vlrggapi**, not just this repo.

## License

The code in this repository is for personal / educational use. Player data
belongs to vlr.gg and the players themselves; no scraped data is redistributed
beyond what was publicly available on vlr.gg at the time of fetching.
