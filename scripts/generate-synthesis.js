// ============================================================================
// AMI Observatory — synthesis generator
// ----------------------------------------------------------------------------
// Computes the week's deterministic facts (scripts/lib/compute-signals.js) and
// asks Claude to turn ONLY those facts into an editorial "Observatory Briefing".
// Writes a DRAFT to data/synthesis.pending.json (never the published file) and
// opens a GitHub Issue with a preview for the editor to review.
//
// Publishing is a separate, human-triggered step (scripts/publish-synthesis.js
// + the publish-synthesis workflow), so nothing unreviewed ever goes live.
//
// Env:
//   ANTHROPIC_API_KEY     required to call the model (missing → error stub)
//   SYNTHESIS_MODEL       default "claude-sonnet-4-6"
//   SYNTHESIS_WINDOW_DAYS default 7
//   GITHUB_TOKEN,
//   GITHUB_REPOSITORY     optional — used to open the review issue
// ============================================================================

const fs = require("fs");
const path = require("path");
const https = require("https");

const {
  loadData,
  buildFacts,
  isEmpty,
  collectAllowedUrls,
} = require("./lib/compute-signals");

const PENDING_FILE = path.resolve(__dirname, "../data/synthesis.pending.json");
const MODEL = process.env.SYNTHESIS_MODEL || "claude-sonnet-4-6";
// Actions passes an empty string for an unset `vars.SYNTHESIS_WINDOW_DAYS`,
// which is not nullish — so `?? 7` would not fire and Number("") would be 0,
// collapsing the window to "today only". `|| 7` falls back on "", NaN, and 0.
const WINDOW_DAYS = Number(process.env.SYNTHESIS_WINDOW_DAYS) || 7;
const CATEGORIES = ["funding", "research", "hiring", "administrative", "corporate"];

// ── refusal detection (mirrors scripts/update-profiles.js) ───────────────────

const REFUSAL_PATTERNS = [
  /\bI cannot\b/i,
  /\bI can't\b/i,
  /\bI'm (not able|unable)\b/i,
  /\bI am (not able|unable)\b/i,
  /\bI don't have\b/i,
  /\bI do not have\b/i,
  /\bWould you like\b/i,
];

function looksLikeRefusal(text) {
  if (!text) return true;
  return REFUSAL_PATTERNS.some((p) => p.test(text));
}

// ── window / snapshot helpers ────────────────────────────────────────────────

function computeWindow() {
  const until = new Date();
  const since = new Date(until.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    days: WINDOW_DAYS,
    since: since.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  };
}

function readPrev() {
  try {
    return JSON.parse(fs.readFileSync(PENDING_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writePending(obj) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(obj, null, 2) + "\n");
  console.log(`[synthesis] Wrote ${PENDING_FILE} (status: ${obj.status})`);
}

// ── prompt construction ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  "You are the editorial analyst for The French Tech Journal's independent AMI Labs Observatory,",
  "a tracker of the Paris AI startup AMI Labs (Advanced Machine Intelligence, co-founded with Yann LeCun).",
  "Your job: read a FACTS object describing what changed this week across news, hiring, research",
  "publications, GitHub activity, French corporate/IP filings, site monitoring, and the team's X posts,",
  "and write a concise, analytical briefing that helps a reader understand what it all MEANS —",
  "connecting signals across sources.",
  "",
  "HARD RULES:",
  "- Use ONLY the numbers, names, dates, and items present in the FACTS object. Never invent or estimate.",
  "- Every evidence URL you cite MUST be copied verbatim from a URL that appears in FACTS.",
  "- If the facts are thin, write fewer threads rather than padding. Quality over quantity.",
  "- Neutral, precise, editorial tone. No hype, no spin, no speculation beyond a brief 'what to watch'.",
  "- Do NOT mention that you were given a facts object or that you are an AI.",
  "",
  "RESEARCH: when FACTS.publications.newItems contains a notable new paper, write a 'research'-category",
  "thread that explains in plain language WHAT the paper is and WHY it matters. Ground every claim ONLY in",
  "that paper's provided tldr, abstract, venue, authors, and citationCount — paraphrase them, never present",
  "results or significance beyond what they state. If the abstract is thin, keep the claim modest. Put the",
  "paper's url in evidence. Prefer explaining one or two of the most significant new papers well over listing many.",
  "",
  "SOCIAL: FACTS.social.notable holds notable X posts from the team (keyword-tagged or high-engagement).",
  "Treat these as primary-source signals — a hire teased, a launch, a research claim, a public stance. Read the",
  "post text and, where it corroborates or adds to other facts, fold it into the relevant thread and cite the post url.",
  "Quote or paraphrase only what the post says; do not infer beyond it. Ignore routine chatter.",
  "",
  "OUTPUT: a single JSON object and nothing else (no markdown fences, no commentary), with keys:",
  '  "headline": string (one editorial line),',
  '  "stateOfPlay": string (2-4 sentences summarising the week),',
  '  "threads": array (0-5) of { "title": string, "category": one of',
  `     [${CATEGORIES.map((c) => `"${c}"`).join(", ")}], "narrative": string (1-3 sentences),`,
  '     "evidence": array of { "label": string, "url": string } },',
  '  "signals": array (0-6) of { "text": string, "category": string },',
  '  "whatToWatch": string (1-2 sentences).',
  "",
  "If you cannot produce a grounded briefing from the facts, output exactly the single token SKIP.",
].join("\n");

function buildUserMessage(window, facts) {
  return [
    `WINDOW: last ${window.days} days (${window.since} to ${window.until}).`,
    "",
    "FACTS:",
    JSON.stringify(facts, null, 2),
    "",
    "Write the briefing JSON now.",
  ].join("\n");
}

// ── response parsing & validation ────────────────────────────────────────────

function extractJson(text) {
  let t = text.trim();
  // strip ``` / ```json fences if present
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1) return null;
  try {
    return JSON.parse(t.slice(first, last + 1));
  } catch (err) {
    console.warn(`[synthesis] JSON parse failed: ${err.message}`);
    return null;
  }
}

function validate(parsed, allowedUrls) {
  if (!parsed || typeof parsed !== "object") return null;
  const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
  const stateOfPlay = typeof parsed.stateOfPlay === "string" ? parsed.stateOfPlay.trim() : "";
  if (!headline || !stateOfPlay) return null;

  const threadsIn = Array.isArray(parsed.threads) ? parsed.threads.slice(0, 5) : [];
  const threads = threadsIn
    .map((t) => {
      if (!t || typeof t !== "object") return null;
      const title = typeof t.title === "string" ? t.title.trim() : "";
      const narrative = typeof t.narrative === "string" ? t.narrative.trim() : "";
      if (!title || !narrative) return null;
      const category = CATEGORIES.includes(t.category) ? t.category : "research";
      // Drop any evidence whose URL was not in the facts (anti-hallucination).
      const evidence = (Array.isArray(t.evidence) ? t.evidence : [])
        .filter((e) => e && typeof e.url === "string" && allowedUrls.has(e.url))
        .map((e) => ({ label: String(e.label || e.url).trim(), url: e.url }));
      return { title, category, narrative, evidence };
    })
    .filter(Boolean);

  const signals = (Array.isArray(parsed.signals) ? parsed.signals.slice(0, 6) : [])
    .map((s) => {
      if (!s || typeof s.text !== "string" || !s.text.trim()) return null;
      const category = CATEGORIES.includes(s.category) ? s.category : undefined;
      return { text: s.text.trim(), ...(category ? { category } : {}) };
    })
    .filter(Boolean);

  const whatToWatch = typeof parsed.whatToWatch === "string" ? parsed.whatToWatch.trim() : "";

  return { headline, stateOfPlay, threads, signals, whatToWatch };
}

// ── GitHub Issue notification (mirrors update-news.js notifyPendingArticles) ──

function renderPreview(briefing) {
  const lines = [];
  lines.push(`### ${briefing.headline}`, "", briefing.stateOfPlay, "");
  for (const t of briefing.threads) {
    lines.push(`**${t.title}** _(${t.category})_`, "", t.narrative);
    for (const e of t.evidence) lines.push(`  - [${e.label}](${e.url})`);
    lines.push("");
  }
  if (briefing.signals.length) {
    lines.push("**Signals**");
    for (const s of briefing.signals) lines.push(`- ${s.text}`);
    lines.push("");
  }
  if (briefing.whatToWatch) lines.push(`**What to watch:** ${briefing.whatToWatch}`);
  return lines.join("\n");
}

function openReviewIssue(briefing, window) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    console.warn("[synthesis] GITHUB_TOKEN/GITHUB_REPOSITORY not set — skipping review issue.");
    return Promise.resolve();
  }
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
  const body =
    `## Observatory Briefing awaiting review\n` +
    `_Window: ${window.since} → ${window.until}_\n\n` +
    renderPreview(briefing) +
    `\n\n---\n` +
    `- [ ] Reviewed / edited \`data/synthesis.pending.json\`\n` +
    `- [ ] Ready to publish\n\n` +
    `**To publish:** run the **Publish Observatory Briefing** workflow ` +
    `(Actions → Publish Observatory Briefing → Run workflow). ` +
    `Edit \`data/synthesis.pending.json\` first if you want changes.\n\n` +
    `_Auto-generated by the synthesis bot at ${new Date().toISOString()}_`;

  const payload = JSON.stringify({
    title: `[Briefing] Weekly Observatory briefing needs review (${window.until})`,
    body,
    labels: ["synthesis-bot", "review-needed"],
    assignees: [owner], // notify the repo owner (GitHub emails/pushes to the assignee)
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.github.com",
        path: `/repos/${owner}/${repo}/issues`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "AMI-Labs-Synthesis-Bot/1.0",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode === 201) {
            console.log(`[synthesis] Opened review issue: ${JSON.parse(data).html_url}`);
          } else {
            console.error(`[synthesis] Failed to open issue (${res.statusCode}): ${data.slice(0, 200)}`);
          }
          resolve();
        });
      }
    );
    req.on("error", (err) => {
      console.error(`[synthesis] Issue request failed: ${err.message}`);
      resolve();
    });
    req.write(payload);
    req.end();
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const window = computeWindow();
  const prev = readPrev();
  const prevSnapshot = prev && prev._snapshot ? prev._snapshot : null;

  const data = loadData();
  const { facts, snapshot } = buildFacts(data, { since: window.since, prevSnapshot });

  const base = {
    generatedAt: new Date().toISOString(),
    window,
    model: MODEL,
    facts,
    _snapshot: snapshot,
  };

  // No API key → write an error stub but keep any prior narrative if present.
  // Preserve the PRIOR snapshot (like the stale fallback): this run produced no
  // briefing, so advancing the diff baseline would make the failed run's new
  // jobs/publications/directors/capital/IP look "already seen" to the next run.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[synthesis] ANTHROPIC_API_KEY not set — writing status:error draft.");
    writePending({
      ...base,
      _snapshot: prevSnapshot || snapshot,
      status: "error",
      headline: prev?.headline || "",
      stateOfPlay: prev?.stateOfPlay || "",
      threads: prev?.threads || [],
      signals: prev?.signals || [],
      whatToWatch: prev?.whatToWatch || "",
    });
    return;
  }

  // Nothing new → empty draft, skip the model call entirely.
  if (isEmpty(facts)) {
    console.log("[synthesis] No new signals in window — writing status:empty draft.");
    writePending({
      ...base,
      status: "empty",
      headline: "A quiet week at the Observatory",
      stateOfPlay: "No significant new signals across news, hiring, research, or filings this week.",
      threads: [],
      signals: [],
      whatToWatch: "",
    });
    return;
  }

  const Anthropic = require("@anthropic-ai/sdk").default;
  const client = new Anthropic();
  const allowedUrls = collectAllowedUrls(facts);

  let text = "";
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(window, facts) }],
    });
    text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  } catch (err) {
    console.error(`[synthesis] Model call failed: ${err.message}`);
  }

  const keepStale = () => {
    // Keep the last good draft's narrative, but refresh the facts/window and
    // preserve the PRIOR snapshot so the next diff basis is unchanged.
    console.warn("[synthesis] Falling back to status:stale (kept previous narrative).");
    writePending({
      ...base,
      _snapshot: prevSnapshot || snapshot,
      status: "stale",
      headline: prev?.headline || "Briefing temporarily unavailable",
      stateOfPlay: prev?.stateOfPlay || "The latest briefing could not be regenerated. Showing the previous edition.",
      threads: prev?.threads || [],
      signals: prev?.signals || [],
      whatToWatch: prev?.whatToWatch || "",
    });
  };

  if (!text || text === "SKIP" || text.startsWith("SKIP") || looksLikeRefusal(text)) {
    keepStale();
    return;
  }

  const parsed = extractJson(text);
  const briefing = validate(parsed, allowedUrls);
  if (!briefing) {
    keepStale();
    return;
  }

  writePending({ ...base, status: "ok", ...briefing });
  console.log(`[synthesis] Draft ready: "${briefing.headline}" (${briefing.threads.length} threads)`);
  await openReviewIssue(briefing, window);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[synthesis] Fatal:", err);
    process.exit(1);
  });
}

module.exports = { extractJson, validate, buildUserMessage, renderPreview };
