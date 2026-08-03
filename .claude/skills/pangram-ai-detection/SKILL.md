---
name: pangram-ai-detection
description: >-
  Diagnose why a piece of human writing is likely to be flagged as AI by Pangram
  (or similar neural AI-text detectors), and localize the exact passages that read
  as machine-written. Use this whenever the user wants to check writing against an
  AI detector, understand or reduce false positives, figure out "why did this get
  flagged as AI," audit an essay/article/report/email before submitting it somewhere
  that runs detection, or analyze the "AI-ness" of prose style — even if they don't
  say "Pangram" by name. Combines the real Pangram API (authoritative verdict, when a
  key is available) with an offline stylometric linter that explains and locates the
  risk. This skill DIAGNOSES ONLY — it never rewrites the user's text for them.
---

# Pangram AI-Detection Diagnostician

## What this skill is for

A writer runs their genuinely human work through Pangram, gets flagged "AI" or "Mixed,"
and has no idea why — Pangram is a black box that returns a verdict with almost no
explanation. This skill closes that gap. It tells the user **which specific passages
read as machine-written and what stylistic property makes them read that way**, so the
writer can decide how to revise in their own voice.

Two design commitments, both important:

1. **Diagnose, don't rewrite.** The whole point is to protect the writer's authentic
   voice. If we rewrote the text, we would flatten it toward exactly the homogenized
   register that gets flagged in the first place. Report the problems; let the human fix
   them. Only offer rewrite suggestions if the user explicitly asks.

2. **Pangram is the ground truth; the linter only explains.** Pangram 4 is a deep
   neural classifier, not a rules engine. No offline heuristic can perfectly predict its
   score. So when an API key is available, the Pangram verdict is authoritative, and the
   stylometric linter's job is to *localize and explain* — to say why a flagged span
   flagged, and to surface risky spans that sit just under the threshold. Never present
   the linter's score as if it were Pangram's.

Before writing the report, read `references/signals.md`. It explains how Pangram
actually works, the decision boundary (the thresholds that separate Human / Mixed / AI),
why "humanizer" tricks backfire, and what the stylometric signals mean. The report will
be far more accurate and less hand-wavy if you have that model in your head.

## Prerequisites

- **`PANGRAM_API_KEY`** environment variable for the authoritative verdict. If it is not
  set, the skill still runs in **heuristic-only mode** — say so plainly in the report and
  label the risk estimate as a proxy, not a Pangram result.
- Python 3 (standard library only; no packages to install).
- Optional overrides: `PANGRAM_API_URL` (default `https://text.api.pangram.com/v3`) and
  `PANGRAM_VERSION` (default `4.0`, i.e. Pangram 4). Adjust these only if the user's
  account docs specify something different.

## Workflow

### 1. Get clean input

Pangram analyzes natural-language prose of **at least 50 words**. Its own guidance is that
detection is noisiest on the wrong kind of input, so prepare the text first:

- Prefer raw text or `.docx` over PDF. PDF extraction introduces artifacts that skew the
  result. If the user hands you a PDF, extract the text and tell them you did.
- Strip boilerplate that isn't the writing under test: headers, footers, bylines, nav,
  reference/citation lists, tables of contents, code blocks, and templated fragments.
  These are out of scope for Pangram and add noise.
- If the piece is long, keep it intact — Pangram scores long documents in overlapping
  windows and the surrounding context genuinely changes per-passage predictions. Do not
  chop it into tiny pieces unless the user wants a specific excerpt checked.

Save the cleaned text to a file (e.g. in the scratchpad) so both scripts read the same input.

### 2. Get the authoritative verdict (if a key is available)

```bash
python3 scripts/pangram_check.py <cleaned_text_file>
```

This prints normalized JSON: the document verdict (`prediction_short`: Human / Mixed / AI),
the character fractions (`fraction_human`, `fraction_ai_assisted`, `fraction_ai`), the
`ai_assistance_score`, and the per-segment/window breakdown with each segment's label,
score, offsets, and humanizer signal. It reads `PANGRAM_API_KEY` from the environment and
does not print the key. If the call fails (no key, network, auth), it exits non-zero with a
clear message — fall back to heuristic-only mode and note it.

### 3. Localize and explain with the stylometric linter

```bash
python3 scripts/style_lint.py <cleaned_text_file>
```

This runs offline and emits JSON: per-signal hits with character offsets and the exact
snippet, sentence-length burstiness stats, a concreteness estimate, and a composite
heuristic risk score (0–100). The signals it measures — hedging/booster co-occurrence,
signposting, antithesis ("not X but Y") constructions, tricolon/parallelism, formulaic
conclusions, low sentence-length variance, low concrete-detail density, and known LLM
lexis — are the documented and well-established correlates of LLM prose. See
`references/signals.md` for what each one means and how heavily to weight it.

### 4. Cross-reference and write the diagnosis

This is the synthesis step, and it's where your judgment matters. Align the two outputs:

- For every segment Pangram labeled **AI-Generated** or **AI-Assisted**, look at which
  linter signals fire inside that span and use them to explain, concretely, *why it
  probably reads as machine-written*. "This two-sentence span flagged AI-Assisted; it
  stacks three hedges and a booster and has near-identical clause rhythm" is useful. "It's
  AI-ish" is not.
- Surface **near-threshold** spans: passages the linter rates risky that Pangram did *not*
  flag. Frame these as "closest to the line" — useful because Pangram's boundary is tight
  (a passage can flip with small context changes) and because the user asked about false
  positives specifically.
- If Pangram says Human but the writer keeps getting flagged elsewhere, that's the data
  drift story in `references/signals.md` — explain it honestly rather than inventing a
  cause.

Do not overclaim. If a signal is weak (em-dashes, individual "AI words"), say it's weak
and why. Honesty about uncertainty is the product here — the user came to this skill
precisely because Pangram gave them false confidence in the opposite direction.

## Report structure

Use this template:

```
# AI-Detection Diagnosis: <document name>

## Verdict
- **Pangram (authoritative):** <Human | Mixed | AI> — <fractions, ai_assistance_score>
  <or: "No API key set — heuristic-only mode. The estimate below is a proxy, not Pangram's result.">
- **Heuristic risk (proxy):** <0–100> — <one-line gloss of what drove it>
- **Distance to the boundary:** <how close to the 90%-human / 80%-AI thresholds; what would tip it>

## Flagged passages (most to least severe)
For each: the quoted span, its Pangram label (if any), the specific signals that fire,
and a plain-language explanation of why it reads as machine-written. No rewrites.

## Patterns across the piece
The recurring habits (e.g. hedging clusters, uniform sentence length, abstract-over-concrete)
that drive the overall signature — the things worth changing globally, not span by span.

## What to keep in mind when revising
Direction, not rewrites: aim for genuine idiosyncrasy (concrete specifics, lived detail,
sentence-rhythm variance, a real stake/opinion), and avoid "humanizer" tricks — they
backfire (see references/signals.md). Note that only re-running Pangram confirms a fix.
```

## Hard "don'ts"

- **Don't rewrite the user's text** unless they explicitly ask. Even then, keep their
  voice and vet every change — the failure mode is homogenizing prose back toward the
  flagged register.
- **Don't recommend evasion tricks** — typo injection, homoglyphs, zero-width characters,
  synonym-swapping, "make it sound human" passes. Pangram strips these in preprocessing and
  has a dedicated head that flags them, so they raise suspicion rather than lower it.
  `references/signals.md` has the receipts.
- **Don't present the heuristic score as Pangram's verdict.** They are different things and
  conflating them is the exact false-confidence problem this skill exists to fix.
```
