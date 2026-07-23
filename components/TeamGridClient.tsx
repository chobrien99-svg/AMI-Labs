"use client";
import Link from "next/link";

type TeamMember = {
  slug: string;
  name: string;
  role: string;
  body: string;
  tags: string[];
  department?: string;
  links: Record<string, string | undefined>;
};

// Location lives inside the tags array (e.g. ["Paris/New York", "Co-Founder"]).
const LOCATION_RE = /paris|new york|montreal|singapore|london|zurich|bay area|san francisco|montréal/i;
function locationOf(m: TeamMember): string {
  return (m.tags || []).find((t) => LOCATION_RE.test(t)) || "";
}

function isFounder(m: TeamMember): boolean {
  return /co-?founder/i.test(m.role) || (m.tags || []).some((t) => /co-?founder/i.test(t));
}
// Non-founder operating / functional leadership (kept distinct from research leads).
function isOperating(m: TeamMember): boolean {
  return /(director of operations|chief of staff|head of (people|finance|operations|ops)|general counsel|\bcoo\b)/i.test(m.role);
}

function monogram(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// Plain text links separated by middots — no boxed icons.
const LINK_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X",
  scholar: "Scholar",
  github: "GitHub",
  website: "Website",
};
const LINK_ORDER = ["linkedin", "scholar", "twitter", "github", "website"];

function ProfileLinks({ m }: { m: TeamMember }) {
  const entries = LINK_ORDER.filter((k) => m.links[k]).map((k) => [k, m.links[k]!] as const);
  return (
    <div className="ed-links">
      {entries.map(([type, url]) => (
        <a key={type} href={url} target="_blank" rel="noopener noreferrer">
          {LINK_LABELS[type] || type}
        </a>
      ))}
      <Link href={`/team/${m.slug}`}>Profile</Link>
    </div>
  );
}

function FounderProfile({ m }: { m: TeamMember }) {
  const loc = locationOf(m);
  return (
    <div className="ed-profile">
      <div className="ed-profile-head">
        <span className="ed-mono" aria-hidden>{monogram(m.name)}</span>
        <div className="ed-ident">
          <Link href={`/team/${m.slug}`} className="ed-name">{m.name}</Link>
          <div className="ed-role">{m.role}</div>
          {loc && <div className="ed-loc">{loc}</div>}
        </div>
      </div>
      {m.body && <p className="ed-bio">{m.body}</p>}
      <ProfileLinks m={m} />
    </div>
  );
}

function DirectoryItem({ m }: { m: TeamMember }) {
  const loc = locationOf(m);
  return (
    <div className="ed-dir-item">
      <span className="ed-mono" aria-hidden>{monogram(m.name)}</span>
      <div className="ed-ident">
        <Link href={`/team/${m.slug}`} className="ed-name">{m.name}</Link>
        <div className="ed-role">{m.role}{loc ? ` · ${loc}` : ""}</div>
        {m.body && <p className="ed-bio">{m.body}</p>}
        <ProfileLinks m={m} />
      </div>
    </div>
  );
}

export default function TeamGridClient({ team }: { team: TeamMember[] }) {
  const founders = team.filter(isFounder);
  const operating = team.filter((m) => !isFounder(m) && isOperating(m));
  const research = team.filter((m) => !isFounder(m) && !isOperating(m));

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Team</h1>
          <p>
            {team.length} members across Paris, New York, Montreal, and Singapore.{" "}
            <Link href="/org-chart" style={{ color: "var(--accent)", textDecoration: "underline", textDecorationColor: "var(--border)" }}>
              View org chart →
            </Link>
          </p>
        </div>
      </div>

      <main>
        {founders.length > 0 && (
          <section className="ed-section">
            <div className="ed-section-head">
              <h2 className="ed-section-title">Co-founders</h2>
              <span className="ed-section-note">{founders.length} researchers &amp; entrepreneurs</span>
            </div>
            <div className="ed-roster">
              {founders.map((m) => <FounderProfile key={m.slug} m={m} />)}
            </div>
          </section>
        )}

        {research.length > 0 && (
          <section className="ed-section">
            <div className="ed-section-head">
              <h2 className="ed-section-title">Science &amp; Research Leadership</h2>
              <span className="ed-section-note">{research.length} researchers &amp; lab leads</span>
            </div>
            <div className="ed-directory">
              {research.map((m) => <DirectoryItem key={m.slug} m={m} />)}
            </div>
          </section>
        )}

        {operating.length > 0 && (
          <section className="ed-section">
            <div className="ed-section-head">
              <h2 className="ed-section-title">Operating Leadership</h2>
            </div>
            <div className="ed-directory">
              {operating.map((m) => <DirectoryItem key={m.slug} m={m} />)}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
