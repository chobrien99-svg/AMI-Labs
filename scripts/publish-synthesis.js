// ============================================================================
// AMI Observatory — publish the reviewed briefing
// ----------------------------------------------------------------------------
// Promotes the reviewed draft (data/synthesis.pending.json) to the live file
// (data/synthesis.json) that the site renders. Run by the editor via the
// "Publish Observatory Briefing" workflow after reviewing/editing the draft.
// The git commit is done by the workflow, not here.
// ============================================================================

const fs = require("fs");
const path = require("path");

const PENDING_FILE = path.resolve(__dirname, "../data/synthesis.pending.json");
const PUBLISHED_FILE = path.resolve(__dirname, "../data/synthesis.json");

function main() {
  let draft;
  try {
    draft = JSON.parse(fs.readFileSync(PENDING_FILE, "utf8"));
  } catch (err) {
    console.error(`[publish] Cannot read draft ${PENDING_FILE}: ${err.message}`);
    process.exit(1);
  }

  if (draft.status === "error") {
    console.error("[publish] Draft has status:error — refusing to publish.");
    process.exit(1);
  }

  const published = {
    ...draft,
    status: draft.status === "stale" ? "stale" : "ok",
    publishedAt: new Date().toISOString(),
  };

  fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(published, null, 2) + "\n");
  console.log(`[publish] Published briefing → ${PUBLISHED_FILE}: "${published.headline}"`);
}

main();
