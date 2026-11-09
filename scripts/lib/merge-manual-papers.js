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
const arxivIdOf = (s) => (String(s || "").match(/(\d{4}\.\d{4,5})/) || [])[1] || null;

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
// the caller re-sorts by date. Entries without a title or without any AMI author are skipped.
function mergeManualPapers(papers, manualEntries, resolver) {
  const out = papers.filter((p) => !p.manual); // re-derive manual rows every run
  const titles = new Set(out.map((p) => normTitle(p.title)));
  const arxivIds = new Set(out.map((p) => arxivIdOf(p.url) || arxivIdOf(p.paperId)).filter(Boolean));
  const added = [];
  for (const entry of manualEntries || []) {
    if (!entry || !entry.title) continue;
    const paper = toPaper(entry, resolver);
    if (!paper.teamAuthors.length) {
      console.warn(`[manual] "${entry.title}" has no author matching the team roster — skipped.`);
      continue;
    }
    const id = arxivIdOf(paper.url);
    if (titles.has(normTitle(paper.title)) || (id && arxivIds.has(id))) continue; // S2 has it now
    out.push(paper);
    added.push(paper);
  }
  return { papers: out, added };
}

module.exports = { mergeManualPapers, normTitle, arxivIdOf };
