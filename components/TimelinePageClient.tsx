"use client";

import { useState } from "react";

interface Milestone {
  id: string;
  date: string;
  label: string;
  title: string;
  description: string;
  category: string;
  icon: string;
}

interface TimelinePageClientProps {
  milestones: Milestone[];
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "founding", label: "Founding" },
  { key: "funding", label: "Funding" },
  { key: "team", label: "Team" },
  { key: "product", label: "Product" },
  { key: "administrative", label: "Administrative" },
];

const CATEGORY_COLORS: Record<string, string> = {
  founding: "tl-cat-founding",
  funding: "tl-cat-funding",
  team: "tl-cat-team",
  product: "tl-cat-product",
  administrative: "tl-cat-admin",
};

export default function TimelinePageClient({ milestones }: TimelinePageClientProps) {
  const [activeCategory, setActiveCategory] = useState("all");

  const sorted = [...milestones].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const filtered =
    activeCategory === "all"
      ? sorted
      : sorted.filter((m) => m.category === activeCategory);

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>AMI Labs — Timeline</h1>
          <p>Key milestones in the history of Advanced Machine Intelligence</p>
        </div>
      </div>

      <main>
        {/* Filters */}
        <div className="controls" style={{ marginBottom: 32 }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`filter-btn${activeCategory === cat.key ? " active" : ""}`}
              onClick={() => setActiveCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
          <span className="result-count">
            {filtered.length} {filtered.length === 1 ? "milestone" : "milestones"}
          </span>
        </div>

        {/* Timeline */}
        {filtered.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", padding: "32px 0" }}>
            No milestones in this category yet.
          </p>
        ) : (
          <div className="tl-preview">
            {filtered.map((m, i) => (
              <div key={m.id} className="tl-item">
                <div className="tl-spine">
                  <div className="tl-node">
                    <span className="tl-node-icon" aria-hidden="true">{m.icon}</span>
                  </div>
                  {i < filtered.length - 1 && <div className="tl-line" />}
                </div>
                <div className="tl-body">
                  <div className="tl-meta">
                    <span className="tl-date">{m.label}</span>
                    <span className={`tl-cat ${CATEGORY_COLORS[m.category] ?? ""}`}>
                      {m.category}
                    </span>
                  </div>
                  <h3 className="tl-title">{m.title}</h3>
                  <p className="tl-desc">{m.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
