/**
 * Strip pipeline/editorial "scaffolding" that sometimes leads a synthesised
 * briefing narrative — e.g. an
 *   "Administrative note: We revamped the backend … we digested 444 new items
 *    (woof!) attributed to the team since the last window."
 * preamble that is meta-commentary about the generation run, not prose meant
 * for readers. Only a narrative (or paragraph) that *begins* with such a
 * labelled aside is touched; everything else passes through unchanged.
 *
 * Shared by the Next app (Observatory Briefing page + Research page) and the
 * weekly digest script, so the aside never surfaces on any surface.
 */

// A narrative/paragraph that opens with one of these labels is an editorial aside.
const SCAFFOLDING_LABEL =
  /^\s*(administrative note|editor'?s note|editorial note|meta note|note to self|internal note)\s*:/i;

// Sentences that still read as run-metadata rather than reader-facing prose;
// used to keep dropping past the labelled sentence until real content begins.
const SCAFFOLDING_CONTINUATION =
  /\b(revamp|back-?end|digest(?:ed)?|new items|the filter|this window|since the last window|woof|pipeline|attributed to the team|back-?fill(?:ed)?)\b/i;

function stripBriefingScaffolding(narrative) {
  if (!narrative) return "";
  const cleaned = String(narrative)
    .split(/\n{2,}/)
    .map((para) => {
      if (!SCAFFOLDING_LABEL.test(para)) return para;
      const sentences = para.match(/[^.!?]+[.!?]+/g);
      if (!sentences) return ""; // the whole paragraph was the aside
      // Always drop the labelled opening sentence, then keep dropping while the
      // following sentences are still run-metadata; the remainder is real prose.
      let i = 1;
      while (i < sentences.length && SCAFFOLDING_CONTINUATION.test(sentences[i])) i++;
      return sentences.slice(i).join("").trim();
    })
    .filter((para) => para.trim().length > 0);
  return cleaned.join("\n\n").trim();
}

module.exports = { stripBriefingScaffolding };
