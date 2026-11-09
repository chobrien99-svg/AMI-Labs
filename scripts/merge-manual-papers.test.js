// Tests for hand-added research papers. Run: node scripts/merge-manual-papers.test.js
const assert = require("assert");
const { mergeManualPapers } = require("./lib/merge-manual-papers");

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

console.warn = quiet;
console.log(`\n${passed} passed`);
