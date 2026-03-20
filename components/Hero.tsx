import Link from "next/link";

export default function Hero() {
  return (
    <section className="hero-section">
      {/* Gradient orbs */}
      <div className="hero-orb hero-orb-purple" aria-hidden="true" />
      <div className="hero-orb hero-orb-blue" aria-hidden="true" />

      {/* Frosted glass card */}
      <div className="hero-glass">
        <div className="hero-eyebrow">A Special Project by The French Tech Journal</div>
        <h1 className="hero-title">
          Tracking AMI Labs<br />
          <span className="hero-title-gradient">One of AI&apos;s Most Watched Companies</span>
        </h1>
        <p className="hero-description">
          AMI Labs is betting that the future of AI isn&apos;t language models: machines that understand the physical world. We&apos;re tracking every milestone, hire, investor, and research development so you don&apos;t have to.
        </p>
        <div className="hero-ctas">
          <Link href="/news" className="hero-cta-primary">
            Read the Latest
          </Link>
          <Link href="/explainers" className="hero-cta-secondary">
            What are World Models?
          </Link>
        </div>
      </div>

      {/* Stat strip */}
      <div className="hero-stats">
        <div className="hero-stat">
          <span className="hero-stat-value">$1.03B</span>
          <span className="hero-stat-label">Seed Raised</span>
        </div>
        <div className="hero-stat-divider" />
        <div className="hero-stat">
          <span className="hero-stat-value">$3.5B</span>
          <span className="hero-stat-label">Valuation</span>
        </div>
        <div className="hero-stat-divider" />
        <div className="hero-stat">
          <span className="hero-stat-value">2025</span>
          <span className="hero-stat-label">Founded</span>
        </div>
        <div className="hero-stat-divider" />
        <div className="hero-stat">
          <span className="hero-stat-value hero-stat-locations">
            Paris · New York · Montreal · Singapore
          </span>
          <span className="hero-stat-label">Offices</span>
        </div>
      </div>
    </section>
  );
}
