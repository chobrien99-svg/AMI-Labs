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
  image?: string;
};

// Location lives inside the tags array (e.g. ["Paris/New York", "Co-Founder"]).
const LOCATION_RE = /paris|new york|montreal|singapore|london|zurich|bay area|san francisco|montréal/i;
function locationOf(m: TeamMember): string {
  return (m.tags || []).find((t) => LOCATION_RE.test(t)) || "";
}

function isFounder(m: TeamMember): boolean {
  return /co-?founder/i.test(m.role) || (m.tags || []).some((t) => /co-?founder/i.test(t));
}
// People placed under Operations regardless of their role string (matched by slug or name).
const OPERATIONS_SLUGS = new Set(["marina-farthouat", "felix-naepels", "christophe-tcheng"]);
const OPERATIONS_NAMES = new Set(["marina farthouat", "felix naepels", "christophe tcheng"]);
// Non-founder operating / functional leadership (kept distinct from research leads).
function isOperating(m: TeamMember): boolean {
  return (
    OPERATIONS_SLUGS.has(m.slug) ||
    OPERATIONS_NAMES.has(m.name.trim().toLowerCase()) ||
    /(director of operations|chief of staff|head of (people|finance|operations|ops)|general counsel|\bcoo\b)/i.test(m.role)
  );
}

function monogram(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// 4:5 duotone portrait. The monogram panel is always rendered behind the image, so
// a missing or broken portrait degrades to the monogram with no JS and no SSR race.
function Portrait({ m }: { m: TeamMember }) {
  return (
    <div className="ed-figure">
      <span className="ed-figure-mono" aria-hidden>{monogram(m.name)}</span>
      {m.image && <img className="founder-image" src={m.image} alt={m.name} loading="lazy" />}
    </div>
  );
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
      <Link href={`/team/${m.slug}`} className="ed-figure-link" aria-label={m.name}>
        <Portrait m={m} />
      </Link>
      <div className="ed-ident">
        <Link href={`/team/${m.slug}`} className="ed-name">{m.name}</Link>
        <div className="ed-role">{m.role}</div>
        {loc && <div className="ed-loc">{loc}</div>}
        {m.body && <p className="ed-bio">{m.body}</p>}
        <ProfileLinks m={m} />
      </div>
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

type Section = "founders" | "research" | "operating";

// Which section a member appears in. The Sanity "Department / Group" field is
// authoritative when set (so editors control placement from a dropdown); otherwise
// we infer from role/tags. Legacy department values are mapped too.
function sectionOf(m: TeamMember): Section {
  const d = (m.department || "").trim().toLowerCase();
  if (d) {
    if (d.includes("operation")) return "operating";
    if (d.includes("science") || d.includes("research")) return "research"; // incl. "Research & Engineering"
    if (d.includes("founder") || d === "leadership") return "founders";
  }
  if (isFounder(m)) return "founders";
  if (isOperating(m)) return "operating";
  return "research";
}

export default function TeamGridClient({ team }: { team: TeamMember[] }) {
  const founders = team.filter((m) => sectionOf(m) === "founders");
  const research = team.filter((m) => sectionOf(m) === "research");
  const operating = team.filter((m) => sectionOf(m) === "operating");

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
