/**
 * Fetches publications for each team member that has a semanticScholarId.
 *
 * Two passes per member:
 *   1. Top-cited  → data/publications.json (slug-keyed; powers team profiles). Unchanged shape.
 *   2. Most-recent → data/research.json (team-wide, date-sorted feed with tldr/abstract;
 *                    powers the /research page and the weekly synthesis analysis).
 *
 * Run manually: node scripts/fetch-publications.js
 * Run via GitHub Action: .github/workflows/fetch-publications.yml
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const TEAM_FILE = path.resolve(__dirname, "../data/team.json");
const PUBS_FILE = path.resolve(__dirname, "../data/publications.json");
const RESEARCH_FILE = path.resolve(__dirname, "../data/research.json");
const DELAY_MS = 1500; // be polite to the API

// Top-cited pass keeps profiles' "greatest hits". paperId added so the non-DOI fallback URL resolves.
const CITE_FIELDS = "title,year,citationCount,venue,externalIds,url,paperId,publicationDate";
// Recency pass carries the substance the synthesis analyses (tldr/abstract) + co-authorship.
const RECENT_FIELDS = "title,year,citationCount,venue,externalIds,url,paperId,publicationDate,abstract,tldr,authors";
const RECENT_FETCH_LIMIT = 15; // request this many newest, then keep RECENT_KEEP
const RECENT_KEEP = 8;
const ABSTRACT_MAX = 1200; // store a bounded abstract; the synthesis truncates further

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "AMI-Labs-Site/1.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function paperUrl(p) {
  const doi = p.externalIds?.DOI;
  return doi ? `https://doi.org/${doi}` : `https://www.semanticscholar.org/paper/${p.paperId}`;
}

// Best available date for sorting recency: publicationDate, else mid-year of `year`, else null (last).
function sortDateOf(p) {
  if (p.publicationDate) return p.publicationDate;
  if (p.year) return `${p.year}-07-01`;
  return null;
}

// ── pass 1: top-cited (profiles) ─────────────────────────────────────────────

async function fetchTopCited(id) {
  const url = `https://api.semanticscholar.org/graph/v1/author/${id}/papers` +
    `?fields=${CITE_FIELDS}&limit=10&sort=citationCount:desc`;
  const data = await get(url);
  return (data.data || []).slice(0, 5).map((p) => ({
    title: p.title,
    year: p.year,
    citationCount: p.citationCount,
    venue: p.venue || null,
    url: paperUrl(p),
  }));
}

// ── pass 2: most-recent (research feed) ──────────────────────────────────────

async function fetchRecent(id) {
  const url = `https://api.semanticscholar.org/graph/v1/author/${id}/papers` +
    `?fields=${RECENT_FIELDS}&limit=${RECENT_FETCH_LIMIT}&sort=publicationDate:desc`;
  const data = await get(url);
  const papers = (data.data || []).filter((p) => p.paperId && p.title);
  // Client-side sort by best date (desc, nulls last) in case the API sort is loose.
  papers.sort((a, b) => {
    const da = sortDateOf(a), db = sortDateOf(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da);
  });
  return papers.slice(0, RECENT_KEEP);
}

// Merge a member's recent paper into the team-wide map (dedupe co-authored papers by paperId).
function addRecentPaper(map, member, p) {
  const id = p.paperId;
  if (map.has(id)) {
    const e = map.get(id);
    if (!e.teamAuthors.some((a) => a.slug === member.slug)) {
      e.teamAuthors.push({ slug: member.slug, name: member.name });
    }
    return;
  }
  map.set(id, {
    paperId: id,
    title: p.title,
    teamAuthors: [{ slug: member.slug, name: member.name }],
    memberSlug: member.slug,
    memberName: member.name,
    publicationDate: p.publicationDate || null,
    year: p.year ?? null,
    venue: p.venue || null,
    url: paperUrl(p),
    citationCount: p.citationCount ?? 0,
    tldr: p.tldr?.text || null,
    abstract: p.abstract ? p.abstract.slice(0, ABSTRACT_MAX) : null,
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const team = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8"));
  const members = team.filter((m) => m.semanticScholarId);

  const existingPubs = fs.existsSync(PUBS_FILE) ? JSON.parse(fs.readFileSync(PUBS_FILE, "utf8")) : {};
  const existingResearch = fs.existsSync(RESEARCH_FILE)
    ? JSON.parse(fs.readFileSync(RESEARCH_FILE, "utf8"))
    : { papers: [] };

  const pubs = { ...existingPubs };
  const researchMap = new Map();
  const failedMembers = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    process.stdout.write(`[${member.name}] `);

    // pass 1 — top-cited (profiles)
    try {
      pubs[member.slug] = await fetchTopCited(member.semanticScholarId);
      process.stdout.write(`top-cited ${pubs[member.slug].length} · `);
    } catch (e) {
      process.stdout.write(`top-cited FAILED (${e.message}) · `);
    }

    await sleep(DELAY_MS);

    // pass 2 — most-recent (research feed)
    try {
      const recent = await fetchRecent(member.semanticScholarId);
      recent.forEach((p) => addRecentPaper(researchMap, member, p));
      console.log(`recent ${recent.length}`);
    } catch (e) {
      failedMembers.push(member.slug);
      console.log(`recent FAILED (${e.message})`);
    }

    if (i < members.length - 1) await sleep(DELAY_MS);
  }

  // Carry over papers contributed only by members whose recency fetch failed this run.
  for (const p of existingResearch.papers || []) {
    if (!p.teamAuthors?.some((a) => failedMembers.includes(a.slug))) continue;
    if (researchMap.has(p.paperId)) {
      const e = researchMap.get(p.paperId);
      for (const a of p.teamAuthors) {
        if (!e.teamAuthors.some((x) => x.slug === a.slug)) e.teamAuthors.push(a);
      }
    } else {
      researchMap.set(p.paperId, p);
    }
  }

  const papers = [...researchMap.values()].sort((a, b) => {
    const da = sortDateOf(a), db = sortDateOf(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da);
  });

  fs.writeFileSync(PUBS_FILE, JSON.stringify(pubs, null, 2));
  fs.writeFileSync(RESEARCH_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), papers }, null, 2));
  console.log(`\nWrote ${PUBS_FILE}`);
  console.log(`Wrote ${RESEARCH_FILE} (${papers.length} papers)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
