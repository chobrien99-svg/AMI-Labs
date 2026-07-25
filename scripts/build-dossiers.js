// ============================================================================
// AMI Observatory — per-person dossiers (Phase 3)
// ----------------------------------------------------------------------------
// Joins every person-linked dataset into one file per person under data/people/,
// plus a relationship graph (_graph.json) and an index (_index.json). This is the
// substrate a quarterly/semi-annual report generator reads: one hop from a person
// to their papers + co-authors, projects, news, and former colleagues — instead of
// stitching six files together.
//
// Pure and deterministic (no network, no timestamps → clean diffs). Resilient to
// fields that aren't populated yet (co-author slugs, contributorSlugs, X authorSlug
// fill in as fetch-publications / analyze-github-activity / fetch-x-posts re-run).
//
//   node scripts/build-dossiers.js
//
// Exports its pure helpers for testing.
// ============================================================================

const fs = require("fs");
const path = require("path");

const DATA = path.resolve(__dirname, "../data");
const OUT_DIR = path.join(DATA, "people");

function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8")); }
  catch { return fallback; }
}

// ── pure helpers (exported for tests) ────────────────────────────────────────

// Parse a "years" string into [start, end]; open-ended ("2020–present") → end 9999.
// Returns null when no 4-digit year is present.
function parseYears(s) {
  const str = String(s == null ? "" : s);
  const start = str.match(/\d{4}/);
  if (!start) return null;
  const s1 = Number(start[0]);
  const rest = str.slice(str.indexOf(start[0]) + 4);
  const end = rest.match(/\d{4}/);
  if (end) return [s1, Number(end[0])];
  if (/present|current|now|ongoing/i.test(str)) return [s1, 9999];
  return [s1, s1];
}

// Do two [start,end] ranges overlap? Returns the [start,end] overlap or null.
function yearsOverlap(a, b) {
  if (!a || !b) return null;
  const start = Math.max(a[0], b[0]);
  const end = Math.min(a[1], b[1]);
  return start <= end ? [start, end] : null;
}

// Canonicalize an employer so people who wrote it differently still group together.
// Conservative: only collapses the big, unambiguous shared employers; otherwise a
// normalized string (so exact matches still connect).
function canonicalOrg(org) {
  const s = String(org == null ? "" : org).toLowerCase();
  if (/\b(meta|facebook|fair)\b/.test(s)) return "Meta (FAIR)";
  if (/\b(google|deepmind|brain)\b/.test(s)) return "Google / DeepMind";
  if (/\bmicrosoft\b/.test(s)) return "Microsoft";
  if (/\bnyu|new york university\b/.test(s)) return "NYU";
  return s.replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// Roster people who co-authored: for each paper, the set of author slugs known to
// the roster (from teamAuthors, plus resolved authors[] when present).
function paperRosterSlugs(paper, rosterSlugs) {
  const slugs = new Set();
  for (const a of paper.teamAuthors || []) if (a && a.slug && rosterSlugs.has(a.slug)) slugs.add(a.slug);
  for (const a of paper.authors || []) if (a && a.slug && rosterSlugs.has(a.slug)) slugs.add(a.slug);
  return [...slugs];
}

const cityRe = /\b(paris|new york|nyc|montreal|singapore|london|san francisco|bay area|seattle|boston|zurich|tel aviv|beijing|shanghai|tokyo|bangalore)\b/i;
function locationFromTags(tags) {
  for (const t of tags || []) if (cityRe.test(t)) return t;
  return null;
}

// ── build ─────────────────────────────────────────────────────────────────────

function buildDossiers() {
  const team = load("team.json", []);
  const research = load("research.json", { papers: [] }).papers || [];
  const analysis = load("github-analysis.json", { projects: [] }).projects || [];
  const activity = (load("github-activity.json", { members: [] }).members) || [];
  const news = load("news.json", []);
  const xposts = (load("x-posts.json", { posts: [] }).posts) || [];
  const pubs = load("publications.json", {});

  const rosterSlugs = new Set(team.map((m) => m.slug));
  const bySlug = new Map(team.map((m) => [m.slug, m]));
  const nameOf = (slug) => (bySlug.get(slug) ? bySlug.get(slug).name : slug);

  const activityBySlug = new Map(activity.map((m) => [m.slug, m]));

  // Indexes keyed by person slug.
  const papersBy = new Map();      // slug -> [paper-with-coauthors]
  const coauthorPairs = new Map(); // "a|b" -> {a,b,papers:[titles]}
  const externalCoauthorsBy = new Map(); // slug -> Map(name -> count)

  for (const p of research) {
    const memberSlugs = paperRosterSlugs(p, rosterSlugs);
    const externals = (p.authors || []).filter((a) => a && !a.slug && a.name).map((a) => a.name);
    for (const slug of memberSlugs) {
      if (!papersBy.has(slug)) papersBy.set(slug, []);
      const coAuthors = [
        ...memberSlugs.filter((s) => s !== slug).map((s) => ({ slug: s, name: nameOf(s) })),
        ...externals.map((name) => ({ slug: null, name })),
      ];
      papersBy.get(slug).push({
        paperId: p.paperId, title: p.title, year: p.year ?? null,
        venue: p.venue || null, url: p.url || null, citationCount: p.citationCount ?? 0,
        coAuthors,
      });
      // external co-author tallies
      if (externals.length) {
        if (!externalCoauthorsBy.has(slug)) externalCoauthorsBy.set(slug, new Map());
        const m = externalCoauthorsBy.get(slug);
        for (const n of externals) m.set(n, (m.get(n) || 0) + 1);
      }
    }
    // co-authorship edges between roster members
    for (let i = 0; i < memberSlugs.length; i++) {
      for (let j = i + 1; j < memberSlugs.length; j++) {
        const [a, b] = [memberSlugs[i], memberSlugs[j]].sort();
        const key = `${a}|${b}`;
        if (!coauthorPairs.has(key)) coauthorPairs.set(key, { a, b, papers: [] });
        coauthorPairs.get(key).papers.push(p.title);
      }
    }
  }

  // GitHub projects per person (from the analysis' contributorSlugs).
  const projectsBy = new Map();
  for (const proj of analysis) {
    for (const slug of proj.contributorSlugs || []) {
      if (!projectsBy.has(slug)) projectsBy.set(slug, []);
      projectsBy.get(slug).push({
        repo: proj.repo, url: proj.url || null, ownership: proj.ownership || null,
        activityScore: proj.activityScore ?? null,
      });
    }
  }

  // News + X posts per person.
  const newsBy = new Map();
  for (const a of news) for (const slug of a.people || []) {
    if (!newsBy.has(slug)) newsBy.set(slug, []);
    newsBy.get(slug).push({ title: a.title, url: a.url, source: a.source || null, publishedAt: a.publishedAt || null });
  }
  const xBy = new Map();
  for (const post of xposts) if (post.authorSlug) {
    if (!xBy.has(post.authorSlug)) xBy.set(post.authorSlug, []);
    xBy.get(post.authorSlug).push({ text: post.text, url: post.url, createdAt: post.createdAt || null });
  }

  // Reports-to / reports.
  const reportsBy = new Map(); // manager slug -> [report slugs]
  for (const m of team) if (m.reportsTo) {
    if (!reportsBy.has(m.reportsTo)) reportsBy.set(m.reportsTo, []);
    reportsBy.get(m.reportsTo).push(m.slug);
  }

  // Shared career history: for each pair, common canonical orgs with overlapping years.
  const colleagueEdges = [];
  const colleaguesBy = new Map(); // slug -> [{slug,name,org,years:[start,end]}]
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      const A = team[i], B = team[j];
      const shared = [];
      for (const ea of A.careerHistory || []) {
        for (const eb of B.careerHistory || []) {
          if (canonicalOrg(ea.org) && canonicalOrg(ea.org) === canonicalOrg(eb.org)) {
            const ov = yearsOverlap(parseYears(ea.years), parseYears(eb.years));
            if (ov) shared.push({ org: canonicalOrg(ea.org), years: ov });
          }
        }
      }
      if (shared.length) {
        // de-dupe by org, keep widest overlap
        const byOrg = new Map();
        for (const s of shared) {
          const cur = byOrg.get(s.org);
          if (!cur) byOrg.set(s.org, s.years);
          else byOrg.set(s.org, [Math.min(cur[0], s.years[0]), Math.max(cur[1], s.years[1])]);
        }
        for (const [org, years] of byOrg) {
          colleagueEdges.push({ a: A.slug, b: B.slug, org, years });
          if (!colleaguesBy.has(A.slug)) colleaguesBy.set(A.slug, []);
          if (!colleaguesBy.has(B.slug)) colleaguesBy.set(B.slug, []);
          colleaguesBy.get(A.slug).push({ slug: B.slug, name: B.name, org, years });
          colleaguesBy.get(B.slug).push({ slug: A.slug, name: A.name, org, years });
        }
      }
    }
  }

  // Assemble one dossier per person.
  const dossiers = team.map((m) => {
    const papers = papersBy.get(m.slug) || [];
    const coAuthorCounts = new Map();
    for (const p of papers) for (const c of p.coAuthors) if (c.slug) coAuthorCounts.set(c.slug, (coAuthorCounts.get(c.slug) || 0) + 1);
    const extMap = externalCoauthorsBy.get(m.slug) || new Map();

    return {
      slug: m.slug,
      name: m.name,
      role: m.role || null,
      department: m.department || null,
      location: locationFromTags(m.tags),
      tags: m.tags || [],
      links: m.links || {},
      semanticScholarId: m.semanticScholarId ?? null,
      careerHistory: m.careerHistory || [],
      reportsTo: m.reportsTo || null,
      reports: reportsBy.get(m.slug) || [],
      papers,
      topPublications: pubs[m.slug] || [],
      githubProjects: projectsBy.get(m.slug) || [],
      githubActivity: activityBySlug.get(m.slug)
        ? { username: activityBySlug.get(m.slug).username || null, githubUrl: activityBySlug.get(m.slug).githubUrl || null, recentEventCount: (activityBySlug.get(m.slug).events || []).length }
        : null,
      news: newsBy.get(m.slug) || [],
      xPosts: xBy.get(m.slug) || [],
      connections: {
        coAuthors: [...coAuthorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([slug, n]) => ({ slug, name: nameOf(slug), sharedPapers: n })),
        externalCoAuthors: [...extMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, papers: n })),
        formerColleagues: colleaguesBy.get(m.slug) || [],
      },
    };
  });

  const graph = {
    coAuthorship: [...coauthorPairs.values()].map((e) => ({ a: e.a, b: e.b, paperCount: e.papers.length, papers: e.papers })),
    colleagues: colleagueEdges,
    reporting: team.filter((m) => m.reportsTo).map((m) => ({ person: m.slug, manager: m.reportsTo })),
  };

  const index = dossiers.map((d) => ({
    slug: d.slug, name: d.name, role: d.role, department: d.department,
    counts: {
      papers: d.papers.length, coAuthors: d.connections.coAuthors.length,
      formerColleagues: d.connections.formerColleagues.length,
      githubProjects: d.githubProjects.length, news: d.news.length, xPosts: d.xPosts.length,
    },
  }));

  return { dossiers, graph, index };
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  const { dossiers, graph, index } = buildDossiers();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Remove stale per-person files (people who left the roster), keep _index/_graph.
  const keep = new Set([...dossiers.map((d) => `${d.slug}.json`), "_index.json", "_graph.json"]);
  for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith(".json") && !keep.has(f)) fs.unlinkSync(path.join(OUT_DIR, f));

  for (const d of dossiers) fs.writeFileSync(path.join(OUT_DIR, `${d.slug}.json`), JSON.stringify(d, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT_DIR, "_graph.json"), JSON.stringify(graph, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT_DIR, "_index.json"), JSON.stringify(index, null, 2) + "\n");

  const withPapers = index.filter((d) => d.counts.papers).length;
  console.log(`Wrote ${dossiers.length} dossiers to ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.log(`  co-authorship edges: ${graph.coAuthorship.length} · shared-history edges: ${graph.colleagues.length} · reporting edges: ${graph.reporting.length}`);
  console.log(`  ${withPapers} people have papers · ${index.filter((d) => d.counts.news).length} have news mentions`);
}

if (require.main === module) main();

module.exports = { buildDossiers, parseYears, yearsOverlap, canonicalOrg, paperRosterSlugs, locationFromTags };
