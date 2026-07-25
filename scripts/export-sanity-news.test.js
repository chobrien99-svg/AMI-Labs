// Tests for the Sanity-articles → news.json merge. Run: node scripts/export-sanity-news.test.js
// No network — fixtures injected.
const assert = require("assert");
const { mergeNews, articleToPeople, deriveUrl } = require("./export-sanity-news");
const { buildMentionIndex } = require("./lib/detect-people");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const ROSTER = [{ slug: "yann-lecun", name: "Yann LeCun" }, { slug: "min-lin", name: "Min Lin" }];
const detectIndex = buildMentionIndex(ROSTER);
const NOW = "2026-07-25T00:00:00.000Z";
const merge = (existing, arts) => mergeNews(existing, arts, { detectIndex, now: NOW });

test("deriveUrl: externalUrl wins, else on-site permalink", () => {
  assert.strictEqual(deriveUrl({ externalUrl: "https://x/y", slug: "s" }), "https://x/y");
  assert.strictEqual(deriveUrl({ slug: "a-paper" }), "/news/a-paper");
});

test("articleToPeople: curated tags win over the detector", () => {
  const a = { title: "Something about Min Lin", summary: "", people: [{ slug: "yann-lecun", name: "Yann LeCun" }] };
  assert.deepStrictEqual(articleToPeople(a, detectIndex), ["yann-lecun"]); // NOT min-lin from text
});

test("articleToPeople: untagged article falls back to detection", () => {
  const a = { title: "Yann LeCun on world models", summary: "", people: [] };
  assert.deepStrictEqual(articleToPeople(a, detectIndex), ["yann-lecun"]);
});

test("new manual article is appended with id === sanityId === _id, approved", () => {
  const out = merge([], [{ _id: "art-1", title: "New Paper", slug: "new-paper", publishedAt: "2026-05-01T00:00:00Z", summary: "By Min Lin.", source: "arXiv", people: [] }]);
  assert.strictEqual(out.length, 1);
  const r = out[0];
  assert.strictEqual(r.id, "art-1");
  assert.strictEqual(r.sanityId, "art-1");
  assert.strictEqual(r.status, "approved");
  assert.strictEqual(r.publishedAt, "2026-05-01"); // date-only
  assert.strictEqual(r.addedAt, NOW);
  assert.deepStrictEqual(r.people, ["min-lin"]); // detector fallback
});

test("article with no externalUrl gets the /news/<slug> permalink", () => {
  const out = merge([], [{ _id: "art-2", title: "Original", slug: "original-post", publishedAt: "2026-06-01" }]);
  assert.strictEqual(out[0].url, "/news/original-post");
});

test("bot row matched by URL: people refreshed, other fields untouched, no sanityId added", () => {
  const existing = [{ id: "bot-uuid", title: "Bot Title", url: "https://x/z", summary: "bot summary", score: 88, image: "/news/pic.jpg", status: "approved" }];
  const out = merge(existing, [{ _id: "news-bot-x", title: "Sanity Title", externalUrl: "https://x/z", slug: "z", publishedAt: "2026-06-01", summary: "sanity summary", score: 12, people: [{ slug: "yann-lecun" }] }]);
  assert.strictEqual(out.length, 1); // merged, not duplicated
  const r = out[0];
  assert.deepStrictEqual(r.people, ["yann-lecun"]); // refreshed
  assert.strictEqual(r.image, "/news/pic.jpg"); // preserved
  assert.strictEqual(r.summary, "bot summary"); // bot-owned, untouched
  assert.strictEqual(r.score, 88); // untouched
  assert.strictEqual(r.sanityId, undefined); // did not take ownership
});

test("owned row (has sanityId) refreshes Sanity-sourced fields on re-sync", () => {
  const existing = [{ id: "art-9", sanityId: "art-9", title: "Old", url: "/news/x", summary: "old", tags: [], score: null, status: "approved", addedAt: "2026-01-01T00:00:00Z", image: null, publishedAt: "2026-01-01" }];
  const out = merge(existing, [{ _id: "art-9", title: "Updated Title", slug: "x", publishedAt: "2026-01-01", summary: "updated", tags: ["research"], people: [{ slug: "min-lin" }] }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].title, "Updated Title");
  assert.strictEqual(out[0].summary, "updated");
  assert.deepStrictEqual(out[0].tags, ["research"]);
  assert.deepStrictEqual(out[0].people, ["min-lin"]);
  assert.strictEqual(out[0].addedAt, "2026-01-01T00:00:00Z"); // preserved
});

test("empty curated + no detection → people key omitted/cleared", () => {
  const out = merge([], [{ _id: "art-3", title: "Generic AI news", slug: "g", publishedAt: "2026-06-01", summary: "nobody named here" }]);
  assert.ok(!("people" in out[0]));
});

test("idempotent: re-running merge is byte-stable and preserves addedAt", () => {
  const arts = [
    { _id: "art-1", title: "New Paper", slug: "new-paper", publishedAt: "2026-05-01", summary: "By Min Lin.", source: "arXiv" },
    { _id: "news-bot-x", title: "S", externalUrl: "https://x/z", slug: "z", publishedAt: "2026-06-01", people: [{ slug: "yann-lecun" }] },
  ];
  const existing = [{ id: "bot-uuid", title: "Bot", url: "https://x/z", summary: "bot", score: 88, image: "/p.jpg", status: "approved" }];
  const once = merge(existing, arts);
  const twice = mergeNews(once, arts, { detectIndex, now: "2099-01-01T00:00:00Z" }); // different now
  assert.deepStrictEqual(JSON.stringify(twice), JSON.stringify(once)); // no churn, addedAt not bumped
});

console.log(`\nAll ${passed} sanity-news sync tests passed.`);
