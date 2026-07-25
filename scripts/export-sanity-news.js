// ============================================================================
// AMI Observatory — sync Sanity articles → data/news.json
// ----------------------------------------------------------------------------
// Manually-authored articles live only in Sanity; the dossier/report pipeline
// reads data/news.json. This read-only sync mirrors export-sanity-to-team.js:
// it pulls visible Sanity articles (with their curated `people` references) and
// MERGES them into news.json so a human-tagged article flows into the per-person
// dossiers and the report.
//
// People precedence: the people you tag on an article in the Studio are
// authoritative. If an article is left untagged, we fall back to the same
// conservative full-name detector the news bot uses, so nothing is orphaned.
//
//   node scripts/export-sanity-news.js
//
// Read-only from Sanity (public dataset; optional SANITY_API_READ_TOKEN for a
// private one). Refuses to touch news.json on an empty/failed read.
// ============================================================================

const https = require("https");
const fs = require("fs");
const path = require("path");
const { buildMentionIndex, detectPeople } = require("./lib/detect-people");

const SANITY = { projectId: "k8hl9hed", dataset: "production", apiVersion: "2024-01-01" };
const TOKEN = process.env.SANITY_API_READ_TOKEN;
const NEWS_FILE = path.resolve(__dirname, "../data/news.json");
const TEAM_FILE = path.resolve(__dirname, "../data/team.json");

// Visible articles (approved or status-less), newest first, with people slugs resolved.
// The reviewStatus filter is the guard that keeps rejected/pending articles out of the cache.
const GROQ =
  '*[_type == "article" && !(_id in path("drafts.**")) && (reviewStatus == "approved" || !defined(reviewStatus))] | order(publishedAt desc){' +
  "_id, title, source, externalUrl, publishedAt, summary, tags, score," +
  '"slug": slug.current,' +
  '"people": people[]->{ "slug": slug.current, name }' +
  "}";

function sanityQuery(groq) {
  const url =
    `https://${SANITY.projectId}.api.sanity.io/v${SANITY.apiVersion}/data/query/${SANITY.dataset}` +
    `?query=${encodeURIComponent(groq)}&perspective=published`;
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "AMI-Labs-Site/1.0", Accept: "application/json" };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode !== 200) { reject(new Error(`Sanity HTTP ${res.statusCode}: ${data.slice(0, 300)}`)); return; }
        try { resolve(JSON.parse(data).result || []); }
        catch { reject(new Error(`Bad JSON from Sanity: ${data.slice(0, 300)}`)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Sanity request timed out")); });
  });
}

// ── pure helpers (exported for tests) ────────────────────────────────────────

// Match the site's URL derivation exactly (app/news/page.tsx): externalUrl, else the
// on-site permalink. This keeps dedup and the git-native image join aligned.
function deriveUrl(article) {
  return article.externalUrl || `/news/${article.slug || article._id}`;
}

// Curated Studio tags win; otherwise best-effort detection from title + summary.
function articleToPeople(article, detectIndex) {
  const curated = (article.people || []).map((p) => p && p.slug).filter(Boolean);
  if (curated.length) return [...new Set(curated)];
  return detectPeople(`${article.title || ""}. ${article.summary || ""}`, detectIndex);
}

const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);

// Merge Sanity articles into the existing news.json rows without clobbering.
function mergeNews(existing, sanityArticles, { detectIndex, now }) {
  const rows = (existing || []).map((r) => ({ ...r }));
  const bySanityId = new Map();
  const byUrl = new Map();
  for (const r of rows) {
    if (r.sanityId) bySanityId.set(r.sanityId, r);
    if (r.url) byUrl.set(r.url, r);
  }

  const fresh = [];
  for (const s of sanityArticles || []) {
    if (!s || !s._id) continue;
    const url = deriveUrl(s);
    const people = articleToPeople(s, detectIndex);
    const owned = bySanityId.get(s._id); // a row this script created
    const match = owned || byUrl.get(url);

    if (match) {
      if (people.length) match.people = people; else delete match.people;
      if (owned) {
        // We own this row → propagate later Studio edits to the Sanity-sourced fields.
        match.title = s.title;
        match.source = s.source || "";
        match.summary = s.summary || "";
        match.tags = s.tags || [];
        match.score = s.score ?? null;
        match.publishedAt = dateOnly(s.publishedAt);
        match.url = url;
      }
      // Matched a bot row by URL only: refresh people, leave bot-owned fields untouched.
      continue;
    }

    // New manual article → a fresh row (id == Sanity _id, same convention the site uses).
    const row = {
      id: s._id,
      sanityId: s._id,
      title: s.title,
      source: s.source || "",
      url,
      publishedAt: dateOnly(s.publishedAt),
      summary: s.summary || "",
      tags: s.tags || [],
      score: s.score ?? null,
      status: "approved",
      addedAt: now,
      image: null,
    };
    if (people.length) row.people = people;
    fresh.push(row);
    bySanityId.set(s._id, row); // guard against duplicate incoming ids in one run
    byUrl.set(url, row);
  }

  // Newest-first among the newly-added rows, prepended (mirrors update-news.js ordering).
  fresh.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  return [...fresh, ...rows];
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const articles = await sanityQuery(GROQ);
  if (!Array.isArray(articles) || articles.length === 0) {
    // Never wipe a good cache on a transient outage or a bad query.
    throw new Error("Sanity returned no articles — refusing to touch news.json.");
  }

  let team = [];
  try { team = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8")); } catch { /* empty roster → detector no-ops */ }
  const detectIndex = buildMentionIndex(team);

  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(NEWS_FILE, "utf8")); } catch { /* first run */ }

  const merged = mergeNews(existing, articles, { detectIndex, now: new Date().toISOString() });

  // Match update-news.js serialization exactly (2-space, NO trailing newline) to avoid churn.
  fs.writeFileSync(NEWS_FILE, JSON.stringify(merged, null, 2));

  const added = merged.length - existing.length;
  const tagged = articles.filter((a) => (a.people || []).length).length;
  console.log(`Synced ${articles.length} Sanity article(s) → news.json (${added} new row(s)); ${tagged} carry curated people tags.`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { mergeNews, articleToPeople, deriveUrl };
