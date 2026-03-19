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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TAG_COLORS: Record<string, string> = {
  funding: "tag-funding",
  research: "tag-research",
  hiring: "tag-hiring",
  administrative: "tag-admin",
};

export default function NewsColumns({ items }: NewsColumnsProps) {
  const recent = items.slice(0, 6);
  const col1 = recent.slice(0, 3);
  const col2 = recent.slice(3, 6);

  return (
    <section className="home-section">
      <div className="home-section-header">
        <span className="home-section-label">Latest News</span>
        <Link href="/news" className="home-section-link">
          View all →
        </Link>
      </div>

      <div className="news-columns">
        <div className="news-col">
          {col1.map((item) => (
            <NewsRow key={item.id} item={item} />
          ))}
        </div>
        <div className="news-col">
          {col2.map((item) => (
            <NewsRow key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const primaryTag = item.tags[0];
  return (
    <div className="news-row">
      <div className="news-row-dot" />
      <div className="news-row-content">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="news-row-title"
        >
          {item.title}
        </a>
        <div className="news-row-meta">
          <span className="news-row-source">{item.source}</span>
          <span className="news-row-sep">·</span>
          <span className="news-row-date">{formatDate(item.publishedAt)}</span>
          {primaryTag && (
            <>
              <span className="news-row-sep">·</span>
              <span className={`news-row-tag ${TAG_COLORS[primaryTag] ?? ""}`}>
                {primaryTag}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
