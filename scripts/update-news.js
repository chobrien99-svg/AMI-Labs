const fs = require("fs");
const https = require("https");
const { randomUUID } = require("crypto");
const Anthropic = require("@anthropic-ai/sdk").default;
const { createClient } = require("@sanity/client");
const { buildMentionIndex, detectPeople } = require("./lib/detect-people");

// ═══════════════════════════════════════════════════════════════════════════
// TRACKER CONFIGURATION — edit this section to adapt for a different company
// ═══════════════════════════════════════════════════════════════════════════

const TRACKER = {
  name: "AMI Labs",
  dataFile: "./data/news.json",
  siteUrl: "https://ami.frenchtechjournal.com",

  // Sanity CMS
  sanity: {
    projectId: "k8hl9hed",
    dataset: "production",
    apiVersion: "2024-01-01",
  },

  // Google News RSS feeds — use %22 for quoted phrases, +when:48h for recency
  googleNewsFeeds: [
    "https://news.google.com/rss/search?q=%22AMI+Labs%22+OR+%22Advanced+Machine+Intelligence%22+when:48h&hl=en&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=%22AMI+Labs%22+%22Yann+LeCun%22+when:48h&hl=en&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=%22AMI+Labs%22+OR+%22AMI+LeCun%22+when:48h&hl=en&gl=FR&ceid=FR:fr",
  ],

  // NewsAPI query (requires NEWS_API_KEY secret)
  newsApiQuery: '("AMI Labs" OR "Advanced Machine Intelligence" OR "AMI LeCun")',

  // Hacker News Algolia search terms — free, no API key needed
  hackerNewsQueries: ["AMI Labs", "Advanced Machine Intelligence", "Yann LeCun AMI"],

  // YouTube channel RSS feeds (free, no API key needed)
  youtubeFeeds: [
    { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCBOEQtZ1EP1cHBW3rvOQSfA", source: "Yann LeCun (YouTube)" },
  ],

  // Reddit RSS search — filtered for AMI keywords
  redditFeeds: [
    "https://www.reddit.com/r/MachineLearning/search.rss?q=%22AMI+Labs%22+OR+%22Yann+LeCun%22&sort=new&restrict_sr=1&t=week",
    "https://www.reddit.com/r/artificial/search.rss?q=%22AMI+Labs%22+OR+%22Advanced+Machine+Intelligence%22&sort=new&restrict_sr=1&t=week",
  ],

  // Whitelisted RSS feeds from specific outlets known to cover AMI Labs
  whitelistFeeds: [
    { url: "https://techcrunch.com/feed/", source: "TechCrunch" },
    { url: "https://www.wired.com/feed/tag/ai/latest/rss", source: "Wired" },
    { url: "https://siliconangle.com/feed/", source: "SiliconANGLE" },
    { url: "https://the-decoder.com/feed/", source: "The Decoder" },
  ],

  // Keywords an article must match (at least one) to pass the whitelist filter
  whitelistKeywords: [
    "ami labs", "ami lab", "advanced machine intelligence",
    "yann lecun", "le cun", "lecun",
    "jepa", "world model",
    "alexandre lebrun",
  ],

  // ── Scoring configuration ─────────────────────────────────────────────────

  // High-authority sources (score boost)
  tier1Sources: [
    "techcrunch", "wired", "nytimes", "new york times", "bloomberg",
    "reuters", "financial times", "wall street journal", "nature",
    "science", "fortune", "business insider", "the verge", "ars technica",
    "mit technology review", "les echos", "le monde", "france 24",
    "pitchbook", "observer", "siliconangle", "silicon angle",
    "straits times", "channel news asia",
  ],

  // Core keywords (highest relevance)
  coreKeywords: [
    "ami labs", "ami lab", "advanced machine intelligence",
    "alexandre lebrun", "pengyouco",
  ],

  // Secondary keywords (moderate relevance)
  secondaryKeywords: [
    "yann lecun", "le cun", "lecun",
    "jepa", "world model", "v-jepa",
  ],

  // Score threshold for auto-routing. Nothing is auto-approved — every article
  // above this score goes to "pending" for human review; below it is auto-rejected
  // as clear noise (still archived in news.json, never shown).
  autoRejectThreshold: 30,

  // Tag inference rules
  tagRules: [
    { tag: "funding", pattern: /rais|fund|invest|valuat|billion|million/ },
    { tag: "research", pattern: /research|paper|model|jepa|science|publish/ },
    { tag: "hiring", pattern: /hir|join|appoint|team/ },
    { tag: "administrative", pattern: /regulat|legal|filing|compliance|incorporat|statut|registr|kbis/ },
  ],

  maxNewPerRun: 15,
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const existing = JSON.parse(fs.readFileSync(TRACKER.dataFile, "utf8"));
const existingUrls = new Set(existing.map((a) => a.url));
const existingTitles = existing.map((a) => a.title.toLowerCase());

// Roster-driven person-mention detection: tag each article with the AMI people it mentions.
const roster = (() => {
  try { return JSON.parse(fs.readFileSync("./data/team.json", "utf8")); }
  catch { return []; }
})();
const mentionIndex = buildMentionIndex(roster);
// Populated once from Sanity before the article loop, so `people` slugs can be written as
// person references. Stays empty when Sanity is unavailable (news.json still gets slugs).
const personIdBySlug = new Map();

// ── Sanity write client (for pushing articles to CMS) ───────────────────────

let sanityClient = null;
if (process.env.SANITY_API_WRITE_TOKEN) {
  sanityClient = createClient({
    ...TRACKER.sanity,
    useCdn: false,
    token: process.env.SANITY_API_WRITE_TOKEN,
  });
} else {
  console.warn("[Sanity] SANITY_API_WRITE_TOKEN not set — articles will only be written to news.json.");
}

// ── HTTP helper (follows redirects) ─────────────────────────────────────────

function httpsGet(url, maxRedirects = 5) {
  return new Promise((resolve) => {
    const doRequest = (requestUrl, redirectsLeft) => {
      const proto = requestUrl.startsWith("http://") ? require("http") : https;
      proto
        .get(requestUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AMI-Labs-News-Bot/1.0)" } }, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
            if (redirectsLeft <= 0) {
              console.error(`[httpsGet] Too many redirects for ${url}`);
              res.resume();
              return resolve("");
            }
            const next = new URL(res.headers.location, requestUrl).href;
            console.log(`[httpsGet] Following ${res.statusCode} redirect → ${next}`);
            res.resume();
            return doRequest(next, redirectsLeft - 1);
          }
          if (res.statusCode !== 200) {
            console.error(`[httpsGet] ${requestUrl} responded with status ${res.statusCode}`);
            res.resume();
            return resolve("");
          }
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve(data));
        })
        .on("error", (err) => {
          console.error(`[httpsGet] Request failed for ${requestUrl}: ${err.message}`);
          resolve("");
        });
    };
    doRequest(url, maxRedirects);
  });
}

// ── image extraction ────────────────────────────────────────────────────────

// Pull an image URL out of an RSS/Atom item block (media:*, enclosure, inline <img>).
function extractItemImage(block) {
  const m =
    /<media:content[^>]+url=["']([^"']+)["'][^>]*>/i.exec(block) ||
    /<media:thumbnail[^>]+url=["']([^"']+)["']/i.exec(block) ||
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image[^"']*["']/i.exec(block) ||
    /<enclosure[^>]+type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i.exec(block) ||
    /<img[^>]+src=["']([^"']+)["']/i.exec(block);
  return m && /^https?:\/\//i.test(m[1]) ? m[1] : null;
}

// Fetch a page's og:image / twitter:image as a last-resort thumbnail source.
async function fetchOgImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const html = await httpsGet(url);
  if (!html) return null;
  const head = html.slice(0, 120000); // meta tags live in <head>
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = p.exec(head);
    if (m && /^https?:\/\//i.test(m[1])) return m[1];
  }
  return null;
}

// ── RSS parsing ─────────────────────────────────────────────────────────────

function parseRSSItems(xml, defaultSource) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(
        "<" + tag + "(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/" + tag + ">|<" + tag + "(?:[^>]*)>([\\s\\S]*?)<\\/" + tag + ">"
      );
      const match = r.exec(block);
      return match ? (match[1] || match[2] || "").trim() : "";
    };
    const title = get("title");
    const link = get("link") || get("guid");
    const pubDate = get("pubDate");
    if (title && link) items.push({ title, link, pubDate, source: defaultSource, image: extractItemImage(block) });
  }
  return items;
}

function parseAtomEntries(xml, defaultSource) {
  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(
        "<" + tag + "[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/" + tag + ">|<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">"
      );
      const match = r.exec(block);
      return match ? (match[1] || match[2] || "").trim() : "";
    };
    const linkMatch = /<link[^>]+href="([^"]+)"/.exec(block);
    const title = get("title");
    const link = linkMatch ? linkMatch[1] : "";
    const pubDate = get("published") || get("updated");
    if (title && link) items.push({ title, link, pubDate, source: defaultSource, image: extractItemImage(block) });
  }
  return items;
}

// ── Fuzzy title deduplication ───────────────────────────────────────────────

function titleWords(title) {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2)
  );
}

function jaccardSimilarity(setA, setB) {
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isTitleDuplicate(title) {
  const words = titleWords(title);
  for (const existing of existingTitles) {
    if (jaccardSimilarity(words, titleWords(existing)) > 0.65) return true;
  }
  return false;
}

// ── Content scoring rubric ──────────────────────────────────────────────────

function scoreArticle(item) {
  const titleLower = item.title.toLowerCase();
  const sourceLower = (item.source || "").toLowerCase();
  let score = 0;
  const breakdown = [];

  // D1: Relevance (0–40) — does the article actually mention AMI Labs?
  const hasCore = TRACKER.coreKeywords.some((kw) => titleLower.includes(kw));
  const hasSecondary = TRACKER.secondaryKeywords.some((kw) => titleLower.includes(kw));
  if (hasCore) {
    score += 40;
    breakdown.push("D1:40 (core keyword in title)");
  } else if (hasSecondary) {
    score += 20;
    breakdown.push("D1:20 (secondary keyword in title)");
  } else {
    score += 5;
    breakdown.push("D1:5 (no tracked keyword in title)");
  }

  // D2: Source credibility (0–25)
  const isTier1 = TRACKER.tier1Sources.some((s) => sourceLower.includes(s));
  if (isTier1) {
    score += 25;
    breakdown.push("D2:25 (tier-1 source)");
  } else if (item.source === "Hacker News") {
    const hnScore = Math.min(15, Math.floor((item.hnPoints || 0) / 10) * 3);
    score += 10 + hnScore;
    breakdown.push(`D2:${10 + hnScore} (HN, ${item.hnPoints || 0} pts)`);
  } else {
    score += 8;
    breakdown.push("D2:8 (standard source)");
  }

  // D3: Content depth signals (0–20)
  const actionWords = /launch|release|announc|partner|acquir|demo|tutorial|open.?source/;
  if (actionWords.test(titleLower)) {
    score += 20;
    breakdown.push("D3:20 (actionable content)");
  } else if (titleLower.length > 60) {
    score += 12;
    breakdown.push("D3:12 (descriptive title)");
  } else {
    score += 5;
    breakdown.push("D3:5 (brief title)");
  }

  // D4: Timeliness (0–15)
  const ageMs = Date.now() - new Date(item.pubDate || Date.now()).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 2) {
    score += 15;
    breakdown.push("D4:15 (< 2 days old)");
  } else if (ageDays <= 7) {
    score += 10;
    breakdown.push("D4:10 (< 7 days old)");
  } else {
    score += 3;
    breakdown.push("D4:3 (> 7 days old)");
  }

  return { score: Math.min(100, score), breakdown };
}

// ── Source fetchers ─────────────────────────────────────────────────────────

async function fetchGoogleNews() {
  const allItems = [];
  for (const url of TRACKER.googleNewsFeeds) {
    console.log(`[Google News] Fetching: ${url}`);
    const xml = await httpsGet(url);
    if (!xml) {
      console.warn("[Google News] Empty response — feed may be blocked or unavailable.");
      continue;
    }
    const items = parseRSSItems(xml, "Google News");
    console.log(`[Google News] Parsed ${items.length} items from feed.`);
    allItems.push(...items);
  }
  const seen = new Set();
  return allItems.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

async function fetchNewsAPI() {
  if (!process.env.NEWS_API_KEY) {
    console.warn("[NewsAPI] NEWS_API_KEY is not set — skipping.");
    return [];
  }
  const query = encodeURIComponent(TRACKER.newsApiQuery);
  const url =
    "https://newsapi.org/v2/everything?q=" + query +
    "&language=en&sortBy=publishedAt&pageSize=20&apiKey=" +
    process.env.NEWS_API_KEY;
  console.log("[NewsAPI] Fetching articles...");
  const data = await httpsGet(url);
  if (!data) {
    console.error("[NewsAPI] Empty response — API may be unreachable.");
    return [];
  }
  try {
    const j = JSON.parse(data);
    if (j.status === "error") {
      console.error(`[NewsAPI] API error: ${j.code} — ${j.message}`);
      return [];
    }
    const articles = (j.articles || []).map((a) => ({
      title: a.title,
      link: a.url,
      pubDate: a.publishedAt,
      source: (a.source && a.source.name) || "News",
      image: a.urlToImage || null,
    }));
    console.log(`[NewsAPI] Received ${articles.length} articles.`);
    return articles;
  } catch (err) {
    console.error(`[NewsAPI] Failed to parse response: ${err.message}`);
    return [];
  }
}

async function fetchHackerNews() {
  const allItems = [];
  for (const query of TRACKER.hackerNewsQueries) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`;
    console.log(`[HN] Searching: "${query}"`);
    const data = await httpsGet(url);
    if (!data) {
      console.warn(`[HN] Empty response for "${query}".`);
      continue;
    }
    try {
      const j = JSON.parse(data);
      const hits = (j.hits || [])
        .filter((h) => h.url)
        .map((h) => ({
          title: h.title,
          link: h.url,
          pubDate: h.created_at,
          source: "Hacker News",
          hnPoints: h.points || 0,
          hnComments: h.num_comments || 0,
        }));
      console.log(`[HN] Found ${hits.length} stories for "${query}".`);
      allItems.push(...hits);
    } catch (err) {
      console.error(`[HN] Failed to parse response for "${query}": ${err.message}`);
    }
  }
  const seen = new Set();
  return allItems.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

async function fetchYouTube() {
  const allItems = [];
  for (const feed of TRACKER.youtubeFeeds) {
    console.log(`[YouTube] Fetching: ${feed.source}`);
    const xml = await httpsGet(feed.url);
    if (!xml) {
      console.warn(`[YouTube] Empty response from ${feed.source}.`);
      continue;
    }
    const items = parseAtomEntries(xml, feed.source);
    console.log(`[YouTube] Found ${items.length} videos from ${feed.source}.`);
    allItems.push(...items);
  }
  return allItems;
}

async function fetchReddit() {
  const allItems = [];
  for (const url of TRACKER.redditFeeds) {
    const subreddit = url.match(/r\/([^/]+)/)?.[1] || "reddit";
    console.log(`[Reddit] Fetching r/${subreddit}...`);
    const xml = await httpsGet(url);
    if (!xml) {
      console.warn(`[Reddit] Empty response from r/${subreddit}.`);
      continue;
    }
    const items = parseAtomEntries(xml, `Reddit r/${subreddit}`);
    console.log(`[Reddit] Found ${items.length} posts from r/${subreddit}.`);
    allItems.push(...items);
  }
  return allItems;
}

async function fetchWhitelistFeeds() {
  const allItems = [];
  const keywords = TRACKER.whitelistKeywords;
  for (const feed of TRACKER.whitelistFeeds) {
    console.log(`[Whitelist] Fetching: ${feed.source} — ${feed.url}`);
    const xml = await httpsGet(feed.url);
    if (!xml) {
      console.warn(`[Whitelist] Empty response from ${feed.source}.`);
      continue;
    }
    const items = parseRSSItems(xml, feed.source);
    const matched = items.filter((item) => {
      const text = (item.title + " " + (item.description || "")).toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });
    console.log(`[Whitelist] ${feed.source}: ${items.length} total items, ${matched.length} matched keywords.`);
    allItems.push(...matched);
  }
  return allItems;
}

// ── Summarization ───────────────────────────────────────────────────────────

async function summarizeWithClaude(title, url) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[Claude] ANTHROPIC_API_KEY is not set — using title as summary.");
    return title;
  }
  try {
    const client = new Anthropic();
    const prompt =
      `Write a 2-3 sentence factual summary of this news article about ${TRACKER.name} (Advanced Machine Intelligence) for a news tracker. ` +
      "Article title: " + JSON.stringify(title) + ". URL: " + url + ". " +
      "Base your summary on what the title conveys. Do NOT mention that you cannot access URLs. Do NOT ask for more information. " +
      "If the title alone is insufficient to write a meaningful summary, respond with only an empty string and nothing else.";
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text.trim() : title;
  } catch (err) {
    console.error(`[Claude] Summarization failed for "${title}": ${err.message}`);
    return title;
  }
}

// ── Tagging & utilities ─────────────────────────────────────────────────────

function inferTags(title) {
  const t = title.toLowerCase();
  return TRACKER.tagRules.filter((r) => r.pattern.test(t)).map((r) => r.tag);
}

function parseDate(dateStr) {
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
}

// ── Sanity write ────────────────────────────────────────────────────────────

async function writeToSanity(article) {
  if (!sanityClient) return;
  const doc = {
    _type: "article",
    _id: `news-bot-${article.id}`,
    title: article.title,
    slug: { _type: "slug", current: slugify(article.title) },
    source: article.source,
    externalUrl: article.url,
    publishedAt: new Date(article.publishedAt).toISOString(),
    summary: article.summary,
    tags: article.tags,
    score: article.score,
    reviewStatus: article.status,
  };
  // Person references, resolved from the detected slugs (skipped if Sanity lacks the person).
  const peopleRefs = (article.people || [])
    .map((slug) => personIdBySlug.get(slug))
    .filter(Boolean)
    .map((id) => ({ _type: "reference", _ref: id, _key: id }));
  if (peopleRefs.length) doc.people = peopleRefs;
  try {
    await sanityClient.createOrReplace(doc);
    console.log(`  [Sanity] Wrote ${article.status} article: "${article.title}" (score: ${article.score})`);
  } catch (err) {
    console.error(`  [Sanity] Failed to write "${article.title}": ${err.message}`);
  }
}

// ── GitHub Issue notification ───────────────────────────────────────────────

async function notifyPendingArticles(pendingArticles) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    console.warn("[Notify] GITHUB_TOKEN or GITHUB_REPOSITORY not set — skipping notification.");
    return;
  }
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
  const lines = pendingArticles.map((a) =>
    `- [ ] **${a.title}** (score: ${a.score})\n  Source: ${a.source} | [Link](${a.url})\n  ${a.summary ? a.summary.slice(0, 150) + "…" : ""}`
  );
  const body =
    `## ${pendingArticles.length} article(s) awaiting review\n\n` +
    lines.join("\n\n") +
    `\n\n---\n[Review on admin page](${TRACKER.siteUrl}/admin/review)\n\n_Auto-generated by AMI News Bot at ${new Date().toISOString()}_`;

  const payload = JSON.stringify({
    title: `[News Bot] ${pendingArticles.length} article(s) need review`,
    body,
    labels: ["news-bot", "review-needed"],
    assignees: [owner], // notify the repo owner (GitHub emails/pushes to the assignee)
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}/issues`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "AMI-Labs-News-Bot/1.0",
        Accept: "application/vnd.github+json",
      },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode === 201) {
          const issue = JSON.parse(data);
          console.log(`[Notify] Created GitHub Issue #${issue.number}: ${issue.html_url}`);
        } else {
          console.error(`[Notify] Failed to create issue (${res.statusCode}): ${data.slice(0, 200)}`);
        }
        resolve();
      });
    });
    req.on("error", (err) => {
      console.error(`[Notify] Request failed: ${err.message}`);
      resolve();
    });
    req.write(payload);
    req.end();
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`=== ${TRACKER.name} News Bot ===`);
  console.log(`Existing articles: ${existing.length} (${existingUrls.size} unique URLs)\n`);

  // Fetch from all sources in parallel
  const [rssItems, newsApiItems, hnItems, ytItems, redditItems, whitelistItems] = await Promise.all([
    fetchGoogleNews(),
    fetchNewsAPI(),
    fetchHackerNews(),
    fetchYouTube(),
    fetchReddit(),
    fetchWhitelistFeeds(),
  ]);

  const allItems = [...rssItems, ...newsApiItems, ...hnItems, ...ytItems, ...redditItems, ...whitelistItems];

  // Deduplicate across all sources by URL
  const seenLinks = new Set();
  const uniqueItems = allItems.filter((item) => {
    if (!item.link || seenLinks.has(item.link)) return false;
    seenLinks.add(item.link);
    return true;
  });

  // Filter out articles already in news.json (by URL or fuzzy title match)
  const newItems = uniqueItems.filter((item) => {
    if (existingUrls.has(item.link)) return false;
    if (isTitleDuplicate(item.title)) {
      console.log(`[Dedup] Skipped near-duplicate: "${item.title}"`);
      return false;
    }
    return true;
  });

  console.log(`\nFound ${uniqueItems.length} unique items across all sources, ${newItems.length} are new.`);

  if (newItems.length === 0) {
    console.log("No new articles to add.");
    return;
  }

  // Resolve person slug → Sanity _id once, so detected people can be written as references.
  if (sanityClient) {
    try {
      const persons = await sanityClient.fetch('*[_type == "person" && !(_id in path("drafts.**"))]{_id, "slug": slug.current}');
      for (const p of persons || []) if (p.slug) personIdBySlug.set(p.slug, p._id);
    } catch (err) {
      console.warn(`[Sanity] Could not load person ids for tagging: ${err.message}`);
    }
  }

  // Score and route articles
  const newArticles = [];
  const pendingArticles = [];
  let pending = 0, rejected = 0;

  for (const item of newItems.slice(0, TRACKER.maxNewPerRun)) {
    const { score, breakdown } = scoreArticle(item);

    // No auto-approval: relevant articles await human review; clear noise is rejected.
    let status;
    if (score >= TRACKER.autoRejectThreshold) {
      status = "pending";
      pending++;
    } else {
      status = "rejected";
      rejected++;
    }

    console.log(`  [Score] ${score}/100 → ${status} | "${item.title}"`);
    breakdown.forEach((b) => console.log(`          ${b}`));

    const summary = status !== "rejected"
      ? await summarizeWithClaude(item.title, item.link)
      : "";

    // Thumbnail: feed-provided image first; otherwise fetch the article's og:image.
    // Only for shown (non-rejected) items — rejected are archived but never displayed.
    const image = item.image || (status !== "rejected" ? await fetchOgImage(item.link) : null);

    const article = {
      id: randomUUID(),
      title: item.title,
      source: item.source,
      url: item.link,
      publishedAt: parseDate(item.pubDate),
      summary,
      tags: inferTags(item.title),
      score,
      status,
      addedAt: new Date().toISOString(),
      image: image || null,
      // Roster people mentioned in the headline/summary (slugs; reviewed before publishing).
      people: detectPeople(`${item.title}. ${summary}`, mentionIndex),
    };
    if (article.people.length === 0) delete article.people; // keep records clean

    newArticles.push(article);
    if (status === "pending") pendingArticles.push(article);

    await writeToSanity(article);
  }

  console.log(`\nRouting: ${pending} pending review, ${rejected} rejected.`);

  // Write all articles (including rejected) to news.json as archive
  if (newArticles.length > 0) {
    const updated = [...newArticles, ...existing];
    fs.writeFileSync(TRACKER.dataFile, JSON.stringify(updated, null, 2));
    console.log(`Updated news.json with ${newArticles.length} new articles (total: ${updated.length}).`);
  }

  // Notify about pending articles via GitHub Issue
  if (pendingArticles.length > 0) {
    await notifyPendingArticles(pendingArticles);
  }
})();
