"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

type Member = {
  slug: string;
  name: string;
  role: string;
  reportsTo: string | null;
  body: string;
  location: string;
  tenure: string;
};

type ColorTriplet = { a: string; b: string; ink: string };

const PALETTE: Record<string, ColorTriplet> = {
  chairman:  { a: "#B8860B", b: "#946B2D", ink: "#6B4E1F" },
  exec:      { a: "#C07A3A", b: "#9E5F28", ink: "#7A4618" },
  ops:       { a: "#A85C72", b: "#87445A", ink: "#6B3347" },
  science:   { a: "#2A7D6B", b: "#1F5E50", ink: "#17453B" },
  research:  { a: "#3D7A4A", b: "#2B5A36", ink: "#1F4427" },
  singapore: { a: "#4A7FA5", b: "#345E7C", ink: "#26455C" },
  fallback:  { a: "#8C8474", b: "#6B6355", ink: "#4A3F30" },
};

const PERSON_COLOR: Record<string, ColorTriplet> = {
  "yann-lecun":       PALETTE.chairman,
  "alexandre-lebrun": PALETTE.exec,
  "laurent-solly":    PALETTE.ops,
  "sean-nguyen":      PALETTE.ops,
  "saining-xie":      PALETTE.science,
  "pascale-fung":     PALETTE.science,
  "min-lin":          PALETTE.singapore,
  "brian-li":         PALETTE.singapore,
  "michael-rabbat":   PALETTE.research,
  "li-jing":          PALETTE.research,
  "xingyi-zhou":      PALETTE.research,
  "sanghyun-woo":     PALETTE.research,
  "delong-chen":      PALETTE.research,
  "david-fan":        PALETTE.research,
  "xinyi-wan":        PALETTE.research,
  "jihan-yang":       PALETTE.research,
};

function colorFor(slug: string, role: string): ColorTriplet {
  const explicit = PERSON_COLOR[slug];
  if (explicit) return explicit;
  const r = role.toLowerCase();
  if (/chairman/.test(r)) return PALETTE.chairman;
  if (/\bceo\b/.test(r)) return PALETTE.exec;
  if (/\bcoo\b|operations/.test(r)) return PALETTE.ops;
  if (/chief|science/.test(r)) return PALETTE.science;
  if (/singapore/.test(r)) return PALETTE.singapore;
  if (/research|scientist|technical staff|pretraining|world models/.test(r)) return PALETTE.research;
  return PALETTE.fallback;
}

function initialsOf(name: string): string {
  return name
    .replace(/[^A-Za-z\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const DEFAULT_PARENT_FOR_ORPHANS = "saining-xie";

type TreeNode = Member & { children: TreeNode[] };

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
    const fallbackParent = map.get(DEFAULT_PARENT_FOR_ORPHANS);
    if (fallbackParent) {
      fallbackParent.children.push(...orphans);
    } else if (root) {
      root.children.push(...orphans);
    }
  }

  return root;
}

type Positioned = { node: TreeNode; x: number; y: number; depth: number };

const MAX_CHILDREN_PER_ROW = 3;
const WRAP_GAP = 24;

function layoutTree(
  root: TreeNode,
  opts: { nodeW: number; nodeH: number; hGap: number; vGap: number }
): { nodes: Positioned[]; width: number; height: number } {
  const { nodeW, nodeH, hGap, vGap } = opts;
  let cursor = 0;
  const xByNode = new Map<TreeNode, number>();
  const gridParents = new Set<TreeNode>();
  const wrappedChildren = new Set<TreeNode>();
  const wrapDepths = new Set<number>();

  function walk(n: TreeNode, depth: number) {
    if (!n.children.length) {
      xByNode.set(n, cursor);
      cursor += nodeW + hGap;
    } else {
      const leaves = n.children.filter((c) => c.children.length === 0);
      const branches = n.children.filter((c) => c.children.length > 0);

      if (leaves.length > MAX_CHILDREN_PER_ROW) {
        gridParents.add(n);
        wrapDepths.add(depth + 1);

        // Process branch children normally first
        branches.forEach((c) => walk(c, depth + 1));

        // Grid the leaf children into 2 rows
        const cols = Math.ceil(leaves.length / 2);
        const row1 = leaves.slice(0, cols);
        const row2 = leaves.slice(cols);
        for (let i = 0; i < cols; i++) {
          xByNode.set(row1[i], cursor);
          if (row2[i]) {
            xByNode.set(row2[i], cursor);
            wrappedChildren.add(row2[i]);
          }
          cursor += nodeW + hGap;
        }

        // Center parent over all children
        const allChildXs = [...branches, ...row1]
          .map((c) => xByNode.get(c)!)
          .filter((x) => x !== undefined);
        const minCX = Math.min(...allChildXs);
        const maxCX = Math.max(...allChildXs);
        xByNode.set(n, (minCX + maxCX) / 2);
      } else {
        n.children.forEach((c) => walk(c, depth + 1));
        const first = xByNode.get(n.children[0])!;
        const last = xByNode.get(n.children[n.children.length - 1])!;
        xByNode.set(n, (first + last) / 2);
      }
    }
  }
  walk(root, 0);

  function shift(n: TreeNode, delta: number) {
    xByNode.set(n, (xByNode.get(n) ?? 0) + delta);
    n.children.forEach((c) => shift(c, delta));
  }
  function contours(n: TreeNode): { left: number[]; right: number[] } {
    const left: number[] = [];
    const right: number[] = [];
    function rec(m: TreeNode, d: number) {
      const x = xByNode.get(m)!;
      if (left[d] === undefined || x < left[d]) left[d] = x;
      if (right[d] === undefined || x > right[d]) right[d] = x;
      m.children.forEach((c) => rec(c, d + 1));
    }
    rec(n, 0);
    return { left, right };
  }
  function resolve(n: TreeNode) {
    if (gridParents.has(n)) return;
    if (n.children.length < 2) {
      n.children.forEach(resolve);
      return;
    }
    for (let i = 1; i < n.children.length; i++) {
      const left = n.children[i - 1];
      const right = n.children[i];
      const lc = contours(left).right;
      const rc = contours(right).left;
      let maxOverlap = 0;
      const depthCount = Math.min(lc.length, rc.length);
      for (let d = 0; d < depthCount; d++) {
        const need = lc[d] + nodeW + hGap;
        const gap = rc[d] - need;
        if (gap < 0 && -gap > maxOverlap) maxOverlap = -gap;
      }
      if (maxOverlap > 0) shift(right, maxOverlap);
    }
    const first = xByNode.get(n.children[0])!;
    const last = xByNode.get(n.children[n.children.length - 1])!;
    xByNode.set(n, (first + last) / 2);
    n.children.forEach(resolve);
  }
  resolve(root);

  const all: Positioned[] = [];
  function collect(n: TreeNode, depth: number) {
    let y = depth * (nodeH + vGap);
    if (wrappedChildren.has(n)) {
      y += nodeH + WRAP_GAP;
    } else {
      for (const wd of wrapDepths) {
        if (depth > wd) y += nodeH + WRAP_GAP;
      }
    }
    all.push({ node: n, x: xByNode.get(n)!, y, depth });
    n.children.forEach((c) => collect(c, depth + 1));
  }
  collect(root, 0);

  const minX = Math.min(...all.map((p) => p.x));
  all.forEach((p) => (p.x -= minX));

  const maxX = Math.max(...all.map((p) => p.x)) + nodeW;
  const maxY = Math.max(...all.map((p) => p.y)) + nodeH;
  return { nodes: all, width: maxX, height: maxY };
}

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
    const kids = kidsByParent.get(cur) || [];
    kids.forEach((k) => {
      if (!out.has(k)) {
        out.add(k);
        stack.push(k);
      }
    });
  }
  return out;
}

const NODE_W = 280;
const NODE_H = 132;
const H_GAP = 32;
const V_GAP = 92;
const PAD = 56;

function MapPin() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.38 4.5 8.5 4.5 8.5s4.5-5.12 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.25a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.35-3.35" />
    </svg>
  );
}

type LegendItem = { key: keyof typeof PALETTE; label: string };
const LEGEND: LegendItem[] = [
  { key: "chairman", label: "Chairman" },
  { key: "exec", label: "CEO" },
  { key: "ops", label: "Operations" },
  { key: "science", label: "Science" },
  { key: "research", label: "Research" },
  { key: "singapore", label: "Singapore" },
];

const FOUNDER_TENURES = new Set(["Co-Founder"]);

export default function OrgChartClient({ team }: { team: Member[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const layout = useMemo(() => {
    const tree = buildTree(team);
    if (!tree) return { nodes: [] as Positioned[], width: 0, height: 0 };
    return layoutTree(tree, { nodeW: NODE_W, nodeH: NODE_H, hGap: H_GAP, vGap: V_GAP });
  }, [team]);

  const focusSlug = expanded ?? hover;

  const lineage = useMemo(() => {
    if (!focusSlug) return null;
    const anc = ancestorsOf(team, focusSlug);
    const dsc = descendantsOf(team, focusSlug);
    return new Set<string>([...anc, ...dsc]);
  }, [focusSlug, team]);

  const matchedSet = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      team
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.role.toLowerCase().includes(q) ||
            (m.location || "").toLowerCase().includes(q)
        )
        .map((m) => m.slug)
    );
  }, [query, team]);

  const stats = useMemo(() => {
    const total = team.length;
    const founders = team.filter((m) => FOUNDER_TENURES.has(m.tenure)).length;
    const cities = new Set(
      team
        .map((m) => (m.location || "").split("/")[0].trim())
        .filter((l) => l && l !== "—")
    );
    return { total, founders, cities: cities.size };
  }, [team]);

  const lastUpdated = useMemo(() => {
    const d = new Date();
    return d.toLocaleString("en-US", { month: "short", year: "numeric" });
  }, []);

  const canvasW = layout.width + PAD * 2;
  const canvasH = layout.height + PAD * 2;

  // Build connector links from positions
  const positionsBySlug = useMemo(() => {
    const m = new Map<string, Positioned>();
    layout.nodes.forEach((p) => m.set(p.node.slug, p));
    return m;
  }, [layout]);

  const links = useMemo(() => {
    const out: { from: Positioned; to: Positioned }[] = [];
    layout.nodes.forEach((p) => {
      const parentSlug = p.node.reportsTo;
      if (!parentSlug) return;
      const parent = positionsBySlug.get(parentSlug);
      if (!parent) return;
      out.push({ from: parent, to: p });
    });
    return out;
  }, [layout, positionsBySlug]);

  function pathFor(from: Positioned, to: Positioned): string {
    const sx = from.x + PAD + NODE_W / 2;
    const sy = from.y + PAD + NODE_H;
    const tx = to.x + PAD + NODE_W / 2;
    const ty = to.y + PAD;
    const my = sy + (ty - sy) / 2;
    return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
  }

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
            Hover a card to trace its reporting line; click to expand.
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
            {LEGEND.map((item) => (
              <span className="legend-dot" key={item.key}>
                <span className="legend-swatch" style={{ background: PALETTE[item.key].a }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <main className="org-main">
        <div className="org-canvas-wrap">
          <div className="org-canvas" style={{ width: canvasW, height: canvasH }}>
            <svg
              className="org-connectors"
              width={canvasW}
              height={canvasH}
              viewBox={`0 0 ${canvasW} ${canvasH}`}
              aria-hidden
            >
              {links.map((l) => {
                const onLineage =
                  lineage &&
                  lineage.has(l.from.node.slug) &&
                  lineage.has(l.to.node.slug);
                const dim = lineage && !onLineage;
                const cls = `org-link${dim ? " org-link--dim" : ""}${onLineage ? " org-link--focus" : ""}`;
                return (
                  <path
                    key={`${l.from.node.slug}-${l.to.node.slug}`}
                    d={pathFor(l.from, l.to)}
                    className={cls}
                    style={{ animationDelay: `${160 + l.to.depth * 90}ms` }}
                  />
                );
              })}
            </svg>

            {layout.nodes.map((p, i) => {
              const matched = matchedSet ? matchedSet.has(p.node.slug) : null;
              const lineageHit = lineage ? lineage.has(p.node.slug) : null;

              let highlight: "dim" | "focus" | null = null;
              if (matched === false) highlight = "dim";
              if (lineage && !lineageHit) highlight = "dim";
              if (lineage && lineageHit) highlight = "focus";
              if (matched === true && !lineage) highlight = "focus";

              const color = colorFor(p.node.slug, p.node.role);
              const isExpanded = expanded === p.node.slug;
              const isRoot = !p.node.reportsTo;

              return (
                <div
                  key={p.node.slug}
                  className="org-node"
                  style={{
                    left: p.x + PAD,
                    top: p.y + PAD,
                    width: NODE_W,
                    animationDelay: `${80 + p.depth * 90 + (i % 4) * 25}ms`,
                  }}
                >
                  <div
                    className={`pcard${highlight === "dim" ? " pcard--dim" : ""}${highlight === "focus" ? " pcard--focus" : ""}${isExpanded ? " pcard--expanded" : ""}`}
                    style={{
                      minHeight: NODE_H,
                      ["--tile-a" as string]: color.a,
                      ["--tile-b" as string]: color.b,
                      ["--tile-ink" as string]: color.ink,
                    }}
                    onMouseEnter={() => setHover(p.node.slug)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setExpanded((cur) => (cur === p.node.slug ? null : p.node.slug))}
                  >
                    <div className="pcard-accent" aria-hidden />

                    <div className="pcard-head">
                      <div
                        className="pcard-avatar"
                        style={{ width: 40, height: 40, fontSize: 16 }}
                      >
                        {initialsOf(p.node.name)}
                      </div>
                      <div className="pcard-headtext">
                        <div className="pcard-name">{p.node.name}</div>
                        <div className="pcard-role">{p.node.role}</div>
                      </div>
                      {isRoot && (
                        <span className="pcard-crown" title="Executive Chairman" aria-hidden>
                          ✦
                        </span>
                      )}
                    </div>

                    {(p.node.location || p.node.tenure) && (
                      <div className="pcard-meta">
                        {p.node.location && (
                          <span className="pcard-loc">
                            <MapPin /> {p.node.location}
                          </span>
                        )}
                        {p.node.tenure && (
                          <span className="pcard-tenure">{p.node.tenure}</span>
                        )}
                      </div>
                    )}

                    {p.node.body && <p className="pcard-body">{p.node.body}</p>}

                    {isExpanded && (
                      <div className="pcard-expanded">
                        <div className="pcard-expanded-body">{p.node.body}</div>
                        <div className="pcard-actions">
                          <Link
                            className="pcard-cta"
                            href={`/team/${p.node.slug}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            View full profile →
                          </Link>
                        </div>
                      </div>
                    )}

                    <div className="pcard-hoverchip" aria-hidden>
                      Click for profile →
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="org-footnote">
          Reporting structure inferred from public announcements and LinkedIn ·
          AMI Labs, Advanced Machine Intelligence
        </p>
      </main>
    </>
  );
}
