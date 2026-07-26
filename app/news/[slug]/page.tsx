import { notFound } from "next/navigation";
import Link from "next/link";
import { PortableText, type PortableTextBlock } from "@portabletext/react";
import imageUrlBuilder from "@sanity/image-url";
import { client } from "@/sanity/lib/client";
import { articleBySlugQuery, allArticlesQuery } from "@/sanity/lib/queries";
import { portableTextComponents } from "@/components/portableTextComponents";
import type { Metadata } from "next";

export const revalidate = 60;

const builder = imageUrlBuilder(client);
function urlFor(source: unknown) {
  return builder.image(source as Parameters<typeof builder.image>[0]);
}

type Article = {
  _id: string;
  title: string;
  slug: { current: string };
  source?: string;
  externalUrl?: string;
  publishedAt: string;
  summary?: string;
  tags?: string[];
  coverImage?: { asset: Record<string, unknown>; alt?: string | null };
  body?: PortableTextBlock[];
};

const TAG_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  funding:        { bg: "#1a2a1a", color: "var(--green)",  border: "#2a4a2a" },
  research:       { bg: "#1a1a2a", color: "var(--blue)",   border: "#2a2a4a" },
  hiring:         { bg: "#2a1a2a", color: "var(--pink)",   border: "#4a2a4a" },
  administrative: { bg: "#2a1a1a", color: "var(--orange)", border: "#4a2a1a" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateStaticParams() {
  try {
    const articles: Article[] = await client.fetch(allArticlesQuery, {}, { perspective: "published" });
    return (articles ?? []).map((a) => ({ slug: a.slug.current }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const { slug } = await params;
    const article: Article | null = await client.fetch(articleBySlugQuery, { slug }, { perspective: "published" });
    if (!article) return {};
    return {
      title: `${article.title} — AMI Labs`,
      description: article.summary,
    };
  } catch {
    return {};
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let article: Article | null = null;

  try {
    article = await client.fetch(articleBySlugQuery, { slug }, { perspective: "published" });
  } catch {
    // Sanity not reachable
  }

  if (!article) notFound();

  const hasBody = article.body && article.body.length > 0;

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ marginBottom: "12px" }}>
            <Link
              href="/news"
              style={{
                fontSize: "0.8rem",
                color: "var(--muted)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "color 0.15s",
              }}
            >
              ← Back to News
            </Link>
          </div>

          {article.tags && article.tags.length > 0 && (
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
              {article.tags.map((tag) => {
                const s = TAG_STYLES[tag] || { bg: "var(--surface2)", color: "var(--muted)", border: "var(--border)" };
                return (
                  <span
                    key={tag}
                    className="tag"
                    style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                  >
                    {tag}
                  </span>
                );
              })}
            </div>
          )}

          <h1 style={{ fontFamily: "var(--font-serif, Georgia, serif)", fontSize: "2rem", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: "12px" }}>
            {article.title}
          </h1>

          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", fontSize: "0.85rem", color: "var(--muted)" }}>
            {article.source && <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>{article.source}</span>}
            <span>{formatDate(article.publishedAt)}</span>
          </div>
        </div>
      </div>

      <main>
        <div style={{ maxWidth: "720px" }}>
          {article.coverImage?.asset && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={urlFor(article.coverImage).width(900).url()}
              alt={article.coverImage.alt ?? article.title ?? ""}
              style={{ width: "100%", borderRadius: "10px", marginBottom: "2rem", display: "block" }}
            />
          )}

          {article.summary && !hasBody && (
            <p style={{ fontSize: "1.125rem", lineHeight: 1.7, color: "var(--text-dim)", marginBottom: "2rem" }}>
              {article.summary}
            </p>
          )}

          {hasBody ? (
            <div style={{ fontSize: "1rem" }}>
              <PortableText value={article.body!} components={portableTextComponents} />
            </div>
          ) : (
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "28px 32px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}>
              <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                This article was originally published externally.
              </p>
              {article.externalUrl && (
                <a
                  href={article.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "var(--accent)",
                    color: "#fff",
                    padding: "10px 20px",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    alignSelf: "flex-start",
                  }}
                >
                  Read on {article.source || "original site"} →
                </a>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
