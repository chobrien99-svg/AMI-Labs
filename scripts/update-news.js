const fs = require("fs");
const https = require("https");
const { randomUUID } = require("crypto");
const Anthropic = require("@anthropic-ai/sdk").default;

// ═══════════════════════════════════════════════════════════════════════════
// TRACKER CONFIGURATION — edit this section to adapt for a different company
// ═══════════════════════════════════════════════════════════════════════════

const TRACKER = {
  name: "AMI Labs",
  dataFile: "./data/news.json",

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

  // Whitelisted RSS feeds from specific outlets known to cover AMI Labs
  whitelistFeeds: [
    { url: "https://techcrunch.com/feed/", source: "TechCrunch" },
    { url: "https://www.wired.com/feed/tag/ai/latest/rss", source: "Wired" },
    { url: "https://siliconangle.com/feed/", source: "SiliconANGLE" },
    { url: "https://the-decoder.com/feed/", source: "The Decoder" },
  ],

  // Keywords an article must match (at least one) to pass the whitelist filter.
  // Only applied to whitelisted RSS feeds, not Google News / NewsAPI / HN.
  whitelistKeywords: [
    "ami labs", "ami lab", "advanced machine intelligence",
    "yann lecun", "le cun", "lecun",
    "jepa", "world model",
    "alexandre lebrun",
  ],

  // Tag inference rules — regex patterns matched against lowercase title
  tagRules: [
    { tag: "funding", pattern: /rais|fund|invest|valuat|billion|million/ },
    { tag: "research", pattern: /research|paper|model|jepa|science|publish/ },
    { tag: "hiring", pattern: /hir|join|appoint|team/ },
    { tag: "administrative", pattern: /regulat|legal|filing|compliance|incorporat|statut|registr|kbis/ },
  ],

  // Max new articles to process per run (controls Claude API spend)
  maxNewPerRun: 10,
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE ENGINE — generally unchanged across trackers
// ═══════════════════════════════════════════════════════════════════════════

const existing = JSON.parse(fs.readFileSync(TRACKER.dataFile, "utf8"));
const existingUrls = new Set(existing.map((a) => a.url));
const existingTitles = existing.map((a) => a.title.toLowerCase());

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
    if (title && link) items.push({ title, link, pubDate, source: defaultSource });
  }
  return items;
}

// ── Fuzzy title deduplication ───────────────────────────────────────────────
// Jaccard similarity on word sets — catches "LeCun raises $1B" vs
// "Yann LeCun raises $1B for AMI Labs" without needing embeddings.

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
        .filter((h) => h.url) // skip Ask HN etc. without URLs
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
    // Filter to articles mentioning our keywords
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

// ── Tagging ─────────────────────────────────────────────────────────────────

function inferTags(title) {
  const t = title.toLowerCase();
  return TRACKER.tagRules.filter((r) => r.pattern.test(t)).map((r) => r.tag);
}

// ── Utilities ───────────────────────────────────────────────────────────────

function parseDate(dateStr) {
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`=== ${TRACKER.name} News Bot ===`);
  console.log(`Existing articles: ${existing.length} (${existingUrls.size} unique URLs)\n`);

  // Fetch from all sources in parallel
  const [rssItems, newsApiItems, hnItems, whitelistItems] = await Promise.all([
    fetchGoogleNews(),
    fetchNewsAPI(),
    fetchHackerNews(),
    fetchWhitelistFeeds(),
  ]);

  const allItems = [...rssItems, ...newsApiItems, ...hnItems, ...whitelistItems];

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

  const newArticles = [];
  for (const item of newItems.slice(0, TRACKER.maxNewPerRun)) {
    const summary = await summarizeWithClaude(item.title, item.link);
    newArticles.push({
      id: randomUUID(),
      title: item.title,
      source: item.source,
      url: item.link,
      publishedAt: parseDate(item.pubDate),
      summary,
      tags: inferTags(item.title),
      addedAt: new Date().toISOString(),
    });
    console.log(`  Added: ${item.title}`);
  }

  if (newArticles.length > 0) {
    const updated = [...newArticles, ...existing];
    fs.writeFileSync(TRACKER.dataFile, JSON.stringify(updated, null, 2));
    console.log(`\nUpdated news.json with ${newArticles.length} new articles (total: ${updated.length}).`);
  }
})();
