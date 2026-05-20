#!/usr/bin/env node
// Generate a shareable PNG of the AMI Labs org chart.
// Reads data/team.json, builds the same layout as components/OrgChartClient.tsx,
// emits SVG, then converts to PNG with rsvg-convert.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEAM_PATH = path.join(ROOT, "data", "team.json");
const OUT_DIR = path.join(ROOT, "public", "exports");
const SVG_PATH = path.join(OUT_DIR, "org-chart.svg");
const PNG_PATH = path.join(OUT_DIR, "org-chart.png");

fs.mkdirSync(OUT_DIR, { recursive: true });

// ────────────────────────────────────────────────────────────────
// Palette (mirrors OrgChartClient.tsx)
// ────────────────────────────────────────────────────────────────
const PALETTE = {
  chairman:  { a: "#B8860B", b: "#946B2D", ink: "#6B4E1F" },
  exec:      { a: "#C07A3A", b: "#9E5F28", ink: "#7A4618" },
  ops:       { a: "#A85C72", b: "#87445A", ink: "#6B3347" },
  science:   { a: "#2A7D6B", b: "#1F5E50", ink: "#17453B" },
  research:  { a: "#3D7A4A", b: "#2B5A36", ink: "#1F4427" },
  singapore: { a: "#4A7FA5", b: "#345E7C", ink: "#26455C" },
  fallback:  { a: "#8C8474", b: "#6B6355", ink: "#4A3F30" },
};

const PERSON_COLOR = {
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

function colorFor(slug, role) {
  const explicit = PERSON_COLOR[slug];
  if (explicit) return explicit;
  const r = (role || "").toLowerCase();
  if (/chairman/.test(r)) return PALETTE.chairman;
  if (/\bceo\b/.test(r)) return PALETTE.exec;
  if (/\bcoo\b|operations/.test(r)) return PALETTE.ops;
  if (/chief|science/.test(r)) return PALETTE.science;
  if (/singapore/.test(r)) return PALETTE.singapore;
  if (/research|scientist|technical staff|pretraining|world models/.test(r))
    return PALETTE.research;
  return PALETTE.fallback;
}

function initialsOf(name) {
  return name
    .replace(/[^A-Za-z\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const TENURE_TAGS = new Set(["Co-Founder", "Founding team", "Founding Team"]);
function extractLocationAndTenure(tags) {
  if (!tags || !tags.length) return { location: "", tenure: "" };
  let location = "";
  let tenure = "";
  for (const t of tags) {
    if (TENURE_TAGS.has(t)) {
      if (!tenure) tenure = t === "Founding Team" ? "Founding team" : t;
    } else if (!location) {
      location = t;
    }
  }
  return { location, tenure };
}

// ────────────────────────────────────────────────────────────────
// Layout (port of layoutTree from OrgChartClient.tsx)
// ────────────────────────────────────────────────────────────────
const NODE_W = 280;
const NODE_H = 132;
const H_GAP = 32;
const V_GAP = 92;
const PAD = 56;
const MAX_CHILDREN_PER_ROW = 3;
const WRAP_GAP = 60;
const DEFAULT_PARENT_FOR_ORPHANS = "saining-xie";

function buildTree(team) {
  const map = new Map();
  team.forEach((m) => map.set(m.slug, { ...m, children: [] }));
  let root = null;
  const orphans = [];
  for (const m of team) {
    const node = map.get(m.slug);
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
    const fallback = map.get(DEFAULT_PARENT_FOR_ORPHANS);
    if (fallback) fallback.children.push(...orphans);
    else if (root) root.children.push(...orphans);
  }
  return root;
}

function layoutTree(root) {
  let cursor = 0;
  const xByNode = new Map();
  const gridParents = new Set();
  const wrappedChildren = new Set();
  const wrapDepths = new Set();

  function walk(n, depth) {
    if (!n.children.length) {
      xByNode.set(n, cursor);
      cursor += NODE_W + H_GAP;
    } else {
      const leaves = n.children.filter((c) => c.children.length === 0);
      const branches = n.children.filter((c) => c.children.length > 0);
      if (leaves.length > MAX_CHILDREN_PER_ROW) {
        gridParents.add(n);
        wrapDepths.add(depth + 1);
        branches.forEach((c) => walk(c, depth + 1));
        const cols = Math.ceil(leaves.length / 2);
        const row1 = leaves.slice(0, cols);
        const row2 = leaves.slice(cols);
        for (let i = 0; i < cols; i++) {
          xByNode.set(row1[i], cursor);
          if (row2[i]) {
            xByNode.set(row2[i], cursor);
            wrappedChildren.add(row2[i]);
          }
          cursor += NODE_W + H_GAP;
        }
        const allChildXs = [...branches, ...row1]
          .map((c) => xByNode.get(c))
          .filter((x) => x !== undefined);
        const minCX = Math.min(...allChildXs);
        const maxCX = Math.max(...allChildXs);
        xByNode.set(n, (minCX + maxCX) / 2);
      } else {
        n.children.forEach((c) => walk(c, depth + 1));
        const first = xByNode.get(n.children[0]);
        const last = xByNode.get(n.children[n.children.length - 1]);
        xByNode.set(n, (first + last) / 2);
      }
    }
  }
  walk(root, 0);

  function shift(n, delta) {
    xByNode.set(n, (xByNode.get(n) ?? 0) + delta);
    n.children.forEach((c) => shift(c, delta));
  }
  function contours(n) {
    const left = [];
    const right = [];
    function rec(m, d) {
      const x = xByNode.get(m);
      if (left[d] === undefined || x < left[d]) left[d] = x;
      if (right[d] === undefined || x > right[d]) right[d] = x;
      m.children.forEach((c) => rec(c, d + 1));
    }
    rec(n, 0);
    return { left, right };
  }
  function resolve(n) {
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
        const need = lc[d] + NODE_W + H_GAP;
        const gap = rc[d] - need;
        if (gap < 0 && -gap > maxOverlap) maxOverlap = -gap;
      }
      if (maxOverlap > 0) shift(right, maxOverlap);
    }
    const first = xByNode.get(n.children[0]);
    const last = xByNode.get(n.children[n.children.length - 1]);
    xByNode.set(n, (first + last) / 2);
    n.children.forEach(resolve);
  }
  resolve(root);

  const all = [];
  function collect(n, depth) {
    let y = depth * (NODE_H + V_GAP);
    if (wrappedChildren.has(n)) {
      y += NODE_H + WRAP_GAP;
    } else {
      for (const wd of wrapDepths) {
        if (depth > wd) y += NODE_H + WRAP_GAP;
      }
    }
    all.push({ node: n, x: xByNode.get(n), y, depth, isWrapped: wrappedChildren.has(n) });
    n.children.forEach((c) => collect(c, depth + 1));
  }
  collect(root, 0);

  const minX = Math.min(...all.map((p) => p.x));
  all.forEach((p) => (p.x -= minX));
  const width = Math.max(...all.map((p) => p.x)) + NODE_W;
  const height = Math.max(...all.map((p) => p.y)) + NODE_H;
  return { nodes: all, width, height };
}

// ────────────────────────────────────────────────────────────────
// SVG helpers
// ────────────────────────────────────────────────────────────────
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Greedy word-wrap returning up to `maxLines` lines.
// charWidth is the average glyph width in pixels for the given fontPx.
function wrapText(text, fontPx, maxWidthPx, maxLines, charWidth) {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const maxChars = Math.max(8, Math.floor(maxWidthPx / charWidth));
  const lines = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? cur + " " + w : w;
    if (candidate.length <= maxChars) cur = candidate;
    else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const remainingWords = words.slice(
      lines.slice(0, -1).join(" ").split(/\s+/).filter(Boolean).length +
        last.split(/\s+/).filter(Boolean).length,
    );
    if (remainingWords.length) {
      lines[maxLines - 1] = (last.length > maxChars - 1
        ? last.slice(0, maxChars - 1)
        : last) + "…";
    }
  }
  return lines;
}

// ────────────────────────────────────────────────────────────────
// Render card as SVG group
// ────────────────────────────────────────────────────────────────
function renderCard(p) {
  const { node } = p;
  const color = colorFor(node.slug, node.role);
  const isRoot = !node.reportsTo;
  const x = p.x + PAD;
  const y = p.y + PAD;

  const padL = 18;
  const padR = 18;
  const padT = 16;
  const accentW = 3;
  const avatarSize = 40;
  const avatarCx = padL + avatarSize / 2;
  const avatarCy = padT + avatarSize / 2;
  const headTextX = padL + avatarSize + 12;
  const headTextRight = NODE_W - padR;
  const headTextW = headTextRight - headTextX;

  const nameY = padT + 18;
  const roleY = nameY + 18;
  const nameLines = wrapText(node.name, 16, headTextW - (isRoot ? 14 : 0), 1, 8.5);
  const roleLines = wrapText(node.role, 12.5, headTextW, 2, 6.6);

  const metaY = padT + avatarSize + 18;

  // Body text — show 2 lines max
  const bodyMaxW = NODE_W - padL - padR;
  let bodyY = metaY;
  let bodyLines = [];
  if (node.location || node.tenure) bodyY += 18;
  if (node.body && node.body.trim()) {
    bodyLines = wrapText(node.body.trim(), 12, bodyMaxW, 2, 6.7);
  }

  const gradId = `g-${node.slug}`;
  const avatarGradId = `a-${node.slug}`;
  const clipId = `c-${node.slug}`;

  let out = "";
  out += `<g class="card" transform="translate(${x},${y})">`;

  out += `<defs>`;
  out += `<clipPath id="${clipId}"><rect x="0" y="0" width="${NODE_W}" height="${NODE_H}" rx="10" ry="10"/></clipPath>`;
  out += `<linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">`;
  out += `<stop offset="0%" stop-color="${color.a}" stop-opacity="0"/>`;
  out += `<stop offset="100%" stop-color="${color.a}" stop-opacity="0.06"/>`;
  out += `</linearGradient>`;
  out += `<linearGradient id="${avatarGradId}" x1="0" y1="0" x2="1" y2="1">`;
  out += `<stop offset="0%" stop-color="${color.a}"/>`;
  out += `<stop offset="100%" stop-color="${color.b}"/>`;
  out += `</linearGradient>`;
  out += `</defs>`;

  // Drop shadow rect (subtle)
  out += `<rect x="0" y="2" width="${NODE_W}" height="${NODE_H}" rx="10" ry="10" fill="#000" opacity="0.05"/>`;

  // Card background
  out += `<rect x="0" y="0" width="${NODE_W}" height="${NODE_H}" rx="10" ry="10" fill="#FFFCF5" stroke="#D5CEBD" stroke-width="1"/>`;

  // Clip all internal content so nothing bleeds outside the rounded card
  out += `<g clip-path="url(#${clipId})">`;
  out += `<rect x="0" y="0" width="${NODE_W}" height="${NODE_H}" fill="url(#${gradId})"/>`;

  // Left accent stripe
  out += `<rect x="0" y="0" width="${accentW}" height="${NODE_H}" fill="${color.a}"/>`;

  // Avatar circle
  out += `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarSize / 2}" fill="url(#${avatarGradId})"/>`;
  out += `<text x="${avatarCx}" y="${avatarCy + 1}" text-anchor="middle" dominant-baseline="central" font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif" font-size="15" font-weight="700" fill="#FFFCF5" letter-spacing="0.5">${escapeXml(initialsOf(node.name))}</text>`;

  // Name
  const name = nameLines[0] || node.name;
  out += `<text x="${headTextX}" y="${nameY}" font-family="'Newsreader','Iowan Old Style', Georgia, serif" font-size="16" font-weight="500" fill="#2C2517" letter-spacing="-0.2">${escapeXml(name)}</text>`;

  // Crown for root
  if (isRoot) {
    out += `<text x="${headTextX + (name.length * 8.8) + 4}" y="${nameY - 1}" font-family="serif" font-size="13" font-weight="600" fill="#B8860B">✦</text>`;
  }

  // Role (max 2 lines)
  roleLines.forEach((line, i) => {
    out += `<text x="${headTextX}" y="${roleY + i * 14}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="500" fill="${color.ink}">${escapeXml(line)}</text>`;
  });

  // Meta: location pin + label + tenure pill
  if (node.location || node.tenure) {
    let metaCursorX = padL;
    if (node.location) {
      // Tiny pin
      out += `<g transform="translate(${metaCursorX}, ${metaY - 8})" fill="#8C8474">`;
      out += `<path d="M5 0 C2.2 0 0 2.2 0 5 C0 8.5 5 13 5 13 S10 8.5 10 5 C10 2.2 7.8 0 5 0 Z M5 7 A2 2 0 1 1 5 3 A2 2 0 0 1 5 7 Z"/>`;
      out += `</g>`;
      metaCursorX += 13;
      const locText = node.location.toUpperCase();
      out += `<text x="${metaCursorX}" y="${metaY}" font-family="ui-monospace, 'JetBrains Mono', 'Menlo', monospace" font-size="9.5" font-weight="500" fill="#8C8474" letter-spacing="0.6">${escapeXml(locText)}</text>`;
      metaCursorX += locText.length * 6.2 + 10;
    }
    if (node.tenure) {
      const tenureText = node.tenure.toUpperCase();
      const pillW = tenureText.length * 5.6 + 14;
      out += `<rect x="${metaCursorX}" y="${metaY - 9}" width="${pillW}" height="14" rx="8" ry="8" fill="rgba(184,134,11,0.10)" stroke="rgba(184,134,11,0.30)" stroke-width="0.7"/>`;
      out += `<text x="${metaCursorX + pillW / 2}" y="${metaY}" text-anchor="middle" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="9" font-weight="600" fill="#946B2D" letter-spacing="0.6">${escapeXml(tenureText)}</text>`;
    }
  }

  // Body
  bodyLines.forEach((line, i) => {
    out += `<text x="${padL}" y="${bodyY + i * 15}" font-family="Inter, system-ui, sans-serif" font-size="11.5" fill="#4A3F30">${escapeXml(line)}</text>`;
  });

  out += `</g>`; // end clip group
  out += `</g>`; // end card group
  return out;
}

// ────────────────────────────────────────────────────────────────
// Build
// ────────────────────────────────────────────────────────────────
const teamRaw = JSON.parse(fs.readFileSync(TEAM_PATH, "utf8"));
const team = teamRaw.map((m) => {
  const { location, tenure } = extractLocationAndTenure(m.tags);
  return {
    slug: m.slug,
    name: m.name,
    role: m.role,
    reportsTo: m.reportsTo,
    body: m.body || "",
    location,
    tenure,
  };
});

const root = buildTree(team);
if (!root) throw new Error("No root node found in team.json");
const layout = layoutTree(root);

const canvasW = layout.width + PAD * 2;
const canvasH = layout.height + PAD * 2;

// Build links
const positionsBySlug = new Map(layout.nodes.map((p) => [p.node.slug, p]));
const links = [];
for (const p of layout.nodes) {
  const parentSlug = p.node.reportsTo;
  if (!parentSlug) continue;
  const parent = positionsBySlug.get(parentSlug);
  if (!parent) continue;
  links.push({ from: parent, to: p });
}

function pathFor(from, to) {
  const sx = from.x + PAD + NODE_W / 2;
  const sy = from.y + PAD + NODE_H;
  const tx = to.x + PAD + NODE_W / 2;
  const ty = to.y + PAD;
  const my = sy + (ty - sy) / 2;
  return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
}

// Header + footer banner sizes
const HEADER_H = 150;
const FOOTER_H = 70;
const SIDE_PAD = 60;

const totalW = canvasW + SIDE_PAD * 2;
const totalH = canvasH + HEADER_H + FOOTER_H;

// Stats
const totalPeople = team.length;
const coFounders = team.filter((m) => m.tenure === "Co-Founder").length;
const cities = new Set(
  team
    .map((m) => (m.location || "").split("/")[0].trim())
    .filter((l) => l && l !== "—")
).size;

// SVG header
let svg = "";
svg += `<?xml version="1.0" encoding="UTF-8"?>\n`;
svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`;

// Backdrop with subtle gradient
svg += `<defs>`;
svg += `<linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">`;
svg += `<stop offset="0%" stop-color="#FFFCF5"/>`;
svg += `<stop offset="100%" stop-color="#F7F3EC"/>`;
svg += `</linearGradient>`;
svg += `<radialGradient id="auraTop" cx="80%" cy="0%" r="50%">`;
svg += `<stop offset="0%" stop-color="rgba(200, 150, 46, 0.18)"/>`;
svg += `<stop offset="100%" stop-color="rgba(200, 150, 46, 0)"/>`;
svg += `</radialGradient>`;
svg += `<radialGradient id="auraBot" cx="15%" cy="100%" r="40%">`;
svg += `<stop offset="0%" stop-color="rgba(42, 125, 107, 0.12)"/>`;
svg += `<stop offset="100%" stop-color="rgba(42, 125, 107, 0)"/>`;
svg += `</radialGradient>`;
svg += `<pattern id="dotGrid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">`;
svg += `<circle cx="1" cy="1" r="1" fill="rgba(148, 107, 45, 0.10)"/>`;
svg += `</pattern>`;
svg += `</defs>`;

svg += `<rect width="${totalW}" height="${totalH}" fill="url(#bgGrad)"/>`;
svg += `<rect width="${totalW}" height="${totalH}" fill="url(#auraTop)"/>`;
svg += `<rect width="${totalW}" height="${totalH}" fill="url(#auraBot)"/>`;

// ── Header ────────────────────────────────────────────────────
const headerX = SIDE_PAD;
svg += `<g transform="translate(${headerX}, 38)">`;
// Eyebrow dot
svg += `<circle cx="6" cy="8" r="4" fill="#B8860B"/>`;
svg += `<text x="18" y="12" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="700" fill="#946B2D" letter-spacing="1.4">THE OBSERVATORY · ORGANIZATION</text>`;
// Title
svg += `<text x="0" y="48" font-family="'Newsreader','Iowan Old Style', Georgia, serif" font-size="40" font-weight="500" fill="#2C2517" letter-spacing="-0.8">AMI Labs Org Chart</text>`;
// Subtitle
svg += `<text x="0" y="76" font-family="Inter, system-ui, sans-serif" font-size="14" fill="#4A3F30">Reporting structure inferred from public announcements and LinkedIn. ${totalPeople} people · ${coFounders} co-founders · ${cities} cities.</text>`;
svg += `</g>`;

// Stats strip (right side of header)
const statsX = totalW - SIDE_PAD - 320;
svg += `<g transform="translate(${statsX}, 56)">`;
const stats = [
  { num: totalPeople, label: "PEOPLE MAPPED" },
  { num: coFounders, label: "CO-FOUNDERS" },
  { num: cities, label: "CITIES" },
];
stats.forEach((s, i) => {
  const sx = i * 110;
  svg += `<rect x="${sx}" y="0" width="2" height="48" fill="#D5CEBD"/>`;
  svg += `<text x="${sx + 14}" y="24" font-family="'Newsreader', Georgia, serif" font-size="26" font-weight="500" fill="#2C2517" letter-spacing="-0.5">${s.num}</text>`;
  svg += `<text x="${sx + 14}" y="42" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="700" fill="#8C8474" letter-spacing="1.2">${s.label}</text>`;
});
svg += `</g>`;

// Legend
const LEGEND = [
  { key: "chairman", label: "Chairman" },
  { key: "exec", label: "CEO" },
  { key: "ops", label: "Operations" },
  { key: "science", label: "Science" },
  { key: "research", label: "Research" },
  { key: "singapore", label: "Singapore" },
];
const legendY = HEADER_H - 26;
svg += `<g transform="translate(${SIDE_PAD}, ${legendY})">`;
let lx = 0;
LEGEND.forEach((it) => {
  const c = PALETTE[it.key];
  svg += `<circle cx="${lx + 5}" cy="6" r="5" fill="${c.a}"/>`;
  svg += `<text x="${lx + 16}" y="10" font-family="Inter, sans-serif" font-size="11.5" font-weight="500" fill="#4A3F30">${it.label}</text>`;
  lx += 16 + (it.label.length * 6.6) + 18;
});
svg += `</g>`;

// ── Canvas (with dotted background and gradient border) ──────
const canvasOX = SIDE_PAD;
const canvasOY = HEADER_H;
svg += `<g transform="translate(${canvasOX}, ${canvasOY})">`;
// Gradient border using stroke
svg += `<rect x="-6" y="-6" width="${canvasW + 12}" height="${canvasH + 12}" rx="14" ry="14" fill="none" stroke="#D5CEBD" stroke-width="1"/>`;
svg += `<rect x="0" y="0" width="${canvasW}" height="${canvasH}" rx="8" ry="8" fill="#FFFCF5"/>`;
svg += `<rect x="0" y="0" width="${canvasW}" height="${canvasH}" rx="8" ry="8" fill="url(#dotGrid)" opacity="0.7"/>`;

// Connectors
for (const l of links) {
  svg += `<path d="${pathFor(l.from, l.to)}" stroke="#BFB49D" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.85"/>`;
}

// Cards
for (const p of layout.nodes) svg += renderCard(p);

svg += `</g>`;

// ── Footer ───────────────────────────────────────────────────
const footerY = HEADER_H + canvasH + 28;
svg += `<text x="${totalW / 2}" y="${footerY}" text-anchor="middle" font-family="'Newsreader', Georgia, serif" font-style="italic" font-size="12" fill="#8C8474">AMI Labs · Advanced Machine Intelligence · ami-labs.com</text>`;

svg += `</svg>`;

fs.writeFileSync(SVG_PATH, svg);
console.log(`SVG written: ${SVG_PATH}  (${canvasW}×${canvasH} canvas, ${totalW}×${totalH} total)`);

// Convert SVG → PNG with 2× scale for crisp social media render
const scale = "2";
try {
  execFileSync("rsvg-convert", ["-z", scale, "-o", PNG_PATH, SVG_PATH], {
    stdio: "inherit",
  });
  const size = fs.statSync(PNG_PATH).size;
  console.log(`PNG written: ${PNG_PATH}  (${(size / 1024).toFixed(1)} KB, ${totalW * 2}×${totalH * 2}px)`);
} catch (err) {
  console.error("PNG conversion failed:", err.message);
  process.exit(1);
}
