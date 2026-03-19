import Link from "next/link";

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

interface ExplainersClientProps {
  pitchdeck: Document | null;
}

export default function ExplainersClient({ pitchdeck }: ExplainersClientProps) {
  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Explainers</h1>
          <p>What is AMI Labs building, and why does it matter?</p>
        </div>
      </div>

      <main>
        {/* ── Pitchdeck embed ── */}
        {pitchdeck && (
          <section className="explainer-embed-section">
            <div className="section-header" style={{ marginTop: 0 }}>
              <div className="section-icon" style={{ background: "var(--accent-dim)" }}>📄</div>
              <h2>Pitchdeck</h2>
              <span className="section-count">{pitchdeck.label}</span>
            </div>

            <div className="explainer-embed">
              <div className="explainer-embed-bar">
                <span className="explainer-embed-title">{pitchdeck.title}</span>
                <span className="explainer-embed-label">{pitchdeck.label}</span>
                <a
                  href={`/documents/${pitchdeck.filename}`}
                  download
                  className="explainer-embed-dl"
                >
                  ↓ Download PDF
                </a>
              </div>
              <iframe
                src={`/documents/${pitchdeck.filename}`}
                className="explainer-embed-iframe"
                title={pitchdeck.title}
              />
            </div>
          </section>
        )}

        {/* ── Editorial cards ── */}
        <div className="section-header">
          <div className="section-icon" style={{ background: "var(--electric-dim)" }}>🧠</div>
          <h2>Background</h2>
        </div>

        <div className="explainers-cards">

          <div className="card explainer-article-card">
            <div className="explainer-article-icon">🧠</div>
            <div className="card-name">What is AMI Labs?</div>
            <div className="card-body">
              <p>
                Advanced Machine Intelligence (AMI Labs) is a Paris-based AI research company
                founded in 2025 by Yann LeCun — Chief AI Scientist at Meta — and entrepreneur
                Alexandre LeBrun. The company raised a $1.03B seed round at a $3.5B valuation,
                co-led by HIRO Capital, with participation from Toyota Ventures, Daphni,
                Founders Future, and others.
              </p>
              <p style={{ marginTop: 10 }}>
                AMI Labs' mission is to build AI systems that understand the real world — not just
                language. Where current large language models excel at text prediction, AMI targets
                a deeper form of intelligence: systems that can reason about physics, causality,
                and the dynamics of the physical environment.
              </p>
            </div>
            <div className="explainer-article-links">
              <Link href="/org-chart" className="card-link">👥 Meet the team →</Link>
              <Link href="/investors" className="card-link">💼 Investors →</Link>
              <Link href="/timeline" className="card-link">📅 Timeline →</Link>
            </div>
          </div>

          <div className="card explainer-article-card">
            <div className="explainer-article-icon">🌐</div>
            <div className="card-name">What are World Models?</div>
            <div className="card-body">
              <p>
                A World Model is an AI system that learns an internal representation of how the
                world works. Rather than mapping inputs to outputs via pattern matching, a world
                model builds a compressed, structured understanding of reality — enabling it to
                <em> predict</em>, <em>plan</em>, and <em>reason</em> about situations it has
                never directly observed.
              </p>
              <p style={{ marginTop: 10 }}>
                Yann LeCun has argued that world models are the missing ingredient for truly
                general AI. Current LLMs have no grounding in physical reality: they cannot
                mentally simulate pouring water into a glass, or anticipate the consequences of
                pushing an object off a table. World models aim to fix this by learning from
                sensory experience — video, audio, proprioception — rather than text alone.
              </p>
              <p style={{ marginTop: 10 }}>
                AMI Labs' architecture, described internally as <strong>Alpha Intelligence</strong>,
                is designed around this thesis: a hierarchical latent-space model trained on
                multimodal real-world data, capable of building and querying an internal
                world representation at inference time.
              </p>
            </div>
            <div className="explainer-article-links">
              <Link href="/news" className="card-link">📰 Latest research news →</Link>
              <Link href="/timeline" className="card-link">📅 Key milestones →</Link>
            </div>
          </div>

        </div>

        {/* ── Footer link to docs ── */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <Link href="/docs" className="card-link" style={{ fontSize: "0.82rem" }}>
            All documents →
          </Link>
        </div>
      </main>
    </>
  );
}
