// ============================================================================
// Validate that tracked JSON files parse — a fast guardrail so a malformed
// hand-edit (e.g. to data/synthesis.json) is caught in CI in seconds instead
// of failing the production build. Run: node scripts/validate-json.js [dir...]
// Defaults to validating everything under data/.
// ============================================================================

const fs = require("fs");
const path = require("path");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".json")) out.push(p);
  }
  return out;
}

function lineColFromPosition(text, pos) {
  const upto = text.slice(0, pos);
  const line = upto.split("\n").length;
  const col = pos - upto.lastIndexOf("\n");
  return { line, col };
}

const roots = process.argv.slice(2);
const targets = roots.length ? roots : ["data"];

const files = [];
for (const t of targets) {
  if (!fs.existsSync(t)) continue;
  files.push(...(fs.statSync(t).isDirectory() ? walk(t) : [t]));
}

let failed = 0;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  try {
    JSON.parse(text);
  } catch (err) {
    failed++;
    // Node's message may already carry "(line X column Y)"; only add our own
    // location when it doesn't.
    const m = /position (\d+)/.exec(err.message);
    let loc = "";
    if (m && !/line \d+/.test(err.message)) {
      const { line, col } = lineColFromPosition(text, Number(m[1]));
      loc = ` (line ${line}, column ${col})`;
    }
    console.error(`✖ ${file}: ${err.message}${loc}`);
  }
}

if (failed) {
  console.error(`\n${failed} invalid JSON file(s) — fix before merging.`);
  process.exit(1);
}
console.log(`✓ ${files.length} JSON file(s) valid.`);
