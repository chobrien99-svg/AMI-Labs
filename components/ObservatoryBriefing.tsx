import Link from "next/link";
import { stripBriefingScaffolding } from "@/scripts/lib/strip-scaffolding";

export interface BriefingEvidence {
  label: string;
  url: string;
}

export interface BriefingThread {
  title: string;
  category: string;
  narrative: string;
  evidence: BriefingEvidence[];
}

export interface BriefingSignal {
  text: string;
  category?: string;
  url?: string;
  linkLabel?: string;
}

export interface Briefing {
  generatedAt?: string;
  publishedAt?: string;
  window?: { days: number; since: string; until: string };
  model?: string;
  status?: "ok" | "empty" | "stale" | "error";
  headline?: string;
  stateOfPlay?: string;
  threads?: BriefingThread[];
  signals?: BriefingSignal[];
  whatToWatch?: string;
  whatToWatchLinks?: { url: string; linkLabel: string }[];
}

interface ObservatoryBriefingProps {
  briefing: Briefing;
  variant?: "preview" | "full";
}

const CATEGORY_TAG: Record<string, string> = {
  funding: "tag-funding",
  research: "tag-research",
  hiring: "tag-hiring",
  administrative: "tag-admin",
  corporate: "tag-admin",
};

const STALE_AFTER_DAYS = 10;

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isStale(briefing: Briefing): boolean {
  if (briefing.status === "stale") return true;
  const stamp = briefing.publishedAt || briefing.generatedAt;
  if (!stamp) return false;
  const t = new Date(stamp).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

function Thread({ thread }: { thread: BriefingThread }) {
  return (
    <div className="card briefing-thread">
      <div className="briefing-thread-head">
        <h3 className="briefing-thread-title">{thread.title}</h3>
        <span className={`news-row-tag ${CATEGORY_TAG[thread.category] ?? "tag-admin"}`}>
          {thread.category}
        </span>
      </div>
      {stripBriefingScaffolding(thread.narrative)
        .split(/\n{2,}/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map((para, i) => (
          <p key={i} className="briefing-narrative">
            {para}
          </p>
        ))}
      {thread.evidence.length > 0 && (
        <ul className="briefing-evidence">
          {thread.evidence.map((e) => (
            <li key={e.url + e.label}>
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                {e.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ObservatoryBriefing({ briefing, variant = "preview" }: ObservatoryBriefingProps) {
  const status = briefing?.status ?? "empty";
  const allThreads = briefing?.threads ?? [];
  const empty = status === "empty" || status === "error" || allThreads.length === 0;
  const threads = variant === "preview" ? allThreads.slice(0, 2) : allThreads;
  const stamp = briefing?.publishedAt || briefing?.generatedAt;

  return (
    <section className="home-section briefing-section">
      <div className="home-section-header">
        <span className="home-section-label">Observatory Briefing</span>
        {variant === "preview" ? (
          <Link href="/briefing" className="home-section-link">
            Read the full analysis →
          </Link>
        ) : (
          stamp && <span className="briefing-stale-note">Updated {formatDate(stamp)}</span>
        )}
      </div>

      {empty ? (
        <p className="briefing-empty">
          The Observatory is quiet this week — no significant new signals across news, hiring,
          research, or filings.
        </p>
      ) : (
        <>
          {briefing.headline && <h2 className="briefing-headline">{briefing.headline}</h2>}
          {briefing.stateOfPlay && <p className="briefing-stateofplay">{briefing.stateOfPlay}</p>}

          <div className="briefing-threads">
            {threads.map((t) => (
              <Thread key={t.title} thread={t} />
            ))}
          </div>

          {variant === "full" && briefing.signals && briefing.signals.length > 0 && (
            <div className="briefing-signals-block">
              <span className="home-section-label">Signals</span>
              <ul className="briefing-signals">
                {briefing.signals.map((s, i) => (
                  <li key={i}>
                    {s.text}
                    {s.url && (
                      <>
                        {" "}
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="briefing-signal-link"
                        >
                          {s.linkLabel || "link"}
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {variant === "full" && briefing.whatToWatch && (
            <div className="briefing-watch">
              <span className="briefing-watch-label">What to watch</span>
              <p>{briefing.whatToWatch}</p>
              {briefing.whatToWatchLinks && briefing.whatToWatchLinks.length > 0 && (
                <p className="briefing-watch-links">
                  {briefing.whatToWatchLinks.map((l, i) => (
                    <span key={l.url}>
                      {i > 0 && <span className="briefing-watch-sep"> · </span>}
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="briefing-signal-link">
                        {l.linkLabel}
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}

          {variant === "preview" && isStale(briefing) && stamp && (
            <p className="briefing-stale-note">Last refreshed {formatDate(stamp)}</p>
          )}
        </>
      )}
    </section>
  );
}
