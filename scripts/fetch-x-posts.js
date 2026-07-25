/**
 * Fetches recent posts from an X (Twitter) List and captures them for the weekly
 * synthesis to analyse for signals. Writes data/x-posts.json (a rolling window).
 *
 * Uses filtered recent-search so volume + cost stay bounded:
 *   query = `list:<X_LIST_ID> -is:retweet -is:reply`  → original posts + quotes only
 *   since_id = last seen post                          → only genuinely new posts
 *
 * Env:
 *   X_BEARER_TOKEN     required (app-only bearer; same secret as monitor-sites.js)
 *   X_LIST_ID          required — numeric ID of your AMI Team List (repo variable)
 *   X_ENGAGEMENT_MIN   optional (default 50) — engagement score to flag a post "notable"
 *   X_WINDOW_DAYS      optional (default 60) — prune posts older than this
 *   X_MAX_POSTS        optional (default 500) — hard cap on stored posts
 *
 * Note: if your API tier rejects the `list:` operator, swap the query for a
 * `(from:userA OR from:userB ...)` union built from team.json twitter handles.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const { loadResolver } = require("./lib/resolve-identity");

const OUT_FILE = path.resolve(__dirname, "../data/x-posts.json");
const RETRY_MS = 3000;
const MAX_PAGES = 5; // cap pages per run (each page ≤100 posts) to bound cost

const BEARER = process.env.X_BEARER_TOKEN;
// Accept either a bare numeric List ID or a full list URL (e.g. x.com/i/lists/<id>) —
// extract the numeric ID so a pasted URL doesn't produce an invalid `list:` query.
const LIST_ID = (process.env.X_LIST_ID || "").match(/\d{5,}/)?.[0] || null;
const ENGAGEMENT_MIN = Number(process.env.X_ENGAGEMENT_MIN) || 50;
const WINDOW_DAYS = Number(process.env.X_WINDOW_DAYS) || 60;
const MAX_POSTS = Number(process.env.X_MAX_POSTS) || 500;

// Keyword tags (mirrors the news scorer) — a deterministic hint for which posts are signal.
const TAG_RULES = [
  { tag: "funding", pattern: /rais(e|ed|ing)|fund(ing|ed)?|invest|valuation|billion|million|\bround\b/i },
  { tag: "research", pattern: /research|paper|world model|jepa|benchmark|arxiv|preprint|publish|dataset|sota/i },
  { tag: "hiring", pattern: /hir(e|ing)|\bjoin(ed|ing)?\b|welcome|thrilled to|excited to (join|announce)|open role|we'?re growing/i },
  { tag: "product", pattern: /launch|releas(e|ed|ing)|\bdemo\b|now available|shipp?ing|\bbeta\b|preview|unveil/i },
];

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
            try { resolve(JSON.parse(data)); } catch { reject(new Error(`Bad JSON`)); }
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

function inferTags(text) {
  const t = text || "";
  return TAG_RULES.filter((r) => r.pattern.test(t)).map((r) => r.tag);
}

function engagementScore(m) {
  if (!m) return 0;
  // Amplification (retweets/quotes) weighted above passive likes.
  return (m.like_count || 0) + 2 * (m.retweet_count || 0) + 2 * (m.quote_count || 0);
}

function maxId(a, b) {
  if (!a) return b;
  if (!b) return a;
  return BigInt(a) >= BigInt(b) ? a : b;
}

// Build one page URL for the filtered recent-search endpoint.
function searchUrl(sinceId, nextToken) {
  const query = `list:${LIST_ID} -is:retweet -is:reply`;
  const params = new URLSearchParams({
    query,
    max_results: "100",
    "tweet.fields": "created_at,public_metrics,entities,author_id,lang,referenced_tweets",
    expansions: "author_id",
    "user.fields": "username,name",
  });
  if (sinceId) params.set("since_id", sinceId);
  if (nextToken) params.set("next_token", nextToken);
  return `https://api.twitter.com/2/tweets/search/recent?${params.toString()}`;
}

function mapPost(t, usersById, resolver) {
  const u = usersById[t.author_id] || {};
  const username = u.username || "";
  const ents = t.entities || {};
  const isQuote = (t.referenced_tweets || []).some((r) => r.type === "quoted");
  const metrics = t.public_metrics || {};
  const tags = inferTags(t.text);
  const score = engagementScore(metrics);
  return {
    id: t.id,
    authorId: t.author_id,
    authorUsername: username,
    // Canonical person slug for the author (via X handle), or null if not on the roster.
    authorSlug: (resolver && resolver.byTwitter(username) && resolver.byTwitter(username).slug) || null,
    authorName: u.name || "",
    createdAt: t.created_at || null,
    text: t.text || "",
    url: username ? `https://x.com/${username}/status/${t.id}` : `https://x.com/i/status/${t.id}`,
    isQuote,
    metrics: {
      likes: metrics.like_count || 0,
      retweets: metrics.retweet_count || 0,
      replies: metrics.reply_count || 0,
      quotes: metrics.quote_count || 0,
    },
    engagementScore: score,
    highEngagement: score >= ENGAGEMENT_MIN,
    tags,
    urls: (ents.urls || []).map((x) => x.expanded_url || x.url).filter(Boolean),
    hashtags: (ents.hashtags || []).map((x) => x.tag).filter(Boolean),
    mentions: (ents.mentions || []).map((x) => x.username).filter(Boolean),
  };
}

async function main() {
  if (!BEARER) { console.log("[x] No X_BEARER_TOKEN — skipping."); return; }
  if (!LIST_ID) { console.log("[x] No X_LIST_ID set — skipping (set it as a repo variable)."); return; }

  const existing = fs.existsSync(OUT_FILE)
    ? JSON.parse(fs.readFileSync(OUT_FILE, "utf8"))
    : { lastSeenId: null, posts: [] };

  const sinceId = existing.lastSeenId || null;
  const fresh = [];
  const usersById = {};
  let nextToken = null;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await getJson(searchUrl(sinceId, nextToken));
      (res.includes?.users || []).forEach((u) => (usersById[u.id] = u));
      const data = res.data || [];
      fresh.push(...data);
      nextToken = res.meta?.next_token || null;
      if (!nextToken || data.length === 0) break;
    }
  } catch (e) {
    console.error(`[x] Fetch failed: ${e.message}`);
    // Preserve whatever we already had; don't clobber on a transient failure.
    if (!existing.posts?.length) process.exit(1);
    return;
  }

  const resolver = loadResolver(); // maps X handles → person slug
  const newPosts = fresh.map((t) => mapPost(t, usersById, resolver));
  console.log(`[x] ${newPosts.length} new post(s) since ${sinceId || "(first run)"}.`);

  // Merge + dedupe by id, newest first.
  const byId = new Map();
  for (const p of [...newPosts, ...(existing.posts || [])]) if (!byId.has(p.id)) byId.set(p.id, p);
  let posts = [...byId.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Prune: rolling window + hard cap.
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  posts = posts.filter((p) => !p.createdAt || new Date(p.createdAt).getTime() >= cutoff).slice(0, MAX_POSTS);

  let lastSeenId = existing.lastSeenId || null;
  for (const p of newPosts) lastSeenId = maxId(lastSeenId, p.id);

  fs.writeFileSync(OUT_FILE, JSON.stringify({
    lastChecked: new Date().toISOString(),
    lastSeenId,
    listId: LIST_ID,
    posts,
  }, null, 2) + "\n");
  console.log(`[x] Wrote ${OUT_FILE} (${posts.length} posts in window).`);
}

main().catch((e) => { console.error("[x] Fatal:", e); process.exit(1); });
