/**
 * Hand-added papers for the research feed (data/research-manual.json).
 *
 * Semantic Scholar can take days or weeks to list a new arXiv paper under its authors,
 * so an important paper can be missing from the weekly fetch. Adding it to
 * research-manual.json makes it appear on /research straight away. Once Semantic
 * Scholar returns the same paper (same arXiv id or same title), its richer record wins
 * and the manual entry is ignored, so entries never cause duplicates and can be left in
 * the file.
 *
 * Minimal entry:
 *   { "arxivId": "2610.39302", "title": "...", "publicationDate": "2026-10-30",
 *     "authors": ["Randall Balestriero", "Yann LeCun"] }
 * Optional: "abstract", "tldr", "venue", "url".
 */

const normTitle = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// arXiv id from a bare id ("2610.39302"), an "arXiv:" id, an arxiv.org URL or an arXiv DOI
// (10.48550/arXiv.2610.39302). Deliberately strict, so a DOI that merely contains a
// "2023.01234"-shaped run is not mistaken for an arXiv id.
const arxivIdOf = (s) => {
  const str = String(s || "").trim();
  const m = str.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/) || str.match(/arxiv(?:\.org\/(?:abs|pdf)\/|[.:])(\d{4}\.\d{4,5})/i);
  return m ? m[1] : null;
};

// Every id a paper has been known by: its paperId plus any `aliases` (earlier ids, e.g. the
// "arXiv:…" id a hand-listed paper had before Semantic Scholar indexed it). Consumers that
// remember which papers they have already reported (send-digest, compute-signals) must
// match on all of these, or a paper that changes id is reported as new a second time.
function paperKeys(p) {
  if (!p) return [];
  return [p.paperId, ...(Array.isArray(p.aliases) ? p.aliases : [])].filter(Boolean);
}

function addAlias(p, id) {
  if (!id || id === p.paperId) return;
  if (!Array.isArray(p.aliases)) p.aliases = [];
  if (!p.aliases.includes(id)) p.aliases.push(id);
}

// Turn a manual entry into the same shape fetch-publications.js stores for a fetched paper.
function toPaper(entry, resolver) {
  const arxivId = arxivIdOf(entry.arxivId || entry.url);
  const authors = (entry.authors || []).map((name) => {
    const person = resolver.byName(name);
    return { name, authorId: null, slug: person ? person.slug : null };
  });
  const teamAuthors = [];
  for (const a of authors) {
    if (a.slug && !teamAuthors.some((t) => t.slug === a.slug)) {
      const person = resolver.bySlug(a.slug);
      teamAuthors.push({ slug: a.slug, name: (person && person.name) || a.name });
    }
  }
  const date = entry.publicationDate || null;
  return {
    paperId: arxivId ? `arXiv:${arxivId}` : `manual:${normTitle(entry.title).replace(/ /g, "-")}`,
    title: entry.title,
    teamAuthors,
    authors,
    memberSlug: teamAuthors[0] ? teamAuthors[0].slug : null,
    memberName: teamAuthors[0] ? teamAuthors[0].name : null,
    publicationDate: date,
    year: date ? Number(date.slice(0, 4)) : null,
    venue: entry.venue || (arxivId ? "arXiv" : null),
    url: entry.url || (arxivId ? `https://arxiv.org/abs/${arxivId}` : null),
    citationCount: 0,
    tldr: entry.tldr || null,
    abstract: entry.abstract || null,
    manual: true,
  };
}

// Add manual papers that the fetched list does not already contain. Returns a new array;
// the caller re-sorts by date. Entries without a title or without any AMI author are skipped,
// and so is a second entry for a paper already accepted (same title or arXiv id).
// When Semantic Scholar has the paper, the fetched record is kept and the manual id is
// recorded on it as an alias, so "already reported" state keyed by the old id still matches.
function mergeManualPapers(papers, manualEntries, resolver) {
  const out = papers.filter((p) => !p.manual); // re-derive manual rows every run
  const byTitle = new Map();
  const byArxiv = new Map();
  const index = (p) => {
    const t = normTitle(p.title);
    if (t && !byTitle.has(t)) byTitle.set(t, p);
    const a = arxivIdOf(p.url) || arxivIdOf(p.paperId);
    if (a && !byArxiv.has(a)) byArxiv.set(a, p);
  };
  out.forEach(index);
  const added = [];
  for (const entry of manualEntries || []) {
    if (!entry || !entry.title) continue;
    const paper = toPaper(entry, resolver);
    if (!paper.teamAuthors.length) {
      console.warn(`[manual] "${entry.title}" has no author matching the team roster — skipped.`);
      continue;
    }
    const id = arxivIdOf(paper.url);
    const match = byTitle.get(normTitle(paper.title)) || (id && byArxiv.get(id));
    if (match) {
      // Semantic Scholar has it now (or this is a duplicate manual entry): keep one row.
      if (!match.manual) addAlias(match, paper.paperId);
      continue;
    }
    out.push(paper);
    added.push(paper);
    index(paper);
  }
  return { papers: out, added };
}

module.exports = { mergeManualPapers, normTitle, arxivIdOf, paperKeys };
