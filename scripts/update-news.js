const fs = require("fs");
const https = require("https");
const { randomUUID } = require("crypto");
const Anthropic = require("@anthropic-ai/sdk").default;

const DATA_FILE = "./data/news.json";
const existing = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const existingUrls = new Set(existing.map((a) => a.url));

function httpsGet(url) {
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": "AMI-Labs-News-Bot/1.0" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", () => resolve(""));
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

async function fetchNewsAPI() {
  if (!process.env.NEWS_API_KEY) return [];
  const query = encodeURIComponent("AMI Labs LeCun");
  const url =
    "https://newsapi.org/v2/everything?q=" +
    query +
    "&language=en&sortBy=publishedAt&pageSize=20&apiKey=" +
    process.env.NEWS_API_KEY;
  const data = await httpsGet(url);
  try {
    const j = JSON.parse(data);
    return (j.articles || []).map((a) => ({
      title: a.title,
      link: a.url,
      pubDate: a.publishedAt,
      source: (a.source && a.source.name) || "News",
    }));
  } catch {
    return [];
  }
}

async function summarizeWithClaude(title, url) {
  if (!process.env.ANTHROPIC_API_KEY) return title;
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
}

function inferTags(title) {
  const t = title.toLowerCase();
  const tags = [];
  if (/rais|fund|invest|valuat|billion|million/.test(t)) tags.push("funding");
  if (/research|paper|model|jepa|science|publish/.test(t)) tags.push("research");
  if (/hir|join|appoint|team/.test(t)) tags.push("hiring");
  if (/regulat|legal|filing|compliance/.test(t)) tags.push("regulatory");
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
  const rssXml = await httpsGet(
    "https://news.google.com/rss/search?q=AMI+Labs+Yann+LeCun&hl=en&gl=US&ceid=US:en"
  );
  const rssItems = parseRSSItems(rssXml);
  const newsApiItems = await fetchNewsAPI();
  const allItems = [...rssItems, ...newsApiItems];

  const newItems = allItems.filter((item) => item.link && !existingUrls.has(item.link));
  console.log("Found " + allItems.length + " total items, " + newItems.length + " new.");

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
    console.log("Added: " + item.title);
  }

  if (newArticles.length > 0) {
    const updated = [...newArticles, ...existing];
    fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2));
    console.log("Updated news.json with " + newArticles.length + " new articles.");
  } else {
    console.log("No new articles to add.");
  }
})();
