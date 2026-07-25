// Tests for the person-mention detector. Run: node scripts/lib/detect-people.test.js
const assert = require("assert");
const { buildMentionIndex, detectPeople, norm } = require("./detect-people");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const ROSTER = [
  { slug: "yann-lecun", name: "Yann LeCun" },
  { slug: "quentin-le-lidec", name: "Quentin Le Lidec" },
  { slug: "aurelia-bortone-bouvet", name: "Aurélia Bortone-Bouvet" },
  { slug: "min-lin", name: "Min Lin" },
  { slug: "madonna", name: "Madonna" }, // single-token name — must be ignored
];
const index = buildMentionIndex(ROSTER);

test("matches a full name, case-insensitively", () => {
  assert.deepStrictEqual(detectPeople("YANN LECUN unveils a world model", index), ["yann-lecun"]);
});

test("matches across diacritics and punctuation", () => {
  assert.deepStrictEqual(detectPeople("A talk by Aurelia Bortone Bouvet", index), ["aurelia-bortone-bouvet"]);
  assert.deepStrictEqual(detectPeople("Aurélia Bortone-Bouvet joined", index), ["aurelia-bortone-bouvet"]);
});

test("finds multiple people and dedupes", () => {
  const got = detectPeople("Yann LeCun and Quentin Le Lidec co-authored; Yann LeCun again.", index).sort();
  assert.deepStrictEqual(got, ["quentin-le-lidec", "yann-lecun"]);
});

test("does NOT match a single common name (needs full name)", () => {
  assert.deepStrictEqual(detectPeople("The lin function and a fan of the show", index), []);
  assert.deepStrictEqual(detectPeople("Min swept the board", index), []);
});

test("single-token roster names are never indexed", () => {
  assert.strictEqual(index.some((e) => e.slug === "madonna"), false);
  assert.deepStrictEqual(detectPeople("Madonna released an album", index), []);
});

test("word boundaries prevent substring false positives", () => {
  assert.deepStrictEqual(detectPeople("minlint and linminster", index), []); // not "Min Lin"
});

test("empty / missing text yields no matches", () => {
  assert.deepStrictEqual(detectPeople("", index), []);
  assert.deepStrictEqual(detectPeople(null, index), []);
});

test("accepts a raw roster (builds index internally)", () => {
  assert.deepStrictEqual(detectPeople("Min Lin leads Singapore", ROSTER), ["min-lin"]);
});

test("norm strips diacritics, case, punctuation", () => {
  assert.strictEqual(norm("Aurélia Bortone-Bouvet!"), "aurelia bortone bouvet");
});

console.log(`\nAll ${passed} person-mention tests passed.`);
