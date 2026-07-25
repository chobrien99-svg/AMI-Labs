// ============================================================================
// AMI Observatory — periodic report generator (Phase 4)
// ----------------------------------------------------------------------------
// Produces a quarterly / semi-annual AMI report by joining the Phase 3 dossiers
// into deterministic facts (compute-report.js) and having Claude narrate them.
// The narration is grounded ONLY in the facts — no invented numbers, names, or
// links. Without ANTHROPIC_API_KEY it still emits a complete facts-only report.
//
// Writes:
//   reports/ami-report-<until-date>.md   — the report
//   data/report.json                     — { period, facts, narration }
//
//   node scripts/generate-report.js
//
// Env: ANTHROPIC_API_KEY (narration), SYNTHESIS_MODEL (default sonnet),
//      REPORT_WINDOW_DAYS (default 90).
// ============================================================================

const fs = require("fs");
const path = require("path");
const { buildReportFacts } = require("./lib/compute-report");

const MODEL = process.env.SYNTHESIS_MODEL || "claude-sonnet-4-6";
const WINDOW_DAYS = Number(process.env.REPORT_WINDOW_DAYS) || 90;
const REPORTS_DIR = path.resolve(__dirname, "../reports");
const JSON_OUT = path.resolve(__dirname, "../data/report.json");

const SYSTEM_PROMPT = [
  "You are a technical analyst for The French Tech Journal's AMI Labs Observatory, writing a",
  "periodic (quarterly / semi-annual) report on AMI Labs — an editorial outside view, not AMI's",
  "own marketing.",
  "",
  "You are given a JSON FACTS object: roster composition, new and top-cited research, GitHub",
  "project activity, notable news, the relationship network (co-authorship, shared work history,",
  "reporting), and per-person highlights — all for a stated time window.",
  "",
  "Write a report that turns these facts into an analytical narrative. HARD RULES:",
  "- Ground EVERY claim in the provided facts. Never invent a number, name, paper, date, or link.",
  "- Do NOT imply AMI owns external/community projects; describe members as contributing to them.",
  "- If a section's facts are thin, say so briefly rather than padding.",
  "- Neutral, precise, editorial tone. No hype.",
  "",
  "OUTPUT: a single JSON object and nothing else, with keys:",
  '  "title": string,',
  '  "subtitle": string (one line: the period and the through-line),',
  '  "overview": string (4-6 sentences: the period\'s throughline),',
  '  "sections": array of { "heading": string, "body": string (2-5 sentences) } covering, when the',
  "     facts support it: Research, Engineering & open-source, People & network, In the press.",
  "If you cannot produce a grounded report, output exactly SKIP.",
].join("\n");

function extractJson(text) {
  let t = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b === -1) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

async function narrate(facts) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[report] ANTHROPIC_API_KEY not set — writing facts-only report.");
    return null;
  }
  const Anthropic = require("@anthropic-ai/sdk").default;
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nWrite the report JSON now.` }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  if (!text || text.trim() === "SKIP") return null;
  return extractJson(text);
}

// ── markdown rendering ────────────────────────────────────────────────────────

const link = (text, url) => (url ? `[${text}](${url})` : text);

function factsAppendix(f) {
  const L = [];
  L.push("## By the numbers", "");
  L.push(`- **Team:** ${f.roster.total} people — ${f.roster.byDepartment.map((d) => `${d.count} ${d.key}`).join(", ")}.`);
  L.push(`- **Research:** ${f.research.newInWindow} new paper(s) in window; ${f.research.totalTracked} tracked.`);
  L.push(`- **Network:** ${f.network.coAuthorshipEdges} co-authorship link(s), ${f.network.sharedHistoryEdges} shared-history link(s), ${f.network.reportingEdges} reporting link(s).`);
  L.push(`- **News:** ${f.news.inWindow} item(s) in window.`, "");

  if (f.research.newPapers.length) {
    L.push("### New research this period", "");
    for (const p of f.research.newPapers.slice(0, 12)) {
      const who = p.teamAuthors.length ? ` — ${p.teamAuthors.join(", ")}` : "";
      L.push(`- ${link(p.title, p.url)} (${p.date || "n.d."}${p.venue ? `, ${p.venue}` : ""})${who}`);
    }
    L.push("");
  }
  if (f.network.sharedHistoryByOrg.length) {
    L.push("### Shared histories", "");
    for (const o of f.network.sharedHistoryByOrg) L.push(`- **${o.key}:** ${o.count} connection(s) among the team.`);
    L.push("");
  }
  if (f.network.topCoAuthorPairs.length) {
    L.push("### Frequent co-authors", "");
    for (const e of f.network.topCoAuthorPairs) L.push(`- ${e.a} & ${e.b} — ${e.paperCount} paper(s)`);
    L.push("");
  }
  if (f.people.mostInNews.length) {
    L.push("### Most in the news", "");
    for (const p of f.people.mostInNews) L.push(`- ${p.name} — ${p.mentions} mention(s)`);
    L.push("");
  }
  if (f.news.notable.length) {
    L.push("### Notable coverage", "");
    for (const a of f.news.notable.slice(0, 10)) {
      const who = a.people.length ? ` — ${a.people.join(", ")}` : "";
      L.push(`- ${link(a.title, a.url)} (${a.source || "?"}, ${a.date || "n.d."})${who}`);
    }
    L.push("");
  }
  return L.join("\n");
}

function reportMarkdown(facts, narration, generatedAt) {
  const L = [];
  const title = narration?.title || `AMI Labs Observatory — Report`;
  L.push(`# ${title}`, "");
  L.push(`*${narration?.subtitle || `Window: ${facts.period.since} to ${facts.period.until}`} · The French Tech Journal*`, "");
  if (narration?.overview) L.push(narration.overview, "");
  for (const s of narration?.sections || []) {
    L.push(`## ${s.heading}`, "", s.body, "");
  }
  L.push(factsAppendix(facts));
  L.push("---", "", `*Generated ${generatedAt} from the Observatory dossiers. Figures cover ${facts.period.since} → ${facts.period.until}. ${narration ? "" : "Facts-only edition (no narration model configured)."}*`);
  return L.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const facts = buildReportFacts({ windowDays: WINDOW_DAYS, now: Date.now() });
  let narration = null;
  try { narration = await narrate(facts); }
  catch (e) { console.error(`[report] narration failed: ${e.message}`); }

  const generatedAt = new Date().toISOString();
  const md = reportMarkdown(facts, narration, generatedAt.slice(0, 10));

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outFile = path.join(REPORTS_DIR, `ami-report-${facts.period.until}.md`);
  fs.writeFileSync(outFile, md + "\n");
  fs.writeFileSync(JSON_OUT, JSON.stringify({ generatedAt, period: facts.period, facts, narration }, null, 2) + "\n");

  console.log(`Wrote ${path.relative(process.cwd(), outFile)} (${narration ? "narrated" : "facts-only"}).`);
  console.log(`  window ${facts.period.since} → ${facts.period.until}: ${facts.research.newInWindow} new papers, ${facts.news.inWindow} news items, ${facts.network.sharedHistoryEdges} shared-history links.`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { reportMarkdown, factsAppendix, extractJson };
