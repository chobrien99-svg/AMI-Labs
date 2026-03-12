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
  const username = member.links.github.replace("https://github.com/", "").replace(/\/$/, "");
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
  const members = team.filter((m) => m.links?.github);

  console.log(`Fetching GitHub activity for ${members.length} members…`);
  if (!TOKEN) console.warn("No GITHUB_TOKEN — rate limited to 60 req/hr");

  const activity = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const username = member.links.github.replace("https://github.com/", "").replace(/\/$/, "");
    process.stdout.write(`[${member.name}] (${username}) fetching… `);
    try {
      const events = await fetchForMember(member);
      console.log(`${events.length} events`);
      activity.push({
        slug: member.slug,
        name: member.name,
        username,
        githubUrl: member.links.github,
        events,
      });
    } catch (e) {
      console.error(`FAILED: ${e.message}`);
    }
    if (i < members.length - 1) await sleep(DELAY_MS);
  }

  const out = { lastFetched: new Date().toISOString(), members: activity };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
