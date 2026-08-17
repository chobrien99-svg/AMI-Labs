// Tests for the X List diagnostic's classification. Run: node scripts/debug-x-posts.test.js
// No test framework — plain asserts so it runs anywhere with just node.

const assert = require("assert");
const { classifyPost, keptByProductionQuery, bucketCounts, authorBreakdown } = require("./debug-x-posts");

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

console.log(`\n${passed} test(s) passed.`);
