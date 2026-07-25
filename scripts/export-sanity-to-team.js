/**
 * Regenerates data/team.json from Sanity — the single source of truth for the roster.
 *
 * This is the inverse of import-team-to-sanity.js. People are added and edited in Sanity;
 * this script pulls every published person document and writes the git-native team.json
 * cache that the site's fallback path and the data pipelines (GitHub, publications, news)
 * read. Run it whenever the roster changes so team.json never drifts out of date.
 *
 * Run with:
 *   node scripts/export-sanity-to-team.js
 *
 * The production dataset is publicly readable, so no token is required. An optional
 * SANITY_API_READ_TOKEN may be set to read a private dataset (it does NOT include drafts —
 * the query excludes draft documents so the cache only ever contains published people).
 *
 * Env:
 *   SANITY_API_READ_TOKEN  — optional; only needed to authenticate against a private dataset.
 *
 * Cache contract notes (why some Sanity fields are handled specially):
 *   - biography: team.json stores a Markdown STRING (generated/maintained by
 *     update-profiles.js), while Sanity stores Portable Text blocks. Writing the block
 *     array here would break update-profiles.js (which measures biography.length as a
 *     character count) and the site's string-fallback path. So we preserve the existing
 *     committed biography string and never emit Sanity's blocks; people with no cached
 *     biography get one on the next update-profiles run. The live site reads the rich
 *     Portable Text biography from Sanity directly regardless.
 *   - image: prefer a committed git-native portrait (/team/*.jpg); otherwise use Sanity's
 *     photo URL so photo changes in the CMS propagate.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const SANITY = { projectId: "k8hl9hed", dataset: "production", apiVersion: "2024-01-01" };
const OUT_FILE = path.resolve(__dirname, "../data/team.json");
const TOKEN = process.env.SANITY_API_READ_TOKEN;

// Pull every published person, mapped to the team.json shape. reportsTo is flattened to
// the manager's slug; the photo asset URL is exposed so we can fall back to it when a
// person has no committed git-native portrait. biography is intentionally NOT fetched —
// see the cache-contract note above.
const GROQ =
  '*[_type == "person" && !(_id in path("drafts.**"))] | order(name asc){' +
  '"slug": slug.current, name, role, body, tags, department,' +
  '"reportsTo": reportsTo->slug.current,' +
  '"sanityPhotoUrl": photo.asset->url,' +
  "careerHistory, links, semanticScholarId" +
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
        if (res.statusCode !== 200) {
          reject(new Error(`Sanity HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(data).result || []); }
        catch { reject(new Error(`Bad JSON from Sanity: ${data.slice(0, 300)}`)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Sanity request timed out")); });
  });
}

// A committed portrait is a repo-relative path like "/team/Name.jpg"; a Sanity photo is an
// absolute https URL. Only the former should survive a resync — Sanity is authoritative for
// the latter, so a re-queried Sanity URL must always win over a previously-cached one.
const isGitNativePortrait = (s) => typeof s === "string" && s.startsWith("/");

// Read the current team.json once, indexed by slug, so we can preserve values the cache
// owns (committed portraits, the Markdown biography string) across a resync.
function loadPrior() {
  try {
    const cur = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    return new Map(cur.filter((m) => m && m.slug).map((m) => [m.slug, m]));
  } catch {
    return new Map();
  }
}

// Strip Sanity object metadata (_key/_type) from careerHistory entries for a clean cache.
function cleanCareerHistory(entries) {
  if (!Array.isArray(entries)) return undefined;
  return entries
    .map((e) => (e && typeof e === "object"
      ? { org: e.org, title: e.title, years: e.years }
      : null))
    .filter((e) => e && (e.org || e.title || e.years));
}

// Drop null/undefined/empty so the cache stays clean and diffs stay small.
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

async function main() {
  console.log(`Reading persons from Sanity (${SANITY.projectId}/${SANITY.dataset})…`);
  const persons = await sanityQuery(GROQ);
  if (!Array.isArray(persons) || persons.length === 0) {
    // Never clobber a good roster with an empty read (transient outage, bad query).
    throw new Error("Sanity returned no persons — refusing to overwrite team.json.");
  }

  const prior = loadPrior();

  const team = persons
    .filter((p) => p && p.slug && p.name)
    .map((p) => {
      const priorMember = prior.get(p.slug) || {};
      const priorImage = priorMember.image;
      // Preserve a committed portrait; otherwise let the (authoritative) Sanity photo win.
      const image = isGitNativePortrait(priorImage) ? priorImage : (p.sanityPhotoUrl || undefined);
      // biography is a Markdown string owned by the cache/update-profiles — preserve it,
      // never overwrite with Sanity's Portable Text blocks.
      const biography = typeof priorMember.biography === "string" ? priorMember.biography : undefined;

      return compact({
        slug: p.slug,
        name: p.name,
        image,
        role: p.role,
        body: p.body,
        tags: p.tags,
        department: p.department,
        reportsTo: p.reportsTo,
        biography,
        careerHistory: cleanCareerHistory(p.careerHistory),
        links: p.links,
        semanticScholarId: p.semanticScholarId,
      });
    });

  fs.writeFileSync(OUT_FILE, JSON.stringify(team, null, 2) + "\n");

  const withGithub = team.filter((m) => m.links && m.links.github).length;
  const withS2 = team.filter((m) => m.semanticScholarId).length;
  const withBio = team.filter((m) => m.biography).length;
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`  ${team.length} people · ${withGithub} with GitHub · ${withS2} with Semantic Scholar ID · ${withBio} with cached biography`);
}

main().catch((e) => { console.error(e); process.exit(1); });
