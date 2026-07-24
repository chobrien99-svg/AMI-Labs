/**
 * Fetches recent public GitHub events for each team member with a GitHub link
 * and writes the results to data/github-activity.json.
 *
 * Run manually: node scripts/fetch-github-activity.js
 * Requires: GITHUB_TOKEN env var (for 5000 req/hr instead of 60)
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const TEAM_FILE = path.resolve(__dirname, "../data/team.json");
const OUT_FILE = path.resolve(__dirname, "../data/github-activity.json");
const TOKEN = process.env.GITHUB_TOKEN;
const MAX_EVENTS = 15; // per user
const DELAY_MS = 500;
const SANITY = { projectId: "k8hl9hed", dataset: "production", apiVersion: "2024-01-01" };

function get(url) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "AMI-Labs-Site/1.0", "Accept": "application/vnd.github+json" };
    if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode === 404) { resolve([]); return; }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
        resolve(JSON.parse(data));
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Read GitHub links straight from Sanity persons (separate request so the GitHub token is
// never sent to Sanity). Passes a Sanity read token if available; public reads work without.
// Returns { ok, members } so an outage is distinguishable from an empty result.
function sanityGet(url) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "AMI-Labs-Site/1.0" };
    const t = process.env.SANITY_API_READ_TOKEN;
    if (t) headers["Authorization"] = `Bearer ${t}`;
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(data)); } catch { reject(new Error("bad JSON")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function fetchSanityMembers() {
  const groq =
    '*[_type == "person" && !(_id in path("drafts.**")) && defined(links.github)]' +
    '{ "slug": slug.current, name, "github": links.github }';
  const url =
    `https://${SANITY.projectId}.api.sanity.io/v${SANITY.apiVersion}/data/query/${SANITY.dataset}` +
    `?query=${encodeURIComponent(groq)}&perspective=published`;
  try {
    const data = await sanityGet(url);
    return { ok: true, members: (data.result || []).filter((p) => p && p.slug && p.github) };
  } catch (e) {
    console.warn(`[sanity] Could not read persons (${e.message}) — using team.json only.`);
    return { ok: false, members: [] };
  }
}

function describeEvent(event) {
  const repo = event.repo?.name || "";
  const repoUrl = `https://github.com/${repo}`;
  const p = event.payload || {};

  switch (event.type) {
    case "PushEvent": {
      const n = (p.commits || []).length;
      const branch = (p.ref || "").replace("refs/heads/", "");
      return { description: `Pushed ${n} commit${n !== 1 ? "s" : ""} to ${branch ? `${branch} on ` : ""}${repo}`, url: repoUrl };
    }
    case "CreateEvent": {
      const rt = p.ref_type;
      if (rt === "repository") return { description: `Created repository ${repo}`, url: repoUrl };
      if (rt === "branch") return { description: `Created branch ${p.ref} in ${repo}`, url: repoUrl };
      if (rt === "tag") return { description: `Created tag ${p.ref} in ${repo}`, url: `${repoUrl}/releases/tag/${p.ref}` };
      return { description: `Created ${rt} in ${repo}`, url: repoUrl };
    }
    case "ReleaseEvent":
      return { description: `Released ${p.release?.tag_name || ""} on ${repo}`, url: p.release?.html_url || repoUrl };
    case "WatchEvent":
      return { description: `Starred ${repo}`, url: repoUrl };
    case "ForkEvent":
      return { description: `Forked ${repo}`, url: p.forkee?.html_url || repoUrl };
    case "IssuesEvent":
      return { description: `${p.action === "opened" ? "Opened" : p.action === "closed" ? "Closed" : p.action} issue #${p.issue?.number} in ${repo}`, url: p.issue?.html_url || repoUrl };
    case "IssueCommentEvent":
      return { description: `Commented on issue #${p.issue?.number} in ${repo}`, url: p.comment?.html_url || repoUrl };
    case "PullRequestEvent":
      return { description: `${p.action === "opened" ? "Opened" : p.pull_request?.merged ? "Merged" : p.action} PR #${p.pull_request?.number} in ${repo}`, url: p.pull_request?.html_url || repoUrl };
    case "PullRequestReviewEvent":
      return { description: `Reviewed PR #${p.pull_request?.number} in ${repo}`, url: p.pull_request?.html_url || repoUrl };
    case "DeleteEvent":
      return { description: `Deleted ${p.ref_type} ${p.ref} in ${repo}`, url: repoUrl };
    case "PublicEvent":
      return { description: `Made ${repo} public`, url: repoUrl };
    case "MemberEvent":
      return { description: `${p.action} member to ${repo}`, url: repoUrl };
    case "GollumEvent":
      return { description: `Updated wiki in ${repo}`, url: `${repoUrl}/wiki` };
    default:
      return { description: `Activity in ${repo}`, url: repoUrl };
  }
}

async function fetchForMember(member) {
  const username = member.github.replace("https://github.com/", "").replace(/\/$/, "");
  const events = await get(`https://api.github.com/users/${username}/events/public?per_page=30`);
  return (Array.isArray(events) ? events : []).slice(0, MAX_EVENTS).map((event) => {
    const { description, url } = describeEvent(event);
    return {
      type: event.type,
      repo: event.repo?.name || "",
      repoUrl: `https://github.com/${event.repo?.name || ""}`,
      description,
      url,
      timestamp: event.created_at,
    };
  });
}

async function main() {
  const team = JSON.parse(fs.readFileSync(TEAM_FILE, "utf8"));

  // Unify GitHub accounts from team.json (git-native seed) and Sanity (CMS), keyed by slug —
  // so a member added in Sanity with a GitHub link is tracked without a team.json edit.
  const bySlug = new Map();
  for (const m of team) if (m.links?.github) bySlug.set(m.slug, { slug: m.slug, name: m.name, github: m.links.github });
  const sanity = await fetchSanityMembers();
  for (const p of sanity.members) if (!bySlug.has(p.slug)) bySlug.set(p.slug, { slug: p.slug, name: p.name || p.slug, github: p.github });
  const members = [...bySlug.values()];
  const knownSlugs = new Set(members.map((m) => m.slug));

  const existing = fs.existsSync(OUT_FILE)
    ? JSON.parse(fs.readFileSync(OUT_FILE, "utf8"))
    : { members: [] };

  console.log(`Fetching GitHub activity for ${members.length} members (team.json + Sanity${sanity.ok ? "" : " OUTAGE"})…`);
  if (!TOKEN) console.warn("No GITHUB_TOKEN — rate limited to 60 req/hr");

  const activity = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const username = member.github.replace("https://github.com/", "").replace(/\/$/, "");
    process.stdout.write(`[${member.name}] (${username}) fetching… `);
    try {
      const events = await fetchForMember(member);
      console.log(`${events.length} events`);
      activity.push({ slug: member.slug, name: member.name, username, githubUrl: member.github, events });
    } catch (e) {
      console.error(`FAILED: ${e.message}`);
    }
    if (i < members.length - 1) await sleep(DELAY_MS);
  }

  // Carry over prior members we couldn't refresh this run so a transient failure never blanks
  // the feed: a known member whose fetch failed, or — on a Sanity outage — a member missing this
  // run entirely (likely Sanity-only). When Sanity reads fine, an absent member is a real removal.
  const gotSlugs = new Set(activity.map((a) => a.slug));
  const unrefreshable = (slug) =>
    (knownSlugs.has(slug) && !gotSlugs.has(slug)) || (!sanity.ok && !knownSlugs.has(slug));
  for (const prev of existing.members || []) {
    if (!gotSlugs.has(prev.slug) && unrefreshable(prev.slug)) {
      activity.push(prev);
      console.log(`  carried over prior activity for ${prev.slug} (not refreshed this run)`);
    }
  }

  const out = { lastFetched: new Date().toISOString(), members: activity };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
