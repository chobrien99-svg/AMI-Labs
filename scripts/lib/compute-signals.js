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

function computeJobFacts(jobs, prevSnapshot) {
  const empty = { total: 0, newSinceLast: 0, newItems: [], byDepartment: {}, jobIds: [] };
  const list = jobs && Array.isArray(jobs.jobs) ? jobs.jobs : [];
  if (!list.length) return empty;
  const jobIds = list.map((j) => j.id).filter(Boolean);
  const prevIds = (prevSnapshot && prevSnapshot.jobIds) || null;
  // First run (no baseline) → don't report every existing job as "new".
  const newList = prevIds ? list.filter((j) => !prevIds.includes(j.id)) : [];
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

function pubKey(slug, p) {
  return `${slug}|${(p.title || "").trim()}|${p.year || ""}`;
}

function computePublicationFacts(publications, prevSnapshot) {
  const empty = { total: 0, newSinceLast: 0, newItems: [], topCited: [], publicationKeys: [] };
  if (!publications || typeof publications !== "object") return empty;
  const flat = [];
  const keys = [];
  for (const [slug, papers] of Object.entries(publications)) {
    if (!Array.isArray(papers)) continue;
    for (const p of papers) {
      const key = pubKey(slug, p);
      keys.push(key);
      flat.push({
        member: slug,
        title: p.title,
        year: p.year,
        venue: p.venue || "",
        url: p.url,
        citationCount: p.citationCount || 0,
        _key: key,
      });
    }
  }
  const prevKeys = (prevSnapshot && prevSnapshot.publicationKeys) || null;
  const newList = prevKeys ? flat.filter((p) => !prevKeys.includes(p._key)) : [];
  const strip = (p) => ({
    member: p.member,
    title: p.title,
    year: p.year,
    venue: p.venue,
    url: p.url,
    citationCount: p.citationCount,
  });
  return {
    total: flat.length,
    newSinceLast: newList.length,
    newItems: newList.map(strip),
    topCited: [...flat].sort((a, b) => b.citationCount - a.citationCount).slice(0, 5).map(strip),
    publicationKeys: keys, // for next snapshot
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

function computeCorporateFacts(pappers, sinceTime, prevSnapshot) {
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

  // New directors: either not in prev snapshot (diff) or nominated within the window.
  const newByDiff = prevKeys
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

function diffArray(current, prev, keyFn) {
  const list = Array.isArray(current) ? current : [];
  const keys = list.map(keyFn);
  const prevKeys = Array.isArray(prev) ? prev : null;
  const newItems = prevKeys ? list.filter((it) => !prevKeys.includes(keyFn(it))) : [];
  return { newItems, keys };
}

function computeIpFacts(inpi, prevSnapshot) {
  const empty = { newMarques: [], newBrevets: [], newDessins: [], marqueKeys: [], brevetKeys: [], dessinKeys: [] };
  if (!inpi || typeof inpi !== "object") return empty;
  const prev = prevSnapshot || {};
  const mk = (x) => x.id || x.numero || x.nom || JSON.stringify(x);
  const m = diffArray(inpi.marques, prev.marqueKeys, mk);
  const b = diffArray(inpi.brevets, prev.brevetKeys, mk);
  const d = diffArray(inpi.dessinsModeles, prev.dessinKeys, mk);
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

// ── orchestrator ─────────────────────────────────────────────────────────────

function buildFacts(data, { since, prevSnapshot } = {}) {
  const sinceTime = toTime(since);
  const prev = prevSnapshot || {};

  const news = computeNewsFacts(data.news, sinceTime);
  const jobsFull = computeJobFacts(data.jobs, prev);
  const pubsFull = computePublicationFacts(data.publications, prev);
  const github = computeGithubFacts(data.github, sinceTime);
  const corpFull = computeCorporateFacts(data.pappers, sinceTime, prev);
  const ipFull = computeIpFacts(data.inpi, prev);
  const monitoring = computeMonitoringFacts(data.monitoring, sinceTime);
  const timeline = computeTimelineFacts(data.timeline, sinceTime);

  // Split rendered "facts" from snapshot-only bookkeeping fields.
  const { jobIds, ...jobs } = jobsFull;
  const { publicationKeys, ...publications } = pubsFull;
  const { dirigeantKeys, ...corporate } = corpFull;
  const { marqueKeys, brevetKeys, dessinKeys, ...ip } = ipFull;

  const facts = { news, jobs, publications, github, corporate, ip, monitoring, timeline };

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
  (facts.publications.topCited || []).forEach((i) => add(i.url));
  (facts.github.notable || []).forEach((i) => add(i.url));
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
};
