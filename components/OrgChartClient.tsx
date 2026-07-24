"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

/* ────────────────────────────────────────────────────────────────
 *  AMI Observatory — Org Chart  (v2)
 *
 *  Vertical-emphasis layout. Yann at top, Alex below, 4 co-founders
 *  centered as tier 2. Each co-founder's subtree stacks vertically as
 *  a single column. Hover any card → 380px popup with bio + CTA.
 *  Click card or popup → /team/[slug].
 *
 *  Page chrome (header, stats, search, legend) is rendered here; the
 *  Nav is provided by app/layout.tsx as before.
 * ──────────────────────────────────────────────────────────────── */

type Member = {
  slug: string;
  name: string;
  role: string;
  reportsTo: string | null;
  body: string;
  location: string;
  tenure: string;
};

type TreeNode = Member & { children: TreeNode[] };

type ColorTriplet = { a: string; b: string; ink: string };

const PALETTE: Record<string, ColorTriplet> = {
  chairman:    { a: "#8FB6FF", b: "#5C82D6", ink: "#C2D5F5" },
  exec:        { a: "#E0A23C", b: "#B57C25", ink: "#F0C878" },
  ops:         { a: "#9A8CFF", b: "#6E5FD6", ink: "#C7BEFF" },
  science:     { a: "#3FC7C0", b: "#2A8B86", ink: "#8FE2DD" },
  research:    { a: "#46C08A", b: "#2E8A63", ink: "#93E2BF" },
  singapore:   { a: "#5AA9E6", b: "#3B78AD", ink: "#A6D4F4" },
  engineering: { a: "#AEB7C6", b: "#7E8797", ink: "#D6DCE6" },
  fallback:    { a: "#8892A1", b: "#5C6675", ink: "#BCC4CF" },
};

const PERSON_COLOR: Record<string, ColorTriplet> = {
  "yann-lecun":              PALETTE.chairman,
  "alexandre-lebrun":        PALETTE.exec,
  "laurent-solly":           PALETTE.ops,
  "sean-nguyen":             PALETTE.ops,
  "leopold-treppoz":         PALETTE.ops,
  "aurelia-bortone-bouvet":  PALETTE.ops,
  "saining-xie":             PALETTE.science,
  "pascale-fung":            PALETTE.science,
  "min-lin":                 PALETTE.singapore,
  "brian-li":                PALETTE.singapore,
  "xinyi-wan":               PALETTE.singapore,
  "chao-du":                 PALETTE.singapore,
  "michael-rabbat":          PALETTE.research,
  "quentin-duval":           PALETTE.research,
  "matthew-muckley":         PALETTE.research,
  "li-jing":                 PALETTE.research,
  "xingyi-zhou":             PALETTE.research,
  "sanghyun-woo":            PALETTE.research,
  "david-fan":               PALETTE.research,
  "jihan-yang":              PALETTE.research,
  "bingyi-kang":             PALETTE.research,
  "john-nguyen":             PALETTE.research,
  "delong-chen":             PALETTE.research,
  "basile-terver":           PALETTE.research,
  "willy-chung":             PALETTE.research,
  "christophe-tcheng":       PALETTE.engineering,
  "felix-naepels":           PALETTE.engineering,
};

/* ────────────────────────────────────────────────────────────────
 *  Visual reorganization overrides.
 *
 *  The chart shows a cleaner hierarchy when Rabbat and Min Lin sit at
 *  tier 2 beside the other co-founders (Min Lin heads the Singapore
 *  column), and the Paris-based admin / engineering staff group under
 *  Laurent (Ops) / Pascale (CRIO Paris).
 *
 *  These overrides ONLY change visual layout — they do not edit
 *  Sanity. When Sanity is updated to match (preferred long-term),
 *  remove the corresponding entries from this map.
 * ──────────────────────────────────────────────────────────────── */
const VISUAL_REPORTS_OVERRIDES: Record<string, string> = {
  "michael-rabbat": "alexandre-lebrun",   // promote to tier 2
  "leopold-treppoz": "laurent-solly",
  "aurelia-bortone-bouvet": "laurent-solly",
  "christophe-tcheng": "laurent-solly",
  "min-lin": "alexandre-lebrun",   // promote to tier 2 — Singapore as its own column
  "delong-chen": "pascale-fung",
  "basile-terver": "pascale-fung",
  "willy-chung": "pascale-fung",
};

function applyOverrides(team: Member[]): Member[] {
  return team.map((m) =>
    VISUAL_REPORTS_OVERRIDES[m.slug]
      ? { ...m, reportsTo: VISUAL_REPORTS_OVERRIDES[m.slug] }
      : m,
  );
}

function colorFor(slug: string, role: string): ColorTriplet {
  const explicit = PERSON_COLOR[slug];
  if (explicit) return explicit;
  const r = role.toLowerCase();
  if (/chairman/.test(r)) return PALETTE.chairman;
  if (/\bceo\b/.test(r)) return PALETTE.exec;
  if (/\bcoo\b|operations|chief of staff/.test(r)) return PALETTE.ops;
  if (/chief.*science|cso/.test(r)) return PALETTE.science;
  if (/singapore/.test(r)) return PALETTE.singapore;
  if (/\bvp engineering|head of it|cio\b/.test(r)) return PALETTE.engineering;
  if (/research|scientist|technical staff|pretraining|world models|phd|doctorant/.test(r)) return PALETTE.research;
  return PALETTE.fallback;
}

function initialsOf(name: string): string {
  return name
    .replace(/[^A-Za-zÀ-ÿ\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* ── Tree building ─────────────────────────────────────────────── */

const DEFAULT_PARENT_FOR_ORPHANS = "saining-xie";

function buildTree(team: Member[]): TreeNode | null {
  const map = new Map<string, TreeNode>();
  team.forEach((m) => map.set(m.slug, { ...m, children: [] }));

  let root: TreeNode | null = null;
  const orphans: TreeNode[] = [];

  for (const m of team) {
    const node = map.get(m.slug)!;
    if (!m.reportsTo) {
      if (!root) root = node;
      else orphans.push(node);
    } else {
      const parent = map.get(m.reportsTo);
      if (parent) parent.children.push(node);
      else orphans.push(node);
    }
  }

  if (orphans.length) {
    const fallback = map.get(DEFAULT_PARENT_FOR_ORPHANS) || root;
    if (fallback) fallback.children.push(...orphans);
  }

  return root;
}

/* ── Column layout ─────────────────────────────────────────────── */

// Cards render at 90% of their natural 420×198 design. CARD_W/CARD_H are the
// on-canvas footprint used for layout, node boxes, and connector math; the
// card's internal design scales to fit via `--card-scale` in globals.css —
// keep that variable in sync with CARD_SCALE.
const CARD_SCALE = 0.9;
const CARD_W = Math.round(420 * CARD_SCALE); // 378
const CARD_H = Math.round(198 * CARD_SCALE); // 178
const TIER_GAP_Y = 64;
const ROW_GAP = 18;
const COL_GAP = 24;
const COLUMN_GAP = 48;
const PAD = 56;

type Positioned = { node: TreeNode; x: number; y: number; depth: number };
type Link = { from: string; to: string };

type SubtreeBlock = {
  placements: Positioned[];
  links: Link[];
  rootX: number;
  width: number;
  height: number;
};

function layoutSubtreeBlock(
  node: TreeNode,
  ox: number,
  oy: number,
  depth: number,
): SubtreeBlock {
  const placements: Positioned[] = [];
  const links: Link[] = [];

  if (!node.children || node.children.length === 0) {
    placements.push({ node, x: ox, y: oy, depth });
    return { placements, links, rootX: ox, width: CARD_W, height: CARD_H };
  }

  const branches = node.children.filter((c) => c.children && c.children.length > 0);
  const leaves = node.children.filter((c) => !c.children || c.children.length === 0);

  // Single-column stack — keeps each subtree narrow & tall.
  const leafCols = 1;
  const leafRows = leaves.length;

  const leavesBlockWidth = leafCols * CARD_W + (leafCols - 1) * COL_GAP;
  const leavesBlockHeight =
    leaves.length > 0 ? leafRows * CARD_H + (leafRows - 1) * ROW_GAP : 0;

  const branchBlocks = branches.map((b) => layoutSubtreeBlock(b, 0, 0, depth + 1));
  const branchesWidth = branchBlocks.length
    ? Math.max(...branchBlocks.map((b) => b.width))
    : 0;
  const branchesHeight =
    branchBlocks.reduce((sum, b) => sum + b.height, 0) +
    Math.max(0, branchBlocks.length - 1) * TIER_GAP_Y;

  const childrenBlockWidth = Math.max(leavesBlockWidth, branchesWidth);
  const childrenBlockHeight =
    leavesBlockHeight +
    (branchBlocks.length && leaves.length ? TIER_GAP_Y : 0) +
    branchesHeight;

  const totalWidth = Math.max(CARD_W, childrenBlockWidth);
  const rootX = ox + (totalWidth - CARD_W) / 2;
  placements.push({ node, x: rootX, y: oy, depth });

  const childrenTop = oy + CARD_H + TIER_GAP_Y;
  const childrenLeft = ox + (totalWidth - childrenBlockWidth) / 2;

  const leavesLeft =
    childrenLeft + (childrenBlockWidth - leavesBlockWidth) / 2;
  leaves.forEach((leaf, i) => {
    const col = i % leafCols;
    const row = Math.floor(i / leafCols);
    placements.push({
      node: leaf,
      x: leavesLeft + col * (CARD_W + COL_GAP),
      y: childrenTop + row * (CARD_H + ROW_GAP),
      depth: depth + 1,
    });
    links.push({ from: node.slug, to: leaf.slug });
  });

  let branchY = childrenTop + leavesBlockHeight + (leaves.length ? TIER_GAP_Y : 0);
  branchBlocks.forEach((block) => {
    const branchLeft = childrenLeft + (childrenBlockWidth - block.width) / 2;
    block.placements.forEach((p) =>
      placements.push({
        node: p.node,
        x: p.x + branchLeft,
        y: p.y + branchY,
        depth: p.depth,
      }),
    );
    block.links.forEach((l) => links.push(l));
    links.push({ from: node.slug, to: block.placements[0].node.slug });
    branchY += block.height + TIER_GAP_Y;
  });

  const totalHeight =
    CARD_H + (childrenBlockHeight ? TIER_GAP_Y + childrenBlockHeight : 0);

  return { placements, links, rootX, width: totalWidth, height: totalHeight };
}

type LayoutResult = {
  nodes: Positioned[];
  links: Link[];
  width: number;
  height: number;
};

function layoutOrg(root: TreeNode): LayoutResult {
  const positions: Positioned[] = [];
  const links: Link[] = [];

  const yann = root;
  const alex = root.children[0];
  const tier2 = alex ? alex.children : [];

  const columns = tier2.map((node) => layoutSubtreeBlock(node, 0, 0, 0));

  const yYann = 0;
  const yAlex = CARD_H + TIER_GAP_Y;
  const yTier2 = yAlex + CARD_H + TIER_GAP_Y;

  let cursorX = 0;
  columns.forEach((col) => {
    col.placements.forEach((p) =>
      positions.push({
        node: p.node,
        x: p.x + cursorX,
        y: p.y + yTier2,
        depth: p.depth + 2,
      }),
    );
    col.links.forEach((l) => links.push(l));
    if (alex) links.push({ from: alex.slug, to: col.placements[0].node.slug });
    cursorX += col.width + COLUMN_GAP;
  });

  // True visual center of the tier-2 row (across actual card positions, not
  // the column rectangles — those carry padding that throws off centering).
  let tierMinX = Infinity;
  let tierMaxX = -Infinity;
  positions.forEach((p) => {
    if (p.x < tierMinX) tierMinX = p.x;
    if (p.x + CARD_W > tierMaxX) tierMaxX = p.x + CARD_W;
  });
  const visualCenterX = (tierMinX + tierMaxX) / 2;

  positions.unshift({
    node: yann,
    x: visualCenterX - CARD_W / 2,
    y: yYann,
    depth: 0,
  });
  if (alex) {
    positions.splice(1, 0, {
      node: alex,
      x: visualCenterX - CARD_W / 2,
      y: yAlex,
      depth: 1,
    });
    links.push({ from: yann.slug, to: alex.slug });
  }

  const minX = Math.min(...positions.map((p) => p.x));
  positions.forEach((p) => (p.x -= minX));

  const maxX = Math.max(...positions.map((p) => p.x + CARD_W));
  const maxY = Math.max(...positions.map((p) => p.y + CARD_H));

  return { nodes: positions, links, width: maxX, height: maxY };
}

/* ── Graph helpers ─────────────────────────────────────────────── */

function ancestorsOf(team: Member[], slug: string): Set<string> {
  const map = new Map(team.map((m) => [m.slug, m]));
  const out = new Set<string>();
  let cur: Member | undefined = map.get(slug);
  while (cur) {
    out.add(cur.slug);
    cur = cur.reportsTo ? map.get(cur.reportsTo) : undefined;
  }
  return out;
}

function descendantsOf(team: Member[], slug: string): Set<string> {
  const kidsByParent = new Map<string, string[]>();
  team.forEach((m) => {
    if (!m.reportsTo) return;
    if (!kidsByParent.has(m.reportsTo)) kidsByParent.set(m.reportsTo, []);
    kidsByParent.get(m.reportsTo)!.push(m.slug);
  });
  const out = new Set<string>([slug]);
  const stack = [slug];
  while (stack.length) {
    const cur = stack.pop()!;
    (kidsByParent.get(cur) || []).forEach((k) => {
      if (!out.has(k)) {
        out.add(k);
        stack.push(k);
      }
    });
  }
  return out;
}

/* ── Inline SVG icons ──────────────────────────────────────────── */

function MapPin() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.38 4.5 8.5 4.5 8.5s4.5-5.12 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.25a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.35-3.35" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function ZoomIcon({ type }: { type: "in" | "out" | "fit" }) {
  if (type === "fit") return <span style={{ fontSize: 13, lineHeight: 1 }}>⊡</span>;
  return (
    <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 400 }}>
      {type === "in" ? "+" : "−"}
    </span>
  );
}

/* ── PersonCard ────────────────────────────────────────────────── */

type CardProps = {
  person: Member;
  highlight: "dim" | "focus" | null;
  isRoot: boolean;
  isCEO: boolean;
  onHover: (slug: string, el: HTMLElement) => void;
  onLeave: () => void;
  onClick: (slug: string) => void;
};

function PersonCard({ person, highlight, isRoot, isCEO, onHover, onLeave, onClick }: CardProps) {
  const color = colorFor(person.slug, person.role);
  const dimmed = highlight === "dim";
  const focused = highlight === "focus";
  const accentCls = isRoot ? "pcard2--root" : isCEO ? "pcard2--ceo" : "";

  return (
    <div
      className={`pcard2 ${accentCls}${dimmed ? " pcard2--dim" : ""}${focused ? " pcard2--focus" : ""}`}
      style={{
        ["--tile-a" as string]: color.a,
        ["--tile-b" as string]: color.b,
        ["--tile-ink" as string]: color.ink,
      }}
      onMouseEnter={(e) => onHover(person.slug, e.currentTarget)}
      onMouseLeave={onLeave}
      onClick={() => onClick(person.slug)}
    >
      <div className="pcard2-stripe" aria-hidden />

      <div className="pcard2-inner">
        <div className="pcard2-avatar"><span>{initialsOf(person.name)}</span></div>

        <div className="pcard2-body">
          <div className="pcard2-namerow">
            <h3 className="pcard2-name">{person.name}</h3>
            {isRoot && <span className="pcard2-mark" title="Executive Chairman" aria-hidden>CHAIR</span>}
          </div>
          <div className="pcard2-role">{person.role}</div>

          <div className="pcard2-meta">
            {person.location && (
              <span className="pcard2-loc"><MapPin /> {person.location}</span>
            )}
            {person.tenure && (
              <span className="pcard2-tenure">{person.tenure}</span>
            )}
          </div>
        </div>
      </div>

      <div className="pcard2-glint" aria-hidden />
    </div>
  );
}

/* ── PersonPopup ───────────────────────────────────────────────── */

type PopupProps = {
  anchorRect: DOMRect;
  person: Member;
  onEnter: () => void;
  onLeave: () => void;
  onNavigate: (slug: string) => void;
};

function PersonPopup({ anchorRect, person, onEnter, onLeave, onNavigate }: PopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: "right" | "left" | "below" }>({
    left: -9999,
    top: -9999,
    side: "right",
  });

  const color = colorFor(person.slug, person.role);

  useEffect(() => {
    if (!popupRef.current) return;
    const popup = popupRef.current;
    const popupW = popup.offsetWidth;
    const popupH = popup.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;

    const spaceRight = vw - anchorRect.right - margin;
    const spaceLeft = anchorRect.left - margin;

    let side: "right" | "left" | "below" = "right";
    let left: number;
    if (spaceRight >= popupW + 12) {
      side = "right";
      left = anchorRect.right + 12;
    } else if (spaceLeft >= popupW + 12) {
      side = "left";
      left = anchorRect.left - popupW - 12;
    } else {
      side = "below";
      left = Math.max(margin, Math.min(vw - popupW - margin, anchorRect.left));
    }

    let top = anchorRect.top + anchorRect.height / 2 - popupH / 2;
    top = Math.max(margin, Math.min(vh - popupH - margin, top));

    setPos({ left, top, side });
  }, [anchorRect, person]);

  return (
    <div
      ref={popupRef}
      className={`ppopup ppopup--${pos.side}`}
      style={{
        left: pos.left,
        top: pos.top,
        ["--tile-a" as string]: color.a,
        ["--tile-b" as string]: color.b,
        ["--tile-ink" as string]: color.ink,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => onNavigate(person.slug)}
      role="dialog"
      aria-label={`${person.name} profile preview`}
    >
      <div className="ppopup-header">
        <div className="ppopup-avatar">{initialsOf(person.name)}</div>
        <div className="ppopup-titles">
          <h3 className="ppopup-name">{person.name}</h3>
          <div className="ppopup-role">{person.role}</div>
          <div className="ppopup-meta">
            {person.location && <span className="ppopup-loc"><MapPin /> {person.location}</span>}
            {person.tenure && <span className="ppopup-tenure">{person.tenure}</span>}
          </div>
        </div>
      </div>

      <div className="ppopup-divider" aria-hidden />

      <div className="ppopup-bio">{person.body}</div>

      <div className="ppopup-cta">
        View full profile <ArrowRight />
      </div>
    </div>
  );
}

/* ── Connectors ────────────────────────────────────────────────── */

type ConnectorsProps = {
  positions: Positioned[];
  links: Link[];
  focusSlug: string | null;
  team: Member[];
};

function Connectors({ positions, links, focusSlug, team }: ConnectorsProps) {
  const bySlug = useMemo(() => {
    const m = new Map<string, Positioned>();
    positions.forEach((p) => m.set(p.node.slug, p));
    return m;
  }, [positions]);

  const lineage = useMemo(() => {
    if (!focusSlug) return null;
    const anc = ancestorsOf(team, focusSlug);
    const dsc = descendantsOf(team, focusSlug);
    return new Set<string>([...anc, ...dsc]);
  }, [focusSlug, team]);

  const maxX = positions.reduce((a, p) => Math.max(a, p.x + CARD_W), 0);
  const maxY = positions.reduce((a, p) => Math.max(a, p.y + CARD_H), 0) + 40;

  function pathFor(from: Positioned, to: Positioned): string {
    const sx = from.x + CARD_W / 2;
    const sy = from.y + CARD_H;
    const tx = to.x + CARD_W / 2;
    const ty = to.y;
    const my = sy + (ty - sy) / 2;
    return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
  }

  return (
    <svg
      className="org2-connectors"
      width={maxX}
      height={maxY}
      viewBox={`0 0 ${maxX} ${maxY}`}
      aria-hidden
    >
      {links.map((l) => {
        const from = bySlug.get(l.from);
        const to = bySlug.get(l.to);
        if (!from || !to) return null;
        const onLineage = lineage && lineage.has(l.from) && lineage.has(l.to);
        const dim = lineage && !onLineage;
        return (
          <path
            key={`${l.from}-${l.to}`}
            d={pathFor(from, to)}
            className={`org2-link${dim ? " org2-link--dim" : ""}${onLineage ? " org2-link--focus" : ""}`}
            style={{ animationDelay: `${120 + to.depth * 60}ms` }}
          />
        );
      })}
    </svg>
  );
}

/* ── Main client component ────────────────────────────────────── */

const POPUP_SHOW_DELAY = 220;
const POPUP_HIDE_DELAY = 180;

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

const LEGEND_ITEMS: { key: keyof typeof PALETTE; label: string }[] = [
  { key: "chairman", label: "Chairman" },
  { key: "exec", label: "CEO" },
  { key: "ops", label: "Operations" },
  { key: "science", label: "Science" },
  { key: "research", label: "Research" },
  { key: "singapore", label: "Singapore" },
  { key: "engineering", label: "Engineering" },
];

export default function OrgChartClient({ team }: { team: Member[] }) {
  const router = useRouter();

  const resolvedTeam = useMemo(() => applyOverrides(team), [team]);

  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<DOMRect | null>(null);
  const [zoom, setZoom] = useState(0.6); // default the viewer to 60% on first load

  const wrapRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layout
  const layout = useMemo(() => {
    const tree = buildTree(resolvedTeam);
    if (!tree) return { nodes: [] as Positioned[], links: [] as Link[], width: 0, height: 0 };
    return layoutOrg(tree);
  }, [resolvedTeam]);

  // Search filter
  const matchedSet = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      resolvedTeam
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.role.toLowerCase().includes(q) ||
            (m.location || "").toLowerCase().includes(q),
        )
        .map((m) => m.slug),
    );
  }, [query, resolvedTeam]);

  // Lineage for hovered card
  const lineage = useMemo(() => {
    if (!hover) return null;
    const anc = ancestorsOf(resolvedTeam, hover);
    const dsc = descendantsOf(resolvedTeam, hover);
    return new Set<string>([...anc, ...dsc]);
  }, [hover, resolvedTeam]);

  // Stats
  const stats = useMemo(() => {
    const total = resolvedTeam.length;
    // Count co-founders by tenure tag OR "Co-Founder" in the role — most
    // co-founders carry the title in their role (e.g. "CEO & Co-Founder")
    // but only Yann has the Sanity "Co-Founder" tenure tag.
    const founders = resolvedTeam.filter(
      (m) => m.tenure === "Co-Founder" || /co-?founder/i.test(m.role),
    ).length;
    const cities = new Set(
      resolvedTeam
        .map((m) => (m.location || "").split("/")[0].trim())
        .filter((l) => l && l !== "—"),
    );
    return { total, founders, cities: cities.size };
  }, [resolvedTeam]);

  const lastUpdated = useMemo(
    () => new Date().toLocaleString("en-US", { month: "short", year: "numeric" }),
    [],
  );

  // Popup state machine
  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleShow = useCallback((slug: string, el: HTMLElement) => {
    cancelHide();
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => {
      setHover(slug);
      setPopupAnchor(el.getBoundingClientRect());
    }, POPUP_SHOW_DELAY);
  }, [cancelHide]);

  const scheduleHide = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setHover(null);
      setPopupAnchor(null);
    }, POPUP_HIDE_DELAY);
  }, []);

  useEffect(() => {
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const hoveredPerson = useMemo(() => {
    if (!hover) return null;
    return resolvedTeam.find((m) => m.slug === hover) || null;
  }, [hover, resolvedTeam]);

  const navigateToProfile = useCallback(
    (slug: string) => router.push(`/team/${slug}`),
    [router],
  );

  const canvasW = layout.width + PAD * 2;
  const canvasH = layout.height + PAD * 2;

  // Zoom: clamp helper, +/- steps, and "fit width" so the full co-founder row
  // is visible (height is left to vertical scroll — the chart is tall).
  const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const fitWidth = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !canvasW) return;
    const avail = wrap.clientWidth - 24;
    setZoom(clampZoom(Math.min(1, avail / canvasW)));
  }, [canvasW]);

  // Ctrl/⌘ + wheel to zoom (matches the v1 behavior).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));
    };
    wrap.addEventListener("wheel", handler, { passive: false });
    return () => wrap.removeEventListener("wheel", handler);
  }, []);

  const zoomPct = Math.round(zoom * 100);

  return (
    <>
      <header className="page-header page-header--observatory">
        <div className="page-header-inner">
          <div className="ph-eyebrow">
            <span className="ph-dot" /> The Observatory · Organization
          </div>
          <h1>AMI Labs Org Chart</h1>
          <p>
            Reporting structure inferred from public announcements and LinkedIn.
            Hover any card to read a profile preview; click to open the full bio.
          </p>
          <div className="ph-stats">
            <div className="ph-stat">
              <div className="ph-stat-num">{stats.total}</div>
              <div className="ph-stat-label">People mapped</div>
            </div>
            <div className="ph-stat">
              <div className="ph-stat-num">{stats.founders}</div>
              <div className="ph-stat-label">Co-Founders</div>
            </div>
            <div className="ph-stat">
              <div className="ph-stat-num">{stats.cities}</div>
              <div className="ph-stat-label">Cities</div>
            </div>
            <div className="ph-stat ph-stat--update">
              <div className="ph-stat-num">{lastUpdated}</div>
              <div className="ph-stat-label">Last updated</div>
            </div>
          </div>
        </div>
      </header>

      <div className="org-controls">
        <div className="org-controls-inner">
          <div className="org-search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search people, roles, or locations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="legend">
            {LEGEND_ITEMS.map((item) => (
              <span className="legend-dot" key={item.key}>
                <span className="legend-swatch" style={{ background: PALETTE[item.key].a }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <main className="org2-main">
        <div className="org2-zoom-bar">
          <button
            className="org-zoom-btn"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomIcon type="out" />
          </button>
          <span className="org-zoom-pct">{zoomPct}%</span>
          <button
            className="org-zoom-btn"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIcon type="in" />
          </button>
          <button
            className="org-zoom-btn"
            onClick={fitWidth}
            title="Fit width"
            aria-label="Fit width"
          >
            <ZoomIcon type="fit" />
          </button>
        </div>

        <div className="org2-canvas-wrap" ref={wrapRef}>
          <div style={{ width: canvasW * zoom, height: canvasH * zoom, position: "relative" }}>
            <div
              className="org2-canvas"
              style={{
                width: canvasW,
                height: canvasH,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <Connectors
                positions={layout.nodes.map((n) => ({ ...n, x: n.x + PAD, y: n.y + PAD }))}
                links={layout.links}
                focusSlug={hover}
                team={resolvedTeam}
              />

            {layout.nodes.map((p, i) => {
              const matched = matchedSet ? matchedSet.has(p.node.slug) : null;
              const lineageHit = lineage ? lineage.has(p.node.slug) : null;

              let highlight: "dim" | "focus" | null = null;
              if (matched === false) highlight = "dim";
              if (lineage && !lineageHit) highlight = "dim";
              if (lineage && lineageHit && p.node.slug !== hover) highlight = "focus";
              if (matched === true && !lineage) highlight = "focus";

              return (
                <div
                  key={p.node.slug}
                  className="org2-node"
                  style={{
                    left: p.x + PAD,
                    top: p.y + PAD,
                    width: CARD_W,
                    height: CARD_H,
                    animationDelay: `${80 + p.depth * 90 + (i % 4) * 25}ms`,
                  }}
                >
                  <PersonCard
                    person={p.node}
                    highlight={highlight}
                    isRoot={p.node.slug === "yann-lecun"}
                    isCEO={p.node.slug === "alexandre-lebrun"}
                    onHover={scheduleShow}
                    onLeave={scheduleHide}
                    onClick={navigateToProfile}
                  />
                </div>
              );
            })}
            </div>
          </div>
        </div>

        <p className="org2-footnote">
          Reporting structure inferred from public announcements and LinkedIn ·
          AMI Labs, Advanced Machine Intelligence
        </p>
      </main>

      {hover && hoveredPerson && popupAnchor && (
        <PersonPopup
          anchorRect={popupAnchor}
          person={hoveredPerson}
          onEnter={cancelHide}
          onLeave={scheduleHide}
          onNavigate={navigateToProfile}
        />
      )}
    </>
  );
}
