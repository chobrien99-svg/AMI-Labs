"use client";

import { useState } from "react";
import Link from "next/link";

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

// Short mono label per event type (replaces the old emoji glyphs).
function eventLabel(type: string): string {
  switch (type) {
    case "PushEvent": return "push";
    case "CreateEvent": return "create";
    case "ReleaseEvent": return "release";
    case "WatchEvent": return "star";
    case "ForkEvent": return "fork";
    case "IssuesEvent": return "issue";
    case "IssueCommentEvent": return "comment";
    case "PullRequestEvent": return "PR";
    case "PullRequestReviewEvent": return "review";
    case "PullRequestReviewCommentEvent": return "review";
    case "DeleteEvent": return "delete";
    case "MemberEvent": return "member";
    default: return type.replace(/Event$/, "").toLowerCase();
  }
}

// Group the event type into one of four accent buckets (no rainbow — each bucket
// is a single Instrument hue).
function eventKind(type: string): string {
  if (type.startsWith("PullRequest")) return "pr";
  if (type === "PushEvent" || type === "CreateEvent" || type === "ReleaseEvent") return "code";
  if (type.startsWith("Issue")) return "issue";
  return "meta";
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

  const active = members.filter((m) => m.events.length > 0);

  const allEvents = members
    .filter((m) => filterMember === "all" || m.slug === filterMember)
    .flatMap((m) => m.events.map((e) => ({ ...e, member: m })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="actv-feed">
      <div className="actv-feed-head">
        <span className="actv-chart-eyebrow"><span className="actv-blip actv-blip-blue" />Activity feed</span>
        {lastFetched && <span className="actv-updated">Updated {timeAgo(lastFetched)}</span>}
      </div>

      <div className="actv-filter">
        <button
          onClick={() => setFilterMember("all")}
          className={`actv-pill${filterMember === "all" ? " actv-pill-on" : ""}`}
        >
          All
        </button>
        {active.map((m) => (
          <button
            key={m.slug}
            onClick={() => setFilterMember(m.slug)}
            className={`actv-pill${filterMember === m.slug ? " actv-pill-on" : ""}`}
          >
            {m.name.split(" ")[0]}
          </button>
        ))}
      </div>

      {allEvents.length === 0 ? (
        <p className="actv-empty">No activity yet. Run the GitHub Action to populate data.</p>
      ) : (
        <div className="actv-rows">
          {allEvents.map((e, i) => (
            <div key={i} className="actv-row">
              <span className="actv-avatar" aria-hidden>{initials(e.member.name)}</span>
              <div className="actv-row-body">
                <div className="actv-row-top">
                  <Link href={`/team/${e.member.slug}`} className="actv-row-name">{e.member.name}</Link>
                  <span className={`actv-type actv-type-${eventKind(e.type)}`}>{eventLabel(e.type)}</span>
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="actv-row-desc">
                    {e.description}
                  </a>
                </div>
                <div className="actv-row-meta">
                  <a href={e.repoUrl} target="_blank" rel="noopener noreferrer" className="actv-row-repo">{e.repo}</a>
                  <span className="actv-dot">·</span>
                  <span>{timeAgo(e.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
