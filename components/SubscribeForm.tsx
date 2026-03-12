"use client";

import { useState, useEffect } from "react";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ email }),
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
      margin: "3rem auto 2rem",
      maxWidth: 480,
      padding: "2rem",
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      textAlign: "center",
    }}>
      <p style={{ margin: "0 0 0.25rem", fontWeight: 600, fontSize: "1rem", color: "var(--foreground)" }}>
        Stay updated
      </p>
      <p style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", color: "rgba(255,255,255,0.45)" }}>
        Get a weekly email digest of new news, jobs, and updates from AMI Labs.
      </p>

      {status === "confirmed" ? (
        <p style={{ color: "#4ade80", fontSize: "0.9rem" }}>
          You&apos;re confirmed. You&apos;ll receive the weekly digest every Monday.
        </p>
      ) : status === "success" ? (
        <p style={{ color: "#4ade80", fontSize: "0.9rem" }}>
          Check your inbox for a confirmation email.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
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
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              color: "var(--foreground)",
              fontSize: "0.875rem",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            style={{
              padding: "0.6rem 1.2rem",
              background: "var(--foreground)",
              color: "var(--background)",
              border: "none",
              borderRadius: 8,
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
      )}

      {status === "error" && (
        <p style={{ marginTop: "0.75rem", color: "#f87171", fontSize: "0.8rem" }}>{message}</p>
      )}
    </div>
  );
}
