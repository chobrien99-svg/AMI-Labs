import Link from "next/link";

export interface ResearchAuthor {
  slug: string;
  name: string;
}

export interface ResearchPaper {
  paperId: string;
  title: string;
  teamAuthors?: ResearchAuthor[];
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

interface ResearchClientProps {
  papers: ResearchPaper[];
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

function formatPaperDate(p: ResearchPaper): string {
  if (p.publicationDate) {
    const d = new Date(p.publicationDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return p.year ? String(p.year) : "";
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

export default function ResearchClient({ papers, notesByUrl }: ResearchClientProps) {
  if (!papers.length) {
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
      <div className="research-list">
        {papers.map((p) => {
          const note = notesByUrl[normalizeUrl(p.url)];
          const date = formatPaperDate(p);
          return (
            <article key={p.paperId} className="pub-item research-paper">
              <div className="pub-title">
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.title}
                </a>
              </div>
              <div className="pub-meta">
                <Authors authors={p.teamAuthors} fallback={p.memberName} />
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
