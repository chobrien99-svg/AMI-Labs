// ============================================================================
// One-off backfill: fetch a thumbnail (og:image / twitter:image) for existing
// news.json articles that don't have one yet. Meant to run in GitHub Actions
// (needs outbound web access). Idempotent — skips articles that already have an
// image, and only touches shown (non-rejected) articles.
//
//   node scripts/backfill-news-images.js         # backfill all missing
//   BACKFILL_MAX=40 node scripts/backfill-news-images.js   # cap this run
// ============================================================================

const fs = require("fs");
const path = require("path");
const https = require("https");

const DATA_FILE = path.resolve(__dirname, "../data/news.json");
const MAX = Number(process.env.BACKFILL_MAX) || Infinity;

function httpsGet(url, maxRedirects = 5) {
  return new Promise((resolve) => {
    const doRequest = (requestUrl, redirectsLeft) => {
      let proto;
      try {
        proto = requestUrl.startsWith("http://") ? require("http") : https;
      } catch {
        return resolve("");
      }
      const req = proto.get(
        requestUrl,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; AMI-Labs-News-Bot/1.0)" }, timeout: 15000 },
        (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
            if (redirectsLeft <= 0) { res.resume(); return resolve(""); }
            const next = new URL(res.headers.location, requestUrl).href;
            res.resume();
            return doRequest(next, redirectsLeft - 1);
          }
          if (res.statusCode !== 200) { res.resume(); return resolve(""); }
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve(data));
        }
      );
      req.on("error", () => resolve(""));
      req.on("timeout", () => { req.destroy(); resolve(""); });
    };
    try { doRequest(url, maxRedirects); } catch { resolve(""); }
  });
}

async function fetchOgImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const html = await httpsGet(url);
  if (!html) return null;
  const head = html.slice(0, 120000);
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

(async () => {
  const articles = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  // Only shown articles (approved or legacy no-status) that have no image yet.
  const targets = articles.filter(
    (a) => (!a.status || a.status === "approved") && a.url && !a.image
  );
  console.log(`[backfill] ${targets.length} article(s) missing an image (of ${articles.length}); cap ${MAX}.`);

  let filled = 0, tried = 0;
  for (const a of targets) {
    if (tried >= MAX) break;
    tried++;
    const img = await fetchOgImage(a.url);
    if (img) {
      a.image = img;
      filled++;
      console.log(`  ✓ ${a.source}: ${a.title.slice(0, 70)}`);
    } else {
      a.image = a.image ?? null; // mark as attempted so we don't retry forever
      console.log(`  · none: ${a.title.slice(0, 70)}`);
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(articles, null, 2) + "\n");
  console.log(`[backfill] Filled ${filled}/${tried} attempted. Wrote ${DATA_FILE}.`);
})();
