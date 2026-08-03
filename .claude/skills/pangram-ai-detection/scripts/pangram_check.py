#!/usr/bin/env python3
"""
pangram_check.py — call the real Pangram text-detection API and print a normalized result.

This is the AUTHORITATIVE verdict. The stylometric linter only explains; this is ground truth.

The Pangram REST API is asynchronous and task-based:
    1. POST <base>/task            -> returns a task_id
    2. GET  <base>/task/<task_id>  -> poll until the result is ready
Both requests authenticate with the `x-api-key` header. (The official `pangram` Python
client wraps this same polling loop in a single `predict()` call.)

Usage:
    python3 pangram_check.py <text_file>
    echo "some text" | python3 pangram_check.py -

Environment:
    PANGRAM_API_KEY          (required)  Your Pangram API key. Never printed.
    PANGRAM_API_URL          (optional)  Task base URL. Default:
                                         https://text.external-api.pangram.com/task
    PANGRAM_PUBLIC_DASHBOARD (optional)  "1" to request a shareable public dashboard link
                                         (default off, for privacy).
    PANGRAM_POLL_TIMEOUT     (optional)  Max seconds to poll for a result (default 120).

Output:
    JSON on stdout with two top-level keys:
      "normalized" — a stable, documented view (verdict, fractions, segments)
      "raw"        — the exact final API response, so field drift is always debuggable.

Exit codes:
    0 success · 2 usage/input error · 3 missing key · 4 API/network error · 5 poll timeout
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE = "https://text.external-api.pangram.com/task"
POLL_INTERVAL_S = 2.0


def read_input(arg: str) -> str:
    if arg == "-":
        return sys.stdin.read()
    with open(arg, "r", encoding="utf-8") as fh:
        return fh.read()


def first_present(d: dict, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and k in d and d[k] is not None:
            return d[k]
    return default


def http_json(url, api_key, method="GET", payload=None):
    """Return (status_code, parsed_json_or_none, raw_body). Raises on transport failure."""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("x-api-key", api_key)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8")
            code = r.getcode()
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")
        except Exception:
            pass
        code = e.code
    try:
        parsed = json.loads(body) if body else None
    except json.JSONDecodeError:
        parsed = None
    return code, parsed, body


def is_pending(code, parsed):
    """True while the task is still processing."""
    if code in (202, 204):
        return True
    if isinstance(parsed, dict):
        status = str(first_present(parsed, "status", "state", default="")).lower()
        if status in ("pending", "processing", "queued", "running", "in_progress", "started"):
            return True
        # Not done until a prediction field appears.
        done = any(k in parsed for k in ("prediction_short", "fraction_ai", "prediction"))
        if not done and status == "":
            # Ambiguous response with no result fields yet — treat as pending.
            return "task_id" in parsed or "id" in parsed
    return False


def normalize(resp: dict, text: str) -> dict:
    if not isinstance(resp, dict):
        return {"note": "API response was not a JSON object; see raw.", "segments": []}
    doc = {
        "prediction_short": first_present(resp, "prediction_short", "prediction_label", "label"),
        "prediction": first_present(resp, "prediction", "headline"),
        "fraction_human": first_present(resp, "fraction_human"),
        "fraction_ai_assisted": first_present(resp, "fraction_ai_assisted"),
        "fraction_ai": first_present(resp, "fraction_ai"),
        "ai_assistance_score": first_present(resp, "ai_assistance_score", "avg_ai_likelihood", "score"),
        "num_human_segments": first_present(resp, "num_human_segments"),
        "num_ai_assisted_segments": first_present(resp, "num_ai_assisted_segments"),
        "num_ai_segments": first_present(resp, "num_ai_segments"),
    }
    raw_segments = first_present(resp, "segments", "windows", "results", "predictions", default=[])
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
            segments.append({
                "label": first_present(seg, "label", "prediction", "class"),
                "ai_assistance_score": first_present(seg, "ai_assistance_score", "ai_likelihood", "score"),
                "confidence": first_present(seg, "confidence"),
                "start_index": start,
                "end_index": end,
                "word_count": first_present(seg, "word_count"),
                "humanizer_score": first_present(seg, "humanizer_score"),
                "is_humanized": first_present(seg, "is_humanized"),
                "text": snippet,
            })
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
        sys.stderr.write("warning: input is under 50 words; Pangram is unreliable below this length.\n")

    api_key = os.environ.get("PANGRAM_API_KEY")
    if not api_key:
        sys.stderr.write("error: PANGRAM_API_KEY is not set. Run in heuristic-only mode instead.\n")
        return 3

    base = os.environ.get("PANGRAM_API_URL", DEFAULT_BASE).rstrip("/")
    public_dash = os.environ.get("PANGRAM_PUBLIC_DASHBOARD", "0") == "1"
    poll_timeout = float(os.environ.get("PANGRAM_POLL_TIMEOUT", "120"))

    payload = {"text": text, "public_dashboard_link": public_dash}
    if os.environ.get("PANGRAM_VERSION"):
        payload["version"] = os.environ["PANGRAM_VERSION"]

    # --- 1. create the task ---
    try:
        code, parsed, body = http_json(base, api_key, method="POST", payload=payload)
    except urllib.error.URLError as e:
        sys.stderr.write(f"error: could not reach Pangram API: {e.reason}\n")
        return 4
    if code >= 400 or not isinstance(parsed, dict):
        sys.stderr.write(f"error: task creation failed (HTTP {code}). {body[:400]}\n")
        return 4

    # Some deployments may return the full result immediately; handle that.
    result = None
    if not is_pending(code, parsed) and first_present(parsed, "prediction_short", "fraction_ai"):
        result = parsed
    else:
        task_id = first_present(parsed, "task_id", "id", "taskId")
        if not task_id:
            sys.stderr.write(f"error: no task_id in response. {body[:400]}\n")
            return 4

        # --- 2. poll for the result ---
        poll_url = f"{base}/{task_id}"
        deadline = time.time() + poll_timeout
        while time.time() < deadline:
            try:
                code, parsed, body = http_json(poll_url, api_key, method="GET")
            except urllib.error.URLError as e:
                sys.stderr.write(f"error: poll request failed: {e.reason}\n")
                return 4
            if code >= 400:
                sys.stderr.write(f"error: poll failed (HTTP {code}). {body[:400]}\n")
                return 4
            if not is_pending(code, parsed):
                result = parsed
                break
            time.sleep(POLL_INTERVAL_S)
        if result is None:
            sys.stderr.write(f"error: timed out after {poll_timeout:.0f}s waiting for result.\n")
            return 5

    out = {
        "endpoint": base,
        "normalized": normalize(result, text),
        "raw": result,
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
