import Link from "next/link";

interface Milestone {
  id: string;
  label: string;
  title: string;
  description: string;
  category: string;
  icon: string;
}

interface TimelinePreviewProps {
  milestones: Milestone[];
}

const CATEGORY_COLORS: Record<string, string> = {
  founding: "tl-cat-founding",
  funding: "tl-cat-funding",
  team: "tl-cat-team",
  product: "tl-cat-product",
  administrative: "tl-cat-admin",
};

export default function TimelinePreview({ milestones }: TimelinePreviewProps) {
  const preview = milestones.slice(-5).reverse();

  return (
    <section className="home-section">
      <div className="home-section-header">
        <span className="home-section-label">Key Milestones</span>
        <Link href="/timeline" className="home-section-link">
          Full timeline →
        </Link>
      </div>

      <div className="tl-preview">
        {preview.map((m, i) => (
          <div key={m.id} className="tl-item">
            <div className="tl-spine">
              <div className="tl-node">
                <span className="tl-node-icon" aria-hidden="true">{m.icon}</span>
              </div>
              {i < preview.length - 1 && <div className="tl-line" />}
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
    </section>
  );
}
