"use client";
import Link from "next/link";

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
  biography: string;
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
};

export default function ProfileClient({ member, publications }: { member: Member; publications: Publication[] }) {
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
        <Link href="/" className="back-link">
          ← Back to Explorer
        </Link>

        {/* BIOGRAPHY */}
        <div className="profile-section">
          <div className="profile-section-title">Biography</div>
          <p className="profile-bio">{member.biography || member.body}</p>
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

        {/* PUBLICATIONS */}
        {publications.length > 0 && (
          <div className="profile-section">
            <div className="profile-section-title">
              Selected Publications (top {publications.length} by citations)
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
