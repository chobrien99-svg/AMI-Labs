// ============================================================================
// One-time migration: person.semanticScholarId  "string"  →  ["string"]
// The schema field became an array (a person can have several Semantic Scholar
// author profiles). Existing single-string values still work everywhere (the
// code handles string-or-array), but converting them makes the Studio field
// render cleanly. Idempotent — re-running only touches docs still holding a
// bare string.
//
//   SANITY_API_WRITE_TOKEN=xxxx node scripts/migrate-ss-ids.js
// ============================================================================

const { createClient } = require("@sanity/client");

const token = process.env.SANITY_API_WRITE_TOKEN;
if (!token) {
  console.error("Set SANITY_API_WRITE_TOKEN to run this migration.");
  process.exit(1);
}

const client = createClient({
  projectId: "k8hl9hed",
  dataset: "production",
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
});

async function main() {
  // Include drafts so both published and draft docs are consistent.
  const persons = await client.fetch(
    '*[_type == "person" && defined(semanticScholarId)]{ _id, name, semanticScholarId }'
  );
  let migrated = 0;
  for (const p of persons) {
    if (typeof p.semanticScholarId === "string") {
      await client.patch(p._id).set({ semanticScholarId: [p.semanticScholarId] }).commit();
      migrated++;
      console.log(`  ${p.name || p._id}: "${p.semanticScholarId}" → ["${p.semanticScholarId}"]`);
    }
  }
  console.log(`\nDone. Migrated ${migrated} person(s) to array form (${persons.length} checked).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
