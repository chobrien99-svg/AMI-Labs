const fs = require("fs");
const https = require("https");
const { randomUUID } = require("crypto");
const Anthropic = require("@anthropic-ai/sdk").default;

const DATA_FILE = "./data/news.json";
const existing = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const existingUrls = new Set(existing.map((a) => a.url));

// ── Broadened search queries ────────────────────────────────────────────────
// Use OR logic so we catch articles mentioning AMI Labs without LeCun and
// vice-versa.  Also include the full legal name and common abbreviations.
const GOOGLE_NEWS_QUERIES = [
  "https://news.google.com/rss/search?q=%22AMI+Labs%22+OR+%22Advanced+Machine+Intelligence%22&hl=en&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22AMI+Labs%22+%22Yann+LeCun%22&hl=en&gl=US&ceid=US:en",
];

const NEWSAPI_QUERY = '("AMI Labs" OR "Advanced Machine Intelligence" OR "AMI LeCun")';

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

function parseRSSItems(xml) {
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
    if (title && link) items.push({ title, link, pubDate, source: "Google News" });
  }
  return items;
}

async function fetchGoogleNews() {
  const allItems = [];
  for (const url of GOOGLE_NEWS_QUERIES) {
    console.log(`[Google News] Fetching: ${url}`);
    const xml = await httpsGet(url);
    if (!xml) {
      console.warn("[Google News] Empty response — the feed may be blocked or unavailable.");
      continue;
    }
    const items = parseRSSItems(xml);
    console.log(`[Google News] Parsed ${items.length} items from feed.`);
    allItems.push(...items);
  }
  // Deduplicate across feeds by link
  const seen = new Set();
  return allItems.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

async function fetchNewsAPI() {
  if (!process.env.NEWS_API_KEY) {
    console.warn("[NewsAPI] NEWS_API_KEY is not set — skipping NewsAPI fetch.");
    return [];
  }
  const query = encodeURIComponent(NEWSAPI_QUERY);
  const url =
    "https://newsapi.org/v2/everything?q=" +
    query +
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

async function summarizeWithClaude(title, url) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[Claude] ANTHROPIC_API_KEY is not set — using title as summary.");
    return title;
  }
  try {
    const client = new Anthropic();
    const prompt =
      "Write a 2-3 sentence factual summary of this news article about AMI Labs (Advanced Machine Intelligence) for a news tracker. " +
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

function inferTags(title) {
  const t = title.toLowerCase();
  const tags = [];
  if (/rais|fund|invest|valuat|billion|million/.test(t)) tags.push("funding");
  if (/research|paper|model|jepa|science|publish/.test(t)) tags.push("research");
  if (/hir|join|appoint|team/.test(t)) tags.push("hiring");
  if (/regulat|legal|filing|compliance|incorporat|statut|registr|kbis/.test(t)) tags.push("administrative");
  return tags;
}

function parseDate(dateStr) {
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

(async () => {
  console.log("=== AMI Labs News Bot ===");
  console.log(`Existing articles: ${existing.length} (${existingUrls.size} unique URLs)`);

  const rssItems = await fetchGoogleNews();
  const newsApiItems = await fetchNewsAPI();
  const allItems = [...rssItems, ...newsApiItems];

  // Deduplicate across both sources by link
  const seenLinks = new Set();
  const uniqueItems = allItems.filter((item) => {
    if (!item.link || seenLinks.has(item.link)) return false;
    seenLinks.add(item.link);
    return true;
  });

  const newItems = uniqueItems.filter((item) => !existingUrls.has(item.link));
  console.log(`\nFound ${uniqueItems.length} unique items across all sources, ${newItems.length} are new.`);

  if (newItems.length === 0) {
    console.log("No new articles to add.");
    return;
  }

  const newArticles = [];
  for (const item of newItems.slice(0, 10)) {
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
    console.log("  Added: " + item.title);
  }

  if (newArticles.length > 0) {
    const updated = [...newArticles, ...existing];
    fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2));
    console.log(`\nUpdated news.json with ${newArticles.length} new articles (total: ${updated.length}).`);
  }
})();
