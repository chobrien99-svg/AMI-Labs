import Link from "next/link";
import { type PortableTextBlock } from "@portabletext/react";

export interface ResearchAuthor {
  slug: string;
  name: string;
}

export interface ResearchPaper {
  paperId: string;
  title: string;
  teamAuthors?: ResearchAuthor[];
  authors?: { slug: string | null; name: string }[];
  memberSlug?: string;
  memberName?: string;
  publicationDate?: string | null;
  year?: number | null;
  venue?: string | null;
  url: string;
  citationCount?: number;
  tldr?: string | null;
  abstract?: string | null;
}

export interface HighlightContributor {
  slug: string | null;
  name: string;
  contribution?: string | null;
}

export interface ResearchHighlight {
  _id: string;
  title: string;
  slug?: string;
  paperUrl: string;
  matchId?: string;
  venue?: string | null;
  publishedAt?: string | null;
  summary?: string | null;
  pinned?: boolean;
  contributors?: HighlightContributor[];
  whyItMatters?: PortableTextBlock[];
}

interface ResearchClientProps {
  papers: ResearchPaper[];
  highlights?: ResearchHighlight[];
  notesByUrl: Record<string, string>;
}

// Canonical key so a synthesis "why it matters" note attaches to its paper whether the
// model cited the DOI form or the Semantic Scholar form of the same URL.
export function normalizeUrl(u?: string | null): string {
  if (!u) return "";
  const s = u.trim().toLowerCase().replace(/\/+$/, "");
  const doi = s.match(/doi\.org\/(.+)$/);
  if (doi) return `doi:${doi[1]}`;
  const s2 = s.match(/semanticscholar\.org\/paper\/([a-z0-9]+)/);
  if (s2) return `s2:${s2[1]}`;
  return s;
}

function formatIsoDate(iso?: string | null, year?: number | null): string {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return year ? String(year) : "";
}

// Every AMI author on a paper: the curated teamAuthors plus any full-author-list entry
// that resolved to a roster slug (so co-authors the paper wasn't fetched under still show).
function amiAuthors(p: ResearchPaper): ResearchAuthor[] {
  const seen = new Set<string>();
  const out: ResearchAuthor[] = [];
  for (const a of [...(p.teamAuthors ?? []), ...(p.authors ?? [])]) {
    if (a && a.slug && !seen.has(a.slug)) {
      seen.add(a.slug);
      out.push({ slug: a.slug, name: a.name });
    }
  }
  return out;
}

function Authors({ authors, fallback }: { authors?: ResearchAuthor[]; fallback?: string }) {
  const list = authors && authors.length ? authors : fallback ? [{ slug: "", name: fallback }] : [];
  if (!list.length) return null;
  return (
    <>
      {list.map((a, i) => (
        <span key={a.slug || a.name}>
          {i > 0 && ", "}
          {a.slug ? (
            <Link href={`/team/${a.slug}`} className="research-author-link">
              {a.name}
            </Link>
          ) : (
            a.name
          )}
        </span>
      ))}
    </>
  );
}

// Compact card for the highlights grid. The whole card links to the highlight's
// dedicated page (so contributor names stay plain text — no nested anchors).
function HighlightCard({ h }: { h: ResearchHighlight }) {
  const date = formatIsoDate(h.publishedAt);
  const names = (h.contributors ?? []).map((c) => c.name).join(", ");
  const meta = [names, h.venue || "", date].filter(Boolean).join(" · ");
  const inner = (
    <>
      <span className="research-highlight-badge">Highlighted</span>
      <h3 className="research-card-title">{h.title}</h3>
      {meta && <div className="research-card-meta">{meta}</div>}
      {h.summary && <p className="research-card-summary">{h.summary}</p>}
      <span className="research-card-cta">Read the highlight →</span>
    </>
  );
  return h.slug ? (
    <Link href={`/research/highlights/${h.slug}`} className="research-card">
      {inner}
    </Link>
  ) : (
    <a href={h.paperUrl} target="_blank" rel="noopener noreferrer" className="research-card">
      {inner}
    </a>
  );
}

export default function ResearchClient({ papers, highlights = [], notesByUrl }: ResearchClientProps) {
  if (!papers.length && !highlights.length) {
    return (
      <main>
        <p className="briefing-empty">
          No recent publications tracked yet — the feed refreshes weekly from Semantic Scholar as
          the team publishes.
        </p>
      </main>
    );
  }

  return (
    <main>
      {highlights.length > 0 && (
        <div className="research-highlights">
          <p className="research-section-label">Highlighted research</p>
          <div className="research-highlights-grid">
            {highlights.map((h) => (
              <HighlightCard key={h._id} h={h} />
            ))}
          </div>
        </div>
      )}

      <div className="research-list">
        {papers.map((p) => {
          const note = notesByUrl[normalizeUrl(p.url)];
          const date = formatIsoDate(p.publicationDate, p.year);
          const authors = amiAuthors(p);
          return (
            <article key={p.paperId} className="pub-item research-paper">
              <div className="pub-title">
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.title}
                </a>
              </div>
              <div className="pub-meta">
                <Authors authors={authors} fallback={p.memberName} />
                {p.venue ? ` · ${p.venue}` : ""}
                {date ? ` · ${date}` : ""}
              </div>
              {p.tldr && <p className="research-tldr">{p.tldr}</p>}
              {p.citationCount && p.citationCount > 0 ? (
                <div className="pub-citations">{p.citationCount.toLocaleString()} citations</div>
              ) : null}
              {note && (
                <div className="research-note">
                  <span className="news-row-tag tag-research research-note-tag">Why it matters</span>
                  <p className="research-note-body">{note}</p>
                  <span className="research-note-attr">From the Observatory Briefing</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
