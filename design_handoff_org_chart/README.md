# Handoff: AMI Observatory — Org Chart Redesign

## Overview

This handoff covers a redesign of the **Org Chart page** on the AMI Observatory site (`ami.frenchtechjournal.com`, `/org-chart` route). The existing page renders a readable-but-too-small D3 tree with tiny cards that require hover-to-read. The redesign keeps the existing reporting data and Observatory color tokens, but:

- Makes every card legibly sized at rest (name, role, location, short bio visible without hover).
- Uses a department-based color palette instead of a hash-based rainbow, so the chart reads as an organization at a glance.
- Adds hint-of-motion: staggered node entrance, connectors that draw in, subtle lift on hover, traced reporting line when a card is focused.
- Adds click-to-expand for a brief inline bio with a "View full profile →" CTA.
- Adds a search box and a department legend in a sticky control bar.

## About the Design Files

The files in this bundle are **design references created in HTML + React (Babel-in-browser)** — a working prototype showing intended look and behavior. They are **not production code to copy directly**.

The task is to **recreate these designs in the target codebase's existing environment**. The target here is the AMI Labs Next.js app (`chobrien99-svg/AMI-Labs`). The existing component lives at `components/OrgChartClient.tsx` and uses D3 for layout + SVG for rendering. The developer should:

- Either keep D3 for layout math and replace the SVG node rendering with HTML/React cards absolutely positioned over an SVG connector layer (recommended — matches this prototype's approach).
- Or replace D3 entirely with a small hand-rolled layout (the prototype includes a compact tidy-tree implementation in `src/data.jsx` — ~50 LOC — that's sufficient for the ~16-person tree).

All color tokens, typography, and the accent-bar signature already exist in the app's `globals.css`. No new tokens are required.

## Fidelity

**High-fidelity.** Colors, typography, spacing, border radii, shadows, animation timings, and hover states are all intentional and should be matched. The only placeholder is the three unbaked researchers (David Fan, Xinyi Wan, Jihan Yang) who are pinned under Saining Xie and carry a generic bio line — the production implementation should keep reading from `data/team.json` (and Sanity overrides) so any future edits flow through.

## Screens / Views

### Single screen: `/org-chart`

**Purpose**: Show AMI Labs' reporting structure in a way that readers can skim without interacting. Secondary purpose: let readers trace a specific person's reporting line and open their profile.

**Page chrome (already in `app/layout.tsx` + `components/Nav.tsx`)**
- 3px gradient accent bar at very top (`body::before`, already in `globals.css`).
- Sticky `Nav` (60px tall). "Org Chart" link is the active one.

**Page header** (`<header className="page-header">`) — this replaces the current plain `page-header` block.
- Background: `var(--surface)` with two very soft radial gradients (brass top-right, teal bottom-left) as atmosphere — see `page-header::before` in `src/styles.css`.
- Eyebrow line: 6px pulsing brass dot + uppercase text `THE OBSERVATORY · ORGANIZATION` in `var(--accent)`.
- H1: `AMI Labs Org Chart` — Newsreader (already loaded as `--font-serif`), 2.5rem, weight 500, tracking −0.02em.
- Lede paragraph: `var(--text-dim)`, 1rem, max-width 620px.
- Four stat cells in a row, each with a 2px brass left-border, serif number, uppercase micro label:
  - `16 People mapped`
  - `5 Co-Founders`
  - `4 Cities`
  - `Apr 2026 Last updated` (number is serif but sized down)

**Control bar** (sticky under nav)
- 340px search input with magnifier icon — `var(--surface)` fill that brightens to `var(--bg)` on focus.
- Department legend (right-aligned): 8px circles + text for Chairman / CEO / Operations / Science / Research / Singapore.

**Canvas**
- A `.org-canvas-wrap` container with a 1px gradient border (the brass→teal→rose gradient makes it feel like a framed specimen), `var(--surface)` fill, `border-radius: 12px`, warm double-layer shadow.
- Inside: `.org-canvas`, a subtly dotted parchment grid (24px repeating radial dots at 10% brass opacity on `var(--bg)`). This is the background that holds the cards and the SVG connectors.
- Overflow: `auto` — the canvas is wider than the viewport on smaller screens; the user scrolls inside the frame.

**Cards** (`.pcard`) — see Components section below.

**Footnote**: centered italic Newsreader, `var(--muted)`, text `Reporting structure inferred from public announcements and LinkedIn · AMI Labs, Advanced Machine Intelligence`.

**Tweaks panel** — only relevant if the production site supports this (it doesn't); skip for the real build.

## Components

### Person card (`.pcard`)

Three density sizes are exposed for tweaks, but **only `standard` should ship**:

| Token | standard (ship) |
|---|---|
| width | 280px |
| min-height | 132px |
| padding | 16px 18px 14px |
| border | 1px solid `var(--border)` (=#D5CEBD) |
| border-radius | 10px |
| background | `var(--bg)` (=#FFFCF5) |
| box-shadow (rest) | `0 1px 2px rgba(44,37,23,0.04), 0 2px 8px rgba(44,37,23,0.03)` |

**Layout inside the card**:
1. `.pcard-accent` — 3px full-height left strip, linear-gradient 180deg from team color A → team color B, rounded on the left corners. Visible by default; optional to hide.
2. `.pcard-head` — 12px-gap flex row:
   - `.pcard-avatar` 40×40 circle, `linear-gradient(135deg, tileA, tileB)`, white 700-weight initials at 40% of avatar size, inset white sheen + warm drop shadow.
   - `.pcard-headtext` column: name in Newsreader 500 1.02rem, role in sans 0.78rem weight 500 colored `var(--tile-ink)` (the dark variant of the team color).
   - Yann LeCun only: `✦` in `var(--accent3)` after the text (executive marker).
3. `.pcard-meta` — mono 0.66rem uppercase, 10px margin-top:
   - Location with 10px map-pin SVG.
   - Tenure pill (only when `tenure` is set): `Co-Founder` or `Founding team`, 2px 7px padding, `var(--accent-dim)` fill, 100px radius, `var(--accent)` text, 1px amber border.
4. `.pcard-body` — 0.8rem, line-height 1.5, `var(--text-dim)`, clamped to 2 lines.
5. `.pcard-hoverchip` — `Click for profile →` in 0.68rem brass, positioned absolute bottom-right, opacity 0 that animates in on `:hover`.

### Team color palette (department-based)

Each person has a `{ a, b, ink }` triplet assigned by role/department — **not** hashed from name. The palette:

| Department | a (light) | b (dark) | ink (text) | Members |
|---|---|---|---|---|
| Chairman | `#B8860B` | `#946B2D` | `#6B4E1F` | Yann LeCun |
| CEO | `#C07A3A` | `#9E5F28` | `#7A4618` | Alexandre LeBrun |
| Operations | `#A85C72` | `#87445A` | `#6B3347` | Laurent Solly, Sean Nguyen |
| Science | `#2A7D6B` | `#1F5E50` | `#17453B` | Saining Xie, Pascale Fung |
| Research | `#3D7A4A` | `#2B5A36` | `#1F4427` | Rabbat, Li Jing, Xingyi Zhou, Sanghyun Woo, Delong Chen, David Fan, Xinyi Wan, Jihan Yang |
| Singapore | `#4A7FA5` | `#345E7C` | `#26455C` | Min Lin, Brian Li |

The mapping is a hand-curated `Record<slug, {a,b,ink}>` (`PERSON_COLOR` in `src/data.jsx`).

### Connectors (`svg.org-connectors`)

- Absolute-positioned SVG sitting behind cards, `pointer-events: none`.
- One `<path>` per reporting edge from parent-bottom-center to child-top-center.
- Two styles, both rendered in 1.4px `#BFB49D` stroke (darker than `--border` so the lines read on the dotted canvas):
  - **Curved (default)**: cubic bezier `M sx,sy C sx,my tx,my tx,ty` where `my = (sy + ty) / 2`.
  - **Orthogonal (optional tweak)**: vertical→horizontal→vertical with 10px corner radii.
- **Draw-in animation**: `stroke-dasharray: 2000; stroke-dashoffset: 2000 → 0` over 900ms cubic-bezier(0.4,0,0.2,1), delay staggered by child depth (`160ms + depth * 90ms`).
- **Focused-lineage styling**: when a card is hovered/expanded, edges on the ancestor-and-descendant set of that slug get `stroke: var(--accent2)`, `stroke-width: 2.2`, full opacity; all others drop to 0.25 opacity. 400ms transition between states.

## Interactions & Behavior

### Entrance
- Cards: `opacity: 0 → 1`, `translateY(8px → 0)`, 520ms ease-out. Delay staggered per node: `80ms + depth * 90ms + (index % 4) * 25ms`.
- Connectors: draw-in as described above.

### Hover a card
- 280ms spring: card rises 3px, border color shifts to its team's `a` color, shadow strengthens (`0 14px 32px rgba(148,107,45,0.14)` + 1px inset of same color), warm sheen pseudo-element fades in at 260ms, hover chip fades in from `translateX(-4px)` to `0`.
- Connector lineage highlight (if `dimOthers` is on): ancestor and descendant edges brass, all others fade to 0.25. Off-lineage cards drop to 0.32 opacity + saturate(0.7).
- All transitions reversible on mouseleave.

### Click a card
- Toggles an "expanded" state on that slug. Clicking again (or clicking a different card) toggles back.
- Expanded card:
  - Keeps the hover styling but stronger: `0 24px 56px rgba(148,107,45,0.18)`, 1.5px inset in team color, `translateY(-4px) scale(1.02)`.
  - Reveals `.pcard-expanded`: top padding + 1px dashed top border + full bio + a "View full profile →" CTA that should route to `/team/[slug]`.
  - Animates in with `expandFade`: 280ms ease, opacity 0→1, translateY(-4px→0).

### Search
- Debounced against `name`, `role`, `location` (case-insensitive contains).
- Non-matches get `highlight: "dim"`; matches stay neutral (or "focus" styled when combined with a hover).

## State Management

Local component state (all in `OrgChartClient.tsx`):

```ts
const [hover, setHover]     = useState<string | null>(null); // slug or null
const [expanded, setExpanded] = useState<string | null>(null);
const [query, setQuery]     = useState<string>("");
```

Derived:
- `focusSlug = expanded ?? hover`
- `lineage = focusSlug ? new Set([...ancestors, ...descendants]) : null`
- `matchedSet = query ? new Set(team.filter(matchesQuery).map(m => m.slug)) : null`

`ancestors` and `descendants` are pure graph traversals over `team` by `reportsTo`. Helpers `ancestorsOf` and `descendantsOf` are in `src/data.jsx` of the prototype — copy them into the component.

No new data fetching. The existing `app/org-chart/page.tsx` flow (static JSON + Sanity override) is unchanged; the client still receives a `Member[]`.

## Design Tokens

All already present in `app/globals.css`. No changes needed; just reference these.

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#FFFCF5` | Canvas + card fill |
| `--surface` | `#F7F3EC` | Page header + canvas frame |
| `--surface2` | `#EDE8DF` | Segmented-control track |
| `--border` | `#D5CEBD` | Card + control borders |
| `--accent` | `#946B2D` | Primary brass — active nav, CTA text |
| `--accent2` | `#B8860B` | Focus ring, focused connectors, link hover |
| `--accent3` | `#C8962E` | Header accent, stat border-left |
| `--accent-dim` | `rgba(184,134,11,0.08)` | Tenure pill fill, search focus ring |
| `--electric` | `#2A7D6B` | Science palette base (reuse in card palette) |
| `--text` | `#2C2517` | Card name, H1 |
| `--text-dim` | `#4A3F30` | Card body, lede |
| `--muted` | `#8C8474` | Meta line, labels |
| `--font-serif` | `Newsreader, Georgia, serif` | H1, card names, stat numbers, footnote |
| `--font-sans` | `Inter, -apple-system, …` | Everything else |
| `--font-mono` | `JetBrains Mono, ui-monospace, …` | Meta line under card head |

**Border radii**: 10px on cards and the canvas frame; 6px on inputs, buttons, segmented controls; 100px on pills; 50% on avatars/dots.

**Shadows**:
- Card rest: `0 1px 2px rgba(44,37,23,0.04), 0 2px 8px rgba(44,37,23,0.03)`
- Card hover: `0 2px 4px rgba(44,37,23,0.05), 0 14px 32px rgba(148,107,45,0.14), 0 0 0 1px var(--team-a) inset`
- Card expanded: `0 4px 10px rgba(44,37,23,0.08), 0 24px 56px rgba(148,107,45,0.18), 0 0 0 1.5px var(--team-a) inset`
- Canvas frame: `0 1px 2px rgba(44,37,23,0.04), 0 12px 32px rgba(44,37,23,0.06)`

**Timings**:
- Hover transform: 280ms `cubic-bezier(0.22, 1, 0.36, 1)`
- Expand: 280ms ease
- Connector draw-in: 900ms `cubic-bezier(0.4, 0, 0.2, 1)`, staggered `160 + depth*90`ms
- Card entrance: 520ms `cubic-bezier(0.22, 1, 0.36, 1)`, staggered `80 + depth*90 + (i%4)*25`ms
- Connector state swap (neutral ↔ focus/dim): 400ms

## Layout Math

The D3 `d3.tree().nodeSize([horizGap, vertGap + nodeH])` approach from the current file is fine for layout. If you keep D3:

- Use `nodeW = 280`, `nodeH = 132`, `hGap = 32`, `vGap = 92`.
- Render cards as absolute-positioned HTML (`left = x - nodeW/2`, `top = y - nodeH/2`), not `<rect>`.
- Render connectors as a single `<svg>` overlay, with paths computed from the D3 node positions (same M/C pattern as the current file).

If you drop D3, `src/data.jsx:layoutTree` in the prototype is a ~50-line tidy-tree that's adequate.

## Assets

- **Fonts**: Newsreader, Inter, JetBrains Mono — all already loaded by the site (`next/font/google` per the existing setup).
- **Icons**: map-pin (inline SVG, 16×16 viewBox, in the prototype's `PersonCard.jsx`); search magnifier (inline SVG). No icon library needed.
- **Images**: none.

## Files in this bundle

- `Org Chart.html` — the working prototype. Open in a browser to see every state.
- `src/data.jsx` — team data (derived from `data/team.json`), department palette, tree build + layout, ancestor/descendant helpers.
- `src/PersonCard.jsx` — the card component.
- `src/Connectors.jsx` — the SVG connector layer.
- `src/OrgChart.jsx` — the page (header, controls, canvas, Tweaks).
- `src/styles.css` — all styles for the redesign. **The canonical styling reference.**

## Files to modify in the production repo

| File | What changes |
|---|---|
| `components/OrgChartClient.tsx` | Full rewrite. Replace D3-SVG rendering with HTML cards + SVG connectors overlay. Keep the existing `team: Member[]` prop and `router.push('/team/' + slug)` on CTA click. |
| `app/globals.css` | Append the card, connector, control-bar, and extended page-header styles from `src/styles.css`. No existing selectors need to change — every new selector is namespaced (`.pcard`, `.org-*`, `.ph-*`). |
| `app/org-chart/page.tsx` | No changes. The server component still passes `Member[]`. |

## Notes for the implementer

- The three researchers without `reportsTo` (David Fan, Xinyi Wan, Jihan Yang) should be pinned under Saining Xie (Science) as a sensible default — the current code pins orphans under the root, which visually lands them beside Yann LeCun. Consider changing the orphan-adoption logic in `buildTree` from "push to root" to "push to a configurable `defaultParent` slug" (`saining-xie`).
- The department palette is a hand-curated `Record<slug, ColorTriplet>`. When new people are added to `team.json`, add a palette entry too — falling back to a neutral palette if missing is fine.
- Keep the existing `AVATAR_COLORS` array in the current file as a fallback for people without a department assignment.
- The Tweaks panel in the prototype is scaffolding for design iteration — **do not port it to production**.
