"use client";

import { useState } from "react";

interface Document {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  filename: string;
  label: string;
  access: string;
}

interface DocsClientProps {
  documents: Document[];
}

const CATEGORY_OPTIONS = [
  { key: "all", label: "All" },
  { key: "pitchdeck", label: "Pitchdeck" },
  { key: "presentation", label: "Presentations" },
  { key: "research", label: "Research" },
  { key: "filing", label: "Filings" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

export default function DocsClient({ documents }: DocsClientProps) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewing, setViewing] = useState<Document | null>(null);

  const filtered =
    activeCategory === "all"
      ? documents
      : documents.filter((d) => d.category === activeCategory);

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Documents</h1>
          <p>Official AMI Labs public documents — pitchdecks, research, and filings.</p>
        </div>
      </div>

      <main>
        {/* Viewer */}
        {viewing && (
          <div className="docs-viewer">
            <div className="docs-viewer-bar">
              <span className="docs-viewer-title">{viewing.title}</span>
              <span className="docs-viewer-label">{viewing.label}</span>
              <a
                href={`/documents/${viewing.filename}`}
                download
                className="docs-viewer-download"
              >
                ↓ Download
              </a>
              <button
                className="docs-viewer-close"
                onClick={() => setViewing(null)}
              >
                ✕ Close
              </button>
            </div>
            <iframe
              src={`/documents/${viewing.filename}`}
              className="docs-viewer-iframe"
              title={viewing.title}
            />
          </div>
        )}

        {/* Filters */}
        <div className="controls">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`filter-btn${activeCategory === opt.key ? " active" : ""}`}
              onClick={() => setActiveCategory(opt.key)}
            >
              {opt.label}
            </button>
          ))}
          <span className="result-count">{filtered.length} document{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Cards */}
        <div className="docs-grid">
          {filtered.map((doc) => (
            <div key={doc.id} className="doc-card">
              <div className="doc-card-icon">📄</div>
              <div className="doc-card-body">
                <div className="doc-card-title">{doc.title}</div>
                <div className="doc-card-meta">{doc.label} · {formatDate(doc.date)}</div>
                <div className="doc-card-desc">{doc.description}</div>
                <div className="doc-card-actions">
                  <button
                    className="doc-btn doc-btn-view"
                    onClick={() => setViewing(viewing?.id === doc.id ? null : doc)}
                  >
                    {viewing?.id === doc.id ? "Close viewer" : "View"}
                  </button>
                  <a
                    href={`/documents/${doc.filename}`}
                    download
                    className="doc-btn doc-btn-dl"
                  >
                    Download PDF
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="empty-state">No documents in this category yet.</div>
        )}
      </main>
    </>
  );
}
