// Tests for the identity resolver. Run: node scripts/lib/resolve-identity.test.js
// No test framework — plain asserts so it runs anywhere with just node.

const assert = require("assert");
const {
  buildResolver, githubUsername, twitterHandle, normName, semanticScholarIds,
} = require("./resolve-identity");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// ── normalization ────────────────────────────────────────────────────────────
test("githubUsername parses URLs, @handles, and bare names", () => {
  assert.strictEqual(githubUsername("https://github.com/mavenlin"), "mavenlin");
  assert.strictEqual(githubUsername("https://github.com/mavenlin/"), "mavenlin");
  assert.strictEqual(githubUsername("http://www.github.com/MavenLin"), "mavenlin");
  assert.strictEqual(githubUsername("@mavenlin"), "mavenlin");
  assert.strictEqual(githubUsername("mavenlin"), "mavenlin");
  assert.strictEqual(githubUsername("https://github.com/org/repo"), "org"); // profile segment only
  assert.strictEqual(githubUsername(null), "");
});

test("twitterHandle parses x.com, twitter.com, @handle", () => {
  assert.strictEqual(twitterHandle("https://x.com/ylecun"), "ylecun");
  assert.strictEqual(twitterHandle("https://twitter.com/YLeCun/"), "ylecun");
  assert.strictEqual(twitterHandle("@ylecun"), "ylecun");
  assert.strictEqual(twitterHandle("ylecun"), "ylecun");
});

test("normName strips diacritics, case, and extra whitespace", () => {
  assert.strictEqual(normName("Basile Terver"), "basile terver");
  assert.strictEqual(normName("  Basile   Terver "), "basile terver");
  assert.strictEqual(normName("Aurélia Bortone-Bouvet"), "aurelia bortone-bouvet");
});

test("semanticScholarIds normalizes string or array", () => {
  assert.deepStrictEqual(semanticScholarIds("123"), ["123"]);
  assert.deepStrictEqual(semanticScholarIds(["123", "456"]), ["123", "456"]);
  assert.deepStrictEqual(semanticScholarIds(null), []);
});

// ── resolver against a representative mini-roster ─────────────────────────────
const ROSTER = [
  { slug: "min-lin", name: "Min Lin", links: { github: "https://github.com/mavenlin", twitter: "https://x.com/lin_min" }, semanticScholarId: ["1688882"] },
  { slug: "yann-lecun", name: "Yann LeCun", links: { github: "https://github.com/ylecun", twitter: "https://x.com/ylecun" }, semanticScholarId: "1688882-yl" },
  { slug: "basile-terver", name: "Basile Terver", links: {} },
];
const r = buildResolver(ROSTER, { onCollision: () => {} });

test("resolves by github username (any format)", () => {
  assert.strictEqual(r.byGithub("mavenlin").slug, "min-lin");
  assert.strictEqual(r.byGithub("https://github.com/MavenLin/").slug, "min-lin");
  assert.strictEqual(r.byGithub("nope"), null);
});

test("resolves by X handle", () => {
  assert.strictEqual(r.byTwitter("ylecun").slug, "yann-lecun");
  assert.strictEqual(r.byTwitter("@lin_min").slug, "min-lin");
});

test("resolves by Semantic Scholar id", () => {
  assert.strictEqual(r.bySemanticScholarId("1688882").slug, "min-lin");
  assert.strictEqual(r.bySemanticScholarId(["x", "1688882-yl"]).slug, "yann-lecun");
});

test("resolves by name (diacritic/case insensitive)", () => {
  assert.strictEqual(r.byName("basile terver").slug, "basile-terver");
  assert.strictEqual(r.byName("Basile Terver").slug, "basile-terver");
});

test("resolve() tries identifiers strongest-first and slugFor returns slug", () => {
  assert.strictEqual(r.slugFor({ github: "mavenlin" }), "min-lin");
  assert.strictEqual(r.slugFor({ xUsername: "ylecun" }), "yann-lecun");
  assert.strictEqual(r.slugFor({ name: "Min Lin" }), "min-lin");
  assert.strictEqual(r.slugFor({ github: "ghost", name: "Basile Terver" }), "basile-terver"); // falls through
  assert.strictEqual(r.slugFor({ name: "Nobody Here" }), null);
});

test("bare-string resolve covers slug, github, S2 id, X handle, and name", () => {
  assert.strictEqual(r.slugFor("min-lin"), "min-lin");        // slug
  assert.strictEqual(r.slugFor("mavenlin"), "min-lin");       // github username
  assert.strictEqual(r.slugFor("1688882"), "min-lin");        // Semantic Scholar id
  assert.strictEqual(r.slugFor("@lin_min"), "min-lin");       // X handle
  assert.strictEqual(r.slugFor("Yann LeCun"), "yann-lecun");  // name
  assert.strictEqual(r.slugFor("unmatched-token"), null);
});

test("collisions keep the first registration and report", () => {
  const collisions = [];
  const dup = buildResolver(
    [
      { slug: "a", name: "Same Name", links: { github: "https://github.com/shared" } },
      { slug: "b", name: "Other", links: { github: "https://github.com/shared" } },
    ],
    { onCollision: (key, kind, existing, slug) => collisions.push([kind, key, existing, slug]) }
  );
  assert.strictEqual(dup.byGithub("shared").slug, "a"); // first wins
  assert.deepStrictEqual(collisions, [["github", "shared", "a", "b"]]);
});

test("empty/garbage roster yields an empty resolver, not a crash", () => {
  const empty = buildResolver(null);
  assert.strictEqual(empty.byGithub("anything"), null);
  assert.strictEqual(empty.slugFor({ name: "x" }), null);
});

console.log(`\nAll ${passed} identity-resolver tests passed.`);
