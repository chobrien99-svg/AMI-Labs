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

const GROUPS: { label: string; test: (role: string) => boolean }[] = [
  { label: "Leadership", test: (r) => /chairman|ceo|coo/i.test(r) },
  { label: "Science & Research Leadership", test: (r) => /crio|chief.*scien|chief.*research|^vp |vice president/i.test(r) },
  { label: "Operations", test: (r) => /director|operations|chief.*staff|chief.*operat/i.test(r) },
];

function getGroup(member: TeamMember): string {
  if (member.department && GROUP_ORDER.includes(member.department)) return member.department;
  for (const g of GROUPS) {
    if (g.test(member.role)) return g.label;
  }
  return "Research & Engineering";
}

const GROUP_ORDER = ["Leadership", "Science & Research Leadership", "Research & Engineering", "Operations"];

const AVATAR_COLORS: [string, string][] = [
  ["#946B2D", "#B8960B"],
  ["#2A7D6B", "#3D9E88"],
  ["#3D7A4A", "#5EA06A"],
  ["#A85C72", "#C8849A"],
  ["#4A7FA5", "#6FA3C4"],
  ["#C07A3A", "#D99B5C"],
  ["#7B5EA7", "#9D84C4"],
  ["#5C8A5E", "#7FAE82"],
];

function getColor(name: string): [string, string] {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const LINK_ICONS: Record<string, string> = {
  linkedin: "in",
  twitter: "𝕏",
  scholar: "S",
  github: "G",
  website: "↗",
};

function LinkIcon({ type, url }: { type: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={type}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 26, height: 26, borderRadius: 6,
        background: "var(--surface2)", color: "var(--muted)",
        fontSize: 11, fontWeight: 700, textDecoration: "none",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--accent-dim)";
        e.currentTarget.style.color = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--surface2)";
        e.currentTarget.style.color = "var(--muted)";
      }}
    >
      {LINK_ICONS[type] || "↗"}
    </a>
  );
}

export default function TeamGridClient({ team }: { team: TeamMember[] }) {
  const grouped = new Map<string, TeamMember[]>();
  for (const label of GROUP_ORDER) grouped.set(label, []);
  for (const m of team) {
    const g = getGroup(m);
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(m);
  }

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
        {GROUP_ORDER.filter((label) => (grouped.get(label)?.length ?? 0) > 0).map((label) => (
          <section key={label} style={{ marginBottom: 48 }}>
            <h2 style={{
              fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 600,
              color: "var(--accent)", marginBottom: 20,
              paddingBottom: 8, borderBottom: "1px solid var(--border)",
            }}>
              {label}
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}>
              {grouped.get(label)!.map((m) => {
                const [c1, c2] = getColor(m.name);
                const linkEntries = Object.entries(m.links).filter(
                  ([k, v]) => v && LINK_ICONS[k]
                ) as [string, string][];

                return (
                  <Link
                    key={m.slug}
                    href={`/team/${m.slug}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      style={{
                        background: "var(--surface)", border: "1px solid var(--border)",
                        borderRadius: 10, padding: 24,
                        transition: "border-color 0.15s, box-shadow 0.15s",
                        cursor: "pointer", height: "100%",
                        display: "flex", flexDirection: "column",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent)";
                        e.currentTarget.style.boxShadow = "0 2px 12px rgba(148, 107, 45, 0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {/* Header: avatar + name/role */}
                      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                          background: `linear-gradient(135deg, ${c1}, ${c2})`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "0.02em",
                        }}>
                          {initials(m.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: 16, fontWeight: 700, color: "var(--text)",
                            lineHeight: 1.3, marginBottom: 2,
                          }}>
                            {m.name}
                          </div>
                          <div style={{
                            fontSize: 13, color: "var(--text-dim)", lineHeight: 1.3,
                          }}>
                            {m.role}
                          </div>
                        </div>
                      </div>

                      {/* Tags */}
                      {m.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                          {m.tags.map((tag) => (
                            <span key={tag} style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 4,
                              background: "var(--accent-dim)", color: "var(--accent)",
                              border: "1px solid var(--border)", fontWeight: 500,
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Body */}
                      {m.body && (
                        <p style={{
                          fontSize: 13, color: "var(--muted)", lineHeight: 1.55,
                          flex: 1,
                        }}>
                          {m.body.length > 140 ? m.body.slice(0, 137) + "…" : m.body}
                        </p>
                      )}

                      {/* Links */}
                      {linkEntries.length > 0 && (
                        <div
                          style={{ display: "flex", gap: 6, marginTop: 12 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {linkEntries.map(([type, url]) => (
                            <LinkIcon key={type} type={type} url={url} />
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
