# How Pangram works, the decision boundary, and what the signals mean

This file is the reasoning behind the skill. Read it before writing a diagnosis. Everything
here is derived from Pangram's own Pangram 4 technical report, model card, and technical
overview (July 2026), plus established LLM stylometry. Where something is Pangram's claim
rather than an independent fact, it is marked as such.

## Table of contents
1. What Pangram actually is (and why there is no "trigger word list")
2. The decision boundary — the concrete, actionable part
3. What the documents reveal about the LLM "signature"
4. Why humanizer / evasion tricks backfire
5. Documented false-positive risk factors
6. The stylometric signals this skill measures, and how to weight them
7. How to talk about all this honestly

---

## 1. What Pangram actually is

Pangram 4 is a deep-learning classifier: a sparse mixture-of-experts transformer backbone
(~6× the parameters of Pangram 3) with LoRA adapters and four classification heads
(segment-level 15-way AI-fraction, tokenwise 3-way provenance, binary mixed-authorship, and
a 4-way humanizer probe). It is **not** a rules engine. Consequences:

- **There is no internal list of "AI words" or features to reverse-engineer.** It learns a
  high-dimensional representation of *how a text was written*. Pangram's own limitations
  section admits its predictions are "to some degree a black box" and "difficult to
  understand."
- **Synthetic mirroring is designed to defeat the checklist approach.** Pangram builds AI
  training text by asking a model for a human document's topic, then "write an article about
  X." Stated goal: learn "How was this text written?" *as opposed to* "What is this text
  about?" So it keys on style/distribution, not topic or keywords.
- **Hard-negative mining patches obvious tells over time.** They run candidate models on a
  reserve of human text, find human samples that get misflagged, synthesize mirrors of them,
  and retrain. Any simple surface tell that causes false positives gets trained *out*. A
  static word list is chasing a moving target.

**Bottom line for diagnosis:** what pushes human writing toward a flag is the *overall
statistical resemblance* of the prose to LLM open-ended prose — a voiceprint, not a
fingerprint. Frame findings that way.

## 2. The decision boundary (the concrete, actionable part)

Per-token labels: `Human`, `AI-Assisted`, `AI-Generated`. Document verdict
(`prediction_short`) from character fractions:

- **Human** if ≥ 90% of characters are labeled Human.
- **AI** if ≥ 80% of characters are labeled AI-Generated.
- **Mixed** otherwise.

`ai_assistance_score = P(AI-Generated) + 0.5 × P(AI-Assisted)`. The AI fraction that Pangram
regresses is `f_AI = (0.5·C_assisted + C_generated) / total_chars`, so **AI-Assisted
characters count half.**

What this means in practice, and why it matters for false positives:

- **"Mixed" is a failure for a writer defending human authorship.** It is not a safe middle
  ground — to anyone running detection it reads as "AI was involved."
- **The human tolerance is tight.** To stay "Human," at least 90% of characters must land in
  Human clauses. So if **more than ~10% of the piece** reads as reworded/AI-cadenced
  (AI-Assisted) — or a smaller amount reads as fully AI-Generated — the document tips to
  Mixed. A couple of machine-sounding sentence-pairs in a moderate essay can do it.
- **The atomic unit is ~2 sentences.** Pangram's minimum segment length is about two
  sentences, so it won't flag a single stray word — it flags *clusters*. Localized passages
  of LLM cadence are what move the needle. This is why the skill localizes to spans.
- **AI-Assisted is the trap for real writers.** It is defined as *the human had the idea, the
  AI made the final lexical choices.* The training labeler works clause by clause: clause
  lexically matches a human source → Human; the *idea* is preserved but *reworded* in a
  non-human way → AI-Assisted; neither → AI-Generated. So even genuinely your own thoughts,
  phrased in standard LLM cadence, accrue toward the threshold. A writer who has absorbed LLM
  phrasing gets caught here without any AI involvement at all.

## 3. What the documents reveal about the LLM "signature"

Only a few concrete linguistic tells are named, but they are worth having:

- **Hedging + emphasis co-occurrence.** The technical overview cites research that LLM
  editing makes text "accumulate hedging words ('may,' 'typically,' 'suggests') and emphasis
  words ('strong,' 'robust,' 'consistent')." This is the single most concrete lexical signal
  Pangram names. The *co-occurrence and density* is the tell, not any one word.
- **Style is sticky.** They cite that "writers who edit LLM output toward their personal
  style still produce text that reads closer to LLM writing than to their own," and that LLM
  edits shift meaning "even when the model is instructed to correct only grammar."
- **Registers nearest the boundary.** In an ablation, allowing the humanizer signal to leak
  into the backbone concentrated new failures in "academic writing and ESL essays." Those two
  registers sit closest to the false-positive edge — relevant if the user writes in them.

## 4. Why humanizer / evasion tricks backfire

If the user's instinct is to humanize or obfuscate, steer them off it — with reasons:

- Commercial humanizers are caught **98.83%** of the time (Pangram's claim), and a
  **dedicated humanizer head** specifically flags typo injection, casing changes, synonym
  substitution, and homoglyph / zero-width attacks. These tricks raise `is_humanized`
  (threshold 0.91) — a *worse* signal than a clean read.
- Homoglyphs and adversarial Unicode are **stripped in preprocessing** before the model sees
  the text, so they do nothing except when they survive as the humanizer tell.
- A GPT-5.6 agent with 24 hours of API access tried style imitation, terse professional
  registers, translation round-trips, and source-conditioning. It found **one** bypass, and
  it was out of scope (terse dictated medical notes, not prose).

The legitimate move is authentic idiosyncrasy, not disguise. Note that PDF-extraction / OCR /
copy-paste artifacts are explicitly *not* treated as humanization — but they still degrade
accuracy, which is why the skill prefers clean text input.

## 5. Documented false-positive risk factors

Straight from Pangram's intended-use and limitations sections — all legitimate:

- **Input hygiene.** Use raw text or `.docx`, not PDF ("PDF parsing can introduce unintended
  artifacts"). Strip headers, footers, instructions, and formatting before checking.
- **Out-of-scope material is error-prone:** source code, tables of contents, reference
  sections, templated/automated writing, technical manuals/instructions, math-heavy text.
  Don't leave these mixed into the prose under test.
- **Length:** under 50 words is unreliable.
- **Context inconsistency (Pangram's own caveat):** the *same* passage can get a different
  label depending on what surrounds it. A paragraph flagged alone may pass inside the whole
  piece, and vice versa. Worth testing both ways when a single passage is in dispute.
- **Data drift — the admitted false-positive driver.** Pangram states it "does not account
  for people who intentionally write like LLMs or who have absorbed elements of LLM style
  into their writing." This is the honest explanation for many human false positives: genuine
  stylistic convergence, not a matching bug. If Pangram returns Human but the writer keeps
  getting flagged by *other* tools or in other contexts, this is usually why.

## 6. The stylometric signals this skill measures, and how to weight them

`style_lint.py` measures the following. These are *correlates* of LLM prose grounded in the
documents above and standard stylometry — not a map of Pangram's internal features. Weight
them accordingly and never present them as certainties.

**Strong signals (weight these most):**
- **Hedge + booster density and co-occurrence.** The one lexical tell Pangram names. Clusters
  of "may / typically / often / suggests / generally" alongside "crucial / robust / strong /
  significant / essential" in the same span are the clearest correlate.
- **Sentence-length burstiness (low variance).** Human prose is bursty — it mixes very short
  and long sentences. LLM prose tends toward uniform, evenly-cadenced sentence lengths. Low
  coefficient of variation is one of the more reliable structural correlates.
- **Concrete-detail density (low = risky).** Specific names, numbers, dates, places, and
  lived particulars are hard for a model to fabricate and rare in generic LLM output.
  Abstraction-heavy prose with few concrete anchors reads machine-written.

**Moderate signals:**
- **Signposting / transition density** at sentence starts ("Moreover, Furthermore,
  Additionally, Consequently, Ultimately, Importantly, Notably"). LLMs over-scaffold.
- **Antithesis constructions** ("not X but Y," "it's not just X, it's Y," "not only … but
  also"). A signature LLM rhetorical move when overused.
- **Tricolon / rule-of-three parallelism** ("A, B, and C" balanced triples, repeated
  parallel clause structure). Elegant once; a tell in bulk.
- **Formulaic conclusions** ("In conclusion," "Overall," "In summary," tidy summarizing
  windups that restate rather than add).

**Weak signals (mention only, always caveated):**
- **Known LLM lexis** ("delve, tapestry, testament to, in the realm of, navigating the, at
  its core, plays a crucial role, it's worth noting"). These are real correlates but the
  *most* likely to have been trained out via hard-negative mining, and the most likely to
  appear innocently in human writing. Flag them, but tell the user they're weak.
- **Em-dash / punctuation frequency.** Weakly correlated, heavily confounded by personal
  style. Report as color, not evidence.

The composite score is a transparent weighted sum, meant to *rank passages for attention*,
not to predict Pangram. Always show which signals drove it.

## 7. How to talk about all this honestly

The user came to this skill because Pangram gave them a confident verdict with no
explanation. The value here is the opposite: specific, located, honestly-hedged explanation.

- Lead with the Pangram verdict when a key is present; it is the ground truth.
- Use the linter to explain *why* and *where*, never to override or impersonate Pangram.
- Distinguish "this is what fired" from "this is definitely why Pangram flagged it" — you are
  inferring, and the black-box nature means you can be wrong.
- The only true confirmation that a revision worked is re-running Pangram. Say so.
- Never sell an evasion trick. The defensible, effective goal is prose that is genuinely,
  verifiably the writer's own.
