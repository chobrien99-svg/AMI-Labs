// ============================================================================
// AMI Observatory — deterministic signal computation
// ----------------------------------------------------------------------------
// Reads every data/*.json source and computes a factual "what changed" block
// over a recent window. NO network, NO Claude — pure/deterministic so the
// numbers, names, dates and links fed to the synthesis step are never invented.
//
// Two strategies, chosen per-source by whether a reliable timestamp exists:
//   • window-filter  — news (publishedAt), github (event timestamp),
//                      pappers (dateNomination), monitoring (lastChanged),
//                      timeline (date)
//   • content-diff   — jobs (postedAt is always null → diff by id),
//     vs _snapshot     publications (year-only → diff by slug|title|year key),
//                      corporate capital/dirigeants, INPI arrays
//
// buildFacts() returns { facts, snapshot }. `facts` is what the model narrates
// over; `snapshot` is persisted (inside synthesis.pending.json) as the diff
// basis for the next run.
// ============================================================================

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "../../data");

// ── loading ─────────────────────────────────────────────────────────────────

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  } catch (err) {
    console.warn(`[signals] Could not read ${file}: ${err.message}`);
    return null;
  }
}

function loadData(dataDir) {
  // dataDir arg kept for testability; defaults to the repo data/ dir.
  const dir = dataDir || DATA_DIR;
  const read = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (err) {
      console.warn(`[signals] Could not read ${f}: ${err.message}`);
      return null;
    }
  };
  return {
    news: read("news.json"),
    jobs: read("jobs.json"),
    publications: read("publications.json"),
    research: read("research.json"),
    x: read("x-posts.json"),
    github: read("github-activity.json"),
    pappers: read("pappers.json"),
    inpi: read("inpi.json"),
    monitoring: read("monitoring.json"),
    timeline: read("timeline.json"),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toTime(value) {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

function inWindow(value, sinceTime) {
  const t = toTime(value);
  return !Number.isNaN(t) && t >= sinceTime;
}

function tally(items, keyFn) {
  const out = {};
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// ── per-source computations ──────────────────────────────────────────────────

function computeNewsFacts(news, sinceTime) {
  const empty = { windowCount: 0, byTag: {}, items: [] };
  if (!Array.isArray(news)) return empty;
  const approved = news.filter((a) => !a.status || a.status === "approved");
  const recent = approved
    .filter((a) => inWindow(a.publishedAt, sinceTime))
    .sort((a, b) => toTime(b.publishedAt) - toTime(a.publishedAt));
  const byTag = {};
  for (const a of recent) {
    for (const tag of a.tags || []) byTag[tag] = (byTag[tag] || 0) + 1;
  }
  return {
    windowCount: recent.length,
    byTag,
    items: recent.slice(0, 12).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source,
      publishedAt: a.publishedAt,
      tags: a.tags || [],
      summary: a.summary || "",
    })),
  };
}

function computeJobFacts(jobs, prevSnapshot, census) {
  const empty = { total: 0, newSinceLast: 0, newItems: [], byDepartment: {}, jobIds: [] };
  const list = jobs && Array.isArray(jobs.jobs) ? jobs.jobs : [];
  if (!list.length) return empty;
  const jobIds = list.map((j) => j.id).filter(Boolean);
  const prevIds = (prevSnapshot && prevSnapshot.jobIds) || null;
  // Census → surface every current job. First normal run (no baseline) → surface none
  // (establish baseline). Otherwise → only jobs absent from the prior snapshot.
  const newList = census ? list.slice() : prevIds ? list.filter((j) => !prevIds.includes(j.id)) : [];
  return {
    total: list.length,
    newSinceLast: newList.length,
    newItems: newList.map((j) => ({
      title: j.title,
      department: j.department || "",
      location: j.location || "",
      url: j.url,
    })),
    byDepartment: tally(list, (j) => j.department || "Unspecified"),
    jobIds, // for next snapshot
  };
}

// Consumes the team-wide recency feed (data/research.json). A paper is "notable"
// this run if it is newly seen (diff by paperId vs snapshot) OR freshly published
// inside the window. `newItems` carries tldr/abstract so the synthesis can explain
// what each paper is and why it matters — grounded, never invented.
function bestPubDate(p) {
  return p.publicationDate || (p.year ? `${p.year}-07-01` : null);
}

function computePublicationFacts(research, prevSnapshot, sinceTime, census) {
  const empty = { total: 0, newSinceLast: 0, newItems: [], recent: [], publicationKeys: [] };
  const papers = research && Array.isArray(research.papers) ? research.papers : [];
  if (!papers.length) return empty;

  const keys = papers.map((p) => p.paperId).filter(Boolean);

  // Snapshot migration: earlier snapshots stored `slug|title|year` keys. If we detect
  // that old format, treat this run as a baseline so switching to paperId keys does not
  // surface every paper as "new" in one burst.
  const prevKeysRaw = (prevSnapshot && prevSnapshot.publicationKeys) || null;
  const prevIsOldFormat = prevKeysRaw && prevKeysRaw.some((k) => typeof k === "string" && k.includes("|"));
  const prevKeys = prevIsOldFormat ? null : prevKeysRaw;

  const inWin = (p) => {
    const d = bestPubDate(p);
    return d ? inWindow(d, sinceTime) : false;
  };

  // Census → treat the whole current corpus as notable. Otherwise → papers absent from
  // the prior snapshot (or none, on a migrated/baseline run).
  const newlySeen = census ? papers.slice() : prevKeys ? papers.filter((p) => !prevKeys.includes(p.paperId)) : [];
  const notable = new Map();
  for (const p of [...newlySeen, ...papers.filter(inWin)]) {
    if (!notable.has(p.paperId)) notable.set(p.paperId, p);
  }

  const strip = (p) => ({
    memberName: p.memberName,
    teamAuthors: (p.teamAuthors || []).map((a) => a.name),
    title: p.title,
    year: p.year,
    publicationDate: p.publicationDate || null,
    venue: p.venue || null,
    url: p.url,
    citationCount: p.citationCount || 0,
    tldr: p.tldr || null,
    abstract: p.abstract ? p.abstract.slice(0, 600) : null,
  });

  return {
    total: papers.length,
    newSinceLast: notable.size,
    newItems: [...notable.values()].slice(0, 12).map(strip),
    recent: papers.filter(inWin).slice(0, 12).map(strip),
    publicationKeys: keys, // paperIds, for next snapshot
  };
}

const TRIVIAL_GH = /Pushed 0 commits/i;

function computeGithubFacts(github, sinceTime) {
  const empty = { windowEventCount: 0, byMember: {}, notable: [] };
  const members = github && Array.isArray(github.members) ? github.members : [];
  if (!members.length) return empty;
  const byMember = {};
  const notable = [];
  let windowEventCount = 0;
  for (const m of members) {
    const events = (m.events || []).filter((e) => inWindow(e.timestamp, sinceTime));
    if (!events.length) continue;
    byMember[m.name || m.slug] = events.length;
    windowEventCount += events.length;
    for (const e of events) {
      if (TRIVIAL_GH.test(e.description || "")) continue;
      if (e.type === "WatchEvent" || e.type === "ForkEvent") continue; // low signal
      notable.push({
        member: m.name || m.slug,
        type: e.type,
        repo: e.repo,
        description: e.description,
        url: e.url || e.repoUrl,
        timestamp: e.timestamp,
      });
    }
  }
  notable.sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp));
  return { windowEventCount, byMember, notable: notable.slice(0, 10) };
}

function computeCorporateFacts(pappers, sinceTime, prevSnapshot, census) {
  const empty = {
    capital: null, capitalChanged: false, prevCapital: null,
    newDirigeants: [], adresse: "", denomination: "",
    dirigeantKeys: [],
  };
  if (!pappers || typeof pappers !== "object") return empty;
  const dirigeants = Array.isArray(pappers.dirigeants) ? pappers.dirigeants : [];
  const dirigeantKeys = dirigeants.map((d) => `${d.nom}|${d.qualite}`);
  const prevKeys = (prevSnapshot && prevSnapshot.dirigeantKeys) || null;
  const prevCapital = prevSnapshot && typeof prevSnapshot.capital === "number"
    ? prevSnapshot.capital : null;

  // New directors: census → all current officers; else not in prev snapshot (diff) or
  // nominated within the window.
  const newByDiff = census
    ? dirigeants.slice()
    : prevKeys
    ? dirigeants.filter((d) => !prevKeys.includes(`${d.nom}|${d.qualite}`))
    : [];
  const newByDate = dirigeants.filter((d) => inWindow(d.dateNomination, sinceTime));
  const seen = new Set();
  const newDirigeants = [...newByDiff, ...newByDate]
    .filter((d) => {
      const k = `${d.nom}|${d.qualite}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((d) => ({ nom: d.nom, qualite: d.qualite, dateNomination: d.dateNomination }));

  const capital = typeof pappers.capital === "number" ? pappers.capital : null;
  return {
    capital,
    capitalChanged: prevCapital != null && capital != null && prevCapital !== capital,
    prevCapital,
    newDirigeants,
    adresse: pappers.adresse || "",
    denomination: pappers.denomination || "",
    dirigeantKeys, // for next snapshot
  };
}

function diffArray(current, prev, keyFn, census) {
  const list = Array.isArray(current) ? current : [];
  const keys = list.map(keyFn);
  const prevKeys = Array.isArray(prev) ? prev : null;
  const newItems = census ? list.slice() : prevKeys ? list.filter((it) => !prevKeys.includes(keyFn(it))) : [];
  return { newItems, keys };
}

function computeIpFacts(inpi, prevSnapshot, census) {
  const empty = { newMarques: [], newBrevets: [], newDessins: [], marqueKeys: [], brevetKeys: [], dessinKeys: [] };
  if (!inpi || typeof inpi !== "object") return empty;
  const prev = prevSnapshot || {};
  const mk = (x) => x.id || x.numero || x.nom || JSON.stringify(x);
  const m = diffArray(inpi.marques, prev.marqueKeys, mk, census);
  const b = diffArray(inpi.brevets, prev.brevetKeys, mk, census);
  const d = diffArray(inpi.dessinsModeles, prev.dessinKeys, mk, census);
  return {
    newMarques: m.newItems,
    newBrevets: b.newItems,
    newDessins: d.newItems,
    marqueKeys: m.keys,
    brevetKeys: b.keys,
    dessinKeys: d.keys,
  };
}

function computeMonitoringFacts(monitoring, sinceTime) {
  const empty = { changedTargets: [] };
  if (!monitoring || typeof monitoring !== "object") return empty;
  const changedTargets = [];
  for (const [target, info] of Object.entries(monitoring)) {
    if (info && inWindow(info.lastChanged, sinceTime)) {
      changedTargets.push({ target, lastChanged: info.lastChanged });
    }
  }
  return { changedTargets };
}

function computeTimelineFacts(timeline, sinceTime) {
  const empty = { recentMilestones: [] };
  if (!Array.isArray(timeline)) return empty;
  const recent = timeline
    .filter((m) => inWindow(m.date, sinceTime))
    .sort((a, b) => toTime(b.date) - toTime(a.date))
    .map((m) => ({ date: m.date, title: m.title, category: m.category }));
  return { recentMilestones: recent };
}

// Captured X (Twitter) posts from the team List. "Notable" = keyword-tagged or high-engagement,
// so the synthesis only ever sees the signal-bearing subset, not the firehose.
function computeSocialFacts(x, sinceTime) {
  const empty = { windowCount: 0, byTag: {}, notable: [] };
  const posts = x && Array.isArray(x.posts) ? x.posts : [];
  if (!posts.length) return empty;
  const inWin = posts.filter((p) => inWindow(p.createdAt, sinceTime));
  const byTag = {};
  for (const p of inWin) for (const t of p.tags || []) byTag[t] = (byTag[t] || 0) + 1;
  const notable = inWin
    .filter((p) => (p.tags && p.tags.length) || p.highEngagement)
    .sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0) || (toTime(b.createdAt) - toTime(a.createdAt)))
    .slice(0, 15)
    .map((p) => ({
      author: p.authorName || p.authorUsername,
      handle: p.authorUsername,
      text: p.text,
      url: p.url,
      createdAt: p.createdAt,
      tags: p.tags || [],
      metrics: p.metrics,
      highEngagement: !!p.highEngagement,
    }));
  return { windowCount: inWin.length, byTag, notable };
}

// ── orchestrator ─────────────────────────────────────────────────────────────

function buildFacts(data, { since, prevSnapshot, census = false } = {}) {
  // Census → no time window (sinceTime 0 admits every dated item) and every diff-based
  // source reports its full current set. The snapshot returned is still the fresh
  // current state, so the NEXT (normal) run diffs against it and returns to deltas.
  const sinceTime = census ? 0 : toTime(since);
  const prev = prevSnapshot || {};

  const news = computeNewsFacts(data.news, sinceTime);
  const jobsFull = computeJobFacts(data.jobs, prev, census);
  const pubsFull = computePublicationFacts(data.research, prev, sinceTime, census);
  const github = computeGithubFacts(data.github, sinceTime);
  const corpFull = computeCorporateFacts(data.pappers, sinceTime, prev, census);
  const ipFull = computeIpFacts(data.inpi, prev, census);
  const monitoring = computeMonitoringFacts(data.monitoring, sinceTime);
  const timeline = computeTimelineFacts(data.timeline, sinceTime);
  const social = computeSocialFacts(data.x, sinceTime);

  // Split rendered "facts" from snapshot-only bookkeeping fields.
  const { jobIds, ...jobs } = jobsFull;
  const { publicationKeys, ...publications } = pubsFull;
  const { dirigeantKeys, ...corporate } = corpFull;
  const { marqueKeys, brevetKeys, dessinKeys, ...ip } = ipFull;

  const facts = { news, jobs, publications, github, corporate, ip, monitoring, timeline, social };

  const snapshot = {
    jobIds,
    publicationKeys,
    capital: corporate.capital,
    dirigeantKeys,
    marqueKeys,
    brevetKeys,
    dessinKeys,
  };

  return { facts, snapshot };
}

// ── emptiness check (lets the generator skip the Claude call) ────────────────

function isEmpty(facts) {
  if (!facts) return true;
  const f = facts;
  const counts = [
    f.news.windowCount,
    f.jobs.newSinceLast,
    f.publications.newSinceLast,
    f.github.windowEventCount,
    f.corporate.newDirigeants.length,
    f.corporate.capitalChanged ? 1 : 0,
    f.ip.newMarques.length + f.ip.newBrevets.length + f.ip.newDessins.length,
    f.monitoring.changedTargets.length,
    f.timeline.recentMilestones.length,
    f.social ? f.social.notable.length : 0,
  ];
  return counts.every((c) => !c);
}

// Collect every URL the model is allowed to cite (anti-hallucination allowlist).
function collectAllowedUrls(facts) {
  const urls = new Set();
  const add = (u) => { if (u) urls.add(u); };
  (facts.news.items || []).forEach((i) => add(i.url));
  (facts.jobs.newItems || []).forEach((i) => add(i.url));
  (facts.publications.newItems || []).forEach((i) => add(i.url));
  (facts.publications.recent || []).forEach((i) => add(i.url));
  (facts.github.notable || []).forEach((i) => add(i.url));
  if (facts.social) (facts.social.notable || []).forEach((i) => add(i.url));
  return urls;
}

module.exports = {
  loadData,
  readJson,
  buildFacts,
  isEmpty,
  collectAllowedUrls,
  // exported for unit testing
  computeNewsFacts,
  computeJobFacts,
  computePublicationFacts,
  computeGithubFacts,
  computeCorporateFacts,
  computeIpFacts,
  computeMonitoringFacts,
  computeTimelineFacts,
  computeSocialFacts,
};
