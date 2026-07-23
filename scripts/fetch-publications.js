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
const RETRY_MS = 3000; // backoff on 429 / 5xx

// Top-cited pass keeps profiles' "greatest hits". paperId added so the non-DOI fallback URL resolves.
const CITE_FIELDS = "title,year,citationCount,venue,externalIds,url,paperId,publicationDate";
// Recency: the author/papers endpoint rejects a publicationDate sort (HTTP 400), so we page through
// its papers with light fields, rank by date client-side, then fetch rich fields for the newest few
// via the /paper/batch endpoint (which supports abstract/tldr/authors).
const DATE_FIELDS = "paperId,publicationDate,year";
const BATCH_FIELDS = "paperId,title,year,venue,externalIds,url,citationCount,publicationDate,abstract,tldr,authors";
const PAGE_SIZE = 100;
const MAX_PAGES = 10; // cap per author profile (up to 1000 papers)
const RECENT_KEEP = 8;
const ABSTRACT_MAX = 1200; // store a bounded abstract; the synthesis truncates further

function requestJson(method, url, body, tries = 2) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const u = new URL(url);
    const req = https.request(
      {
        method,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          "User-Agent": "AMI-Labs-Site/1.0",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const status = res.statusCode;
          if (status === 200) {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error(`Bad JSON for ${method} ${url}`)); }
          } else if ((status === 429 || status >= 500) && tries > 0) {
            setTimeout(() => requestJson(method, url, body, tries - 1).then(resolve, reject), RETRY_MS);
          } else {
            reject(new Error(`HTTP ${status} for ${method} ${url}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      if (tries > 0) setTimeout(() => requestJson(method, url, body, tries - 1).then(resolve, reject), RETRY_MS);
      else reject(err);
    });
    req.setTimeout(20000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    if (payload) req.write(payload);
    req.end();
  });
}

function get(url) { return requestJson("GET", url); }
function postJson(url, body) { return requestJson("POST", url, body); }

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// A member's semanticScholarId may be a string or an array (authors can be split across
// multiple Semantic Scholar profiles — e.g. landmark vs. recent work under different IDs).
function idsOf(member) {
  const v = member.semanticScholarId;
  return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];
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

function byDateDesc(a, b) {
  const da = sortDateOf(a), db = sortDateOf(b);
  if (!da && !db) return 0;
  if (!da) return 1;   // nulls last
  if (!db) return -1;
  return db.localeCompare(da);
}

// Page through one author profile's papers with light fields (no sort — the endpoint 400s
// on a publicationDate sort). Returns [{paperId, publicationDate, year}].
async function fetchAuthorPaperDates(id) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `https://api.semanticscholar.org/graph/v1/author/${id}/papers` +
      `?fields=${DATE_FIELDS}&offset=${offset}&limit=${PAGE_SIZE}`;
    const data = await get(url);
    const batch = (data.data || []).filter((p) => p.paperId);
    out.push(...batch);
    if (data.next == null || batch.length === 0) break;
    offset = data.next;
    await sleep(DELAY_MS);
  }
  return out;
}

// Gather papers across all of a member's author profiles, rank by date, and fetch rich
// fields for the newest RECENT_KEEP via the batch endpoint (which supports abstract/tldr/authors).
async function fetchRecent(ids) {
  const seen = new Map();
  for (let i = 0; i < ids.length; i++) {
    const papers = await fetchAuthorPaperDates(ids[i]);
    for (const p of papers) if (!seen.has(p.paperId)) seen.set(p.paperId, p);
    if (i < ids.length - 1) await sleep(DELAY_MS);
  }
  const topIds = [...seen.values()].sort(byDateDesc).slice(0, RECENT_KEEP).map((p) => p.paperId);
  if (!topIds.length) return [];

  await sleep(DELAY_MS);
  const url = `https://api.semanticscholar.org/graph/v1/paper/batch?fields=${BATCH_FIELDS}`;
  const details = await postJson(url, { ids: topIds });
  const byId = new Map();
  for (const p of details || []) if (p && p.paperId && p.title) byId.set(p.paperId, p);
  return topIds.map((id) => byId.get(id)).filter(Boolean); // preserve date order
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
    const ids = idsOf(member);
    process.stdout.write(`[${member.name}] `);

    // pass 1 — top-cited from the primary profile (profiles' greatest hits)
    try {
      pubs[member.slug] = await fetchTopCited(ids[0]);
      process.stdout.write(`top-cited ${pubs[member.slug].length} · `);
    } catch (e) {
      process.stdout.write(`top-cited FAILED (${e.message}) · `);
    }

    await sleep(DELAY_MS);

    // pass 2 — most-recent across all of the member's profiles (research feed)
    try {
      const recent = await fetchRecent(ids);
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
