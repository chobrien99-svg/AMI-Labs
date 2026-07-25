// ============================================================================
// AMI Observatory — identity coverage audit
// ----------------------------------------------------------------------------
// Read-only report over data/team.json (the Sanity-derived roster). Shows which
// people are missing the external identifiers the data pipelines rely on, so the
// gaps can be filled in Sanity. Also surfaces any identifier collisions the
// resolver would hit. No network; safe to run anytime.
//
//   node scripts/audit-identity-coverage.js
// ============================================================================

const fs = require("fs");
const path = require("path");
const { buildResolver, semanticScholarIds } = require("./lib/resolve-identity");

const TEAM_FILE = path.resolve(__dirname, "../data/team.json");

// Which identifiers matter, and which pipeline each one unlocks.
const FIELDS = [
  { key: "github", label: "GitHub", get: (m) => m.links && m.links.github, unlocks: "GitHub activity + analysis" },
  { key: "semanticScholarId", label: "Semantic Scholar", get: (m) => semanticScholarIds(m.semanticScholarId).length > 0, unlocks: "publications + research" },
  { key: "twitter", label: "X/Twitter", get: (m) => m.links && m.links.twitter, unlocks: "X posts" },
  { key: "linkedin", label: "LinkedIn", get: (m) => m.links && m.links.linkedin, unlocks: "profile links" },
];

function main() {
  let roster;
  try { roster = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8")); }
  catch (e) { console.error(`Could not read team.json: ${e.message}`); process.exit(1); }

  const total = roster.length;
  console.log(`Identity coverage — ${total} people in team.json\n`);

  // Per-field coverage summary.
  for (const f of FIELDS) {
    const have = roster.filter((m) => f.get(m)).length;
    const pct = total ? Math.round((have / total) * 100) : 0;
    console.log(`  ${f.label.padEnd(18)} ${String(have).padStart(3)}/${total}  (${pct}%)  — unlocks ${f.unlocks}`);
  }

  // People missing the two identifiers that drive the biggest pipelines.
  for (const key of ["github", "semanticScholarId"]) {
    const f = FIELDS.find((x) => x.key === key);
    const missing = roster.filter((m) => !f.get(m)).map((m) => m.name).sort();
    console.log(`\nMissing ${f.label} (${missing.length}):`);
    console.log(missing.length ? missing.map((n) => `  · ${n}`).join("\n") : "  (none — full coverage)");
  }

  // Collisions the resolver would encounter (same identifier → two people).
  const collisions = [];
  buildResolver(roster, { onCollision: (k, kind, a, b) => collisions.push(`${kind} "${k}": ${a} vs ${b}`) });
  console.log(`\nIdentifier collisions: ${collisions.length}`);
  for (const c of collisions) console.log(`  ⚠ ${c}`);

  console.log("\nFill any gaps by editing the person in Sanity, then re-run the Sync Team from Sanity workflow.");
}

main();
