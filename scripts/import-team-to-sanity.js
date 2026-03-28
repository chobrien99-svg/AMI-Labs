/**
 * One-time import: seeds all team.json members into Sanity as person documents.
 *
 * Run with:
 *   SANITY_WRITE_TOKEN=sk... node scripts/import-team-to-sanity.js
 *
 * Safe to re-run — uses createIfNotExists so existing documents are never overwritten.
 * reportsTo references are only patched if the field is not already set.
 *
 * Required env vars:
 *   SANITY_WRITE_TOKEN  — a Sanity token with Editor (write) permissions
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const PROJECT_ID = "k8hl9hed";
const DATASET = "production";
const API_VERSION = "2024-01-01";
const TOKEN = process.env.SANITY_WRITE_TOKEN;

if (!TOKEN) {
  console.error("Missing SANITY_WRITE_TOKEN");
  process.exit(1);
}

const teamData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../data/team.json"), "utf8")
);

// ── Sanity HTTP helpers ───────────────────────────────────────────────────────

function sanityRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: `${PROJECT_ID}.api.sanity.io`,
        path: `/v${API_VERSION}/data/${endpoint}/${DATASET}`,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function query(groq) {
  const encoded = encodeURIComponent(groq);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: `${PROJECT_ID}.api.sanity.io`,
        path: `/v${API_VERSION}/data/query/${DATASET}?query=${encoded}`,
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data).result); }
          catch { reject(new Error(data)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// Deterministic Sanity document ID from slug
function docId(slug) {
  return `person-import-${slug}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch all existing person documents (slug → _id map)
  console.log("Fetching existing Sanity persons…");
  const existing = await query(`*[_type == "person"]{_id, "slug": slug.current, reportsTo}`);
  const slugToId = new Map(existing.map((p) => [p.slug, p._id]));
  const hasReportsTo = new Set(existing.filter((p) => p.reportsTo?._ref).map((p) => p.slug));

  console.log(`Found ${existing.length} existing person(s) in Sanity.`);

  // ── Pass 1: create missing persons ──────────────────────────────────────────
  const mutations = [];
  for (const m of teamData) {
    if (slugToId.has(m.slug)) {
      console.log(`  ✓ already exists: ${m.name}`);
      continue;
    }
    mutations.push({
      createIfNotExists: {
        _type: "person",
        _id: docId(m.slug),
        name: m.name,
        slug: { _type: "slug", current: m.slug },
        role: m.role,
        ...(m.body ? { body: m.body } : {}),
        ...(m.tags?.length ? { tags: m.tags } : {}),
        // reportsTo wired in pass 2
      },
    });
    slugToId.set(m.slug, docId(m.slug)); // register so pass 2 can resolve refs
  }

  if (mutations.length > 0) {
    console.log(`\nPass 1: creating ${mutations.length} new person(s)…`);
    // Sanity mutation endpoint accepts up to 200 mutations at a time
    for (let i = 0; i < mutations.length; i += 200) {
      const batch = mutations.slice(i, i + 200);
      const res = await sanityRequest("POST", "mutate", { mutations: batch });
      if (res.status !== 200) {
        console.error("Mutation failed:", JSON.stringify(res.body, null, 2));
        process.exit(1);
      }
      console.log(`  Created batch ${Math.floor(i / 200) + 1} (${batch.length} docs)`);
    }
  } else {
    console.log("\nPass 1: nothing to create.");
  }

  // ── Pass 2: patch reportsTo references ──────────────────────────────────────
  const patches = [];
  for (const m of teamData) {
    if (!m.reportsTo) continue;               // root node — no manager
    if (hasReportsTo.has(m.slug)) {
      console.log(`  ✓ reportsTo already set: ${m.name}`);
      continue;
    }
    const managerSanityId = slugToId.get(m.reportsTo);
    if (!managerSanityId) {
      console.warn(`  ⚠ Manager slug "${m.reportsTo}" for ${m.name} not found — skipping`);
      continue;
    }
    const personSanityId = slugToId.get(m.slug);
    if (!personSanityId) {
      console.warn(`  ⚠ Person "${m.name}" not found in id map — skipping`);
      continue;
    }
    patches.push({
      patch: {
        id: personSanityId,
        set: { reportsTo: { _type: "reference", _ref: managerSanityId } },
        ifRevisionID: undefined,
      },
    });
  }

  if (patches.length > 0) {
    console.log(`\nPass 2: patching reportsTo on ${patches.length} person(s)…`);
    for (let i = 0; i < patches.length; i += 200) {
      const batch = patches.slice(i, i + 200);
      const res = await sanityRequest("POST", "mutate", { mutations: batch });
      if (res.status !== 200) {
        console.error("Patch failed:", JSON.stringify(res.body, null, 2));
        process.exit(1);
      }
      console.log(`  Patched batch ${Math.floor(i / 200) + 1} (${batch.length} docs)`);
    }
  } else {
    console.log("\nPass 2: nothing to patch.");
  }

  console.log("\nDone. All team.json members are now in Sanity.");
  console.log("The 'Reports To' field will now show the full team when editing any person.");
}

main().catch((e) => { console.error(e); process.exit(1); });
