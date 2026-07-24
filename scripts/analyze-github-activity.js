/**
 * Analyzes the AMI team's GitHub activity over a recent window (~2 months) and writes a
 * ranked, analyzed view of the projects they're most active on — NOT a commit log.
 *
 * Pipeline (all deterministic except the final narration):
 *   1. Roster of usernames from data/github-activity.json (falls back to team.json).
 *   2. For each member, page their public events within the window.
 *   3. Aggregate by repo with weighted scoring (real contribution >> stars/forks); rank.
 *   4. For the top repos, fetch metadata + README excerpt (what the project IS).
 *   5. Claude narrates: an overview, a grounded per-project analysis, and cross-cutting themes.
 *
 * Writes data/github-analysis.json. Run via the "Analyze GitHub Activity" workflow.
 * Env: GITHUB_TOKEN (required for rate limit), ANTHROPIC_API_KEY (narration),
 *      SYNTHESIS_MODEL (optional), GH_ANALYSIS_WINDOW_DAYS (optional, default 60).
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const ACTIVITY_FILE = path.resolve(__dirname, "../data/github-activity.json");
const TEAM_FILE = path.resolve(__dirname, "../data/team.json");
const OUT_FILE = path.resolve(__dirname, "../data/github-analysis.json");
const TOKEN = process.env.GITHUB_TOKEN;
const MODEL = process.env.SYNTHESIS_MODEL || "claude-sonnet-4-6";
const WINDOW_DAYS = Number(process.env.GH_ANALYSIS_WINDOW_DAYS) || 60;
const TOP_N = 15;
const MAX_PAGES = 3; // GitHub caps public events at ~300 events / 90 days per user
const PER_PAGE = 100;
const README_MAX = 1600;

// Event weighting: real contribution counts; stars/forks are near-zero signal.
const WEIGHT = {
  PushEvent: 4, PullRequestEvent: 5, ReleaseEvent: 6, CreateEvent: 3,
  IssuesEvent: 2, PullRequestReviewEvent: 2, IssueCommentEvent: 1,
  MemberEvent: 1, GollumEvent: 1, PublicEvent: 3, DeleteEvent: 0,
  ForkEvent: 0.5, WatchEvent: 0,
};
// Types that mean the person actually worked on the repo (vs merely bookmarked it).
const CONTRIB_TYPES = new Set([
  "PushEvent", "PullRequestEvent", "ReleaseEvent", "CreateEvent", "IssuesEvent",
  "PullRequestReviewEvent", "IssueCommentEvent", "MemberEvent", "GollumEvent", "PublicEvent",
]);

function ghRequest(url, raw = false) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "AMI-Labs-Site/1.0", Accept: "application/vnd.github+json" };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode === 404) { resolve(null); return; }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
        try { resolve(raw ? data : JSON.parse(data)); }
        catch { reject(new Error(`Bad JSON for ${url}`)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── roster ────────────────────────────────────────────────────────────────────
function loadRoster() {
  try {
    const a = JSON.parse(fs.readFileSync(ACTIVITY_FILE, "utf8"));
    const members = (a.members || [])
      .filter((m) => m.username)
      .map((m) => ({ name: m.name, username: m.username }));
    if (members.length) return members;
  } catch { /* fall through */ }
  const team = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8"));
  return team
    .filter((m) => m.links?.github)
    .map((m) => ({ name: m.name, username: m.links.github.replace("https://github.com/", "").replace(/\/$/, "") }));
}

// ── events → per-repo aggregation ───────────────────────────────────────────────
async function fetchMemberEvents(username, sinceMs) {
  const events = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await ghRequest(`https://api.github.com/users/${username}/events/public?per_page=${PER_PAGE}&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    events.push(...batch);
    const oldest = new Date(batch[batch.length - 1].created_at).getTime();
    if (oldest < sinceMs || batch.length < PER_PAGE) break; // paged past the window
    await sleep(250);
  }
  return events.filter((e) => new Date(e.created_at).getTime() >= sinceMs);
}

function aggregate(memberEvents) {
  const repos = new Map();
  memberEvents.forEach(({ member, events }) => {
    for (const e of events) {
      const repo = e.repo?.name;
      if (!repo) continue;
      let r = repos.get(repo);
      if (!r) {
        r = { repo, score: 0, counts: {}, commits: 0, contributors: new Set(), lastAt: e.created_at, contribEvents: 0 };
        repos.set(repo, r);
      }
      const w = WEIGHT[e.type] ?? 1;
      r.score += w;
      r.counts[e.type] = (r.counts[e.type] || 0) + 1;
      // payload.size is the authoritative commit count; the commits[] array can be empty/truncated.
      if (e.type === "PushEvent") {
        r.commits += typeof e.payload?.size === "number" ? e.payload.size : (e.payload?.commits || []).length;
      }
      if (CONTRIB_TYPES.has(e.type)) { r.contributors.add(member.name); r.contribEvents++; }
      if (e.created_at > r.lastAt) r.lastAt = e.created_at;
    }
  });
  return [...repos.values()]
    .filter((r) => r.contribEvents > 0) // drop repos only starred/forked
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);
}

// ── repo metadata + README (what the project IS) ────────────────────────────────
function summariseCounts(counts, commits) {
  const parts = [];
  // Report a real commit count when we have one; otherwise label the pushes as pushes,
  // never as commits (empty payload.commits must not be reported as N commits).
  if (counts.PushEvent) {
    parts.push(commits > 0
      ? `${commits} commit${commits !== 1 ? "s" : ""}`
      : `${counts.PushEvent} push${counts.PushEvent !== 1 ? "es" : ""}`);
  }
  if (counts.PullRequestEvent) parts.push(`${counts.PullRequestEvent} PR${counts.PullRequestEvent !== 1 ? "s" : ""}`);
  if (counts.ReleaseEvent) parts.push(`${counts.ReleaseEvent} release${counts.ReleaseEvent !== 1 ? "s" : ""}`);
  if (counts.CreateEvent) parts.push(`${counts.CreateEvent} create${counts.CreateEvent !== 1 ? "s" : ""}`);
  if (counts.IssuesEvent) parts.push(`${counts.IssuesEvent} issue${counts.IssuesEvent !== 1 ? "s" : ""}`);
  return parts.join(", ") || "activity";
}

function decodeReadme(payload) {
  if (!payload || !payload.content) return null;
  try {
    const text = Buffer.from(payload.content, payload.encoding || "base64").toString("utf8");
    return text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, README_MAX);
  } catch { return null; }
}

async function enrich(project) {
  const meta = await ghRequest(`https://api.github.com/repos/${project.repo}`);
  await sleep(200);
  const readme = decodeReadme(await ghRequest(`https://api.github.com/repos/${project.repo}/readme`));
  return {
    repo: project.repo,
    url: meta?.html_url || `https://github.com/${project.repo}`,
    owner: meta?.owner?.login || project.repo.split("/")[0],
    description: meta?.description || null,
    language: meta?.language || null,
    topics: Array.isArray(meta?.topics) ? meta.topics.slice(0, 8) : [],
    stars: meta?.stargazers_count ?? null,
    isFork: !!meta?.fork,
    pushedAt: meta?.pushed_at || project.lastAt,
    activityScore: Math.round(project.score),
    eventSummary: summariseCounts(project.counts, project.commits),
    contributors: [...project.contributors],
    readmeExcerpt: readme,
  };
}

// ── narration (Claude, grounded in the facts) ───────────────────────────────────
const SYSTEM_PROMPT = [
  "You are a technical analyst for The French Tech Journal's AMI Labs Observatory.",
  "You are given a ranked list of GitHub projects the AMI Labs team has been most active on over a recent",
  "window, each with metadata (description, language, topics, README excerpt), which team members are active",
  "on it, and a summary of the activity. Write an analysis of what the team is building — the NATURE and",
  "PURPOSE of the top projects — NOT a commit log.",
  "",
  "HARD RULES:",
  "- Ground every claim about a project ONLY in its provided description, README excerpt, topics, and language.",
  "  If those are thin, say the purpose is not clear from the available metadata rather than guessing.",
  "- Do not invent repo purposes, affiliations, or facts not present. Do not enumerate individual commits.",
  "- Note who is active on a project and the kind of work (e.g. heavy pushing vs. reviewing) only from the facts.",
  "- Neutral, precise, editorial tone.",
  "",
  "OUTPUT: a single JSON object and nothing else, with keys:",
  '  "overview": string (3-5 sentences: what the team is collectively working on, the through-line),',
  '  "projects": array of { "repo": string (copied EXACTLY from a provided repo), "analysis": string',
  "     (2-4 sentences on what the project is and its purpose, grounded in its metadata) },",
  '  "themes": array (0-3) of { "title": string, "text": string } — cross-project patterns worth naming.',
  "If you cannot produce a grounded analysis, output exactly SKIP.",
].join("\n");

function extractJson(text) {
  let t = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b === -1) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

async function narrate(projects) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[analyze] ANTHROPIC_API_KEY not set — writing facts without narration.");
    return null;
  }
  const Anthropic = require("@anthropic-ai/sdk").default;
  const client = new Anthropic();
  const facts = projects.map((p, i) => ({
    rank: i + 1, repo: p.repo, description: p.description, language: p.language,
    topics: p.topics, stars: p.stars, isFork: p.isFork, activity: p.eventSummary,
    contributors: p.contributors, readmeExcerpt: p.readmeExcerpt,
  }));
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2600,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `WINDOW: last ${WINDOW_DAYS} days.\n\nPROJECTS (ranked):\n${JSON.stringify(facts, null, 2)}\n\nWrite the analysis JSON now.` }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  if (!text || text.trim() === "SKIP") return null;
  return extractJson(text);
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) console.warn("[analyze] No GITHUB_TOKEN — heavily rate limited (60 req/hr).");
  const roster = loadRoster();
  const sinceMs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  console.log(`Analyzing GitHub activity for ${roster.length} members over ${WINDOW_DAYS} days…`);

  const memberEvents = [];
  for (const member of roster) {
    try {
      const events = await fetchMemberEvents(member.username, sinceMs);
      memberEvents.push({ member, events });
      process.stdout.write(`  ${member.username}: ${events.length} events\n`);
    } catch (e) {
      console.error(`  ${member.username}: FAILED (${e.message})`);
    }
    await sleep(250);
  }

  const ranked = aggregate(memberEvents);
  console.log(`\nTop ${ranked.length} projects by weighted activity. Enriching…`);

  const projects = [];
  for (const r of ranked) {
    try {
      projects.push(await enrich(r));
      process.stdout.write(`  ${r.repo} (score ${Math.round(r.score)})\n`);
    } catch (e) {
      console.error(`  ${r.repo}: enrich FAILED (${e.message})`);
    }
  }

  let narration = null;
  try { narration = await narrate(projects); }
  catch (e) { console.error(`[analyze] narration failed: ${e.message}`); }

  const analysisByRepo = new Map((narration?.projects || []).map((p) => [p.repo, p.analysis]));
  const out = {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    memberCount: roster.length,
    overview: narration?.overview || "",
    themes: Array.isArray(narration?.themes) ? narration.themes : [],
    projects: projects.map((p, i) => ({
      rank: i + 1,
      repo: p.repo,
      url: p.url,
      owner: p.owner,
      activityScore: p.activityScore,
      eventSummary: p.eventSummary,
      contributors: p.contributors,
      description: p.description,
      language: p.language,
      topics: p.topics,
      stars: p.stars,
      isFork: p.isFork,
      analysis: analysisByRepo.get(p.repo) || "",
    })),
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${OUT_FILE} (${out.projects.length} projects${narration ? ", analyzed" : ", facts only"}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
