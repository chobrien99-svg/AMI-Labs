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
const { buildResolver } = require("./lib/resolve-identity");

const TEAM_FILE = path.resolve(__dirname, "../data/team.json");
const PUBS_FILE = path.resolve(__dirname, "../data/publications.json");
const RESEARCH_FILE = path.resolve(__dirname, "../data/research.json");
const SANITY = { projectId: "k8hl9hed", dataset: "production", apiVersion: "2024-01-01" };
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
// Newest papers kept per member (across all their profiles) for the research feed.
// Raised from 8 → 40 so a ~6-month window is captured even for prolific authors
// (e.g. LeCun across 3 profiles) — the six-month report and dossiers draw on this.
// The /research page still ships only the newest 40 team-wide (FEED_CAP), so this
// grows the data file server-side without adding client weight.
const RECENT_KEEP = 40;
const ABSTRACT_MAX = 1200; // store a bounded abstract; the synthesis truncates further

function requestJson(method, url, body, tries = 2, extraHeaders = {}) {
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
          ...extraHeaders,
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
            setTimeout(() => requestJson(method, url, body, tries - 1, extraHeaders).then(resolve, reject), RETRY_MS);
          } else {
            reject(new Error(`HTTP ${status} for ${method} ${url}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      if (tries > 0) setTimeout(() => requestJson(method, url, body, tries - 1, extraHeaders).then(resolve, reject), RETRY_MS);
      else reject(err);
    });
    req.setTimeout(20000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    if (payload) req.write(payload);
    req.end();
  });
}

function get(url, extraHeaders) { return requestJson("GET", url, null, 2, extraHeaders); }
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

// Read Semantic Scholar IDs straight from Sanity persons, so a researcher added in Sanity
// (with the ID filled in) gets a feed without a team.json edit. Uses the public read API;
// passes a read token if one is available (for private datasets). Degrades to [] on any error.
async function fetchSanityMembers() {
  const groq =
    '*[_type == "person" && !(_id in path("drafts.**")) && defined(semanticScholarId)]' +
    '{ "slug": slug.current, name, semanticScholarId }';
  const url =
    `https://${SANITY.projectId}.api.sanity.io/v${SANITY.apiVersion}/data/query/${SANITY.dataset}` +
    `?query=${encodeURIComponent(groq)}&perspective=published`;
  const token = process.env.SANITY_API_READ_TOKEN;
  try {
    const data = await get(url, token ? { Authorization: `Bearer ${token}` } : undefined);
    // ok:true even when empty — distinguishes "Sanity has no such authors" from an outage.
    return { ok: true, members: (data.result || []).filter((p) => p && p.slug && idsOf(p).length) };
  } catch (e) {
    console.warn(`[sanity] Could not read persons (${e.message}) — using team.json only.`);
    return { ok: false, members: [] };
  }
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

// Top-cited across ALL of a member's author profiles: fetch each, merge (dedupe by paperId),
// re-rank by citation count, keep the top 5. A single failed alternate profile does not discard
// results already gathered from the member's other profiles.
async function fetchTopCited(ids) {
  const seen = new Map();
  let anyOk = false, anyError = false;
  for (let i = 0; i < ids.length; i++) {
    try {
      const url = `https://api.semanticscholar.org/graph/v1/author/${ids[i]}/papers` +
        `?fields=${CITE_FIELDS}&limit=10&sort=citationCount:desc`;
      const data = await get(url);
      for (const p of data.data || []) if (p.paperId && !seen.has(p.paperId)) seen.set(p.paperId, p);
      anyOk = true;
    } catch (e) {
      anyError = true;
      console.error(`\n  ⚠ top-cited profile ${ids[i]} failed: ${e.message}`);
    }
    if (i < ids.length - 1) await sleep(DELAY_MS);
  }
  if (!anyOk && anyError) throw new Error("all author profiles failed");
  return [...seen.values()]
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 5)
    .map((p) => ({
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
  let anyOk = false;
  let anyError = false;
  for (let i = 0; i < ids.length; i++) {
    // Isolate each profile: one stale/failed alternate ID must not discard the papers
    // already gathered from the member's valid profiles.
    try {
      const papers = await fetchAuthorPaperDates(ids[i]);
      for (const p of papers) if (!seen.has(p.paperId)) seen.set(p.paperId, p);
      anyOk = true;
    } catch (e) {
      anyError = true;
      console.error(`\n  ⚠ profile ${ids[i]} failed: ${e.message}`);
    }
    if (i < ids.length - 1) await sleep(DELAY_MS);
  }
  // Only surface a failure (so the caller preserves the member's prior papers via carry-over)
  // when EVERY profile errored — a partial failure still uses whatever succeeded.
  if (!anyOk && anyError) throw new Error("all author profiles failed");
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
// Resolve the paper's FULL author list (from Semantic Scholar) to canonical people where
// possible — matching by S2 author id, then by name. Outside collaborators stay in the list
// with slug:null. This is what makes co-authorship (e.g. a member + Yann LeCun) queryable.
function resolveAuthors(p, resolver) {
  if (!Array.isArray(p.authors)) return [];
  return p.authors.map((a) => {
    const person = resolver.bySemanticScholarId(a.authorId) || resolver.byName(a.name);
    return { name: a.name || null, authorId: a.authorId || null, slug: person ? person.slug : null };
  });
}

// Every AMI author on the paper (any position), by roster slug — deduped, roster names.
function teamAuthorsFrom(authors, member, resolver) {
  const seen = new Set();
  const out = [];
  for (const a of authors) {
    if (a.slug && !seen.has(a.slug)) {
      seen.add(a.slug);
      const person = resolver.bySlug(a.slug);
      out.push({ slug: a.slug, name: (person && person.name) || a.name });
    }
  }
  // Safety net: credit the profile the paper was fetched under even if name/id resolution missed it.
  if (!seen.has(member.slug)) out.push({ slug: member.slug, name: member.name });
  return out;
}

function addRecentPaper(map, member, p, resolver) {
  const id = p.paperId;
  const authors = resolveAuthors(p, resolver); // full author list with resolved slugs (co-authorship)
  const teamAuthors = teamAuthorsFrom(authors, member, resolver);
  if (map.has(id)) {
    // Union in any AMI authors not already credited (e.g. seen first under a different profile).
    const e = map.get(id);
    for (const t of teamAuthors) if (!e.teamAuthors.some((a) => a.slug === t.slug)) e.teamAuthors.push(t);
    return;
  }
  map.set(id, {
    paperId: id,
    title: p.title,
    teamAuthors, // ALL AMI authors on the paper, regardless of listed position
    authors,
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
  const resolver = buildResolver(team); // maps paper authors (S2 id / name) → person slug

  // Unify Semantic Scholar authors from team.json (git-native seed) and Sanity (CMS). A person's
  // IDs from both sources are merged by slug, so either source can add a researcher — or an extra
  // author profile — and nothing regresses if Sanity is unreachable (it just falls back to team.json).
  const bySlug = new Map();
  const addSource = (slug, name, ssid) => {
    if (!slug) return;
    const cur = bySlug.get(slug) || { slug, name, ids: new Set() };
    if (name && !cur.name) cur.name = name;
    for (const id of idsOf({ semanticScholarId: ssid })) cur.ids.add(String(id));
    bySlug.set(slug, cur);
  };
  for (const m of team) if (m.semanticScholarId) addSource(m.slug, m.name, m.semanticScholarId);
  const sanity = await fetchSanityMembers();
  for (const p of sanity.members) addSource(p.slug, p.name, p.semanticScholarId);

  const members = [...bySlug.values()]
    .filter((m) => m.ids.size)
    .map((m) => ({ slug: m.slug, name: m.name || m.slug, semanticScholarId: [...m.ids] }));
  const knownSlugs = new Set(members.map((m) => m.slug));
  console.log(`Members with Semantic Scholar IDs: ${members.length} (team.json: ${team.filter((m) => m.semanticScholarId).length}, Sanity: ${sanity.members.length}${sanity.ok ? "" : ", OUTAGE"}).`);

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

    // pass 1 — top-cited across all of the member's profiles (profiles' greatest hits)
    try {
      pubs[member.slug] = await fetchTopCited(ids);
      process.stdout.write(`top-cited ${pubs[member.slug].length} · `);
    } catch (e) {
      process.stdout.write(`top-cited FAILED (${e.message}) · `);
    }

    await sleep(DELAY_MS);

    // pass 2 — most-recent across all of the member's profiles (research feed)
    try {
      const recent = await fetchRecent(ids);
      recent.forEach((p) => addRecentPaper(researchMap, member, p, resolver));
      console.log(`recent ${recent.length}`);
    } catch (e) {
      failedMembers.push(member.slug);
      console.log(`recent FAILED (${e.message})`);
    }

    if (i < members.length - 1) await sleep(DELAY_MS);
  }

  // Carry over papers we couldn't refresh this run, so a transient failure never deletes data:
  //   • a known member whose recency fetch failed (failedMembers), OR
  //   • an author missing from this run entirely because Sanity was unreachable — otherwise a
  //     Sanity-only researcher's papers would be dropped on an outage (they're never in members
  //     and so never in failedMembers). When Sanity read OK, an absent author is a real removal.
  const unrefreshable = (a) => failedMembers.includes(a.slug) || (!sanity.ok && !knownSlugs.has(a.slug));
  for (const p of existingResearch.papers || []) {
    if (!p.teamAuthors?.some(unrefreshable)) continue;
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
