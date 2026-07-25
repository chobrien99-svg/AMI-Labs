// ============================================================================
// AMI Observatory — identity resolver
// ----------------------------------------------------------------------------
// One place that maps any external identifier a data source might carry — a
// GitHub username, a Semantic Scholar author ID, an X/Twitter handle, or a
// plain name — back to the canonical person `slug` from the roster (team.json,
// which is generated from Sanity). Every pipeline should resolve identity
// through this module instead of keying by name/username/id in its own way, so
// the same person never fragments across data files.
//
// Pure and deterministic — no network. Build once from a roster array, then
// look people up:
//
//   const { loadResolver } = require("./lib/resolve-identity");
//   const resolver = loadResolver();                 // reads data/team.json
//   resolver.byGithub("mavenlin")?.slug;             // -> "min-lin"
//   resolver.slugFor({ xUsername: "ylecun" });       // -> "yann-lecun"
// ============================================================================

const fs = require("fs");
const path = require("path");

const TEAM_FILE = path.resolve(__dirname, "../../data/team.json");

// ── normalization helpers ───────────────────────────────────────────────────

// A GitHub profile link (or bare username) → lowercase username, or "".
function githubUsername(v) {
  if (!v || typeof v !== "string") return "";
  let s = v.trim();
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.replace(/^@/, "").replace(/\/+$/, "");
  s = s.split(/[/?#]/)[0]; // first path segment only
  return s.toLowerCase();
}

// An X/Twitter link, @handle, or bare handle → lowercase handle, or "".
function twitterHandle(v) {
  if (!v || typeof v !== "string") return "";
  let s = v.trim();
  s = s.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "");
  s = s.replace(/^@/, "").replace(/\/+$/, "");
  s = s.split(/[/?#]/)[0];
  return s.toLowerCase();
}

// Names: strip diacritics, lowercase, collapse whitespace. So "Basile Terver",
// "  basile   terver " and "Basile Térver" all key the same.
function normName(v) {
  if (!v || typeof v !== "string") return "";
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// semanticScholarId may be a single string or an array of strings.
function semanticScholarIds(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((x) => (x == null ? "" : String(x).trim())).filter(Boolean);
}

// ── resolver ────────────────────────────────────────────────────────────────

function buildResolver(roster, { onCollision } = {}) {
  const people = Array.isArray(roster) ? roster.filter((p) => p && p.slug) : [];

  const bySlugMap = new Map();
  const byGithubMap = new Map();
  const byS2Map = new Map();
  const byTwitterMap = new Map();
  const byNameMap = new Map();

  const warn = onCollision || ((key, kind, existingSlug, slug) =>
    console.warn(`[resolve-identity] ${kind} "${key}" maps to both "${existingSlug}" and "${slug}" — keeping "${existingSlug}".`));

  // First registration wins; later duplicates are reported, not overwritten.
  const register = (map, key, person, kind) => {
    if (!key) return;
    const existing = map.get(key);
    if (existing && existing.slug !== person.slug) { warn(key, kind, existing.slug, person.slug); return; }
    if (!existing) map.set(key, person);
  };

  for (const p of people) {
    register(bySlugMap, p.slug, p, "slug");
    register(byGithubMap, githubUsername(p.links && p.links.github), p, "github");
    register(byTwitterMap, twitterHandle(p.links && p.links.twitter), p, "twitter");
    register(byNameMap, normName(p.name), p, "name");
    for (const id of semanticScholarIds(p.semanticScholarId)) register(byS2Map, id, p, "semanticScholarId");
  }

  const bySlug = (v) => (v ? bySlugMap.get(String(v).trim()) || null : null);
  const byGithub = (v) => byGithubMap.get(githubUsername(v)) || null;
  const byTwitter = (v) => byTwitterMap.get(twitterHandle(v)) || null;
  const byName = (v) => byNameMap.get(normName(v)) || null;
  const bySemanticScholarId = (v) => {
    for (const id of semanticScholarIds(v)) { const p = byS2Map.get(id); if (p) return p; }
    return null;
  };

  // Try identifiers strongest-first: slug > github > S2 id > X handle > name.
  // `xUsername`/`twitter` are interchangeable inputs for the handle.
  function resolve(input) {
    if (!input) return null;
    // A bare string is tried against every identifier map, strongest-first, matching the
    // object path below. Stronger lookups miss cleanly on unrelated strings (e.g. an S2 id
    // isn't a github username), so ordering stays safe.
    if (typeof input === "string") {
      return bySlug(input) || byGithub(input) || bySemanticScholarId(input) || byTwitter(input) || byName(input);
    }
    return (
      bySlug(input.slug) ||
      byGithub(input.github) ||
      bySemanticScholarId(input.semanticScholarId) ||
      byTwitter(input.twitter || input.xUsername) ||
      byName(input.name) ||
      null
    );
  }

  const slugFor = (input) => { const p = resolve(input); return p ? p.slug : null; };

  return {
    roster: people,
    bySlug, byGithub, byTwitter, byName, bySemanticScholarId,
    resolve, slugFor,
  };
}

function loadResolver(opts) {
  let roster = [];
  try { roster = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8")); }
  catch (e) { console.warn(`[resolve-identity] could not read team.json (${e.message}) — resolver is empty.`); }
  return buildResolver(roster, opts);
}

module.exports = {
  buildResolver,
  loadResolver,
  // normalization helpers, exported so pipelines can reuse them for parsing.
  githubUsername,
  twitterHandle,
  normName,
  semanticScholarIds,
};
