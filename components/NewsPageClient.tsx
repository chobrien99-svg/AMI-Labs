"use client";
import { useState, useMemo } from "react";

type Article = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  tags: string[];
  addedAt: string;
};

const TAG_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  funding:    { bg: "#1a2a1a", color: "var(--green)",  border: "#2a4a2a" },
  research:   { bg: "#1a1a2a", color: "var(--blue)",   border: "#2a2a4a" },
  hiring:     { bg: "#2a1a2a", color: "var(--pink)",   border: "#4a2a4a" },
  regulatory: { bg: "#2a1a1a", color: "var(--orange)", border: "#4a2a1a" },
};

function TagBadge({ tag }: { tag: string }) {
  const s = TAG_STYLES[tag] || { bg: "var(--surface2)", color: "var(--muted)", border: "var(--border)" };
  return (
    <span
      className="tag"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {tag}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const ALL_TAGS = ["funding", "research", "hiring", "regulatory"];

export default function NewsPageClient({ articles }: { articles: Article[] }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return articles
      .filter((a) => {
        const matchQuery = !q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.source.toLowerCase().includes(q);
        const matchTag = !activeTag || a.tags.includes(activeTag);
        return matchQuery && matchTag;
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, [articles, query, activeTag]);

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>AMI Labs News Tracker</h1>
          <p>Funding announcements, research publications, and company updates — updated daily.</p>
        </div>
      </div>

      <main>
        <div className="controls" style={{ marginBottom: "24px" }}>
          <div className="search-wrap">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Search news…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className={`filter-btn${!activeTag ? " active" : ""}`}
            onClick={() => setActiveTag(null)}
          >All</button>
          {ALL_TAGS.map((t) => (
            <button
              key={t}
              className={`filter-btn${activeTag === t ? " active" : ""}`}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          <span className="result-count">{filtered.length} article{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
            No articles found.
          </div>
        )}

        {filtered.map((article) => (
          <div key={article.id} className="news-item">
            <div className="news-meta">
              <span className="news-source-badge">{article.source}</span>
              <span className="news-date">{formatDate(article.publishedAt)}</span>
            </div>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="news-title">
              {article.title}
            </a>
            <div className="news-summary">{article.summary}</div>
            {article.tags.length > 0 && (
              <div className="news-tags">
                {article.tags.map((t) => <TagBadge key={t} tag={t} />)}
              </div>
            )}
          </div>
        ))}
      </main>
    </>
  );
}
