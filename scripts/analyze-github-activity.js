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
const { loadResolver } = require("./lib/resolve-identity");

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

// AMI-owned GitHub orgs (lowercase), if known — configure via AMI_GITHUB_ORGS (comma-separated).
// Empty by default: we do NOT claim external/community projects as AMI's own.
const AMI_ORGS = new Set((process.env.AMI_GITHUB_ORGS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean));

const DOTFILES = /^\.?(dotfiles?|zshrc|bashrc|bash_profile|zprofile|vimrc|tmux\.conf|nvim|config|profile|gitconfig)$/i;
function ownerName(full) { const i = full.indexOf("/"); return { owner: full.slice(0, i), name: full.slice(i + 1) }; }

// Personal housekeeping (websites, dotfiles, org-profile repos) — not a research/engineering
// signal. The domain-website check needs metadata; pass null to run only the name-based checks.
function isPersonalRepo(full, meta) {
  const { owner, name } = ownerName(full);
  if (name === ".github") return true;                          // org profile repo
  if (/\.github\.io$/i.test(name)) return true;                 // GitHub Pages site
  if (name.toLowerCase() === owner.toLowerCase()) return true;  // owner/owner profile repo
  if (DOTFILES.test(name)) return true;                         // dotfiles
  if (meta && /\.[a-z]{2,6}$/i.test(name) && /^(HTML|CSS|SCSS|Less)$/i.test(meta.language || "") &&
      !meta.description && !(meta.topics || []).length) return true; // personal domain website
  return false;
}

// ami | personal-account | external — where a project sits relative to AMI and the member.
function ownershipOf(owner, contributorUsernames) {
  const o = (owner || "").toLowerCase();
  if (AMI_ORGS.has(o)) return "ami";
  if ((contributorUsernames || []).some((u) => u.toLowerCase() === o)) return "personal-account";
  return "external";
}

// ── roster ────────────────────────────────────────────────────────────────────
function loadRoster() {
  try {
    const a = JSON.parse(fs.readFileSync(ACTIVITY_FILE, "utf8"));
    const members = (a.members || [])
      .filter((m) => m.username)
      .map((m) => ({ name: m.name, username: m.username, slug: m.slug }));
    if (members.length) return members;
  } catch { /* fall through */ }
  const team = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8"));
  return team
    .filter((m) => m.links?.github)
    .map((m) => ({ name: m.name, slug: m.slug, username: m.links.github.replace("https://github.com/", "").replace(/\/$/, "") }));
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
        r = { repo, score: 0, counts: {}, commits: 0, contributors: new Set(), contributorUsernames: new Set(), contributorSlugs: new Set(), lastAt: e.created_at, contribEvents: 0 };
        repos.set(repo, r);
      }
      const w = WEIGHT[e.type] ?? 1;
      r.score += w;
      r.counts[e.type] = (r.counts[e.type] || 0) + 1;
      // payload.size is the authoritative commit count; the commits[] array can be empty/truncated.
      if (e.type === "PushEvent") {
        r.commits += typeof e.payload?.size === "number" ? e.payload.size : (e.payload?.commits || []).length;
      }
      if (CONTRIB_TYPES.has(e.type)) {
        r.contributors.add(member.name);
        if (member.username) r.contributorUsernames.add(member.username);
        if (member.slug) r.contributorSlugs.add(member.slug); // canonical slug from the roster
        r.contribEvents++;
      }
      if (e.created_at > r.lastAt) r.lastAt = e.created_at;
    }
  });
  return [...repos.values()]
    // drop repos only starred/forked, and obvious personal housekeeping (by name)
    .filter((r) => r.contribEvents > 0 && !isPersonalRepo(r.repo, null))
    .sort((a, b) => b.score - a.score);
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
  const owner = meta?.owner?.login || project.repo.split("/")[0];
  const contributorUsernames = [...project.contributorUsernames];
  return {
    repo: project.repo,
    url: meta?.html_url || `https://github.com/${project.repo}`,
    owner,
    ownership: ownershipOf(owner, contributorUsernames), // ami | personal-account | external
    description: meta?.description || null,
    language: meta?.language || null,
    topics: Array.isArray(meta?.topics) ? meta.topics.slice(0, 8) : [],
    stars: meta?.stargazers_count ?? null,
    isFork: !!meta?.fork,
    pushedAt: meta?.pushed_at || project.lastAt,
    activityScore: Math.round(project.score),
    eventSummary: summariseCounts(project.counts, project.commits),
    contributors: [...project.contributors],
    contributorUsernames,
    contributorSlugs: [...project.contributorSlugs],
    readmeExcerpt: readme,
  };
}

// ── narration (Claude, grounded in the facts) ───────────────────────────────────
const SYSTEM_PROMPT = [
  "You are a technical analyst for The French Tech Journal's AMI Labs Observatory.",
  "You are given a ranked list of GitHub projects that CURRENT AMI Labs team members have been most active on",
  "over a recent window, each with metadata (description, language, topics, README excerpt), which members are",
  "active on it, and a summary of the activity. Write an analysis of what these people are putting time into —",
  "the NATURE and PURPOSE of the top projects — NOT a commit log.",
  "",
  "FRAMING — this is critical:",
  "- The signal is 'where current AMI members are investing effort, based on public activity' — NOT 'AMI's",
  "  projects'. Most of these are external or community projects; some predate AMI or involve many institutions.",
  "- Each project has an 'ownership' field: 'ami' (owned by an AMI GitHub org), 'personal-account' (a member's",
  "  own account), or 'external' (an outside org/community project). Make this distinction explicit in the prose",
  "  when relevant. NEVER imply AMI owns, originated, or is affiliated with an 'external'/'personal-account'",
  "  project — say a member is contributing to it. Only call a project AMI's if ownership is 'ami'.",
  "",
  "HARD RULES:",
  "- Ground every claim about a project ONLY in its provided description, README excerpt, topics, and language.",
  "  If those are thin, say the purpose is not clear from the available metadata rather than guessing.",
  "- Do not invent repo purposes, affiliations, or facts not present. Do not enumerate individual commits.",
  "- Note who is active on a project and the kind of work (e.g. heavy pushing vs. reviewing) only from the facts.",
  "- Neutral, precise, editorial tone.",
  "",
  "OUTPUT: a single JSON object and nothing else, with keys:",
  '  "overview": string (3-5 sentences: what current AMI members are collectively putting effort into and the',
  "     through-line — framed as their activity, not AMI's ownership),",
  '  "projects": array of { "repo": string (copied EXACTLY from a provided repo), "analysis": string',
  "     (2-4 sentences on what the project is and its purpose, grounded in its metadata, with ownership made clear) },",
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
    rank: i + 1, repo: p.repo, owner: p.owner, ownership: p.ownership,
    description: p.description, language: p.language,
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
  const resolver = loadResolver(); // maps contributor github usernames/names → person slug
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
  // Enrich a few more than we need, since the metadata-based personal-repo filter can drop some.
  const candidates = ranked.slice(0, TOP_N + 8);
  console.log(`\n${ranked.length} contributed projects; enriching top ${candidates.length}…`);

  const enriched = [];
  for (const r of candidates) {
    try {
      enriched.push(await enrich(r));
      process.stdout.write(`  ${r.repo} (score ${Math.round(r.score)})\n`);
    } catch (e) {
      console.error(`  ${r.repo}: enrich FAILED (${e.message})`);
    }
  }
  // Drop personal websites/dotfiles the name filter couldn't catch without metadata, then take the top N.
  const projects = enriched.filter((p) => !isPersonalRepo(p.repo, p)).slice(0, TOP_N);
  console.log(`${projects.length} projects after excluding personal repos.`);

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
      ownership: p.ownership, // ami | personal-account | external
      activityScore: p.activityScore,
      eventSummary: p.eventSummary,
      contributors: p.contributors,
      // Canonical person slugs for the contributors, so the analysis links to people.
      // Prefer the slug the roster already carried; fall back to resolving the contributor's
      // github username / name against team.json for any the roster didn't slug.
      contributorSlugs: [...new Set([
        ...(p.contributorSlugs || []),
        ...(p.contributorUsernames || []).map((u) => { const m = resolver.byGithub(u); return m && m.slug; }),
        ...(p.contributors || []).map((n) => { const m = resolver.byName(n); return m && m.slug; }),
      ].filter(Boolean))],
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
