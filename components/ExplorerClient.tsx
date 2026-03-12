"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import SubscribeForm from "./SubscribeForm";

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

type InvestorItem = {
  name: string;
  role: string;
  body: string;
  tags: string[];
  colead?: boolean;
};

type TeamMember = {
  slug: string;
  name: string;
  role: string;
  body: string;
  tags: string[];
};

type InvestorData = {
  corp: InvestorItem[];
  vc: InvestorItem[];
  angel: InvestorItem[];
};

function InvestorCard({ item, category }: { item: InvestorItem; category: string }) {
  return (
    <div className="card">
      <div className="card-top">
        <div className="avatar" style={avatarStyle(item.name)}>
          {initials(item.name)}
        </div>
        <div>
          <div className="card-name">{item.name}</div>
          <div className="card-role">{item.role}</div>
        </div>
      </div>
      <div className="card-body">{item.body}</div>
      <div className="tags">
        {item.colead && <span className="tag tag-colead">Co-Lead</span>}
        {(item.tags || []).map((t) => (
          <span key={t} className="tag tag-country">{t}</span>
        ))}
        <span className={`tag tag-${category}`}>{
          category === "corp" ? "Corporate" :
          category === "vc" ? "VC" : "Angel"
        }</span>
      </div>
    </div>
  );
}

function TeamCard({ member }: { member: TeamMember }) {
  return (
    <Link href={`/team/${member.slug}`} style={{ display: "block" }}>
      <div className="card" style={{ cursor: "pointer" }}>
        <div className="card-top">
          <div className="avatar" style={avatarStyle(member.name)}>
            {initials(member.name)}
          </div>
          <div>
            <div className="card-name">{member.name}</div>
            <div className="card-role">{member.role}</div>
          </div>
        </div>
        <div className="card-body">{member.body}</div>
        <div className="tags">
          {(member.tags || []).map((t) => (
            <span key={t} className="tag tag-country">{t}</span>
          ))}
          <span className="tag tag-team">Team</span>
        </div>
      </div>
    </Link>
  );
}

type Props = {
  investors: InvestorData;
  team: TeamMember[];
};

type Filter = "all" | "corp" | "vc" | "angel" | "team";

export default function ExplorerClient({ investors, team }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const q = query.toLowerCase();

  function matchItem(item: { name: string; role: string; body: string }) {
    return !q || item.name.toLowerCase().includes(q) ||
      item.role.toLowerCase().includes(q) ||
      item.body.toLowerCase().includes(q);
  }

  const filtered = useMemo(() => ({
    corp: investors.corp.filter(matchItem),
    vc: investors.vc.filter(matchItem),
    angel: investors.angel.filter(matchItem),
    team: team.filter(matchItem),
  }), [q, investors, team]);

  const total =
    (filter === "all" || filter === "corp" ? filtered.corp.length : 0) +
    (filter === "all" || filter === "vc" ? filtered.vc.length : 0) +
    (filter === "all" || filter === "angel" ? filtered.angel.length : 0) +
    (filter === "all" || filter === "team" ? filtered.team.length : 0);

  const show = (cat: Filter) => filter === "all" || filter === cat;

  return (
    <>
      <header>
        <div className="header-inner">
          <div className="logo-wrap">
            <img src="/ami-logo.png" alt="AMI Labs" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          </div>
          <div className="header-text">
            <h1>AMI Labs — Investor &amp; Team Explorer</h1>
            <p>Advanced Machine Intelligence · Paris · New York · Montreal · Singapore</p>
          </div>
          <div className="badge">
            <div className="badge-amount">$1.03B</div>
            <div className="badge-label">Seed Round · $3.5B Valuation</div>
          </div>
        </div>
      </header>

      <div className="stats-bar">
        <div className="stats-inner">
          <div className="stat">
            <div className="stat-dot" style={{ background: "var(--green)" }} />
            <span className="stat-num">{investors.corp.length}</span>
            <span className="stat-label">Corporate Investors</span>
          </div>
          <div className="stat">
            <div className="stat-dot" style={{ background: "var(--blue)" }} />
            <span className="stat-num">{investors.vc.length}</span>
            <span className="stat-label">VC Firms</span>
          </div>
          <div className="stat">
            <div className="stat-dot" style={{ background: "var(--orange)" }} />
            <span className="stat-num">{investors.angel.length}</span>
            <span className="stat-label">Business Angels</span>
          </div>
          <div className="stat">
            <div className="stat-dot" style={{ background: "var(--pink)" }} />
            <span className="stat-num">{team.length}</span>
            <span className="stat-label">Team Members</span>
          </div>
        </div>
      </div>

      <main>
        <div className="controls">
          <div className="search-wrap">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Search names, roles, firms…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {(["all", "corp", "vc", "angel", "team"] as Filter[]).map((f) => (
            <button
              key={f}
              className={`filter-btn${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "corp" ? "Corporate" : f === "vc" ? "VC Firms" : f === "angel" ? "Angels" : "Team"}
            </button>
          ))}
          <span className="result-count">{total} result{total !== 1 ? "s" : ""}</span>
        </div>

        {show("corp") && (
          <>
            <div className="section-header">
              <div className="section-icon" style={{ background: "#1a2a1a" }}>🏢</div>
              <h2>Corporate &amp; Strategic Investors</h2>
              <span className="section-count">{filtered.corp.length}</span>
            </div>
            <div className="cards-grid">
              {filtered.corp.map((item) => <InvestorCard key={item.name} item={item} category="corp" />)}
            </div>
          </>
        )}

        {show("vc") && (
          <>
            <div className="section-header">
              <div className="section-icon" style={{ background: "#1a1a2a" }}>💼</div>
              <h2>Venture Capital Firms</h2>
              <span className="section-count">{filtered.vc.length}</span>
            </div>
            <div className="cards-grid">
              {filtered.vc.map((item) => <InvestorCard key={item.name} item={item} category="vc" />)}
            </div>
          </>
        )}

        {show("angel") && (
          <>
            <div className="section-header">
              <div className="section-icon" style={{ background: "#2a1a1a" }}>👤</div>
              <h2>Business Angels</h2>
              <span className="section-count">{filtered.angel.length}</span>
            </div>
            <div className="cards-grid">
              {filtered.angel.map((item) => <InvestorCard key={item.name} item={item} category="angel" />)}
            </div>
          </>
        )}

        {show("team") && (
          <>
            <div className="section-header">
              <div className="section-icon" style={{ background: "#2a1a2a" }}>🚀</div>
              <h2>Team Members</h2>
              <span className="section-count">{filtered.team.length}</span>
            </div>
            <div className="cards-grid">
              {filtered.team.map((member) => <TeamCard key={member.slug} member={member} />)}
            </div>
          </>
        )}
      <SubscribeForm />
      </main>
    </>
  );
}
