/**
 * Read-only diagnostic for the X List feed. Answers one question: is the
 * production query's `-is:retweet -is:reply` filter dropping more than intended?
 *
 * Runs two recent-searches over the same window and reports both counts:
 *   unfiltered  `list:<X_LIST_ID>`                      → everything the List produced
 *   production  `list:<X_LIST_ID> -is:retweet -is:reply` → what fetch-x-posts.js keeps
 *
 * Both numbers come from the API rather than being inferred, so the gap between
 * them is a fact. The unfiltered posts are then classified locally (retweet /
 * reply / quote / original) to explain *what* the gap is made of, and that model
 * is cross-checked against the real filtered count — a mismatch is itself a
 * finding and is reported as one.
 *
 * Two things keep the two counts genuinely comparable:
 *   - the window (start_time + end_time) is frozen once and reused for every page
 *     of both queries, so a post arriving mid-run cannot land in one and not the
 *     other and masquerade as a filter effect;
 *   - if either query hits the page cap the two no longer reach equally far back,
 *     so all comparisons are restricted to the interval both cover completely.
 *
 * Writes nothing to data/. Prints to stdout, and to the job summary under Actions.
 *
 * Env:
 *   X_BEARER_TOKEN   required — same app-only bearer as fetch-x-posts.js
 *   X_LIST_ID        required — numeric List ID (or a full list URL)
 *   X_DEBUG_DAYS     optional (default 7)  — lookback; 7 is the API's hard limit
 *   X_DEBUG_PAGES    optional (default 3)  — page cap per query (≤100 posts each)
 *   X_DEBUG_SAMPLES  optional (default 5)  — excluded posts to show per bucket
 */

const https = require("https");

const RETRY_MS = 3000;
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOW_MARGIN_MS = 30 * 60 * 1000;
// The API rejects an `end_time` within ~10s of the request; keep well clear of that.
const END_LAG_MS = 60 * 1000;

const BEARER = process.env.X_BEARER_TOKEN;
const LIST_ID = (process.env.X_LIST_ID || "").match(/\d{5,}/)?.[0] || null;
const DAYS = Math.min(Number(process.env.X_DEBUG_DAYS) || 7, 7);
const MAX_PAGES = Number(process.env.X_DEBUG_PAGES) || 3;
const SAMPLES = Number(process.env.X_DEBUG_SAMPLES) || 5;

// ── pure helpers (exported for tests) ────────────────────────────────────────

// Which bucket a post falls into. Precedence mirrors how the search operators
// compose: a quote that is also a reply is dropped by `-is:reply`, and a retweet
// of anything is dropped by `-is:retweet`, so retweet wins over reply over quote.
function classifyPost(t) {
  const refs = t.referenced_tweets || [];
  if (refs.some((r) => r.type === "retweeted")) return "retweet";
  if (refs.some((r) => r.type === "replied_to") || t.in_reply_to_user_id) return "reply";
  if (refs.some((r) => r.type === "quoted")) return "quote";
  return "original";
}

// `-is:retweet -is:reply` keeps originals and standalone quotes.
const KEPT_BUCKETS = ["original", "quote"];
const keptByProductionQuery = (bucket) => KEPT_BUCKETS.includes(bucket);

function bucketCounts(posts) {
  const counts = { original: 0, quote: 0, reply: 0, retweet: 0 };
  for (const t of posts) counts[classifyPost(t)]++;
  return counts;
}

// Per-author tallies, busiest first.
function authorBreakdown(posts, usersById) {
  const by = new Map();
  for (const t of posts) {
    const name = usersById[t.author_id]?.username || t.author_id || "(unknown)";
    if (!by.has(name)) by.set(name, { author: name, total: 0, original: 0, quote: 0, reply: 0, retweet: 0 });
    const row = by.get(name);
    row.total++;
    row[classifyPost(t)]++;
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

// Oldest post in a result set. Recent-search returns newest-first, so for a query
// that hit the page cap this is the point past which its results are incomplete.
function oldestTimestamp(posts) {
  let oldest = null;
  for (const t of posts) {
    if (!t.created_at) continue;
    const ms = new Date(t.created_at).getTime();
    if (oldest === null || ms < oldest) oldest = ms;
  }
  return oldest;
}

// The floor of the interval over which *both* result sets are complete, and so the
// only interval their counts may be compared over. An untruncated query covers the
// whole window; a truncated one only reaches back to its oldest retrieved post, so
// the shared floor is the latest of those.
function comparisonFloor({ unfiltered, production, windowStartMs }) {
  const floors = [];
  for (const r of [unfiltered, production]) {
    if (r.truncated) floors.push(oldestTimestamp(r.posts) ?? windowStartMs);
  }
  return floors.length ? Math.max(...floors) : windowStartMs;
}

const atOrAfter = (floorMs) => (t) =>
  !t.created_at || new Date(t.created_at).getTime() >= floorMs;

// ── API ──────────────────────────────────────────────────────────────────────

function getJson(url, tries = 2) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { method: "GET", hostname: u.hostname, path: u.pathname + u.search,
        headers: { Authorization: `Bearer ${BEARER}`, "User-Agent": "AMI-Labs-Site/1.0" } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const status = res.statusCode;
          if (status === 200) {
            try { resolve(JSON.parse(data)); } catch { reject(new Error("Bad JSON")); }
          } else if ((status === 429 || status >= 500) && tries > 0) {
            setTimeout(() => getJson(url, tries - 1).then(resolve, reject), RETRY_MS);
          } else {
            reject(new Error(`HTTP ${status}: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", (err) => (tries > 0
      ? setTimeout(() => getJson(url, tries - 1).then(resolve, reject), RETRY_MS)
      : reject(err)));
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

// One window, computed once and reused for every page of both queries. Recomputing
// it per request would give the two searches different bounds, so a post arriving
// between them could show up in one and not the other — reporting a filter gap that
// is really just elapsed time.
function windowBounds() {
  const end = Date.now() - END_LAG_MS;
  const span = Math.min(DAYS * 24 * 60 * 60 * 1000, RECENT_WINDOW_MS - WINDOW_MARGIN_MS);
  const startMs = end - span;
  return { start: isoSeconds(startMs), end: isoSeconds(end), startMs };
}

// Collect up to MAX_PAGES for one query. `truncated` flags that the cap was hit,
// which makes the count a floor rather than a total.
async function collect(query, win) {
  const posts = [];
  const usersById = {};
  let nextToken = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      query,
      max_results: "100",
      start_time: win.start,
      end_time: win.end,
      "tweet.fields": "created_at,author_id,referenced_tweets,in_reply_to_user_id,public_metrics",
      expansions: "author_id",
      "user.fields": "username,name",
    });
    if (nextToken) params.set("next_token", nextToken);
    const res = await getJson(`https://api.twitter.com/2/tweets/search/recent?${params.toString()}`);
    (res.includes?.users || []).forEach((u) => (usersById[u.id] = u));
    const data = res.data || [];
    posts.push(...data);
    nextToken = res.meta?.next_token || null;
    if (!nextToken || data.length === 0) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return { posts, usersById, truncated };
}

// ── report ───────────────────────────────────────────────────────────────────

function buildReport({ unfiltered, production, usersById, win }) {
  const truncated = unfiltered.truncated || production.truncated;
  const floorMs = comparisonFloor({ unfiltered, production, windowStartMs: win.startMs });
  // Compare only where both result sets are complete; outside that, a difference in
  // counts measures how far each query happened to paginate, not the filter.
  const inScope = atOrAfter(floorMs);
  const unfilteredCmp = unfiltered.posts.filter(inScope);
  const productionCmp = production.posts.filter(inScope);

  const total = unfilteredCmp.length;
  const counts = bucketCounts(unfilteredCmp);
  const modelledKeep = counts.original + counts.quote;
  const lines = [];

  lines.push(`Window: ${win.start} → ${win.end} (last ${DAYS} day(s), frozen for both queries)`);
  lines.push(`List:   ${LIST_ID}`);
  lines.push("");
  const LABEL_W = 44;
  const row = (label, n, note = "") =>
    `  ${label.padEnd(LABEL_W)}${String(n).padStart(5)} post(s)${note}`;

  lines.push("Retrieved:");
  lines.push(row(`unfiltered  list:${LIST_ID}`, unfiltered.posts.length,
    unfiltered.truncated ? "  [page cap hit — a floor]" : ""));
  lines.push(row("production  ... -is:retweet -is:reply", production.posts.length,
    production.truncated ? "  [page cap hit — a floor]" : ""));
  lines.push("");

  if (truncated) {
    lines.push(`Hit the ${MAX_PAGES}-page cap (${MAX_PAGES * 100} posts) on at least one query, so the`);
    lines.push(`retrieved counts above are floors, not totals — and the two queries paginate`);
    lines.push(`independently, so they do not reach equally far back. Everything below is`);
    lines.push(`therefore restricted to ${isoSeconds(floorMs)} → ${win.end}, the interval both`);
    lines.push(`queries cover completely. Raise X_DEBUG_PAGES to widen it.`);
    lines.push("");
  }

  lines.push(`Comparison over ${isoSeconds(floorMs)} → ${win.end}:`);
  lines.push(row("unfiltered", total));
  lines.push(row("production (-is:retweet -is:reply)", productionCmp.length));
  lines.push(row("excluded by the filter", total - productionCmp.length));
  lines.push("");
  lines.push("Composition of the unfiltered set:");
  for (const b of ["original", "quote", "reply", "retweet"]) {
    const mark = keptByProductionQuery(b) ? "kept   " : "dropped";
    lines.push(`  ${mark} ${b.padEnd(9)} ${String(counts[b]).padStart(4)}  (${pct(counts[b], total)})`);
  }
  lines.push("");

  // Cross-check: local classification vs what the API actually returned. Valid only
  // because both sides are now measured over the same fully-covered interval.
  if (modelledKeep === productionCmp.length) {
    lines.push(`Cross-check: originals + quotes = ${modelledKeep}, matches the filtered count.`);
  } else {
    lines.push(`Cross-check MISMATCH: originals + quotes = ${modelledKeep}, but the filtered`);
    lines.push(`  query returned ${productionCmp.length}. The filter is not behaving as modelled —`);
    lines.push(`  worth inspecting before drawing conclusions from the buckets above.`);
  }

  if (total) {
    lines.push("");
    lines.push("Per author (unfiltered):");
    lines.push(`  ${"author".padEnd(20)} ${"tot".padStart(4)} ${"orig".padStart(5)} ${"quote".padStart(6)} ${"reply".padStart(6)} ${"RT".padStart(5)}`);
    for (const r of authorBreakdown(unfilteredCmp, usersById)) {
      lines.push(`  @${r.author.padEnd(19)} ${String(r.total).padStart(4)} ${String(r.original).padStart(5)} ${String(r.quote).padStart(6)} ${String(r.reply).padStart(6)} ${String(r.retweet).padStart(5)}`);
    }
  }

  // Show what is being thrown away, so the trade-off is concrete.
  const dropped = unfilteredCmp.filter((t) => !keptByProductionQuery(classifyPost(t)));
  if (dropped.length) {
    lines.push("");
    lines.push("Sample of excluded posts:");
    for (const bucket of ["retweet", "reply"]) {
      const sample = dropped.filter((t) => classifyPost(t) === bucket).slice(0, SAMPLES);
      if (!sample.length) continue;
      lines.push(`  ── ${bucket === "reply" ? "replies" : `${bucket}s`} ──`);
      for (const t of sample) {
        const who = usersById[t.author_id]?.username || t.author_id;
        const text = (t.text || "").replace(/\s+/g, " ").slice(0, 110);
        lines.push(`  @${who}: ${text}`);
      }
    }
  }

  return lines.join("\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!BEARER) { console.log("[x-debug] No X_BEARER_TOKEN — skipping."); return; }
  if (!LIST_ID) { console.log("[x-debug] No X_LIST_ID set — skipping."); return; }

  const base = `list:${LIST_ID}`;
  const win = windowBounds(); // frozen once, shared by both queries and every page
  let unfiltered;
  let production;
  try {
    unfiltered = await collect(base, win);
    production = await collect(`${base} -is:retweet -is:reply`, win);
  } catch (e) {
    console.error(`[x-debug] Fetch failed: ${e.message}`);
    process.exit(1);
  }

  const report = buildReport({
    unfiltered,
    production,
    usersById: { ...unfiltered.usersById, ...production.usersById },
    win,
  });

  console.log(report);

  // Surface it on the Actions run page too, so no log-scrolling is needed.
  if (process.env.GITHUB_STEP_SUMMARY) {
    require("fs").appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## X List diagnostic\n\n\`\`\`\n${report}\n\`\`\`\n`
    );
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[x-debug] Fatal:", e); process.exit(1); });
}

module.exports = {
  classifyPost, keptByProductionQuery, bucketCounts, authorBreakdown,
  oldestTimestamp, comparisonFloor,
};
