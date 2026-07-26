// Shared PortableText renderers for Sanity rich-text `body` fields.
// Used by the article page (app/news/[slug]) and research highlights
// (components/ResearchClient) so image / video / PDF embeds render identically.
import imageUrlBuilder from "@sanity/image-url";
import { client } from "@/sanity/lib/client";

const builder = imageUrlBuilder(client);
function urlFor(source: unknown) {
  return builder.image(source as Parameters<typeof builder.image>[0]);
}

export const portableTextComponents = {
  types: {
    image: ({ value }: { value: { asset: unknown; alt?: string; caption?: string } }) => (
      <figure style={{ margin: "2rem 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urlFor(value).width(900).url()}
          alt={value.alt ?? ""}
          style={{ width: "100%", borderRadius: "8px", display: "block" }}
        />
        {value.caption && (
          <figcaption style={{ marginTop: "8px", fontSize: "0.8rem", color: "var(--muted)", textAlign: "center" }}>
            {value.caption}
          </figcaption>
        )}
      </figure>
    ),
    videoEmbed: ({ value }: { value: { url: string; caption?: string } }) => {
      let src = value.url;
      const yt = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
      if (yt) src = `https://www.youtube.com/embed/${yt[1]}`;
      const vimeo = !yt && src.match(/vimeo\.com\/(\d+)/);
      if (vimeo) src = `https://player.vimeo.com/video/${vimeo[1]}`;
      return (
        <figure style={{ margin: "2rem 0" }}>
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "8px" }}>
            <iframe
              src={src}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={value.caption ?? "Video"}
            />
          </div>
          {value.caption && (
            <figcaption style={{ marginTop: "8px", fontSize: "0.8rem", color: "var(--muted)", textAlign: "center" }}>
              {value.caption}
            </figcaption>
          )}
        </figure>
      );
    },
    pdfEmbed: ({ value }: { value: { url: string; caption?: string } }) => (
      <figure style={{ margin: "2rem 0" }}>
        <div style={{
          position: "relative",
          paddingBottom: "75%",
          height: 0,
          overflow: "hidden",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}>
          <iframe
            src={value.url}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
            title={value.caption ?? "PDF Document"}
          />
        </div>
        {value.caption && (
          <figcaption style={{ marginTop: "8px", fontSize: "0.8rem", color: "var(--muted)", textAlign: "center" }}>
            {value.caption}
          </figcaption>
        )}
        <div style={{ marginTop: "8px", textAlign: "center" }}>
          <a
            href={value.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              fontSize: "0.82rem", color: "var(--accent)", fontWeight: 600,
              textDecoration: "none", padding: "6px 14px",
              border: "1px solid var(--border)", borderRadius: "6px",
              background: "var(--surface)", transition: "all 0.15s",
            }}
          >
            ↓ Open PDF in new tab
          </a>
        </div>
      </figure>
    ),
  },
  block: {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "2rem 0 0.75rem", letterSpacing: "-0.02em" }}>{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 style={{ fontSize: "1.375rem", fontWeight: 700, margin: "1.75rem 0 0.6rem", letterSpacing: "-0.015em" }}>{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "1.5rem 0 0.5rem" }}>{children}</h3>
    ),
    normal: ({ children }: { children?: React.ReactNode }) => (
      <p style={{ lineHeight: 1.75, marginBottom: "1.25rem", color: "var(--text-dim)" }}>{children}</p>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote style={{
        borderLeft: "3px solid var(--accent2)",
        paddingLeft: "1.25rem",
        margin: "1.5rem 0",
        color: "var(--muted)",
        fontStyle: "italic",
      }}>
        {children}
      </blockquote>
    ),
  },
  marks: {
    strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
    link: ({ value, children }: { value?: { href: string }; children?: React.ReactNode }) => (
      <a
        href={value?.href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "3px" }}
      >
        {children}
      </a>
    ),
  },
  list: {
    bullet: ({ children }: { children?: React.ReactNode }) => (
      <ul style={{ paddingLeft: "1.5rem", marginBottom: "1.25rem", lineHeight: 1.75, color: "var(--text-dim)" }}>{children}</ul>
    ),
    number: ({ children }: { children?: React.ReactNode }) => (
      <ol style={{ paddingLeft: "1.5rem", marginBottom: "1.25rem", lineHeight: 1.75, color: "var(--text-dim)" }}>{children}</ol>
    ),
  },
  listItem: {
    bullet: ({ children }: { children?: React.ReactNode }) => <li style={{ marginBottom: "0.4rem" }}>{children}</li>,
    number: ({ children }: { children?: React.ReactNode }) => <li style={{ marginBottom: "0.4rem" }}>{children}</li>,
  },
};
