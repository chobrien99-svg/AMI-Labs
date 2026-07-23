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

// Ordered filter set; "administrative" surfaces to readers as "Corporate".
const TAB_ORDER = ["funding", "research", "hiring", "administrative"];
const CATEGORY_LABEL: Record<string, string> = {
  funding: "Funding",
  research: "Research",
  hiring: "Hiring",
  administrative: "Corporate",
};
function categoryLabel(tag: string): string {
  return CATEGORY_LABEL[tag] || tag.charAt(0).toUpperCase() + tag.slice(1);
}
function primaryCategory(a: Article): string | null {
  for (const t of TAB_ORDER) if (a.tags.includes(t)) return t;
  return a.tags[0] || null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function monthKey(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

// Tighten machine-length summaries to an editorial ~180 chars, cut on a word boundary.
function trim(summary: string, max = 180): string {
  const s = (summary || "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > 80 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "") + "…";
}

function Kicker({ article }: { article: Article }) {
  const cat = primaryCategory(article);
  return (
    <div className="ed-kicker">
      <span className="src">{article.source}</span>
      <span className="dot">·</span>
      <span>{formatDate(article.publishedAt)}</span>
      {cat && <><span className="dot">·</span><span className="cat">{categoryLabel(cat)}</span></>}
    </div>
  );
}

function articleProps(url: string) {
  return url.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" };
}

export default function NewsPageClient({ articles }: { articles: Article[] }) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return articles
      .filter((a) => {
        const matchQuery = !q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q) || a.source.toLowerCase().includes(q);
        const matchTag = !activeTag || a.tags.includes(activeTag);
        return matchQuery && matchTag;
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, [articles, query, activeTag]);

  const tabs = useMemo(() => {
    const present = new Set(articles.flatMap((a) => a.tags));
    return TAB_ORDER.filter((t) => present.has(t));
  }, [articles]);

  // Lead story only in the default (unfiltered) view, so filtering stays a clean list.
  const isDefaultView = !query.trim() && !activeTag;
  const lead = isDefaultView ? filtered[0] : undefined;
  const rest = lead ? filtered.slice(1) : filtered;

  // Group the remainder by month, preserving the newest-first order.
  const months: { label: string; items: Article[] }[] = [];
  for (const a of rest) {
    const label = monthKey(a.publishedAt);
    const bucket = months[months.length - 1];
    if (bucket && bucket.label === label) bucket.items.push(a);
    else months.push({ label, items: [a] });
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Coverage</h1>
          <p>AMI Labs in the press — funding, research, hiring, and corporate developments, tracked daily.</p>
        </div>
      </div>

      <main>
        <div className="ed-search">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search AMI coverage…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="ed-tabs">
          <button className={`ed-tab${!activeTag ? " active" : ""}`} onClick={() => setActiveTag(null)}>All</button>
          {tabs.map((t) => (
            <button
              key={t}
              className={`ed-tab${activeTag === t ? " active" : ""}`}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              {categoryLabel(t)}
            </button>
          ))}
          <span className="ed-count">{filtered.length} article{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {filtered.length === 0 && <div className="ed-empty">No coverage found.</div>}

        {lead && (
          <article className="ed-lead">
            <Kicker article={lead} />
            <a href={lead.url} {...articleProps(lead.url)} className="ed-lead-title">{lead.title}</a>
            {lead.summary && <p className="ed-lead-sum">{trim(lead.summary, 240)}</p>}
          </article>
        )}

        {months.map((month) => (
          <section key={month.label}>
            <div className="ed-month">{month.label}</div>
            {month.items.map((a) => (
              <article key={a.id} className="ed-row">
                <Kicker article={a} />
                <a href={a.url} {...articleProps(a.url)} className="ed-row-title">{a.title}</a>
                {a.summary && <p className="ed-row-sum">{trim(a.summary)}</p>}
              </article>
            ))}
          </section>
        ))}
      </main>
    </>
  );
}
