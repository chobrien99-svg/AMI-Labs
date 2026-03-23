# AMI Observatory — Design Restyle Handoff

> **Purpose**: Restyle the existing AMI Labs tracker site (ami.frenchtechjournal.com) from its current dark-mode "Claude Code aesthetic" to a warm, editorial "Observatory" theme.
>
> **Stack**: Next.js on Vercel. Styling is done via CSS custom properties in `globals.css`. The site uses Inter font, no Tailwind — all custom CSS.
>
> **Approach**: This is a CSS-first restyle. The layout, components, and data logic stay the same. We are swapping the design tokens (colors, fonts, border radii, shadows) and making targeted CSS adjustments to specific components.

---

## 1. Design Philosophy

**Current look**: Dark (#09090b background), purple/violet accents (#7c3aed, #a78bfa), electric blue highlights, rounded-xl cards, gradient text. This is the "Claude Code aesthetic" — shadcn defaults, indigo/purple palette, Inter font, dark mode everything.

**New look: "The Observatory"**: Light, warm, editorial. Think brass telescope hardware, parchment paper, a journalist's notebook. Serif headlines signal editorial credibility. Warm amber/gold accents replace purple. Light backgrounds replace dark. The site should feel like a *publication tracking a company*, not a startup landing page.

**Key principle**: We are *watching* AMI Labs. The visual metaphor is an observatory — patient, warm, scholarly, precise. Not flashy, not dark, not techy.

---

## 2. Color System — Replace CSS Custom Properties

### Current → New mapping

Replace the `:root` block in `globals.css`:

```css
/* ============================================
   OBSERVATORY THEME — replace entire :root
   ============================================ */
:root {
  /* Backgrounds */
  --bg: #FFFCF5;              /* was: #09090b (near-black) → warm parchment white */
  --surface: #F7F3EC;          /* was: #18181b → warm linen */
  --surface2: #EDE8DF;         /* was: #27272a → slightly darker linen */
  --border: #D5CEBD;           /* was: #3f3f46 → warm sand border */

  /* Primary accent — brass/amber replaces purple */
  --accent: #946B2D;           /* was: #7c3aed → deep brass (buttons, active states) */
  --accent2: #B8860B;          /* was: #a78bfa → golden brass (links, highlights) */
  --accent-dim: rgba(184, 134, 11, 0.08); /* was: purple dim → amber dim */

  /* Secondary accent — muted teal replaces electric blue */
  --electric: #2A7D6B;         /* was: #38bdf8 → deep teal (secondary links) */
  --electric-dim: rgba(42, 125, 107, 0.08); /* was: blue dim → teal dim */

  /* Text */
  --text: #2C2517;             /* was: #fafafa → dark walnut (near-black but warm) */
  --text-dim: #4A3F30;         /* was: #d4d4d8 → warm dark brown */
  --muted: #8C8474;            /* was: #71717a → warm gray */

  /* Semantic colors — warmer versions */
  --green: #3D7A4A;            /* was: #22c55e → muted forest green */
  --blue: #4A7FA5;             /* was: #60a5fa → muted slate blue */
  --orange: #C07A3A;           /* was: #fb923c → warm sienna */
  --pink: #A85C72;             /* was: #f472b6 → dusty rose */
  --yellow: #B8960B;           /* was: #facc15 → dark gold */
}
```

### Tag/badge color overrides

The current tag colors use neon-bright values with transparent dark backgrounds. Replace with warm, muted tones on light backgrounds:

```css
/* Tag overrides — warm muted palette */
.tag-corp {
  color: #2A6B4A;
  background: #E8F2EB;
  border: 1px solid #C2D9CA;
}
.tag-vc {
  color: #3A6B8A;
  background: #E5EFF5;
  border: 1px solid #BDD1E0;
}
.tag-angel {
  color: #8B5A2B;
  background: #F5EDE0;
  border: 1px solid #DBC9A8;
}
.tag-team {
  color: #7A3F55;
  background: #F2E5EB;
  border: 1px solid #D4B8C5;
}
.tag-colead {
  color: #7A6B0B;
  background: #F5F0D8;
  border: 1px solid #D9CF9A;
}
.tag-country {
  background: #EDE8DF;
  color: #6B6355;
  border: 1px solid #D5CEBD;
}

/* News tags */
.tag-funding {
  color: #7A6B0B;
  background: #F5F0D8;
  border: 1px solid #D9CF9A;
}
.tag-research {
  color: #3A6B8A;
  background: #E5EFF5;
  border: 1px solid #BDD1E0;
}
.tag-hiring {
  color: #2A6B4A;
  background: #E8F2EB;
  border: 1px solid #C2D9CA;
}
.tag-admin {
  background: #EDE8DF;
  color: #6B6355;
  border: 1px solid #D5CEBD;
}

/* Timeline category tags */
.tl-cat-founding {
  color: #946B2D;
  background: rgba(184, 134, 11, 0.08);
  border: 1px solid rgba(184, 134, 11, 0.25);
}
.tl-cat-funding {
  color: #7A6B0B;
  background: #F5F0D8;
  border: 1px solid #D9CF9A;
}
.tl-cat-team {
  color: #7A3F55;
  background: #F2E5EB;
  border: 1px solid #D4B8C5;
}
.tl-cat-product {
  color: #2A7D6B;
  background: rgba(42, 125, 107, 0.08);
  border: 1px solid rgba(42, 125, 107, 0.25);
}
.tl-cat-admin {
  background: #EDE8DF;
  color: #6B6355;
  border: 1px solid #D5CEBD;
}
```

---

## 3. Typography — Add Serif Headlines

### Font loading

Add a serif font for headlines. Options (in order of preference):
1. **Newsreader** (Google Fonts) — designed for editorial/news use
2. **Fraunces** (Google Fonts) — warm, slightly quirky serif
3. **Georgia** (system font) — no loading needed, universally available

**Recommended**: Start with Georgia (zero latency), upgrade to Newsreader later if desired.

Add to `layout.tsx` or `globals.css`:

```css
/* If using Google Fonts (Newsreader): add <link> in layout.tsx <head> */
/* <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap" rel="stylesheet"> */

/* Font variable — add to :root */
:root {
  --font-serif: 'Newsreader', 'Georgia', 'Times New Roman', serif;
  /* Keep existing --font-inter for body text */
}
```

### Where to apply serif

Serif goes on **headlines only** — not body text, not UI labels, not navigation:

```css
/* Hero titles */
.hero-title,
.page-header h1,
.profile-name,
header .header-text h1 {
  font-family: var(--font-serif);
  letter-spacing: -0.02em;      /* slightly tighter than current -0.04em */
  -webkit-text-fill-color: unset; /* REMOVE gradient text fills */
  -webkit-background-clip: unset;
  background-clip: unset;
  background: none;
  color: var(--text);            /* solid dark color, no gradients */
}

/* Section headers can stay sans-serif uppercase — they're labels, not headlines */
```

---

## 4. Component-Specific Overrides

### Navigation bar

```css
.nav {
  background: var(--bg);                /* was: dark with blur */
  -webkit-backdrop-filter: none;        /* remove blur effect */
  backdrop-filter: none;
  border-bottom: 1px solid var(--border);
}

.nav-logo-dot {
  background: var(--accent2);           /* brass dot */
  box-shadow: none;                     /* remove glow */
}

.nav-link:hover {
  background: var(--surface);           /* subtle warm hover */
}

.nav-link.active {
  color: var(--accent);
  background: var(--accent-dim);
}
```

### Hero section (homepage)

```css
/* Remove the dark orbs/glows entirely */
.hero-orb { display: none; }

.hero-section {
  background: var(--bg);                /* clean white, no dark bg */
}

.hero-glass {
  background: var(--surface);           /* warm linen card */
  -webkit-backdrop-filter: none;
  border: 1px solid var(--border);      /* warm border, no glow */
  box-shadow: 0 1px 3px rgba(44, 37, 23, 0.06); /* very subtle warm shadow */
}

.hero-eyebrow {
  color: var(--accent);                 /* brass, not neon purple */
}

.hero-title {
  font-family: var(--font-serif);
  color: var(--text);
}

.hero-title-gradient {
  /* REMOVE gradient — use solid accent color instead */
  background: none;
  -webkit-text-fill-color: var(--accent2);
  -webkit-background-clip: unset;
}

.hero-cta-primary {
  background: var(--accent);            /* solid brass button */
  border-radius: 6px;                   /* less rounded than current 10px */
}
.hero-cta-primary:hover {
  background: #7A5A22;                  /* darker brass on hover */
}

.hero-cta-secondary {
  color: var(--accent);
  background: transparent;
  border: 1px solid var(--accent2);
  border-radius: 6px;
}

.hero-stats {
  background: var(--surface);
  border: 1px solid var(--border);
  -webkit-backdrop-filter: none;
}
```

### Cards

```css
.card {
  background: var(--bg);                /* white cards on linen bg */
  border: 1px solid var(--border);
  border-radius: 10px;                  /* slightly less rounded: 10px not 14px */
}

.card:hover {
  border-color: var(--accent2);
  box-shadow: 0 2px 12px rgba(148, 107, 45, 0.08); /* warm subtle shadow */
  transform: translateY(-1px);          /* less dramatic lift */
}

/* Avatar backgrounds — warm instead of random */
.avatar {
  background: #F5EFE0;                  /* warm linen */
  color: var(--accent);                 /* brass initials */
  border-radius: 8px;                   /* slightly less rounded */
}
```

### Badge (funding amount)

```css
.badge {
  background: var(--accent-dim);
  border: 1px solid rgba(184, 134, 11, 0.2);
}

.badge-amount {
  color: var(--accent2);
}
```

### News items

```css
.news-source-badge {
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid rgba(184, 134, 11, 0.2);
}

.news-title:hover {
  color: var(--accent2);
}
```

### Stat dots

The colored dots next to stat counters should use the warm palette:

```css
/* Update any inline styles on stat-dot elements in the JSX */
/* Corporate: warm green */
/* VC: slate blue */
/* Angels: sienna/amber */
/* Team: dusty rose */
```

### Footer

```css
.site-footer {
  background: var(--surface);
  border-top: 1px solid var(--border);
}
```

### Search & filter buttons

```css
input[type="search"] {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
}

input[type="search"]:focus {
  border-color: var(--accent2);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.filter-btn.active {
  background: var(--accent-dim);
  border-color: var(--accent2);
  color: var(--accent);
}
```

---

## 5. Global Adjustments

### Border radius — reduce across the board

The current site uses `14px` and `10px` radii everywhere, which contributes to the "shadcn/Claude Code" feel. Reduce to crisper values:

```css
/* Search-and-replace in globals.css: */
/* border-radius: 14px → border-radius: 10px (cards, news items) */
/* border-radius: 10px → border-radius: 6px (buttons, inputs, filter btns) */
/* border-radius: 20px → border-radius: 100px (pill tags stay pills) */
```

### Remove all gradient text

Search for all instances of:
- `background: linear-gradient(...)`
- `-webkit-background-clip: text`
- `-webkit-text-fill-color: transparent`

Replace with solid `color: var(--text)` or `color: var(--accent2)` depending on context.

### Remove all glow/blur effects

Search for and remove:
- `box-shadow: 0 0 8px ...` (glow effects)
- `filter: blur(...)` (orb blurs)
- `-webkit-backdrop-filter: blur(...)` (glass effects)

Replace with subtle warm shadows where needed:
```css
box-shadow: 0 1px 3px rgba(44, 37, 23, 0.06);
```

### Soften hover transforms

```css
/* Current: transform: translateY(-2px) — too dramatic */
/* New: transform: translateY(-1px) — subtle, professional */
```

---

## 6. Accent Bar — New Signature Element

Add a thin warm gradient bar at the very top of the page (above the nav) as a visual signature:

```css
/* Add to layout or as a pseudo-element on body/nav */
body::before {
  content: '';
  display: block;
  height: 3px;
  background: linear-gradient(90deg, #C8962E 0%, #D4A854 40%, #E8D5A8 100%);
  position: sticky;
  top: 0;
  z-index: 200;
}
```

---

## 7. Implementation Order

Follow this sequence to minimize visual breakage during the restyle:

1. **Replace `:root` variables** — This alone will transform ~70% of the look
2. **Remove gradient text** — Search and replace all gradient-on-text patterns
3. **Remove glow/blur effects** — Clean up all `box-shadow` glows and backdrop filters
4. **Add serif font** — Load the font, apply to headline selectors
5. **Override hero section** — Remove orbs, fix hero glass card
6. **Override tag/badge colors** — Apply the warm tag palette
7. **Reduce border radii** — Global search-and-replace
8. **Add accent bar** — The `body::before` element
9. **Adjust avatar colors** — Update avatar background logic in JSX if avatars use inline styles
10. **Test and refine** — Check all pages (Explorer, News, Org Chart, Activity, Team profiles)

---

## 8. Files to Modify

| File | What changes |
|------|-------------|
| `globals.css` | `:root` variables, all component overrides, tag colors |
| `layout.tsx` | Add serif font `<link>` tag (if using Google Fonts) |
| Any component with inline `style=` for avatar colors | Update to use warm palette |
| Any component with inline `style=` for stat-dot colors | Update dot colors |

---

## 9. Color Reference — Quick Copy

| Token | Hex | Usage |
|-------|-----|-------|
| Parchment | `#FFFCF5` | Page background |
| Linen | `#F7F3EC` | Surface/card backgrounds |
| Sand | `#EDE8DF` | Secondary surfaces |
| Border | `#D5CEBD` | All borders |
| Brass | `#C8962E` | Accent highlight (badges, accent bar) |
| Amber | `#946B2D` | Primary accent (buttons, active nav) |
| Deep amber | `#B8860B` | Links, highlighted text |
| Walnut | `#2C2517` | Primary text |
| Dark brown | `#4A3F30` | Secondary text |
| Warm gray | `#8C8474` | Muted/tertiary text |
| Deep teal | `#2A7D6B` | Secondary accent (electric replacement) |

---

## 10. What NOT to Change

- **Layout structure** — Grid columns, flex arrangements, max-widths all stay
- **Component logic** — Filtering, search, routing, data fetching unchanged
- **Responsive breakpoints** — Keep existing `@media` queries
- **Content** — All text, data, links stay the same
- **URL structure** — No routing changes

This is purely a visual restyle. If it looks right, ship it.
