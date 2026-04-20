/**
 * Weekly digest sender.
 * Reads data/news.json and data/jobs.json, filters items added in the last 7 days,
 * fetches subscribers from the Resend audience, and sends a digest email.
 *
 * Required env vars: RESEND_API_KEY, RESEND_AUDIENCE_ID, DIGEST_FROM_EMAIL
 * Optional:          DIGEST_REPLY_TO
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.RESEND_API_KEY;
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL || "AMI Labs Digest <digest@frenchtechjournal.com>";
const REPLY_TO = process.env.DIGEST_REPLY_TO || "";
const SANITY_TOKEN = process.env.SANITY_API_READ_TOKEN || "";
const SANITY_PROJECT_ID = "k8hl9hed";
const SANITY_DATASET = "production";
const SITE_URL = "https://ami.frenchtechjournal.com";

if (!API_KEY || !AUDIENCE_ID) {
  console.error("Missing RESEND_API_KEY or RESEND_AUDIENCE_ID");
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function resend(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: "api.resend.com",
        path,
        method,
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          "User-Agent": "AMI-Labs-Digest/1.0",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── collect new content (last 7 days) ────────────────────────────────────────

const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

function recentItems(file, dateField) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data", file), "utf8"));
    const items = Array.isArray(raw) ? raw : raw.jobs || raw.items || [];
    return items.filter((item) =>
      item[dateField] && new Date(item[dateField]) >= cutoff &&
      (!item.status || item.status === "approved")
    );
  } catch (e) {
    console.warn(`Could not read ${file}:`, e.message);
    return [];
  }
}

async function fetchSanityArticles() {
  if (!SANITY_TOKEN) {
    console.warn("No SANITY_API_READ_TOKEN — skipping Sanity fetch for digest.");
    return [];
  }
  try {
    const query = encodeURIComponent(
      `*[_type == "article" && !(_id in path("drafts.**")) && (reviewStatus == "approved" || !defined(reviewStatus)) && dateTime(publishedAt) >= dateTime("${cutoff.toISOString()}")] | order(publishedAt desc) { title, slug, source, externalUrl, publishedAt, summary }`
    );
    const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}?query=${query}`;
    const res = await get(url, {
      Authorization: `Bearer ${SANITY_TOKEN}`,
      "User-Agent": "AMI-Labs-Digest/1.0",
    });
    if (res.status !== 200 || !res.body.result) {
      console.warn("Sanity fetch returned unexpected response:", res.status, JSON.stringify(res.body));
      return [];
    }
    return res.body.result.map((a) => ({
      id: a.slug?.current ?? a.title,
      title: a.title,
      source: a.source ?? "AMI Labs",
      url: a.externalUrl ?? `${SITE_URL}/news/${a.slug?.current}`,
      publishedAt: a.publishedAt ?? "",
      summary: a.summary ?? "",
      tags: [],
      addedAt: a.publishedAt ?? "",
    }));
  } catch (e) {
    console.warn("Sanity fetch failed:", e.message);
    return [];
  }
}

// ── build HTML email ──────────────────────────────────────────────────────────

function articleRow(a) {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #D5CEBD;">
        <a href="${a.url}" style="color:#2C2517;font-weight:600;text-decoration:none;font-size:14px;">${a.title}</a>
        <br/>
        <span style="color:#8C8474;font-size:12px;">${a.source} &middot; ${a.publishedAt || ""}</span>
        ${a.summary ? `<p style="color:#4A3F30;font-size:13px;margin:6px 0 0;">${a.summary.slice(0, 180)}${a.summary.length > 180 ? "…" : ""}</p>` : ""}
      </td>
    </tr>`;
}

function jobRow(j) {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #D5CEBD;">
        <a href="${j.url}" style="color:#2C2517;font-weight:600;text-decoration:none;font-size:14px;">${j.title}</a>
        <br/>
        <span style="color:#8C8474;font-size:12px;">${[j.department, j.location].filter(Boolean).join(" · ")}</span>
      </td>
    </tr>`;
}

// ── fetch subscribers and send ────────────────────────────────────────────────

function buildHtml(newArticles, newJobs) {
  const weekLabel = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFFCF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <!-- accent bar -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="height:3px;background:linear-gradient(90deg,#C8962E 0%,#D4A854 40%,#E8D5A8 100%);"></td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFCF5;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- header -->
        <tr>
          <td style="padding:0 0 32px;border-bottom:1px solid #D5CEBD;">
            <p style="margin:0 0 4px;font-size:12px;color:#8C8474;text-transform:uppercase;letter-spacing:0.1em;">AMI Labs</p>
            <h1 style="margin:0;font-size:24px;font-weight:600;color:#2C2517;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.02em;">Weekly Digest</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#8C8474;">Week of ${weekLabel}</p>
          </td>
        </tr>

        ${newArticles.length > 0 ? `
        <!-- news -->
        <tr>
          <td style="padding:24px 0 8px;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#8C8474;text-transform:uppercase;letter-spacing:0.08em;">News & Coverage</p>
          </td>
        </tr>
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${newArticles.map(articleRow).join("")}
            </table>
          </td>
        </tr>` : ""}

        ${newJobs.length > 0 ? `
        <!-- jobs -->
        <tr>
          <td style="padding:24px 0 8px;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#8C8474;text-transform:uppercase;letter-spacing:0.08em;">Open Positions</p>
          </td>
        </tr>
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${newJobs.map(jobRow).join("")}
            </table>
          </td>
        </tr>` : ""}

        <!-- footer -->
        <tr>
          <td style="padding:40px 0 0;border-top:1px solid #D5CEBD;">
            <p style="margin:0;font-size:12px;color:#4A3F30;">
              You&rsquo;re receiving this because you subscribed at
              <a href="https://frenchtechjournal.com" style="color:#946B2D;text-decoration:none;">frenchtechjournal.com</a>.
              &nbsp;&middot;&nbsp;
              <a href="{{unsubscribe_url}}" style="color:#946B2D;text-decoration:none;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function main() {
  // Collect articles from both sources
  const jsonArticles = recentItems("news.json", "addedAt");
  const sanityArticles = await fetchSanityArticles();

  // Merge: Sanity first, then JSON — dedup by URL
  const sanityUrls = new Set(sanityArticles.map((a) => a.url));
  const newArticles = [...sanityArticles, ...jsonArticles.filter((a) => !sanityUrls.has(a.url))];
  const newJobs = recentItems("jobs.json", "postedAt");

  console.log(`Sanity articles: ${sanityArticles.length}, JSON articles: ${jsonArticles.length}, Jobs: ${newJobs.length}`);

  if (newArticles.length === 0 && newJobs.length === 0) {
    console.log("Nothing new this week — skipping digest.");
    process.exit(0);
  }

  const html = buildHtml(newArticles, newJobs);

  // Fetch all contacts
  const contactsRes = await resend("GET", `/audiences/${AUDIENCE_ID}/contacts`);
  if (contactsRes.status !== 200) {
    console.error("Failed to fetch contacts:", contactsRes.body);
    process.exit(1);
  }

  const contacts = (contactsRes.body.data || []).filter((c) => !c.unsubscribed);
  console.log(`Sending to ${contacts.length} subscriber(s)…`);

  if (contacts.length === 0) {
    console.log("No subscribers yet.");
    process.exit(0);
  }

  const weekLabel = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const subject = `AMI Labs Digest — ${weekLabel}`;
  const BATCH_SIZE = 100;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE).map((c) => ({
      from: FROM_EMAIL,
      to: [c.email],
      subject,
      html,
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
    }));

    const res = await resend("POST", "/emails/batch", batch);
    if (res.status !== 200 && res.status !== 201) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, res.body);
    } else {
      console.log(`Batch ${i / BATCH_SIZE + 1} sent (${batch.length} emails).`);
    }
  }

  console.log("Digest complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
