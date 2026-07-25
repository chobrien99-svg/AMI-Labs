# Data Architecture — connecting people, research, news, and activity

*Status: living document. Phase 0 implemented; later phases proposed.*

## Why this exists

The Observatory grew section by section — team, news, research, GitHub activity, X,
company filings — and each was wired up on its own. The result is that the same
**person** is represented differently (or not at all) across sources, and the
datasets that describe their work (news, papers, commits) aren't consistently linked
back to them. This document maps the current state, names the problems, and proposes a
target model where **each person is a single source of truth** that everything else
resolves to — so we can spot connections (co-authorship, shared histories,
collaborators) and build things like a quarterly report on top.

---

## Current state

### Sources and how identity is keyed

| Source | What it holds | Identity key | Linked to a person? |
| --- | --- | --- | --- |
| **Sanity `person`** | Canonical profiles: role, bio, `careerHistory`, `reportsTo`, `links` (github/scholar/twitter/…), `semanticScholarId`, `featuredPublications` | `slug` | — (it *is* the person) |
| `data/team.json` | Cache/fallback of the roster | `slug` | ✅ (but stale — see below) |
| `data/github-activity.json` | Recent public GitHub events | `slug` + `username` | ✅ resolved via `links.github` |
| `data/github-analysis.json` | Ranked project analysis | contributor `name` | ⚠️ by name only |
| `data/publications.json` | Top papers per person | person `slug` (object keys) | ✅ |
| `data/research.json` | Recent papers feed | `memberSlug` / `teamAuthors` per paper | ✅ (AMI authors only) |
| **Sanity `article`** (news) | News items | — | ❌ **no person reference** |
| `data/x-posts.json` | X/Twitter posts | X `authorId` | ❌ not resolved to a slug |
| `data/synthesis.json` | Narrative briefing | — | ❌ |
| INPI / Pappers / jobs / investors / timeline | Company & market data | various | ❌ (not person-scoped) |

### The three problems

1. **Roster drift — no single canonical list.** Sanity is authoritative with **38
   people** (Co-founders 6 · Science & Research Leadership 26 · Operating Leadership 6).
   `team.json` — which several pipelines and the site's fallback path still read — has
   only **17**, missing ~21 people, including most of the current research bench
   (Le Lidec, Terver, Bardes, Garrido, Duval, Girdhar, Ma, Muckley, Kang, Chao Du,
   Dervishi, Chung, Fan, Wan, Yang, Iyer, Brown, J. Nguyen) and the entire Operations
   group. `team.json` was seeded **into** Sanity once (`import-team-to-sanity.js`); since
   then people were added *in Sanity* and never flowed back, so the file is now a stale
   snapshot masquerading as data.

2. **Orphan datasets.** News (`article`), X posts, and outside co-authors on papers are
   not linked to people at all. Nothing knows an article is *about* Quentin, or that
   Yann LeCun co-authored a paper with a team member.

3. **No shared resolver.** Each pipeline keys identity its own way — name here, GitHub
   username there, Semantic Scholar ID elsewhere, X author ID in a fourth place — with
   nothing mapping those to one canonical slug. So the same human fragments across files.

---

## Target architecture: person as the hub

The fix is not a rebuild — Sanity `person` is already the richest model. It's finishing
what Sanity started and adding a thin join layer.

1. **Sanity `person` is the sole roster.** One list. `team.json` becomes a **generated
   build cache** (Sanity → JSON), never hand-edited, so it can't drift again.
   *(Phase 0, implemented here.)*

2. **A single identity resolver.** One module: given any external key (GitHub username,
   Semantic Scholar ID, X author ID, or a name) → return the canonical `slug`. Every
   pipeline routes identity through it. Structurally kills problem #3.

3. **Link the orphan datasets to people.**
   - Add a `people` reference array to Sanity `article`; the news bot suggests matches by
     name for human approval. News becomes *about* someone.
   - Give papers a full, resolved author list (not just AMI authors) so co-authorship —
     including outside collaborators like LeCun — is in the data.
   - Store the resolved `slug` on X posts.

4. **Model relationships so patterns surface.** `reportsTo` already gives hierarchy. Add
   or derive: **co-authorship** (from paper author lists), **shared career history**
   (overlapping `org` + `years` in `careerHistory` → e.g. "FAIR alumni together"), and
   collaboration edges.

5. **Per-person dossiers.** A build step that, for each slug, aggregates *everything* —
   identity, career, their papers + co-authors, their GitHub projects, news mentioning
   them, X posts — into one `data/people/<slug>.json`. This is the substrate a quarterly
   or semi-annual report generator reads: one hop from "Quentin Le Lidec" to
   "LeWorldModel → co-authored with LeCun," instead of stitching five files.

---

## Roadmap

Each phase stands alone and leaves the site working.

- **Phase 0 — Reconcile the roster.** *(Implemented in this PR.)* Make Sanity the one
  list; add `scripts/export-sanity-to-team.js` to regenerate `team.json` from Sanity, and
  a workflow to keep it fresh. Ends the drift; every `team.json` reader instantly sees all
  38 people.
- **Phase 1 — Resolver + complete external IDs.** Ensure every person carries GitHub,
  Semantic Scholar, X, and LinkedIn IDs; build the resolver; refactor pipelines to use it.
- **Phase 2 — Link the orphans.** `people` refs on `article`; full resolved paper authors;
  slug on X posts. Backfill via name / ID matching with human review.
- **Phase 3 — Relationship edges + per-person dossiers.** Derive co-authorship and
  shared-history graphs; emit `data/people/<slug>.json`.
- **Phase 4 — Report generator.** Consumes the dossiers to produce quarterly /
  semi-annual reports.

---

## Decisions on record

- **Everyone tracked is AMI staff** (confirmed 2026-07). No watchlist / observed-external
  class is needed for the roster; the affiliation is uniform.
- **Sanity is canonical** for person identity. Git-native JSON files are derived caches.

## Open questions

- **Portraits:** some people have committed `/team/*.jpg` portraits; others only have a
  Sanity `photo`. Phase 0 preserves committed portraits and falls back to the Sanity CDN
  URL. Long-term, pick one home for portraits.
- **Biography dual representation:** Sanity stores biography as Portable Text; `team.json`
  stores it as a Markdown string generated by `update-profiles.js`. Phase 0 keeps these
  separate (it preserves the string and never writes Sanity blocks into the cache).
  Reconciling the two into one canonical source is a later-phase task.
- **Papers as a first-class entity vs. enriching `research.json`** — decide in Phase 2.
- **Outside collaborators** (e.g. LeCun on an external paper) — represent as lightweight
  non-staff `person` records, or as plain name strings on the paper? Decide in Phase 2/3.
