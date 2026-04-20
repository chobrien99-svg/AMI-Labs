# ClawBeat — The Intel Forge

**ClawBeat** is an autonomous intelligence aggregator for the **OpenClaw** ecosystem. It curates news, research papers, media, GitHub repositories, and community events across the agentic AI landscape, with a focus on OpenClaw, Moltbot, and Steinberger developments.

Live at [clawbeat.co](https://clawbeat.co).

---

## Overview

ClawBeat operates as a high-signal newsroom. Automated Python forges run daily to pull fresh content from dozens of sources, deduplicate, score, and persist everything to Supabase. The React frontend reads from Supabase and renders five sections:

| Section | Description |
|---|---|
| **Intel Feed** | Daily news dispatches grouped by date, with a scored Lead Signal spotlight and `// also_today` sidebar |
| **Research** | ArXiv and Semantic Scholar papers, sorted by publication date |
| **Media** | YouTube video stream curated for keyword relevance |
| **The Forge** | GitHub repositories, sortable by stars or recency |
| **Events** | Upcoming OpenClaw community events (virtual + in-person) |

---

## Architecture

```
forge.py           →  news, videos, GitHub repos  →  Supabase
events_forge.py    →  OpenClaw events              →  Supabase
sanitize.py        →  data cleanup utilities

index.tsx          →  React app (Intel Feed)
public/*.html      →  standalone pages (Research, Media, Forge, Events, Admin)
```

### Frontend

- **React 19 + TypeScript**, built with **Vite**
- No build-step imports via `esm.sh` in standalone HTML pages
- `index.tsx` — Intel Feed (main app); mounts at `#root` in `index.html`
- `public/research.html`, `public/media.html`, `public/forge.html`, `public/events-calendar.html` — standalone section pages
- `public/admin.html` — spotlight override admin panel
- `src/whitelist.json` — curated source whitelist used to badge verified outlets

### Backend

**`forge.py`** — Main daily content forge:
- Fetches from Google News RSS, YouTube (yt-dlp), GitHub REST API
- Uses **Gemini API** (`gemini-embedding-001`) for semantic vector clustering (0.82 similarity threshold) to merge duplicate stories
- Applies **spaCy NER** for tag extraction on article summaries
- Enforces a strict keyword density check against `CORE_BRANDS`
- Prioritizes primary sources over derivative coverage (`// more coverage` drawer)
- Writes to Supabase tables: `news_items`, `videos`, `github_projects`, `research_papers`, `feed_metadata`

**`events_forge.py`** — Daily event discovery:
- Layer 1 (RSS/API): Google News RSS, Reddit RSS, HN Algolia API — extracts event-platform URLs from feed content
- Layer 2 (platform scrapers): Luma search, `lu.ma/claw` community calendar, AI Tinkerers, Eventship, Meetup, Circle.so communities
- Seed events list for hand-curated OpenClaw URLs (keyword filter bypassed)
- Eventbrite **disabled** due to query keyword injection in JSON-LD
- Validation: `openclaw` must appear in event title or description
- Writes to Supabase table: `events`

### Data (Supabase)

Tables: `news_items`, `videos`, `github_projects`, `research_papers`, `events`, `feed_metadata`, `spotlight_overrides`

Key schema notes:
- `news_items.date` — `MM-DD-YYYY`
- `events.start_date` / `end_date` — `MM/DD/YYYY`
- `spotlight_overrides` — admin-controlled per-slot overrides for the Lead Signal card (slots 1–4 per dispatch date)

---

## Local Development

### Frontend

```bash
npm install
npm run dev       # dev server at localhost:5173
npm run build     # tsc + vite build → dist/
```

### Python forges

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# spaCy English model (required for forge.py tag extraction)
python -m spacy download en_core_web_sm

python forge.py           # run news / media / GitHub forge
python events_forge.py    # run events discovery
```

### Environment variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_key_here
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_service_role_key
GITHUB_TOKEN=your_token_here   # optional — raises API rate limits
```

---

## Key Features

**Lead Signal spotlight** — Each daily dispatch surfaces up to four high-score articles in a featured card. Scoring weighs `// more coverage` depth, source tier (priority / verified), and whitelist membership. Slots can be manually overridden via the admin panel (`/admin.html`).

**Recency enforcement** — Articles are grouped and sorted by publication date (`MM-DD-YYYY`). Priority status requires publication within a 48-hour window.

**Source verification** — `src/whitelist.json` defines trusted outlets. Verified sources receive a `✓ verified` badge; other high-quality sources receive a `priority` badge.

**Scroll-to-top** — Floating button appears after 800px of scroll on all pages.

**Analytics** — Google Analytics `G-WHLSLX6VL3` via `gtag`.
