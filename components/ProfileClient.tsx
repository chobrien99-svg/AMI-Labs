"use client";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { PortableText, type PortableTextBlock } from "@portabletext/react";

const AVATAR_COLORS = [
  ["#6c63ff", "#a78bfa"], ["#3b82f6", "#60a5fa"], ["#10b981", "#34d399"],
  ["#f59e0b", "#fbbf24"], ["#ef4444", "#f87171"], ["#8b5cf6", "#c084fc"],
  ["#ec4899", "#f472b6"], ["#14b8a6", "#2dd4bf"],
];

function avatarStyle(name: string) {
  const i = name.charCodeAt(0) % AVATAR_COLORS.length;
  const [a, b] = AVATAR_COLORS[i];
  return { background: `linear-gradient(135deg,${a},${b})` };
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

type CareerEntry = { org: string; title: string; years: string };
type Links = { linkedin?: string; twitter?: string; scholar?: string; github?: string; website?: string; bilibili?: string };

type Member = {
  slug: string;
  name: string;
  role: string;
  body: string;
  tags: string[];
  biography: string | null;
  biographyPortable: PortableTextBlock[] | null;
  careerHistory: CareerEntry[];
  links: Links;
  semanticScholarId: string | null;
};

export type Publication = {
  title: string;
  year: number | null;
  citationCount: number;
  venue: string | null;
  url: string;
  note?: string;
};

const portableTextComponents = {
  block: {
    h1: ({ children }: { children?: React.ReactNode }) => <h1 className="bio-h1">{children}</h1>,
    h2: ({ children }: { children?: React.ReactNode }) => <h2 className="bio-h2">{children}</h2>,
    h3: ({ children }: { children?: React.ReactNode }) => <h3 className="bio-h3">{children}</h3>,
    normal: ({ children }: { children?: React.ReactNode }) => <p className="bio-p">{children}</p>,
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote style={{ borderLeft: "3px solid var(--accent2)", paddingLeft: "1rem", color: "var(--muted)", fontStyle: "italic", margin: "1rem 0" }}>
        {children}
      </blockquote>
    ),
  },
  marks: {
    strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
    em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
    link: ({ value, children }: { value?: { href: string }; children?: React.ReactNode }) => (
      <a href={value?.href} target="_blank" rel="noopener noreferrer" className="bio-link">{children}</a>
    ),
  },
  list: {
    bullet: ({ children }: { children?: React.ReactNode }) => <ul className="bio-ul">{children}</ul>,
    number: ({ children }: { children?: React.ReactNode }) => <ol className="bio-ol">{children}</ol>,
  },
  listItem: {
    bullet: ({ children }: { children?: React.ReactNode }) => <li className="bio-li">{children}</li>,
    number: ({ children }: { children?: React.ReactNode }) => <li className="bio-li">{children}</li>,
  },
};

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="bio-h1">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="bio-h2">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="bio-h3">{children}</h3>,
  p:  ({ children }: { children?: React.ReactNode }) => <p className="bio-p">{children}</p>,
  a:  ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="bio-link">{children}</a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="bio-ul">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="bio-ol">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="bio-li">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
};

function BiographySection({ member }: { member: Member }) {
  if (member.biographyPortable && member.biographyPortable.length > 0) {
    return (
      <div className="profile-bio">
        <PortableText value={member.biographyPortable} components={portableTextComponents} />
      </div>
    );
  }
  const text = member.biography || member.body;
  if (!text) return null;
  return (
    <div className="profile-bio">
      <ReactMarkdown components={markdownComponents}>{text}</ReactMarkdown>
    </div>
  );
}

export default function ProfileClient({
  member,
  publications,
  featuredPublications = [],
}: {
  member: Member;
  publications: Publication[];
  featuredPublications?: Publication[];
}) {
  return (
    <>
      <div className="profile-header">
        <div className="profile-header-inner">
          <div className="profile-avatar" style={avatarStyle(member.name)}>
            {initials(member.name)}
          </div>
          <div>
            <div className="profile-name">{member.name}</div>
            <div className="profile-role">{member.role}</div>
            <div className="profile-tags">
              {(member.tags || []).map((t) => (
                <span key={t} className="tag tag-country">{t}</span>
              ))}
              <span className="tag tag-team">AMI Labs</span>
            </div>
            <div className="profile-links">
              {member.links?.linkedin && (
                <a href={member.links.linkedin} target="_blank" rel="noopener noreferrer" className="profile-link">LinkedIn</a>
              )}
              {member.links?.twitter && (
                <a href={member.links.twitter} target="_blank" rel="noopener noreferrer" className="profile-link">Twitter/X</a>
              )}
              {member.links?.scholar && (
                <a href={member.links.scholar} target="_blank" rel="noopener noreferrer" className="profile-link">Google Scholar</a>
              )}
              {member.links?.github && (
                <a href={member.links.github} target="_blank" rel="noopener noreferrer" className="profile-link">GitHub</a>
              )}
              {member.links?.website && (
                <a href={member.links.website} target="_blank" rel="noopener noreferrer" className="profile-link">Website</a>
              )}
              {member.links?.bilibili && (
                <a href={member.links.bilibili} target="_blank" rel="noopener noreferrer" className="profile-link">Bilibili</a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="profile-content">
        <Link href="/org-chart" className="back-link">
          ← Back to Org Chart
        </Link>

        {/* BIOGRAPHY */}
        <div className="profile-section">
          <div className="profile-section-title">Biography</div>
          <BiographySection member={member} />
        </div>

        {/* CAREER HISTORY */}
        {member.careerHistory && member.careerHistory.length > 0 && (
          <div className="profile-section">
            <div className="profile-section-title">Career History</div>
            {member.careerHistory.map((entry, i) => (
              <div key={i} className="career-item">
                <div className="career-years">{entry.years}</div>
                <div>
                  <div className="career-org">{entry.org}</div>
                  <div className="career-title-text">{entry.title}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FEATURED PUBLICATIONS (manually curated in Sanity) */}
        {featuredPublications.length > 0 && (
          <div className="profile-section">
            <div className="profile-section-title">Key Papers</div>
            {featuredPublications.map((pub, i) => (
              <div key={i} className="pub-item">
                <div className="pub-title">
                  <a href={pub.url} target="_blank" rel="noopener noreferrer">{pub.title}</a>
                </div>
                {pub.note && <div style={{ fontSize: "0.75rem", color: "var(--accent)", marginTop: "2px", fontWeight: 500 }}>{pub.note}</div>}
                <div className="pub-meta">
                  {pub.year ?? "—"}{pub.venue ? ` · ${pub.venue}` : ""}
                </div>
                {pub.citationCount && pub.citationCount > 0 ? (
                  <div className="pub-citations">{pub.citationCount.toLocaleString()} citations</div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* AUTO-FETCHED PUBLICATIONS (Semantic Scholar) */}
        {publications.length > 0 && (
          <div className="profile-section">
            <div className="profile-section-title">
              {featuredPublications.length > 0
                ? `More Publications (top ${publications.length} by citations)`
                : `Selected Publications (top ${publications.length} by citations)`}
            </div>
            {publications.map((pub, i) => (
              <div key={i} className="pub-item">
                <div className="pub-title">
                  <a href={pub.url} target="_blank" rel="noopener noreferrer">{pub.title}</a>
                </div>
                <div className="pub-meta">
                  {pub.year ?? "—"}{pub.venue ? ` · ${pub.venue}` : ""}
                </div>
                {pub.citationCount > 0 && (
                  <div className="pub-citations">{pub.citationCount.toLocaleString()} citations</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
