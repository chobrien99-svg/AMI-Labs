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
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL || "AMI Labs Digest <digest@amilabs.xyz>";
const REPLY_TO = process.env.DIGEST_REPLY_TO || "";

if (!API_KEY || !AUDIENCE_ID) {
  console.error("Missing RESEND_API_KEY or RESEND_AUDIENCE_ID");
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

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
    return items.filter((item) => item[dateField] && new Date(item[dateField]) >= cutoff);
  } catch (e) {
    console.warn(`Could not read ${file}:`, e.message);
    return [];
  }
}

const newArticles = recentItems("news.json", "addedAt");
const newJobs = recentItems("jobs.json", "postedAt");

console.log(`New articles: ${newArticles.length}, New jobs: ${newJobs.length}`);

if (newArticles.length === 0 && newJobs.length === 0) {
  console.log("Nothing new this week — skipping digest.");
  process.exit(0);
}

// ── build HTML email ──────────────────────────────────────────────────────────

function articleRow(a) {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #1e1e1e;">
        <a href="${a.url}" style="color:#e2e8f0;font-weight:600;text-decoration:none;font-size:14px;">${a.title}</a>
        <br/>
        <span style="color:#64748b;font-size:12px;">${a.source} &middot; ${a.publishedAt || ""}</span>
        ${a.summary ? `<p style="color:#94a3b8;font-size:13px;margin:6px 0 0;">${a.summary.slice(0, 180)}${a.summary.length > 180 ? "…" : ""}</p>` : ""}
      </td>
    </tr>`;
}

function jobRow(j) {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #1e1e1e;">
        <a href="${j.url}" style="color:#e2e8f0;font-weight:600;text-decoration:none;font-size:14px;">${j.title}</a>
        <br/>
        <span style="color:#64748b;font-size:12px;">${[j.department, j.location].filter(Boolean).join(" · ")}</span>
      </td>
    </tr>`;
}

const weekLabel = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- header -->
        <tr>
          <td style="padding:0 0 32px;">
            <p style="margin:0 0 4px;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.1em;">AMI Labs</p>
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#f1f5f9;">Weekly Digest</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#64748b;">Week of ${weekLabel}</p>
          </td>
        </tr>

        ${newArticles.length > 0 ? `
        <!-- news -->
        <tr>
          <td style="padding:0 0 8px;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">News & Coverage</p>
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
            <p style="margin:0;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Open Positions</p>
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
          <td style="padding:40px 0 0;">
            <p style="margin:0;font-size:12px;color:#334155;">
              You&rsquo;re receiving this because you subscribed at
              <a href="https://amilabs.xyz" style="color:#475569;">amilabs.xyz</a>.
              &nbsp;&middot;&nbsp;
              <a href="{{unsubscribe_url}}" style="color:#475569;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── fetch subscribers and send ────────────────────────────────────────────────

async function main() {
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
