// Tests for the briefing scaffolding stripper. Run: node scripts/lib/strip-scaffolding.test.js
const assert = require("assert");
const { stripBriefingScaffolding } = require("./strip-scaffolding");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

test("removes a leading 'Administrative note: … (woof!)' aside, keeps the real prose", () => {
  const input =
    "Administrative note: We revamped the backend in terms of the way publications " +
    "are captured, so the filter is more comprehensive. That means we digested 444 " +
    "new items (woof!) attributed to the team since the last window. But the " +
    "directional signal is hard to miss: JEPA is spreading.";
  const out = stripBriefingScaffolding(input);
  assert.ok(!/administrative note/i.test(out), "label removed");
  assert.ok(!out.includes("444"), "run-metadata sentence removed");
  assert.ok(!out.includes("woof"), "woof removed");
  assert.strictEqual(out, "But the directional signal is hard to miss: JEPA is spreading.");
});

test("leaves an ordinary narrative untouched (aside from trim)", () => {
  const input = "224 Ventures opens with $100 million. Vinyals left DeepMind the same day.";
  assert.strictEqual(stripBriefingScaffolding(input), input);
});

test("drops an aside that is its own paragraph, preserves following paragraphs", () => {
  const input =
    "Editor's note: back-filled 12 items this window.\n\n" +
    "The real story is the hiring wave.\n\nLondon and New York both grew.";
  assert.strictEqual(
    stripBriefingScaffolding(input),
    "The real story is the hiring wave.\n\nLondon and New York both grew."
  );
});

test("does not touch a mid-sentence 'note:' that is not a leading label", () => {
  const input = "The filing includes a note: the board approved the raise.";
  assert.strictEqual(stripBriefingScaffolding(input), input);
});

test("handles empty / nullish input", () => {
  assert.strictEqual(stripBriefingScaffolding(""), "");
  assert.strictEqual(stripBriefingScaffolding(null), "");
  assert.strictEqual(stripBriefingScaffolding(undefined), "");
});

console.log(`\n${passed} passed`);
