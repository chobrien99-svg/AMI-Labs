import Link from "next/link";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  tags: string[];
}

interface NewsColumnsProps {
  items: NewsItem[];
}

function monthYear(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const CAT_CLASS: Record<string, string> = {
  funding: "c-funding",
  research: "c-research",
  hiring: "c-hiring",
  administrative: "c-admin",
};

function CatMeta({ item }: { item: NewsItem }) {
  const tag = item.tags[0];
  return (
    <>
      {item.source}
      {" · "}
      {monthYear(item.publishedAt)}
      {tag && (
        <>
          {" · "}
          <span className={`cat ${CAT_CLASS[tag] ?? "c-neutral"}`}>{tag.toUpperCase()}</span>
        </>
      )}
    </>
  );
}

export default function NewsColumns({ items }: NewsColumnsProps) {
  if (!items.length) return null;
  const lead = items[0];
  const rest = items.slice(1, 6);

  return (
    <section className="home-section" id="news">
      <div className="home-section-header">
        <span className="home-section-label">Latest Signals</span>
        <Link href="/news" className="home-section-link">View all →</Link>
      </div>

      <div className="news-grid">
        <a className="lead" href={lead.url} target="_blank" rel="noopener noreferrer">
          <svg className="wave" viewBox="0 0 460 380" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
            <g fill="none" stroke="var(--clay)" strokeWidth=".9" strokeDasharray="1.4 6.5" className="flow">
              <path d="M-30 360 C130 320 250 250 500 150" opacity=".55" />
              <path d="M-30 380 C130 344 250 278 500 182" opacity=".5" />
              <path d="M-30 400 C140 368 260 306 500 214" opacity=".45" />
              <path d="M0 400 C160 372 280 320 520 236" opacity=".4" />
              <path d="M40 400 C190 378 300 338 540 262" opacity=".34" />
              <path d="M90 400 C230 384 340 352 560 288" opacity=".28" />
              <path d="M150 400 C280 390 380 366 580 314" opacity=".22" />
              <path d="M220 400 C330 394 420 380 600 342" opacity=".16" />
            </g>
          </svg>
          <h3 className="lead-h">{lead.title}</h3>
          <div className="lead-tick" />
          <div className="lead-m"><CatMeta item={lead} /></div>
        </a>

        <div className="sig-list">
          {rest.map((item) => (
            <div className="sig" key={item.id}>
              <a className="sig-t" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
              <div className="sig-m"><CatMeta item={item} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
