#!/usr/bin/env python3
"""
pangram_check.py — call the real Pangram text-detection API and print a normalized result.

This is the AUTHORITATIVE verdict. The stylometric linter only explains; this is ground truth.

Usage:
    python3 pangram_check.py <text_file>
    echo "some text" | python3 pangram_check.py -

Environment:
    PANGRAM_API_KEY   (required)  Your Pangram API key. Never printed.
    PANGRAM_API_URL   (optional)  Default: https://text.api.pangram.com/v3
    PANGRAM_VERSION   (optional)  Default: 4.0   (selects the Pangram 4 model)

Output:
    JSON on stdout with two top-level keys:
      "normalized" — a stable, documented view (verdict, fractions, segments)
      "raw"        — the exact API response, so field drift is always debuggable.

Exit codes:
    0 success · 2 usage/input error · 3 missing key · 4 API/network error

Notes:
    The response schema is modeled on the Pangram 4 model card (document-level
    fraction_* + prediction_short, and a per-window/segment array). The API may name or
    nest fields slightly differently across versions, so parsing is deliberately defensive:
    anything it can't map is preserved verbatim under "raw". If "normalized" looks empty,
    read "raw" to see the real structure and adjust the field maps below.
"""

import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://text.api.pangram.com/v3"
DEFAULT_VERSION = "4.0"
TIMEOUT_S = 120


def read_input(arg: str) -> str:
    if arg == "-":
        return sys.stdin.read()
    with open(arg, "r", encoding="utf-8") as fh:
        return fh.read()


def first_present(d: dict, *keys, default=None):
    """Return the first key that exists in d (supports schema drift)."""
    for k in keys:
        if isinstance(d, dict) and k in d and d[k] is not None:
            return d[k]
    return default


def normalize(resp: dict, text: str) -> dict:
    """Map the API response onto a stable shape. Best-effort; never raises on missing fields."""
    if not isinstance(resp, dict):
        return {"note": "API response was not a JSON object; see raw.", "segments": []}

    doc = {
        "prediction_short": first_present(resp, "prediction_short", "prediction_label", "label"),
        "prediction": first_present(resp, "prediction", "headline"),
        "fraction_human": first_present(resp, "fraction_human"),
        "fraction_ai_assisted": first_present(resp, "fraction_ai_assisted"),
        "fraction_ai": first_present(resp, "fraction_ai"),
        "ai_assistance_score": first_present(
            resp, "ai_assistance_score", "avg_ai_likelihood", "score"
        ),
        "num_human_segments": first_present(resp, "num_human_segments"),
        "num_ai_assisted_segments": first_present(resp, "num_ai_assisted_segments"),
        "num_ai_segments": first_present(resp, "num_ai_segments"),
    }

    # Segments/windows live under one of several possible keys.
    raw_segments = first_present(
        resp, "segments", "windows", "results", "predictions", default=[]
    )
    segments = []
    if isinstance(raw_segments, list):
        for seg in raw_segments:
            if not isinstance(seg, dict):
                continue
            start = first_present(seg, "start_index", "start", "char_start")
            end = first_present(seg, "end_index", "end", "char_end")
            snippet = first_present(seg, "text", "substring")
            if snippet is None and start is not None and end is not None:
                try:
                    snippet = text[int(start):int(end)]
                except Exception:
                    snippet = None
            segments.append(
                {
                    "label": first_present(seg, "label", "prediction", "class"),
                    "ai_assistance_score": first_present(
                        seg, "ai_assistance_score", "ai_likelihood", "score"
                    ),
                    "confidence": first_present(seg, "confidence"),
                    "start_index": start,
                    "end_index": end,
                    "word_count": first_present(seg, "word_count"),
                    "humanizer_score": first_present(seg, "humanizer_score"),
                    "is_humanized": first_present(seg, "is_humanized"),
                    "text": snippet,
                }
            )
    doc["segments"] = segments
    return doc


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write("usage: pangram_check.py <text_file|->\n")
        return 2

    try:
        text = read_input(sys.argv[1])
    except OSError as e:
        sys.stderr.write(f"error: could not read input: {e}\n")
        return 2

    if len(text.split()) < 50:
        sys.stderr.write(
            "warning: input is under 50 words; Pangram is unreliable below this length.\n"
        )

    api_key = os.environ.get("PANGRAM_API_KEY")
    if not api_key:
        sys.stderr.write(
            "error: PANGRAM_API_KEY is not set. Run in heuristic-only mode instead.\n"
        )
        return 3

    url = os.environ.get("PANGRAM_API_URL", DEFAULT_URL)
    version = os.environ.get("PANGRAM_VERSION", DEFAULT_VERSION)

    payload = json.dumps({"text": text, "version": version}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    # Pangram authenticates via the x-api-key header. Some deployments also accept a
    # bearer token; send both so either gateway is satisfied. The key is never printed.
    req.add_header("x-api-key", api_key)
    req.add_header("Authorization", f"Bearer {api_key}")

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            body = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8")[:500]
        except Exception:
            pass
        sys.stderr.write(f"error: Pangram API returned HTTP {e.code}. {detail}\n")
        return 4
    except urllib.error.URLError as e:
        sys.stderr.write(f"error: could not reach Pangram API: {e.reason}\n")
        return 4

    try:
        raw = json.loads(body)
    except json.JSONDecodeError:
        sys.stderr.write("error: Pangram API returned non-JSON body.\n")
        sys.stderr.write(body[:500] + "\n")
        return 4

    out = {
        "endpoint": url,
        "version_requested": version,
        "normalized": normalize(raw, text),
        "raw": raw,
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
