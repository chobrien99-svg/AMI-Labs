"use client";

import { useState, useEffect } from "react";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [ftjOptIn, setFtjOptIn] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "confirmed" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("subscribed") === "true") {
      setStatus("confirmed");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ftjOptIn }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div style={{
      margin: "1.5rem auto",
      maxWidth: 560,
      padding: "1.5rem 2rem",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.25rem" }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: "1rem", color: "var(--text)" }}>
          Stay updated
        </p>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
          Weekly digest of new news, jobs &amp; updates from AMI Labs.
        </p>
      </div>

      {status === "confirmed" ? (
        <p style={{ margin: "0.75rem 0 0", color: "var(--green)", fontSize: "0.9rem" }}>
          You&apos;re confirmed. You&apos;ll receive the weekly digest every Monday.
        </p>
      ) : status === "success" ? (
        <p style={{ margin: "0.75rem 0 0", color: "var(--green)", fontSize: "0.9rem" }}>
          Check your inbox for a confirmation email.
        </p>
      ) : (
        <>
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginTop: "0.85rem" }}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "loading"}
              style={{
                flex: 1,
                padding: "0.6rem 0.9rem",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={status === "loading"}
              style={{
                padding: "0.6rem 1.2rem",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: status === "loading" ? "not-allowed" : "pointer",
                opacity: status === "loading" ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {status === "loading" ? "…" : "Subscribe"}
            </button>
          </form>

          <label style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.65rem",
            cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={ftjOptIn}
              onChange={(e) => setFtjOptIn(e.target.checked)}
              style={{ accentColor: "var(--accent)", width: 14, height: 14, cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
              Also subscribe to newsletters from{" "}
              <a
                href="https://frenchtechjournal.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent2)", textDecoration: "underline" }}
              >
                The French Tech Journal
              </a>
            </span>
          </label>
        </>
      )}

      {status === "error" && (
        <p style={{ marginTop: "0.75rem", color: "#f87171", fontSize: "0.8rem" }}>{message}</p>
      )}
    </div>
  );
}
