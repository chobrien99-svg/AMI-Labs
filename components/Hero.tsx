import Link from "next/link";

export default function Hero() {
  return (
    <section className="ih-hero">
      <div className="grid-bg" aria-hidden="true" />
      <svg className="hero-traj" viewBox="0 0 1280 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M-40,430 C260,400 360,250 620,300 C820,340 900,180 1180,210" fill="none" stroke="rgba(110,160,255,.22)" strokeWidth="1.5" />
        <path d="M1180,210 C1260,196 1340,150 1420,160" fill="none" stroke="rgba(110,160,255,.55)" strokeWidth="1.5" strokeDasharray="5 6" className="flow" />
        <circle cx="1180" cy="210" r="3.5" fill="#6EA0FF" />
      </svg>

      <div className="hero-in">
        <div>
          <div className="eyebrow"><span className="bk" />Observatory · A Special Project by The French Tech Journal</div>
          <h1 className="title">
            The AMI Labs Observatory<br />
            <em>One of AI&apos;s Most Watched Companies</em>
          </h1>
          <p className="lede">
            Advanced Machine Intelligence is betting that the future of AI goes beyond language models to machines that understand the physical world. We track every hire, investor move, and research milestone on the quest to take world models from the lab to commercialization.
          </p>
          <div className="ctas">
            <Link href="/news" className="btn btn-p">Read the Latest</Link>
            <Link href="/explainers" className="btn btn-s">What are World Models?</Link>
          </div>
          <div className="hstats">
            <div className="hstat"><b>$1.03B</b><span>Seed Raised</span></div>
            <div className="hstat"><b>$3.5B</b><span>Valuation</span></div>
            <div className="hstat"><b>4</b><span>Offices</span></div>
            <div className="hstat"><b>2025</b><span>Founded</span></div>
          </div>
        </div>
        <div>
          <div className="fig">
            <div className="fig-bar"><span className="sq" />Fig.01 — Embodied manipulation</div>
            {/* Placeholder: swap for /cube_1_half.gif (exceeds the design import size cap). */}
            <img src="/lewm-demo.gif" alt="Robot arm acting under a learned dynamics model" />
            <div className="fig-cap">UR5 arm · pick-and-place guided by a <b>learned world model</b></div>
          </div>
          <p className="hero-note">The arm plans its next move by simulating what will happen — not by matching text. Intelligence begins in the world, not in language.</p>
        </div>
      </div>
    </section>
  );
}
