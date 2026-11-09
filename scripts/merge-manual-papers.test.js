// Tests for hand-added research papers. Run: node scripts/merge-manual-papers.test.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { mergeManualPapers, arxivIdOf, paperKeys } = require("./lib/merge-manual-papers");
const { computeNewResearch } = require("./send-digest");
const { computePublicationFacts } = require("./lib/compute-signals");

const people = { "yann-lecun": { slug: "yann-lecun", name: "Yann LeCun" } };
const resolver = {
  byName: (n) => (n === "Yann LeCun" ? people["yann-lecun"] : null),
  bySlug: (s) => people[s] || null,
};
const entry = { arxivId: "2610.39302", title: "Proving the Hypothesis", publicationDate: "2026-10-30", authors: ["Randall Balestriero", "Yann LeCun"] };
const quiet = console.warn; console.warn = () => {};

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

test("adds a manual paper missing from the fetched list, credited to the team author", () => {
  const { papers, added } = mergeManualPapers([], [entry], resolver);
  assert.strictEqual(added.length, 1);
  assert.strictEqual(papers[0].paperId, "arXiv:2610.39302");
  assert.strictEqual(papers[0].url, "https://arxiv.org/abs/2610.39302");
  assert.deepStrictEqual(papers[0].teamAuthors, [{ slug: "yann-lecun", name: "Yann LeCun" }]);
  assert.strictEqual(papers[0].year, 2026);
});

test("skips it once Semantic Scholar returns the same arXiv id", () => {
  const fetched = [{ paperId: "abc", title: "Different Title", url: "https://doi.org/10.48550/arXiv.2610.39302" }];
  assert.strictEqual(mergeManualPapers(fetched, [entry], resolver).added.length, 0);
});

test("skips it once Semantic Scholar returns the same title", () => {
  const fetched = [{ paperId: "abc", title: "Proving the hypothesis!", url: "https://www.semanticscholar.org/paper/abc" }];
  assert.strictEqual(mergeManualPapers(fetched, [entry], resolver).added.length, 0);
});

test("re-running replaces last run's manual row instead of duplicating it", () => {
  const first = mergeManualPapers([], [entry], resolver).papers;
  const second = mergeManualPapers(first, [entry], resolver).papers;
  assert.strictEqual(second.length, 1);
});

test("removing an entry from the file removes its row", () => {
  const first = mergeManualPapers([], [entry], resolver).papers;
  assert.strictEqual(mergeManualPapers(first, [], resolver).papers.length, 0);
});

test("skips entries with no author on the team roster", () => {
  const out = mergeManualPapers([], [{ ...entry, authors: ["Someone Else"] }], resolver);
  assert.strictEqual(out.added.length, 0);
});


test("duplicate manual entries (same arXiv id or same title) produce one row", () => {
  const sameId = { ...entry, title: "A Retitled Copy" };
  const sameTitle = { ...entry, arxivId: "2610.99999" };
  const { papers } = mergeManualPapers([], [entry, sameId, sameTitle], resolver);
  assert.strictEqual(papers.length, 1);
});

test("when Semantic Scholar indexes it, the fetched record keeps the manual id as an alias", () => {
  const fetched = [{ paperId: "99339e", title: "Proving the Hypothesis", url: "https://www.semanticscholar.org/paper/99339e" }];
  const { papers } = mergeManualPapers(fetched, [entry], resolver);
  assert.strictEqual(papers.length, 1);
  assert.deepStrictEqual(paperKeys(papers[0]), ["99339e", "arXiv:2610.39302"]);
  // Idempotent across runs.
  assert.deepStrictEqual(paperKeys(mergeManualPapers(papers, [entry], resolver).papers[0]), ["99339e", "arXiv:2610.39302"]);
});

test("arxivIdOf is strict: arXiv forms match, look-alike DOIs do not", () => {
  assert.strictEqual(arxivIdOf("2610.39302"), "2610.39302");
  assert.strictEqual(arxivIdOf("arXiv:2610.39302"), "2610.39302");
  assert.strictEqual(arxivIdOf("https://arxiv.org/abs/2610.39302v2"), "2610.39302");
  assert.strictEqual(arxivIdOf("https://doi.org/10.48550/arXiv.2610.39302"), "2610.39302");
  assert.strictEqual(arxivIdOf("https://doi.org/10.1109/CVPR52729.2023.01234"), null);
});

test("digest does not re-report a hand-listed paper after its id changes", () => {
  const seenPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seen-")), "seen.json");
  fs.writeFileSync(seenPath, JSON.stringify({ seenPaperIds: ["old"] }));
  const week1 = mergeManualPapers([{ paperId: "old", title: "Old Paper", url: "u" }], [entry], resolver).papers;
  const r1 = computeNewResearch(week1, seenPath);
  assert.deepStrictEqual(r1.newResearch.map((p) => p.paperId), ["arXiv:2610.39302"]);
  fs.writeFileSync(seenPath, JSON.stringify({ seenPaperIds: r1.nextSeen }));
  const fetched = [{ paperId: "old", title: "Old Paper", url: "u" }, { paperId: "99339e", title: "Proving the Hypothesis", url: "s2" }];
  const week2 = mergeManualPapers(fetched, [entry], resolver).papers;
  assert.deepStrictEqual(computeNewResearch(week2, seenPath).newResearch, []);
});

test("synthesis signals do not treat the re-identified paper as newly seen", () => {
  const week1 = mergeManualPapers([], [entry], resolver).papers;
  const snap = { publicationKeys: computePublicationFacts({ papers: week1 }, null, "2000-01-01", false).publicationKeys };
  const week2 = mergeManualPapers([{ paperId: "99339e", title: "Proving the Hypothesis", url: "s2", publicationDate: "2026-10-29" }], [entry], resolver).papers;
  // A far-future window so only the "newly seen" diff (not recency) can mark it notable.
  const facts = computePublicationFacts({ papers: week2 }, snap, "2999-01-01", false);
  assert.strictEqual(facts.newSinceLast, 0);
});

console.warn = quiet;
console.log(`\n${passed} passed`);
