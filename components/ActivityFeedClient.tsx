"use client";

import { useState } from "react";

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

function timeAgo(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function eventIcon(type: string) {
  switch (type) {
    case "PushEvent": return "⬆";
    case "CreateEvent": return "✦";
    case "ReleaseEvent": return "🏷";
    case "WatchEvent": return "★";
    case "ForkEvent": return "⑂";
    case "IssuesEvent": return "○";
    case "IssueCommentEvent": return "◎";
    case "PullRequestEvent": return "↦";
    case "PullRequestReviewEvent": return "✓";
    case "DeleteEvent": return "✕";
    default: return "•";
  }
}

export type GithubEvent = {
  type: string;
  repo: string;
  repoUrl: string;
  description: string;
  url: string;
  timestamp: string;
};

export type MemberActivity = {
  slug: string;
  name: string;
  username: string;
  githubUrl: string;
  events: GithubEvent[];
};

type Props = {
  members: MemberActivity[];
  lastFetched: string | null;
};

export default function ActivityFeedClient({ members, lastFetched }: Props) {
  const [filterMember, setFilterMember] = useState<string>("all");

  // Flatten and sort all events by timestamp
  const allEvents = members
    .filter((m) => filterMember === "all" || m.slug === filterMember)
    .flatMap((m) => m.events.map((e) => ({ ...e, member: m })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px 60px" }}>

      {/* filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button
          onClick={() => setFilterMember("all")}
          style={{
            padding: "0.35rem 0.85rem",
            borderRadius: 20,
            border: "1px solid var(--border)",
            background: filterMember === "all" ? "var(--accent-dim)" : "transparent",
            color: filterMember === "all" ? "var(--accent)" : "var(--muted)",
            fontSize: "0.78rem",
            cursor: "pointer",
          }}
        >
          All
        </button>
        {members.map((m) => (
          <button
            key={m.slug}
            onClick={() => setFilterMember(m.slug)}
            style={{
              padding: "0.35rem 0.85rem",
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: filterMember === m.slug ? "var(--accent-dim)" : "transparent",
              color: filterMember === m.slug ? "var(--accent)" : "var(--muted)",
              fontSize: "0.78rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: "50%",
              ...avatarStyle(m.name),
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.55rem", fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {initials(m.name)}
            </span>
            {m.name.split(" ")[0]}
          </button>
        ))}
        {lastFetched && (
          <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--muted)" }}>
            Updated {timeAgo(lastFetched)}
          </span>
        )}
      </div>

      {/* event feed */}
      {allEvents.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>No activity yet. Run the GitHub Action to populate data.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {allEvents.map((e, i) => (
            <div key={i} style={{
              display: "flex",
              gap: 14,
              padding: "12px 0",
              borderBottom: "1px solid var(--border)",
            }}>
              {/* avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                ...avatarStyle(e.member.name),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.65rem", fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 2,
              }}>
                {initials(e.member.name)}
              </div>

              {/* content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <a href={`/team/${e.member.slug}`} style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>
                    {e.member.name}
                  </a>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                    {eventIcon(e.type)}
                  </span>
                  <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.82rem", color: "var(--text-dim)", textDecoration: "none", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.description}
                  </a>
                </div>
                <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
                  <a href={e.repoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.72rem", color: "var(--muted)", textDecoration: "none" }}>
                    {e.repo}
                  </a>
                  <span style={{ fontSize: "0.68rem", color: "var(--border)" }}>·</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{timeAgo(e.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
