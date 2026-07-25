// Tests for the report generator's pure helpers. Run: node scripts/generate-report.test.js
const assert = require("assert");
const { paperDate, tally } = require("./lib/compute-report");
const { reportMarkdown, factsAppendix, extractJson } = require("./generate-report");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

test("paperDate prefers publicationDate, falls back to mid-year, else null", () => {
  assert.strictEqual(paperDate({ publicationDate: "2026-03-14", year: 2026 }), "2026-03-14");
  assert.strictEqual(paperDate({ year: 2025 }), "2025-07-01");
  assert.strictEqual(paperDate({}), null);
});

test("tally counts and sorts descending, skipping empties", () => {
  const t = tally([{ o: "a" }, { o: "b" }, { o: "a" }, { o: "" }, { o: null }], (x) => x.o);
  assert.deepStrictEqual(t, [{ key: "a", count: 2 }, { key: "b", count: 1 }]);
});

test("extractJson tolerates code fences and surrounding prose", () => {
  assert.deepStrictEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepStrictEqual(extractJson('Here you go: {"a":1} thanks'), { a: 1 });
  assert.strictEqual(extractJson("no json here"), null);
});

const FACTS = {
  period: { windowDays: 90, since: "2026-04-26", until: "2026-07-25" },
  roster: { total: 38, byDepartment: [{ key: "Science & Research Leadership", count: 26 }, { key: "Co-founders", count: 6 }] },
  research: { totalTracked: 52, newInWindow: 1, newPapers: [{ title: "A JEPA paper", date: "2026-05-01", venue: "arXiv", url: "https://x/y", teamAuthors: ["Yann LeCun"] }], topCited: [] },
  github: { topProjects: [], overview: null },
  news: { inWindow: 2, notable: [{ title: "AMI raises round", date: "2026-05-02", source: "Sifted", url: "https://n/1", people: ["Yann LeCun"] }], aboutPeople: [] },
  network: { coAuthorshipEdges: 3, topCoAuthorPairs: [{ a: "Quentin Le Lidec", b: "Yann LeCun", paperCount: 2 }], sharedHistoryEdges: 234, sharedHistoryByOrg: [{ key: "Meta (FAIR)", count: 120 }], reportingEdges: 37 },
  people: { mostPublished: [], mostConnected: [], mostInNews: [{ name: "Yann LeCun", mentions: 37 }] },
};

test("factsAppendix renders grounded facts with links", () => {
  const md = factsAppendix(FACTS);
  assert.ok(md.includes("38 people"));
  assert.ok(md.includes("[A JEPA paper](https://x/y)"));
  assert.ok(md.includes("**Meta (FAIR):** 120 connection(s)"));
  assert.ok(md.includes("Quentin Le Lidec & Yann LeCun — 2 paper(s)"));
});

test("reportMarkdown works facts-only and with narration", () => {
  const factsOnly = reportMarkdown(FACTS, null, "2026-07-25");
  assert.ok(factsOnly.startsWith("# AMI Labs Observatory — Report"));
  assert.ok(factsOnly.includes("Facts-only edition"));

  const narrated = reportMarkdown(FACTS, { title: "Q2 2026 at AMI", subtitle: "the quarter in review", overview: "Overview text.", sections: [{ heading: "Research", body: "Research body." }] }, "2026-07-25");
  assert.ok(narrated.includes("# Q2 2026 at AMI"));
  assert.ok(narrated.includes("## Research\n\nResearch body."));
  assert.ok(!narrated.includes("Facts-only edition"));
});

console.log(`\nAll ${passed} report-generator tests passed.`);
