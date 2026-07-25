// Tests for the dossier builder's pure helpers. Run: node scripts/build-dossiers.test.js
const assert = require("assert");
const { parseYears, yearsOverlap, canonicalOrg, paperRosterSlugs, locationFromTags } = require("./build-dossiers");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

test("parseYears handles ranges, open-ended, single, and junk", () => {
  assert.deepStrictEqual(parseYears("2013–2025"), [2013, 2025]); // en-dash
  assert.deepStrictEqual(parseYears("2024-2026"), [2024, 2026]); // hyphen
  assert.deepStrictEqual(parseYears("2020–present"), [2020, 9999]);
  assert.deepStrictEqual(parseYears("2019"), [2019, 2019]);
  assert.strictEqual(parseYears("n/a"), null);
});

test("yearsOverlap computes overlap or null", () => {
  assert.deepStrictEqual(yearsOverlap([2013, 2020], [2018, 2025]), [2018, 2020]);
  assert.deepStrictEqual(yearsOverlap([2010, 2012], [2015, 2020]), null);
  assert.deepStrictEqual(yearsOverlap([2015, 9999], [2019, 2021]), [2019, 2021]); // open-ended
  assert.strictEqual(yearsOverlap(null, [2019, 2021]), null);
});

test("canonicalOrg groups the big shared employers", () => {
  assert.strictEqual(canonicalOrg("Meta AI (Facebook AI Research)"), "Meta (FAIR)");
  assert.strictEqual(canonicalOrg("FAIR"), "Meta (FAIR)");
  assert.strictEqual(canonicalOrg("Google DeepMind"), "Google / DeepMind");
  assert.strictEqual(canonicalOrg("Some Startup Inc"), "some startup inc");
  assert.strictEqual(canonicalOrg("Meta AI (Facebook AI Research)"), canonicalOrg("Meta"));
});

test("paperRosterSlugs unions teamAuthors + resolved authors, roster-filtered", () => {
  const roster = new Set(["a", "b"]);
  const paper = {
    teamAuthors: [{ slug: "a", name: "A" }],
    authors: [{ slug: "b", name: "B" }, { slug: null, name: "External" }, { slug: "ghost", name: "Not On Roster" }],
  };
  assert.deepStrictEqual(paperRosterSlugs(paper, roster).sort(), ["a", "b"]);
});

test("locationFromTags picks a known city tag", () => {
  assert.strictEqual(locationFromTags(["Paris", "Co-Founder"]), "Paris");
  assert.strictEqual(locationFromTags(["Founding Team", "Singapore"]), "Singapore");
  assert.strictEqual(locationFromTags(["Co-Founder"]), null);
});

console.log(`\nAll ${passed} dossier-helper tests passed.`);
