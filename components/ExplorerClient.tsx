"use client";
import { useState, useMemo } from "react";
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

type InvestorLinks = {
  linkedin?: string;
  website?: string;
  announcement?: string;
};

type InvestorItem = {
  name: string;
  role: string;
  body: string;
  tags: string[];
  colead?: boolean;
  links?: InvestorLinks;
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
      {item.links && (
        <div className="card-links">
          {item.links.linkedin && (
            <a href={item.links.linkedin} target="_blank" rel="noopener noreferrer" className="card-link">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              LinkedIn
            </a>
          )}
          {item.links.website && (
            <a href={item.links.website} target="_blank" rel="noopener noreferrer" className="card-link">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Website
            </a>
          )}
          {item.links.announcement && (
            <a href={item.links.announcement} target="_blank" rel="noopener noreferrer" className="card-link">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Announcement
            </a>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  investors: InvestorData;
};

type Filter = "all" | "corp" | "vc" | "angel";

export default function ExplorerClient({ investors }: Props) {
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
  }), [q, investors]);

  const total =
    (filter === "all" || filter === "corp" ? filtered.corp.length : 0) +
    (filter === "all" || filter === "vc" ? filtered.vc.length : 0) +
    (filter === "all" || filter === "angel" ? filtered.angel.length : 0);

  const show = (cat: Filter) => filter === "all" || filter === cat;

  return (
    <>
      <header>
        <div className="header-inner">
          <div className="logo-wrap">
            <img src="/ami-logo.png" alt="AMI Labs" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          </div>
          <div className="header-text">
            <h1>AMI Labs — Investors</h1>
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
        </div>
      </div>

      <SubscribeForm />

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
          {(["all", "corp", "vc", "angel"] as Filter[]).map((f) => (
            <button
              key={f}
              className={`filter-btn${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "corp" ? "Corporate" : f === "vc" ? "VC Firms" : "Angels"}
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
      </main>
    </>
  );
}
