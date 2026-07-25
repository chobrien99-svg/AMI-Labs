// ============================================================================
// AMI Observatory — periodic report facts (Phase 4)
// ----------------------------------------------------------------------------
// Deterministic facts for a quarterly/semi-annual AMI report, computed by joining
// the Phase 3 dossiers/graph with the time-windowed sources (research, news).
// NO network, NO model — every number, name, date and link the report narrates
// over is grounded here, never invented. The narration step (generate-report.js)
// only rewrites these facts into prose.
//
//   const { buildReportFacts } = require("./lib/compute-report");
//   const facts = buildReportFacts({ windowDays: 90, now: Date.now() });
// ============================================================================

const fs = require("fs");
const path = require("path");

const DATA = path.resolve(__dirname, "../../data");
const PEOPLE = path.join(DATA, "people");

function load(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// Best available date for a paper (publicationDate, else mid-year), as YYYY-MM-DD or null.
function paperDate(p) {
  if (p.publicationDate) return String(p.publicationDate).slice(0, 10);
  if (p.year) return `${p.year}-07-01`;
  return null;
}

// Group a list into a sorted [ {key, count} ] tally.
function tally(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null || k === "") continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
}

// ── main fact builder ────────────────────────────────────────────────────────

function buildReportFacts({ windowDays = 90, now = Date.now() } = {}) {
  const sinceMs = now - windowDays * 24 * 60 * 60 * 1000;
  const sinceStr = iso(sinceMs);
  const untilStr = iso(now);

  const index = load(path.join(PEOPLE, "_index.json"), []);
  const graph = load(path.join(PEOPLE, "_graph.json"), { coAuthorship: [], colleagues: [], reporting: [] });
  const research = (load(path.join(DATA, "research.json"), { papers: [] }).papers) || [];
  const news = load(path.join(DATA, "news.json"), []);
  const analysis = (load(path.join(DATA, "github-analysis.json"), { projects: [] }).projects) || [];

  const nameBySlug = new Map(index.map((p) => [p.slug, p.name]));
  const inWindow = (dateStr) => dateStr != null && dateStr >= sinceStr && dateStr <= untilStr;

  // ── roster ──
  const roster = {
    total: index.length,
    byDepartment: tally(index, (p) => p.department || "Unassigned"),
  };

  // ── research ──
  const papersDated = research.map((p) => ({ ...p, _date: paperDate(p) }));
  const newPapers = papersDated
    .filter((p) => inWindow(p._date))
    .sort((a, b) => (b._date || "").localeCompare(a._date || ""))
    .map((p) => ({
      title: p.title, date: p._date, venue: p.venue || null, url: p.url || null,
      citationCount: p.citationCount ?? 0,
      teamAuthors: (p.teamAuthors || []).map((a) => a.name),
    }));
  const topCited = [...papersDated]
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 8)
    .map((p) => ({ title: p.title, year: p.year ?? null, venue: p.venue || null, url: p.url || null, citationCount: p.citationCount ?? 0 }));
  const research_ = {
    totalTracked: research.length,
    newInWindow: newPapers.length,
    newPapers: newPapers.slice(0, 20),
    topCited,
  };

  // ── news ──
  const newsDated = news
    .filter((a) => (a.status ? a.status !== "rejected" : true))
    .map((a) => ({ ...a, _date: a.publishedAt ? String(a.publishedAt).slice(0, 10) : null }));
  const newsInWindow = newsDated.filter((a) => inWindow(a._date));
  const news_ = {
    inWindow: newsInWindow.length,
    notable: [...newsInWindow]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 12)
      .map((a) => ({ title: a.title, date: a._date, source: a.source || null, url: a.url, people: (a.people || []).map((s) => nameBySlug.get(s) || s) })),
    aboutPeople: tally(newsInWindow.flatMap((a) => a.people || []), (s) => nameBySlug.get(s) || s).slice(0, 10),
  };

  // ── github ──
  const github_ = {
    topProjects: analysis
      .slice()
      .sort((a, b) => (b.activityScore ?? 0) - (a.activityScore ?? 0))
      .slice(0, 8)
      .map((p) => ({ repo: p.repo, ownership: p.ownership || null, activityScore: p.activityScore ?? 0, url: p.url || null, contributors: p.contributors || [] })),
    overview: (load(path.join(DATA, "github-analysis.json"), {}).overview) || null,
  };

  // ── network ──
  // Co-authorship is computed from research.json directly (the freshest source), so the
  // report stays internally consistent even when _graph.json hasn't been rebuilt yet.
  const rosterSlugs = new Set(index.map((p) => p.slug));
  const pairCounts = new Map();
  for (const p of research) {
    const slugs = [...new Set([
      ...(p.teamAuthors || []).map((a) => a && a.slug),
      ...(p.authors || []).map((a) => a && a.slug),
    ].filter((s) => s && rosterSlugs.has(s)))];
    for (let i = 0; i < slugs.length; i++) {
      for (let j = i + 1; j < slugs.length; j++) {
        const [a, b] = [slugs[i], slugs[j]].sort();
        const k = `${a}|${b}`;
        pairCounts.set(k, (pairCounts.get(k) || 0) + 1);
      }
    }
  }
  const coAuthPairs = [...pairCounts.entries()]
    .map(([k, count]) => { const [a, b] = k.split("|"); return { a, b, count }; })
    .sort((x, y) => y.count - x.count);
  // Shared work history comes from the graph (derived from careerHistory, which is stable).
  const sharedByOrg = tally(graph.colleagues || [], (e) => e.org);
  const network_ = {
    coAuthorshipEdges: coAuthPairs.length,
    topCoAuthorPairs: coAuthPairs.slice(0, 8).map((e) => ({ a: nameBySlug.get(e.a) || e.a, b: nameBySlug.get(e.b) || e.b, paperCount: e.count })),
    sharedHistoryEdges: (graph.colleagues || []).length,
    sharedHistoryByOrg: sharedByOrg.slice(0, 8), // e.g. "Meta (FAIR)": N connections
    reportingEdges: (graph.reporting || []).length,
  };

  // ── people highlights (from dossier index counts) ──
  const withCounts = index.map((p) => ({ ...p, _score: (p.counts?.papers || 0) + (p.counts?.coAuthors || 0) + (p.counts?.githubProjects || 0) + (p.counts?.news || 0) }));
  const people_ = {
    mostPublished: [...index].sort((a, b) => (b.counts?.papers || 0) - (a.counts?.papers || 0)).slice(0, 8).map((p) => ({ name: p.name, role: p.role, papers: p.counts?.papers || 0 })),
    mostConnected: [...index].sort((a, b) => ((b.counts?.coAuthors || 0) + (b.counts?.formerColleagues || 0)) - ((a.counts?.coAuthors || 0) + (a.counts?.formerColleagues || 0))).slice(0, 8).map((p) => ({ name: p.name, role: p.role, coAuthors: p.counts?.coAuthors || 0, formerColleagues: p.counts?.formerColleagues || 0 })),
    mostInNews: [...index].sort((a, b) => (b.counts?.news || 0) - (a.counts?.news || 0)).slice(0, 8).filter((p) => (p.counts?.news || 0) > 0).map((p) => ({ name: p.name, mentions: p.counts?.news || 0 })),
  };

  return {
    period: { windowDays, since: sinceStr, until: untilStr },
    roster,
    research: research_,
    github: github_,
    news: news_,
    network: network_,
    people: people_,
  };
}

module.exports = { buildReportFacts, paperDate, tally };
