/**
 * Fetches top 5 publications by citation count for each team member
 * that has a semanticScholarId, and writes results to data/publications.json.
 *
 * Run manually: node scripts/fetch-publications.js
 * Run via GitHub Action: .github/workflows/fetch-publications.yml
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const TEAM_FILE = path.resolve(__dirname, "../data/team.json");
const OUT_FILE = path.resolve(__dirname, "../data/publications.json");
const DELAY_MS = 1500; // be polite to the API

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

async function fetchForMember(slug, id) {
  const url = `https://api.semanticscholar.org/graph/v1/author/${id}/papers` +
    `?fields=title,year,citationCount,venue,externalIds,url&limit=10&sort=citationCount:desc`;
  const data = await get(url);
  return (data.data || []).slice(0, 5).map((p) => {
    const doi = p.externalIds?.DOI;
    return {
      title: p.title,
      year: p.year,
      citationCount: p.citationCount,
      venue: p.venue || null,
      url: doi
        ? `https://doi.org/${doi}`
        : `https://www.semanticscholar.org/paper/${p.paperId}`,
    };
  });
}

async function main() {
  const team = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8"));
  const members = team.filter((m) => m.semanticScholarId);

  // Load existing data so we can preserve entries for members not being re-fetched
  let existing = {};
  if (fs.existsSync(OUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
  }

  const result = { ...existing };
  let fetched = 0;

  for (const member of members) {
    process.stdout.write(`[${member.name}] fetching… `);
    try {
      result[member.slug] = await fetchForMember(member.slug, member.semanticScholarId);
      console.log(`${result[member.slug].length} papers`);
      fetched++;
    } catch (e) {
      console.error(`FAILED: ${e.message}`);
      // Keep existing data if available
    }
    if (fetched < members.length) await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
