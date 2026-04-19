"use client";
import { useState, useEffect, useCallback } from "react";

type PendingArticle = {
  _id: string;
  title: string;
  source?: string;
  externalUrl?: string;
  publishedAt: string;
  summary?: string;
  tags?: string[];
  score?: number;
};

const TAG_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  funding:        { bg: "#1a2a1a", color: "var(--green)",  border: "#2a4a2a" },
  research:       { bg: "#1a1a2a", color: "var(--blue)",   border: "#2a2a4a" },
  hiring:         { bg: "#2a1a2a", color: "var(--pink)",   border: "#4a2a4a" },
  administrative: { bg: "#2a1a1a", color: "var(--orange)", border: "#4a2a1a" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return null;
  const color = score >= 70 ? "var(--green)" : score >= 30 ? "var(--orange)" : "var(--pink)";
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 12,
      fontSize: 13, fontWeight: 600, color, border: `1px solid ${color}`,
      background: "var(--surface)",
    }}>
      {score}/100
    </span>
  );
}

export default function ReviewPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [articles, setArticles] = useState<PendingArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("admin_secret");
    if (stored) {
      setSecret(stored);
      setAuthenticated(true);
    }
  }, []);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/review?" + new URLSearchParams({ secret }));
      if (!res.ok) throw new Error(res.status === 401 ? "Invalid admin secret" : "Failed to fetch");
      const data = await res.json();
      setArticles(data.articles || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    if (authenticated) fetchPending();
  }, [authenticated, fetchPending]);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("admin_secret", secret);
    setAuthenticated(true);
  };

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    setActing(id);
    try {
      const res = await fetch("/api/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setArticles((prev) => prev.filter((a) => a._id !== id));
    } catch {
      setError("Failed to update article — check your admin secret.");
    } finally {
      setActing(null);
    }
  };

  if (!authenticated) {
    return (
      <div style={{ maxWidth: 400, margin: "120px auto", padding: 40 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, marginBottom: 8 }}>
          News Review
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: 24, fontSize: 14 }}>
          Enter the admin secret to access the review queue.
        </p>
        <form onSubmit={handleAuth}>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin secret"
            style={{
              width: "100%", padding: "10px 14px", fontSize: 14,
              border: "1px solid var(--border)", borderRadius: 6,
              background: "var(--surface)", color: "var(--text)",
              marginBottom: 12,
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%", padding: "10px 14px", fontSize: 14,
              background: "var(--accent)", color: "white", border: "none",
              borderRadius: 6, cursor: "pointer", fontWeight: 600,
            }}
          >
            Sign In
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, marginBottom: 4 }}>
            Review Queue
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            {articles.length} article{articles.length !== 1 ? "s" : ""} pending review
          </p>
        </div>
        <button
          onClick={fetchPending}
          disabled={loading}
          style={{
            padding: "8px 16px", fontSize: 13, fontWeight: 600,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 6, cursor: "pointer", color: "var(--text)",
          }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{
          padding: "12px 16px", marginBottom: 20, borderRadius: 6,
          background: "#fff0f0", border: "1px solid #f5c6c6", color: "#a33",
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {articles.length === 0 && !loading && (
        <div style={{
          textAlign: "center", padding: 60, color: "var(--muted)",
          background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)",
        }}>
          <p style={{ fontSize: 16, marginBottom: 4 }}>All clear</p>
          <p style={{ fontSize: 13 }}>No articles pending review.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {articles.map((article) => (
          <div
            key={article._id}
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, padding: 20,
              opacity: acting === article._id ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <ScoreBadge score={article.score} />
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{article.source}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>·</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{formatDate(article.publishedAt)}</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                  {article.externalUrl ? (
                    <a href={article.externalUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--text)", textDecoration: "underline", textDecorationColor: "var(--border)" }}>
                      {article.title}
                    </a>
                  ) : article.title}
                </h3>
                {article.summary && (
                  <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 8 }}>
                    {article.summary}
                  </p>
                )}
                {article.tags && article.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {article.tags.map((tag) => {
                      const s = TAG_STYLES[tag] || { bg: "var(--surface2)", color: "var(--muted)", border: "var(--border)" };
                      return (
                        <span key={tag} style={{
                          padding: "2px 8px", fontSize: 11, borderRadius: 4,
                          background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                        }}>
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => handleAction(article._id, "approved")}
                  disabled={acting === article._id}
                  style={{
                    padding: "8px 16px", fontSize: 13, fontWeight: 600,
                    background: "var(--green)", color: "white", border: "none",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(article._id, "rejected")}
                  disabled={acting === article._id}
                  style={{
                    padding: "8px 16px", fontSize: 13, fontWeight: 600,
                    background: "var(--surface2)", color: "var(--muted)",
                    border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer",
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
