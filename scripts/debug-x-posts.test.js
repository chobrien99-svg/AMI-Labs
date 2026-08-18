// Tests for the X List diagnostic's classification. Run: node scripts/debug-x-posts.test.js
// No test framework — plain asserts so it runs anywhere with just node.

const assert = require("assert");
const {
  classifyPost, keptByProductionQuery, bucketCounts, authorBreakdown,
  oldestTimestamp, comparisonFloor,
} = require("./debug-x-posts");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// ── classification ───────────────────────────────────────────────────────────
test("a post with no references is an original", () => {
  assert.strictEqual(classifyPost({ id: "1", text: "hello" }), "original");
  assert.strictEqual(classifyPost({ id: "1", referenced_tweets: [] }), "original");
});

test("retweets, replies and quotes are recognised", () => {
  assert.strictEqual(classifyPost({ referenced_tweets: [{ type: "retweeted", id: "9" }] }), "retweet");
  assert.strictEqual(classifyPost({ referenced_tweets: [{ type: "replied_to", id: "9" }] }), "reply");
  assert.strictEqual(classifyPost({ referenced_tweets: [{ type: "quoted", id: "9" }] }), "quote");
});

test("in_reply_to_user_id alone marks a reply (self-threads included)", () => {
  assert.strictEqual(classifyPost({ in_reply_to_user_id: "42" }), "reply");
});

test("precedence matches how the search operators compose", () => {
  // A quote that is also a reply is removed by -is:reply, so it must not count as a quote.
  assert.strictEqual(
    classifyPost({ referenced_tweets: [{ type: "quoted", id: "9" }, { type: "replied_to", id: "8" }] }),
    "reply"
  );
  // A retweet outranks everything else.
  assert.strictEqual(
    classifyPost({ referenced_tweets: [{ type: "retweeted", id: "9" }, { type: "quoted", id: "8" }] }),
    "retweet"
  );
});

// ── which buckets the production query keeps ─────────────────────────────────
test("production query keeps originals and quotes only", () => {
  assert.strictEqual(keptByProductionQuery("original"), true);
  assert.strictEqual(keptByProductionQuery("quote"), true);
  assert.strictEqual(keptByProductionQuery("reply"), false);
  assert.strictEqual(keptByProductionQuery("retweet"), false);
});

// ── aggregation ──────────────────────────────────────────────────────────────
const SAMPLE = [
  { author_id: "a", text: "original one" },
  { author_id: "a", referenced_tweets: [{ type: "retweeted", id: "1" }] },
  { author_id: "a", referenced_tweets: [{ type: "retweeted", id: "2" }] },
  { author_id: "b", referenced_tweets: [{ type: "replied_to", id: "3" }] },
  { author_id: "b", referenced_tweets: [{ type: "quoted", id: "4" }] },
];

test("bucketCounts tallies every bucket", () => {
  assert.deepStrictEqual(bucketCounts(SAMPLE), { original: 1, quote: 1, reply: 1, retweet: 2 });
});

test("bucketCounts on an empty set is all zeroes", () => {
  assert.deepStrictEqual(bucketCounts([]), { original: 0, quote: 0, reply: 0, retweet: 0 });
});

test("authorBreakdown groups by username, busiest first", () => {
  const users = { a: { username: "alice" }, b: { username: "bob" } };
  const rows = authorBreakdown(SAMPLE, users);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], { author: "alice", total: 3, original: 1, quote: 0, reply: 0, retweet: 2 });
  assert.deepStrictEqual(rows[1], { author: "bob", total: 2, original: 0, quote: 1, reply: 1, retweet: 0 });
});

test("authorBreakdown falls back to author_id when the user is not expanded", () => {
  const rows = authorBreakdown([{ author_id: "zz", text: "x" }], {});
  assert.strictEqual(rows[0].author, "zz");
});

// ── comparable interval when a query truncates ───────────────────────────────
const ts = (iso) => new Date(iso).getTime();
const WINDOW_START = ts("2026-08-10T00:00:00Z");

test("oldestTimestamp finds the earliest created_at, ignoring posts without one", () => {
  assert.strictEqual(
    oldestTimestamp([
      { created_at: "2026-08-14T00:00:00Z" },
      { created_at: "2026-08-12T00:00:00Z" },
      { id: "no-date" },
    ]),
    ts("2026-08-12T00:00:00Z")
  );
  assert.strictEqual(oldestTimestamp([]), null);
  assert.strictEqual(oldestTimestamp([{ id: "x" }]), null);
});

test("no truncation → compare over the whole window", () => {
  const floor = comparisonFloor({
    unfiltered: { posts: [{ created_at: "2026-08-11T00:00:00Z" }], truncated: false },
    production: { posts: [{ created_at: "2026-08-11T00:00:00Z" }], truncated: false },
    windowStartMs: WINDOW_START,
  });
  assert.strictEqual(floor, WINDOW_START);
});

test("one query truncates → floor is its oldest retrieved post", () => {
  const floor = comparisonFloor({
    unfiltered: {
      posts: [{ created_at: "2026-08-16T00:00:00Z" }, { created_at: "2026-08-15T00:00:00Z" }],
      truncated: true,
    },
    production: { posts: [{ created_at: "2026-08-11T00:00:00Z" }], truncated: false },
    windowStartMs: WINDOW_START,
  });
  // The unfiltered query only reaches back to the 15th, so the 11th is not comparable.
  assert.strictEqual(floor, ts("2026-08-15T00:00:00Z"));
});

test("both truncate → floor is the later of the two, not the earlier", () => {
  const floor = comparisonFloor({
    unfiltered: { posts: [{ created_at: "2026-08-15T00:00:00Z" }], truncated: true },
    production: { posts: [{ created_at: "2026-08-13T00:00:00Z" }], truncated: true },
    windowStartMs: WINDOW_START,
  });
  assert.strictEqual(floor, ts("2026-08-15T00:00:00Z"));
});

test("a truncated query with no dated posts falls back to the window start", () => {
  const floor = comparisonFloor({
    unfiltered: { posts: [], truncated: true },
    production: { posts: [], truncated: false },
    windowStartMs: WINDOW_START,
  });
  assert.strictEqual(floor, WINDOW_START);
});

console.log(`\n${passed} test(s) passed.`);
