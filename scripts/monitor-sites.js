const https = require("https");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");

// ── helpers ──────────────────────────────────────────────────────────────────

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": "AMI-Labs-Monitor/1.0", ...headers } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, headers).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function createGithubIssue(title, body) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.log("[github] No GITHUB_TOKEN/GITHUB_REPOSITORY — skipping issue creation.");
    return Promise.resolve();
  }
  const payload = JSON.stringify({ title, body, labels: ["monitoring"] });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.github.com",
        path: `/repos/${repo}/issues`,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "AMI-Labs-Monitor/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode === 201) {
            const issue = JSON.parse(data);
            console.log(`[github] Issue created: ${issue.html_url}`);
            resolve();
          } else {
            console.error(`[github] Failed to create issue: ${res.statusCode} ${data}`);
            resolve(); // non-fatal
          }
        });
      }
    );
    req.on("error", (e) => { console.error("[github] Request error:", e.message); resolve(); });
    req.write(payload);
    req.end();
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(str) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

// ── Ashby jobs ───────────────────────────────────────────────────────────────

async function checkJobs() {
  console.log("\n[jobs] Checking jobs.ashbyhq.com/ami …");
  const JOBS_FILE = "./data/jobs.json";
  const stored = JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));
  const storedIds = new Set((stored.jobs || []).map((j) => j.id));

  let data;
  try {
    const res = await fetch("https://api.ashbyhq.com/posting-api/job-board/ami");
    data = JSON.parse(res.body);
  } catch (e) {
    console.error("[jobs] Fetch failed:", e.message);
    return;
  }

  const postings = data.jobPostings || data.jobs || [];
  const current = postings.map((p) => ({
    id: p.id,
    title: p.title,
    department: p.department || "",
    location: (p.locationName || p.location || ""),
    url: p.jobUrl || `https://jobs.ashbyhq.com/ami/${p.id}`,
    postedAt: p.publishedDate || p.createdAt || null,
  }));

  const added = current.filter((j) => !storedIds.has(j.id));
  const removedIds = new Set(current.map((j) => j.id));
  const removed = (stored.jobs || []).filter((j) => !removedIds.has(j.id));

  console.log(`[jobs] ${current.length} live postings. +${added.length} added, -${removed.length} removed.`);

  if (added.length > 0 || removed.length > 0) {
    const lines = [];
    if (added.length > 0) {
      lines.push("## New Positions");
      added.forEach((j) => lines.push(`- **[${j.title}](${j.url})** — ${j.department}${j.location ? ` · ${j.location}` : ""}`));
    }
    if (removed.length > 0) {
      lines.push("\n## Removed Positions");
      removed.forEach((j) => lines.push(`- ~~${j.title}~~ — ${j.department}${j.location ? ` · ${j.location}` : ""}`));
    }
    lines.push(`\n_Detected at ${new Date().toISOString()}_`);
    await createGithubIssue(
      `[Monitor] AMI Jobs changed: +${added.length} added, -${removed.length} removed`,
      lines.join("\n")
    );
  }

  stored.lastChecked = new Date().toISOString();
  stored.jobs = current;
  fs.writeFileSync(JOBS_FILE, JSON.stringify(stored, null, 2));
}

// ── amilabs.xyz website ───────────────────────────────────────────────────────

async function checkWebsite() {
  console.log("\n[website] Checking amilabs.xyz …");
  const MON_FILE = "./data/monitoring.json";
  const stored = JSON.parse(fs.readFileSync(MON_FILE, "utf8"));

  let res;
  try {
    res = await fetch("https://amilabs.xyz/");
  } catch (e) {
    console.error("[website] Fetch failed:", e.message);
    return stored;
  }

  const text = stripHtml(res.body);
  const currentHash = hash(text);
  const prevHash = stored.amilabs_xyz.contentHash;

  console.log(`[website] Hash: ${currentHash} (prev: ${prevHash || "none"})`);

  if (prevHash && prevHash !== currentHash) {
    console.log("[website] Change detected!");
    await createGithubIssue(
      "[Monitor] amilabs.xyz website content changed",
      `The content of [amilabs.xyz](https://amilabs.xyz/) has changed.\n\n- Previous hash: \`${prevHash}\`\n- New hash: \`${currentHash}\`\n\n_Detected at ${new Date().toISOString()}_`
    );
    stored.amilabs_xyz.lastChanged = new Date().toISOString();
  }

  stored.amilabs_xyz.lastChecked = new Date().toISOString();
  stored.amilabs_xyz.contentHash = currentHash;
  fs.writeFileSync(MON_FILE, JSON.stringify(stored, null, 2));
  return stored;
}

// ── X / Twitter ───────────────────────────────────────────────────────────────

async function checkTwitter(stored) {
  console.log("\n[twitter] Checking x.com/amilabs …");
  const MON_FILE = "./data/monitoring.json";
  const token = process.env.X_BEARER_TOKEN;

  if (!token) {
    console.log("[twitter] No X_BEARER_TOKEN secret — skipping.");
    return;
  }

  let userId;
  try {
    const r = await fetch(
      "https://api.twitter.com/2/users/by/username/amilabs",
      { Authorization: `Bearer ${token}` }
    );
    const d = JSON.parse(r.body);
    if (d.errors) { console.error("[twitter] API error:", d.errors[0]?.message); return; }
    userId = d.data?.id;
  } catch (e) {
    console.error("[twitter] User lookup failed:", e.message);
    return;
  }

  let tweets;
  try {
    const r = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,text`,
      { Authorization: `Bearer ${token}` }
    );
    const d = JSON.parse(r.body);
    tweets = d.data || [];
  } catch (e) {
    console.error("[twitter] Timeline fetch failed:", e.message);
    return;
  }

  if (tweets.length === 0) { console.log("[twitter] No tweets found."); return; }

  const latestId = tweets[0].id;
  const prevId = stored.x_amilabs.latestTweetId;
  console.log(`[twitter] Latest tweet ID: ${latestId} (prev: ${prevId || "none"})`);

  if (prevId && latestId !== prevId) {
    const newTweets = tweets.filter((t) => BigInt(t.id) > BigInt(prevId));
    console.log(`[twitter] ${newTweets.length} new tweet(s).`);
    const lines = newTweets.map((t) =>
      `> ${t.text}\n> — [${t.created_at}](https://x.com/amilabs/status/${t.id})`
    );
    await createGithubIssue(
      `[Monitor] @amilabs posted ${newTweets.length} new tweet(s) on X`,
      `New tweet(s) from [@amilabs](https://x.com/amilabs):\n\n${lines.join("\n\n")}\n\n_Detected at ${new Date().toISOString()}_`
    );
    stored.x_amilabs.lastChanged = new Date().toISOString();
  }

  stored.x_amilabs.lastChecked = new Date().toISOString();
  stored.x_amilabs.latestTweetId = latestId;
  fs.writeFileSync(MON_FILE, JSON.stringify(stored, null, 2));
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
  await checkJobs();
  const stored = await checkWebsite();
  await checkTwitter(stored);
  console.log("\n[monitor] Done.");
})();
