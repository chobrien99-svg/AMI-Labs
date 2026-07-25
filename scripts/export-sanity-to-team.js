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
 * SANITY_API_READ_TOKEN may be set to include unpublished/draft edits.
 *
 * Env:
 *   SANITY_API_READ_TOKEN  — optional; only needed to read drafts.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const SANITY = { projectId: "k8hl9hed", dataset: "production", apiVersion: "2024-01-01" };
const OUT_FILE = path.resolve(__dirname, "../data/team.json");
const TOKEN = process.env.SANITY_API_READ_TOKEN;

// Pull every published person, mapped to the team.json shape. reportsTo is flattened to
// the manager's slug; the photo asset URL is exposed so we can fall back to it when a
// person has no committed git-native portrait.
const GROQ =
  '*[_type == "person" && !(_id in path("drafts.**"))] | order(name asc){' +
  '"slug": slug.current, name, role, body, tags, department,' +
  '"reportsTo": reportsTo->slug.current,' +
  '"sanityPhotoUrl": photo.asset->url,' +
  "biography, careerHistory, links, semanticScholarId" +
  "}";

function sanityQuery(groq) {
  const url =
    `https://${SANITY.projectId}.api.sanity.io/v${SANITY.apiVersion}/data/query/${SANITY.dataset}` +
    `?query=${encodeURIComponent(groq)}` +
    (TOKEN ? "" : "&perspective=published");
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

// Existing team.json → slug map, so we can preserve committed git-native portraits
// (/team/<name>.jpg) that don't live in Sanity.
function existingImages() {
  try {
    const cur = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    return new Map(cur.filter((m) => m && m.slug && m.image).map((m) => [m.slug, m.image]));
  } catch {
    return new Map();
  }
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

  const priorImages = existingImages();

  const team = persons
    .filter((p) => p && p.slug && p.name)
    .map((p) =>
      compact({
        slug: p.slug,
        name: p.name,
        // Prefer a committed git-native portrait; fall back to the Sanity CDN photo.
        image: priorImages.get(p.slug) || p.sanityPhotoUrl || undefined,
        role: p.role,
        body: p.body,
        tags: p.tags,
        department: p.department,
        reportsTo: p.reportsTo,
        biography: p.biography,
        careerHistory: p.careerHistory,
        links: p.links,
        semanticScholarId: p.semanticScholarId,
      })
    );

  fs.writeFileSync(OUT_FILE, JSON.stringify(team, null, 2) + "\n");

  const withGithub = team.filter((m) => m.links && m.links.github).length;
  const withS2 = team.filter((m) => m.semanticScholarId).length;
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`  ${team.length} people · ${withGithub} with GitHub · ${withS2} with Semantic Scholar ID`);
}

main().catch((e) => { console.error(e); process.exit(1); });
