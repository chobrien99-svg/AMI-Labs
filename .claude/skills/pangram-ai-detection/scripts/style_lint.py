#!/usr/bin/env python3
"""
style_lint.py — offline stylometric linter for LLM-prose correlates.

This does NOT predict Pangram. It LOCALIZES and EXPLAINS: it finds the passages and habits
that make prose read as machine-written, so a human diagnosis can point to exact spans. When
a Pangram API verdict is available, that is the ground truth; this only explains the "why"
and "where". See references/signals.md for what each signal means and how to weight it.

Usage:
    python3 style_lint.py <text_file>
    echo "some text" | python3 style_lint.py -

Output: JSON on stdout with per-signal hits (snippet + char offsets), burstiness and
concreteness stats, a per-sentence ranking of the riskiest spans, and a transparent
composite risk score in [0, 100] with its breakdown. The score ranks passages for
attention; it is a proxy, not a probability.

Stdlib only; no packages required.
"""

import json
import re
import statistics
import sys

# ---- Lexicons (see references/signals.md §6). Correlates, not certainties. ----

HEDGES = {
    "may", "might", "could", "can", "would", "perhaps", "possibly", "likely",
    "generally", "typically", "often", "usually", "tends", "tend", "suggests",
    "suggest", "appears", "appear", "seems", "seem", "arguably", "relatively",
    "somewhat", "potentially", "presumably", "largely", "broadly", "commonly",
}
BOOSTERS = {
    "crucial", "crucially", "essential", "essentially", "vital", "key", "significant",
    "significantly", "strong", "strongly", "robust", "consistent", "consistently",
    "powerful", "remarkable", "remarkably", "notable", "notably", "critical",
    "critically", "profound", "profoundly", "compelling", "paramount", "pivotal",
    "important", "importantly", "substantial", "substantially",
}
SIGNPOSTS = {
    "moreover", "furthermore", "additionally", "consequently", "therefore", "thus",
    "however", "notably", "importantly", "ultimately", "indeed", "similarly",
    "conversely", "nevertheless", "nonetheless", "accordingly", "hence", "overall",
}
CONCLUSION_OPENERS = [
    "in conclusion", "in summary", "to sum up", "to summarize", "in short",
    "all in all", "ultimately", "overall", "in essence", "taken together",
]
# Weak: known LLM lexis, most likely trained out by hard-negative mining. Low weight.
LLM_LEXIS = [
    "delve", "tapestry", "a testament to", "testament to", "in the realm of",
    "navigating the", "at its core", "plays a crucial role", "plays a vital role",
    "plays a key role", "it's worth noting", "it is worth noting", "it's important to",
    "it is important to note", "when it comes to", "in today's", "ever-evolving",
    "landscape of", "underscore", "underscores", "foster a", "shed light on",
    "the world of", "a myriad of", "seamless", "seamlessly",
]
# Contrastive-pivot markers: the "X rather than Y / not-A-B / it changes yet it remains"
# scaffolding. A signature LLM cadence in analytic prose, and one the strict antithesis
# patterns below miss because each is a single marker, not a full "not only ... but" frame.
# These are legitimate constructions in isolation; density is the tell.
CONTRASTIVE_RES = [
    re.compile(r"\brather than\b", re.I),
    re.compile(r"\bnot simply\b", re.I),
    re.compile(r"\bnot merely\b", re.I),
    re.compile(r"\bnot necessarily\b", re.I),
    re.compile(r"\bnot solely\b", re.I),
    re.compile(r"\bas opposed to\b", re.I),
    re.compile(r"\beven as\b", re.I),
    re.compile(r";\s+the\s+[^.?!;]{1,45}\bremains?\b", re.I),  # "…changes; the substrate remains"
]

# A section-break / punchy line is short; those add reader-facing variance but are not what a
# 512-token detector window scores. Body cadence (sentences at/above this length) is the honest
# uniformity measure. See references/signals.md §6.
BODY_MIN_WORDS = 8

SENT_RE = re.compile(r'[^.!?]*[.!?]+["\')\]]?|\S[^.!?]*$', re.S)
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]*")
DASH_RE = re.compile(r"—|–|(?<=\s)-(?=\s)")


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def split_sentences(text):
    """Return list of (sentence_text, start, end) using char offsets."""
    out = []
    for m in SENT_RE.finditer(text):
        s = m.group()
        if s.strip():
            out.append((s.strip(), m.start(), m.end()))
    return out


def word_spans(text):
    return [(m.group(), m.start(), m.end()) for m in WORD_RE.finditer(text)]


def find_lexicon_hits(text, lexicon):
    """Whole-word, case-insensitive hits for a set of single words."""
    hits = []
    for m in WORD_RE.finditer(text):
        if m.group().lower() in lexicon:
            hits.append({"snippet": m.group(), "start": m.start(), "end": m.end()})
    return hits


def find_phrase_hits(text, phrases):
    low = text.lower()
    hits = []
    for p in phrases:
        start = 0
        while True:
            i = low.find(p, start)
            if i == -1:
                break
            hits.append({"snippet": text[i:i + len(p)], "start": i, "end": i + len(p)})
            start = i + len(p)
    return hits


def find_antithesis(text):
    hits = []
    patterns = [
        r"\bnot only\b[^.?!]{1,80}?\bbut\b",
        r"\bnot just\b[^.?!]{1,80}?\bbut\b",
        r"\bit'?s not\b[^.?!]{1,80}?\bit'?s\b",
        r"\bisn'?t (?:just |merely |only )?[^.?!]{1,80}?\bit'?s\b",
        r"\bnot\b[^,.?!]{1,40}?,?\s+but rather\b",
    ]
    for pat in patterns:
        for m in re.finditer(pat, text, re.I):
            hits.append({"snippet": m.group()[:120], "start": m.start(), "end": m.end()})
    return hits


def find_contrastive(text):
    hits = []
    for rx in CONTRASTIVE_RES:
        for m in rx.finditer(text):
            hits.append({"snippet": m.group()[:80], "start": m.start(), "end": m.end()})
    hits.sort(key=lambda h: h["start"])
    return hits


def find_tricolon(text):
    # "A, B, and C" style balanced triples — elegant once, a tell in bulk.
    hits = []
    pat = r"\b[\w'-]+(?:\s+[\w'-]+){0,3},\s+[\w'-]+(?:\s+[\w'-]+){0,3},\s+(?:and|or)\s+[\w'-]+(?:\s+[\w'-]+){0,3}"
    for m in re.finditer(pat, text):
        hits.append({"snippet": m.group()[:120], "start": m.start(), "end": m.end()})
    return hits


def find_participial_openers(sentences):
    hits = []
    for s, start, end in sentences:
        m = re.match(r"([A-Z][a-z]+ing\b[^,.?!]{0,40},)", s)
        if m:
            hits.append({"snippet": m.group(1), "start": start, "end": start + len(m.group(1))})
    return hits


def find_signpost_openers(sentences):
    hits = []
    for s, start, end in sentences:
        m = re.match(r"([A-Za-z]+)", s)
        if m and m.group(1).lower() in SIGNPOSTS:
            hits.append({"snippet": m.group(1), "start": start, "end": start + len(m.group(1))})
    return hits


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: style_lint.py <text_file|->\n")
        return 2
    text = sys.stdin.read() if sys.argv[1] == "-" else open(sys.argv[1], encoding="utf-8").read()

    words = word_spans(text)
    n_words = len(words)
    sentences = split_sentences(text)
    n_sents = len(sentences)
    if n_words == 0 or n_sents == 0:
        print(json.dumps({"error": "no analyzable text"}))
        return 0
    per100 = n_words / 100.0

    # ---- collect hits ----
    hedge_hits = find_lexicon_hits(text, HEDGES)
    booster_hits = find_lexicon_hits(text, BOOSTERS)
    signpost_hits = find_signpost_openers(sentences)
    antithesis_hits = find_antithesis(text)
    contrastive_hits = find_contrastive(text)
    tricolon_hits = find_tricolon(text)
    conclusion_hits = find_phrase_hits(text, CONCLUSION_OPENERS)
    lexis_hits = find_phrase_hits(text, LLM_LEXIS)
    participial_hits = find_participial_openers(sentences)
    dash_hits = [{"snippet": m.group(), "start": m.start(), "end": m.end()} for m in DASH_RE.finditer(text)]

    # ---- burstiness (sentence-length variation) ----
    # Report both the overall CV and the body-only CV. Short section-break lines inflate the
    # overall figure with reader-facing variance a detector's windows never see; the body-only
    # CV is the honest measure of how uniform the sustained prose actually is.
    sent_wcounts = [len(WORD_RE.findall(s)) for s, _, _ in sentences]
    mean_len = statistics.mean(sent_wcounts)
    stdev_len = statistics.pstdev(sent_wcounts) if n_sents > 1 else 0.0
    cv = (stdev_len / mean_len) if mean_len else 0.0  # overall coefficient of variation

    body_wcounts = [w for w in sent_wcounts if w >= BODY_MIN_WORDS]
    short_lines = [w for w in sent_wcounts if w < BODY_MIN_WORDS]
    if len(body_wcounts) >= 5:
        body_mean = statistics.mean(body_wcounts)
        body_cv = (statistics.pstdev(body_wcounts) / body_mean) if body_mean else 0.0
    else:
        body_cv = cv  # too few body sentences to separate; fall back to overall
    # The subscore keys on body_cv — that is what actually gets windowed and scored.
    masking = cv - body_cv  # large positive => short lines are hiding uniform body prose

    # ---- concreteness (anchors: digits + mid-sentence proper-noun proxy) ----
    digit_tokens = len(re.findall(r"\b\d[\d,.:/-]*\b", text))
    proper_nouns = 0
    for s, _, _ in sentences:
        toks = WORD_RE.findall(s)
        for i, t in enumerate(toks):
            if i > 0 and t[0].isupper() and t.lower() not in SIGNPOSTS:
                proper_nouns += 1
    anchors = digit_tokens + proper_nouns
    anchor_density = anchors / per100  # per 100 words

    # ---- hedge/booster co-occurrence within a sentence ----
    both = 0
    for s, _, _ in sentences:
        low = {w.lower() for w in WORD_RE.findall(s)}
        if (low & HEDGES) and (low & BOOSTERS):
            both += 1
    cooc_ratio = both / n_sents

    # ---- subscores in [0,1] (see references/signals.md §6 for the reasoning) ----
    hb_density = (len(hedge_hits) + len(booster_hits)) / per100
    per500 = n_words / 500.0
    sub = {
        "hedge_booster": clamp(hb_density / 4.0 * (1 + 0.5 * cooc_ratio)),
        "burstiness_low_variance": clamp((0.5 - body_cv) / 0.4),
        "low_concreteness": clamp((3.0 - anchor_density) / 3.0),
        "contrastive_pivot": clamp((len(contrastive_hits) / per500) / 5.0),
        "signposting": clamp((len(signpost_hits) / n_sents) / 0.3),
        "antithesis": clamp((len(antithesis_hits) / per500) / 2.0),
        "tricolon_parallelism": clamp((len(tricolon_hits) / per500) / 3.0),
        "formulaic_conclusion": clamp(len(conclusion_hits) / 2.0),
        "llm_lexis_weak": clamp(len(lexis_hits) / max(1.0, (n_words / 1000.0) * 2)),
        "em_dash_weak": clamp((len(dash_hits) / per100) / 2.0),
    }
    weights = {
        "hedge_booster": 20, "burstiness_low_variance": 18, "low_concreteness": 16,
        "contrastive_pivot": 12, "signposting": 10, "antithesis": 8,
        "tricolon_parallelism": 6, "formulaic_conclusion": 4, "llm_lexis_weak": 3,
        "em_dash_weak": 3,
    }
    contributions = {k: round(weights[k] * sub[k], 1) for k in weights}
    composite = round(sum(contributions.values()), 1)

    # ---- per-sentence risk ranking (localize lexical signals) ----
    lexical_pools = {
        "hedge": hedge_hits, "booster": booster_hits, "signpost": signpost_hits,
        "antithesis": antithesis_hits, "contrastive": contrastive_hits, "tricolon": tricolon_hits,
        "conclusion": conclusion_hits, "llm_lexis": lexis_hits, "participial": participial_hits,
    }
    ranked = []
    for s, start, end in sentences:
        fired = {}
        for name, pool in lexical_pools.items():
            c = sum(1 for h in pool if start <= h["start"] < end)
            if c:
                fired[name] = c
        score = sum(fired.values())
        if score:
            ranked.append({"start": start, "end": end, "signals": fired,
                           "hits": score, "text": s[:240]})
    ranked.sort(key=lambda r: r["hits"], reverse=True)

    out = {
        "disclaimer": "Heuristic proxy for LLM-prose style. NOT a Pangram prediction. "
                      "Use Pangram's API for the authoritative verdict; use this to locate and explain.",
        "composite_risk_0_100": composite,
        "score_breakdown": contributions,
        "subscores_0_1": {k: round(v, 3) for k, v in sub.items()},
        "stats": {
            "words": n_words, "sentences": n_sents,
            "mean_sentence_words": round(mean_len, 1),
            "stdev_sentence_words": round(stdev_len, 1),
            "sentence_length_cv": round(cv, 3),
            "body_sentence_length_cv": round(body_cv, 3),
            "short_break_lines": len(short_lines),
            "cv_note": "body_cv is the honest measure (what gets windowed); lower = more "
                       "uniform/machine-like; human prose is typically >~0.5",
            "cadence_masking": round(masking, 3),
            "cadence_masking_note": ("short section-break lines are inflating the overall CV; "
                                     "the sustained body prose is more uniform than it looks"
                                     if masking > 0.05 else "overall and body cadence agree"),
            "concrete_anchors": anchors,
            "concrete_anchors_per_100w": round(anchor_density, 2),
            "hedge_booster_per_100w": round(hb_density, 2),
            "hedge_booster_cooccurrence_sentences": both,
        },
        "signal_counts": {
            "hedges": len(hedge_hits), "boosters": len(booster_hits),
            "signpost_openers": len(signpost_hits), "antithesis": len(antithesis_hits),
            "contrastive_pivots": len(contrastive_hits), "tricolon": len(tricolon_hits),
            "formulaic_conclusions": len(conclusion_hits),
            "llm_lexis_weak": len(lexis_hits), "participial_openers": len(participial_hits),
            "em_dashes_weak": len(dash_hits),
        },
        "riskiest_spans": ranked[:10],
        "hits": {
            "hedges": hedge_hits, "boosters": booster_hits, "signpost_openers": signpost_hits,
            "antithesis": antithesis_hits, "contrastive_pivots": contrastive_hits,
            "tricolon": tricolon_hits, "formulaic_conclusions": conclusion_hits,
            "llm_lexis_weak": lexis_hits, "participial_openers": participial_hits,
        },
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
