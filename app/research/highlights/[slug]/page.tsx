import { notFound } from "next/navigation";
import Link from "next/link";
import { PortableText } from "@portabletext/react";
import { client } from "@/sanity/lib/client";
import { researchHighlightBySlugQuery, researchHighlightsQuery } from "@/sanity/lib/queries";
import { portableTextComponents } from "@/components/portableTextComponents";
import type { ResearchHighlight } from "@/components/ResearchClient";
import type { Metadata } from "next";

export const revalidate = 60;

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateStaticParams() {
  try {
    const highlights = await client.fetch<ResearchHighlight[]>(
      researchHighlightsQuery,
      {},
      { perspective: "published" }
    );
    return (highlights ?? []).filter((h) => h.slug).map((h) => ({ slug: h.slug as string }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const { slug } = await params;
    const h = await client.fetch<ResearchHighlight | null>(
      researchHighlightBySlugQuery,
      { slug },
      { perspective: "published" }
    );
    if (!h) return {};
    return { title: `${h.title} — Research — AMI Labs`, description: h.summary ?? undefined };
  } catch {
    return {};
  }
}

export default async function ResearchHighlightPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let h: ResearchHighlight | null = null;
  try {
    h = await client.fetch(researchHighlightBySlugQuery, { slug }, { perspective: "published" });
  } catch {
    // Sanity unreachable
  }
  if (!h) notFound();

  const date = formatDate(h.publishedAt);

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ marginBottom: "12px" }}>
            <Link
              href="/research"
              style={{ fontSize: "0.8rem", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              ← Back to Research
            </Link>
          </div>

          <span className="research-highlight-badge">Highlighted research</span>

          <h1 style={{ fontFamily: "var(--font-serif, Georgia, serif)", fontSize: "2rem", lineHeight: 1.2, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            {h.title}
          </h1>

          <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", fontSize: "0.85rem", color: "var(--muted)" }}>
            {h.venue && <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>{h.venue}</span>}
            {date && <span>{date}</span>}
            <a href={h.paperUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent2)", fontWeight: 600, textDecoration: "none" }}>
              View paper ↗
            </a>
          </div>
        </div>
      </div>

      <main>
        <div style={{ maxWidth: "760px" }}>
          {h.contributors && h.contributors.length > 0 && (
            <ul className="research-contributors research-contributors-detail">
              {h.contributors.map((c) => (
                <li key={c.slug || c.name}>
                  {c.slug ? <Link href={`/team/${c.slug}`}>{c.name}</Link> : c.name}
                  {c.contribution ? ` — ${c.contribution}` : ""}
                </li>
              ))}
            </ul>
          )}

          {h.summary && (
            <p style={{ fontSize: "1.125rem", lineHeight: 1.7, color: "var(--text-dim)", marginBottom: "2rem" }}>
              {h.summary}
            </p>
          )}

          {h.whyItMatters && h.whyItMatters.length > 0 && (
            <div className="research-highlight-body">
              <PortableText value={h.whyItMatters} components={portableTextComponents} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
