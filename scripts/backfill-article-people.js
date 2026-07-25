// ============================================================================
// AMI Observatory — backfill article↔people links
// ----------------------------------------------------------------------------
// One-off/repeatable pass over data/news.json: for each article, detect which
// roster people are mentioned (title + summary) and store their slugs on a
// `people` field, so news is linked to the people it's about. Idempotent —
// recomputes every run; sets `people` when there are matches and removes it when
// there are none, so re-running after the roster grows keeps things in sync.
//
//   node scripts/backfill-article-people.js         # write
//   node scripts/backfill-article-people.js --dry    # report only, no write
// ============================================================================

const fs = require("fs");
const path = require("path");
const { buildMentionIndex, detectPeople } = require("./lib/detect-people");

const NEWS_FILE = path.resolve(__dirname, "../data/news.json");
const TEAM_FILE = path.resolve(__dirname, "../data/team.json");
const DRY = process.argv.includes("--dry");

function main() {
  const roster = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8"));
  const articles = JSON.parse(fs.readFileSync(NEWS_FILE, "utf8"));
  const index = buildMentionIndex(roster);

  let tagged = 0;
  const counts = new Map(); // slug -> # articles
  for (const a of articles) {
    const people = detectPeople(`${a.title || ""}. ${a.summary || ""}`, index);
    if (people.length) {
      a.people = people;
      tagged++;
      for (const s of people) counts.set(s, (counts.get(s) || 0) + 1);
    } else if ("people" in a) {
      delete a.people; // clear stale matches so re-runs stay idempotent
    }
  }

  console.log(`Scanned ${articles.length} articles — ${tagged} mention a roster person.`);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length) {
    console.log("\nMost-mentioned people:");
    for (const [slug, n] of top) console.log(`  ${String(n).padStart(3)}  ${slug}`);
  }

  if (DRY) { console.log("\n(dry run — news.json not written)"); return; }
  fs.writeFileSync(NEWS_FILE, JSON.stringify(articles, null, 2));
  console.log(`\nWrote ${NEWS_FILE}.`);
}

main();
