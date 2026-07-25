// ============================================================================
// AMI Observatory — person-mention detection
// ----------------------------------------------------------------------------
// Given a piece of text (a news headline + summary) and the roster, return the
// canonical `slug`s of the people mentioned. Used to link news articles to the
// people they're about. Conservative by design: it matches a person's FULL name
// as a whole phrase (diacritic- and case-insensitive), so common single names
// (Li, Fan, Brown, Lin) don't produce false positives. Suggestions are meant to
// be reviewed by a human before publishing, so precision beats recall here.
//
//   const { buildMentionIndex, detectPeople } = require("./lib/detect-people");
//   const index = buildMentionIndex(roster);
//   detectPeople("Yann LeCun on world models", index); // -> ["yann-lecun"]
// ============================================================================

// Normalize for matching: strip diacritics, lowercase, and turn every run of
// non-alphanumerics into a single space. Applied identically to names and text
// so "Aurélia Bortone-Bouvet" and "...Aurelia Bortone Bouvet..." align.
function norm(s) {
  return String(s == null ? "" : s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Build a reusable index of { slug, name, pattern }. People whose name is a
// single token are skipped — matching one common name is too false-positive-prone.
function buildMentionIndex(roster) {
  const entries = [];
  for (const p of roster || []) {
    if (!p || !p.slug || !p.name) continue;
    const n = norm(p.name);
    const tokens = n ? n.split(" ") : [];
    if (tokens.length < 2) continue; // require a full (multi-token) name
    // Whole-phrase, word-bounded match on the normalized text.
    const pattern = new RegExp(`\\b${tokens.map(escapeRe).join("\\s+")}\\b`);
    entries.push({ slug: p.slug, name: p.name, pattern });
  }
  return entries;
}

const isIndex = (x) => Array.isArray(x) && (x.length === 0 || (x[0] && x[0].pattern instanceof RegExp));

// Return the deduped slugs of people mentioned in `text`. Second arg may be a
// prebuilt index (preferred for many calls) or a raw roster array.
function detectPeople(text, indexOrRoster) {
  const index = isIndex(indexOrRoster) ? indexOrRoster : buildMentionIndex(indexOrRoster);
  const hay = norm(text);
  if (!hay) return [];
  const slugs = [];
  for (const e of index) if (e.pattern.test(hay)) slugs.push(e.slug);
  return [...new Set(slugs)];
}

module.exports = { buildMentionIndex, detectPeople, norm };
