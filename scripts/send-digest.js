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

// ── new research (diff since last digest) ─────────────────────────────────────
// research.json is a rolling, de-duplicated corpus keyed by Semantic Scholar
// paperId. To surface "what's new since last week" we keep a small state file of
// paperIds we've already reported and diff against it — this is robust to the
// fetch pipeline back-filling old papers (which have old publicationDates but
// only just entered the corpus) in a way a pure date-window filter is not.
const SEEN_PATH = path.resolve(__dirname, "../data/research-digest-seen.json");
const NEW_RESEARCH_MAX = 18; // cap how many we render; ALL current ids are still recorded as seen

function loadResearchPapers() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data/research.json"), "utf8"));
    const papers = Array.isArray(raw) ? raw : raw.papers || raw.items || [];
    return papers.filter((p) => p && p.paperId);
  } catch (e) {
    console.warn("Could not read research.json:", e.message);
    return [];
  }
}

function loadSeenIds(seenPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(seenPath, "utf8"));
    const ids = Array.isArray(raw) ? raw : raw.seenPaperIds || [];
    return new Set(ids.filter(Boolean));
  } catch {
    return null; // no state file yet → first run
  }
}

// Diff the corpus against the seen-set. First run seeds a baseline and reports
// nothing (so the first real digest isn't a 600-paper dump). Every run returns
// the union of previously-seen ids + all current ids to persist, so a paper is
// never reported twice even if only a subset was rendered.
function computeNewResearch(papers, seenPath, max = NEW_RESEARCH_MAX) {
  const currentIds = papers.map((p) => p.paperId);
  const seen = loadSeenIds(seenPath);
  const isFirstRun = seen === null;
  const nextSeen = new Set([...(seen || []), ...currentIds]);

  let newResearch = [];
  if (!isFirstRun) {
    newResearch = papers
      .filter((p) => !seen.has(p.paperId))
      .sort((a, b) => String(b.publicationDate || "").localeCompare(String(a.publicationDate || "")))
      .slice(0, max);
  }
  return { newResearch, nextSeen: [...nextSeen], isFirstRun };
}

function persistSeen(seenPath, ids) {
  const payload = { seenPaperIds: [...ids].sort(), updatedAt: new Date().toISOString() };
  fs.writeFileSync(seenPath, JSON.stringify(payload, null, 2));
}

// ── build HTML email ──────────────────────────────────────────────────────────
// Palette + fonts mirror the site's "Instrument" design (app/instrument-theme.css,
// app/home-instrument.css): ink canvas, paper body, blue + clay accents, serif
// editorial headlines, mono labels. Email-safe: hardcoded hex, web-safe font
// fallbacks (the display faces load in clients that have them, else fall back).
const DZ = {
  ink: "#0B0E13", panel: "#141A22", paper: "#F4F4F1", card: "#FFFFFF",
  border: "#E1E0DB", line: "#ECEBE6",
  blue: "#4A7FA5", blueSoft: "#8FB6FF", clay: "#C96D3B",
  text: "#15181D", muted: "#7C8288", body: "#3A4048",
  onDark: "#F5F8FC", onDarkDim: "#93A0B4", onDarkDd: "#6B788C",
};
// Category accent colors, straight from home-instrument.css (.c-funding etc.).
const CAT = { funding: "#B45E2E", research: "#B23F3F", hiring: "#8A6A12", product: "#2A6B4A", administrative: "#51575C" };
const FZ = {
  serif: "'Newsreader',Georgia,'Times New Roman',serif",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,'Courier New',monospace",
  body: "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

// Small uppercase mono section label with the blue "blip" square, matching the site eyebrow.
function sectionLabel(text) {
  return `<p style="margin:0;font-family:${FZ.mono};font-size:10.5px;font-weight:600;color:${DZ.blue};text-transform:uppercase;letter-spacing:0.14em;">
    <span style="display:inline-block;width:6px;height:6px;background:${DZ.blue};margin-right:8px;vertical-align:middle;"></span>${text}</p>`;
}

function articleRow(a) {
  const cat = (a.category || (Array.isArray(a.tags) ? a.tags[0] : "") || "").toLowerCase();
  const accent = CAT[cat] || DZ.blue;
  const chip = cat
    ? `<span style="font-family:${FZ.mono};font-size:9.5px;font-weight:600;color:${accent};text-transform:uppercase;letter-spacing:0.06em;border:1px solid ${accent}40;padding:1px 6px;border-radius:3px;margin-left:8px;">${cat}</span>`
    : "";
  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${DZ.line};">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="3" valign="top" style="padding-top:5px;"><div style="width:3px;height:34px;background:${accent};border-radius:2px;"></div></td>
          <td style="padding-left:13px;">
            <a href="${a.url}" style="font-family:${FZ.serif};color:${DZ.text};font-weight:500;text-decoration:none;font-size:15px;line-height:1.35;">${a.title}</a>
            <div style="margin-top:6px;">
              <span style="font-family:${FZ.mono};color:${DZ.muted};font-size:11px;">${a.source || ""}${a.publishedAt ? ` &middot; ${a.publishedAt}` : ""}</span>${chip}
            </div>
            ${a.summary ? `<p style="color:${DZ.body};font-size:13px;line-height:1.55;margin:8px 0 0;">${a.summary.slice(0, 180)}${a.summary.length > 180 ? "…" : ""}</p>` : ""}
          </td>
        </tr></table>
      </td>
    </tr>`;
}

function researchRow(p) {
  const accent = CAT.research || DZ.blue;
  const team = (Array.isArray(p.teamAuthors) ? p.teamAuthors : [])
    .map((t) => (t && t.name) || "")
    .filter(Boolean);
  const authorLine = team.length
    ? team.slice(0, 4).join(", ") + (team.length > 4 ? ` +${team.length - 4}` : "")
    : "";
  const date = p.publicationDate || (p.year ? String(p.year) : "");
  const meta = [authorLine, [p.venue, date].filter(Boolean).join(" · ")].filter(Boolean).join("  ·  ");
  const tldr = p.tldr || "";
  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${DZ.line};">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="3" valign="top" style="padding-top:5px;"><div style="width:3px;height:34px;background:${accent};border-radius:2px;"></div></td>
          <td style="padding-left:13px;">
            <a href="${p.url}" style="font-family:${FZ.serif};color:${DZ.text};font-weight:500;text-decoration:none;font-size:15px;line-height:1.35;">${p.title}</a>
            ${meta ? `<div style="margin-top:6px;"><span style="font-family:${FZ.mono};color:${DZ.muted};font-size:11px;">${meta}</span></div>` : ""}
            ${tldr ? `<p style="color:${DZ.body};font-size:13px;line-height:1.55;margin:8px 0 0;">${tldr.slice(0, 200)}${tldr.length > 200 ? "…" : ""}</p>` : ""}
          </td>
        </tr></table>
      </td>
    </tr>`;
}

function jobRow(j) {
  return `
    <tr>
      <td style="padding:0 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${DZ.paper};border:1px solid ${DZ.border};border-radius:7px;">
          <tr>
            <td style="padding:12px 15px;">
              <a href="${j.url}" style="font-family:${FZ.serif};color:${DZ.text};font-weight:500;text-decoration:none;font-size:14px;">${j.title}</a>
              <br/>
              <span style="font-family:${FZ.mono};color:${DZ.muted};font-size:11px;">${[j.department, j.location].filter(Boolean).join(" · ")}</span>
            </td>
            <td width="56" align="right" valign="middle" style="padding:12px 15px;">
              <a href="${j.url}" style="font-family:${FZ.mono};font-size:11px;font-weight:600;color:${DZ.blue};text-decoration:none;">View &rarr;</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// ── Observatory Briefing (published, human-reviewed synthesis) ────────────────

// Only include a briefing that is published (status "ok") AND fresh — so an
// unpublished or stale (e.g. skipped-week) briefing is never re-emailed.
function loadBriefing() {
  try {
    const b = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data/synthesis.json"), "utf8"));
    if (!b || b.status !== "ok" || !b.headline) return null;
    const stamp = b.publishedAt || b.generatedAt;
    if (!stamp) return null;
    const ageDays = (Date.now() - new Date(stamp).getTime()) / (24 * 60 * 60 * 1000);
    if (!(ageDays >= 0) || ageDays > 9) return null;
    return b;
  } catch {
    return null;
  }
}

function briefingThread(t) {
  const ev = (t.evidence || [])
    .map((e) => `<a href="${e.url}" style="font-family:${FZ.mono};color:${DZ.blue};text-decoration:none;">${e.label}</a>`)
    .join(` <span style="color:${DZ.border};">&middot;</span> `);
  const paras = String(t.narrative || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p, i) =>
        `<p style="margin:${i === 0 ? "0" : "8px 0 0"};font-size:13px;color:${DZ.body};line-height:1.55;">${p}</p>`
    )
    .join("");
  return `
    <div style="margin:0 0 18px;padding-left:13px;border-left:2px solid ${DZ.border};">
      <p style="margin:0 0 5px;font-family:${FZ.serif};font-size:15px;font-weight:500;color:${DZ.text};">${t.title}</p>
      ${paras}
      ${ev ? `<p style="margin:7px 0 0;font-size:12px;">${ev}</p>` : ""}
    </div>`;
}

function briefingSection(b) {
  const threads = (b.threads || []).slice(0, 4).map(briefingThread).join("");
  return `
        <tr>
          <td style="padding:26px 0 10px;">
            ${sectionLabel("Observatory Briefing")}
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 22px;border-bottom:1px solid ${DZ.border};">
            <h2 style="margin:0 0 12px;font-size:22px;font-weight:500;color:${DZ.text};font-family:${FZ.serif};line-height:1.2;letter-spacing:-0.01em;">${b.headline}</h2>
            <p style="margin:0 0 20px;font-size:14px;color:${DZ.body};line-height:1.6;">${b.stateOfPlay}</p>
            ${threads}
            ${b.whatToWatch ? `<p style="margin:16px 0 0;font-size:13px;color:${DZ.body};line-height:1.55;"><strong style="color:${DZ.clay};">What to watch:</strong> ${b.whatToWatch}</p>` : ""}
            <p style="margin:20px 0 0;"><a href="${SITE_URL}/briefing" style="font-family:${FZ.mono};color:${DZ.blue};font-weight:600;text-decoration:none;font-size:12.5px;">Read the full briefing &rarr;</a></p>
          </td>
        </tr>`;
}

// ── fetch subscribers and send ────────────────────────────────────────────────

function buildHtml(briefing, newArticles, newJobs, newResearch = []) {
  const weekLabel = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${DZ.paper};font-family:${FZ.body};">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:${DZ.paper};">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${DZ.card};border:1px solid ${DZ.border};border-radius:12px;overflow:hidden;">

        <!-- accent bar (blue → clay) -->
        <tr><td style="height:3px;background:linear-gradient(90deg,${DZ.blue} 0%,${DZ.clay} 100%);font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- header: ink hero band -->
        <tr>
          <td style="background:${DZ.ink};padding:30px 36px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle">
                  <span style="font-family:${FZ.mono};font-size:10.5px;font-weight:600;color:${DZ.blueSoft};text-transform:uppercase;letter-spacing:0.2em;">
                    <span style="display:inline-block;width:7px;height:7px;background:${DZ.blueSoft};margin-right:9px;vertical-align:middle;"></span>AMI Observatory</span>
                </td>
                <td align="right" valign="middle">
                  <span style="font-family:${FZ.mono};font-size:10px;color:${DZ.onDarkDd};letter-spacing:0.03em;">The French Tech Journal</span>
                </td>
              </tr>
            </table>
            <h1 style="margin:18px 0 0;font-family:${FZ.serif};font-size:30px;font-weight:500;color:${DZ.onDark};line-height:1.05;letter-spacing:-0.01em;">Weekly Digest</h1>
            <p style="margin:9px 0 0;font-family:${FZ.mono};font-size:11.5px;color:${DZ.onDarkDim};letter-spacing:0.02em;">Week of ${weekLabel}</p>
          </td>
        </tr>

        <!-- body -->
        <tr><td style="padding:8px 36px 0;">

          ${briefing ? `<table width="100%" cellpadding="0" cellspacing="0">${briefingSection(briefing)}</table>` : ""}

          ${newResearch.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:26px 0 4px;">${sectionLabel("New Research")}</td></tr>
            <tr><td style="padding:0 0 8px;"><p style="margin:0;font-family:${FZ.mono};font-size:11px;color:${DZ.muted};line-height:1.5;">Papers added to the research index this week, co-authored by AMI team members.</p></td></tr>
            ${newResearch.map(researchRow).join("")}
            <tr><td style="padding:12px 0 0;"><a href="${SITE_URL}/research" style="font-family:${FZ.mono};color:${DZ.blue};font-weight:600;text-decoration:none;font-size:12.5px;">Browse the full research index &rarr;</a></td></tr>
          </table>` : ""}

          ${newArticles.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:26px 0 12px;">${sectionLabel("News &amp; Coverage")}</td></tr>
            ${newArticles.map(articleRow).join("")}
          </table>` : ""}

          ${newJobs.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:26px 0 14px;">${sectionLabel("Open Positions")}</td></tr>
            ${newJobs.map(jobRow).join("")}
          </table>` : ""}

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="center" style="padding:30px 0 6px;">
              <a href="${SITE_URL}" style="display:inline-block;font-family:${FZ.body};padding:12px 28px;background:${DZ.blue};color:#fff;font-size:13px;font-weight:600;border-radius:5px;text-decoration:none;">Read more at AMI Observatory</a>
            </td>
          </tr></table>

          <!-- footer -->
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="padding:26px 0 30px;margin-top:8px;border-top:1px solid ${DZ.border};">
              <p style="margin:18px 0 0;font-family:${FZ.mono};font-size:11px;color:${DZ.muted};line-height:1.6;">
                You&rsquo;re receiving this because you subscribed at
                <a href="https://frenchtechjournal.com" style="color:${DZ.blue};text-decoration:none;">frenchtechjournal.com</a>.
                &nbsp;&middot;&nbsp;
                <a href="{{unsubscribe_url}}" style="color:${DZ.blue};text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr></table>

        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function main() {
  // Credentials are required only to actually send — checked here so importing
  // buildHtml (for previews/tests) doesn't terminate the caller.
  if (!API_KEY || !AUDIENCE_ID) {
    console.error("Missing RESEND_API_KEY or RESEND_AUDIENCE_ID");
    process.exit(1);
  }

  // Collect articles from both sources
  const jsonArticles = recentItems("news.json", "addedAt");
  const sanityArticles = await fetchSanityArticles();

  // Merge: Sanity first, then JSON — dedup by URL
  const sanityUrls = new Set(sanityArticles.map((a) => a.url));
  const newArticles = [...sanityArticles, ...jsonArticles.filter((a) => !sanityUrls.has(a.url))];
  const newJobs = recentItems("jobs.json", "postedAt");
  const briefing = loadBriefing();

  // New research is best-effort: any failure yields an empty section and never
  // blocks the digest, since this email goes to real subscribers.
  let research = { newResearch: [], nextSeen: null, isFirstRun: false };
  try {
    research = computeNewResearch(loadResearchPapers(), SEEN_PATH);
  } catch (e) {
    console.warn("New-research diff failed:", e.message);
  }
  const newResearch = research.newResearch;

  console.log(`Briefing: ${briefing ? "yes" : "no"}, Sanity articles: ${sanityArticles.length}, JSON articles: ${jsonArticles.length}, Jobs: ${newJobs.length}, New research: ${newResearch.length}${research.isFirstRun ? " (first run — baseline seeded)" : ""}`);

  if (!briefing && newArticles.length === 0 && newJobs.length === 0 && newResearch.length === 0) {
    // Even when skipping the email, persist the baseline on the very first run so
    // the first real digest isn't a backfill dump of the entire corpus.
    if (research.isFirstRun && research.nextSeen) {
      try { persistSeen(SEEN_PATH, research.nextSeen); console.log("Seeded research baseline."); }
      catch (e) { console.warn("Could not seed research baseline:", e.message); }
    }
    console.log("Nothing new this week — skipping digest.");
    process.exit(0);
  }

  const html = buildHtml(briefing, newArticles, newJobs, newResearch);

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

  // Record every current paperId as seen only after the send succeeded, so a
  // failed send doesn't silently swallow this week's new papers.
  if (research.nextSeen) {
    try { persistSeen(SEEN_PATH, research.nextSeen); console.log(`Recorded ${research.nextSeen.length} seen paperIds.`); }
    catch (e) { console.warn("Could not persist research state:", e.message); }
  }

  console.log("Digest complete.");
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { buildHtml, articleRow, jobRow, researchRow, computeNewResearch, loadResearchPapers };
