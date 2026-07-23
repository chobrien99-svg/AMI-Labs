import Link from "next/link";
import Hero from "@/components/Hero";
import ObservatoryBriefing, { type Briefing } from "@/components/ObservatoryBriefing";
import NewsColumns from "@/components/NewsColumns";
import ExplainerStrip from "@/components/ExplainerStrip";
import TimelinePreview from "@/components/TimelinePreview";
import SubscribeForm from "@/components/SubscribeForm";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  tags: string[];
}

interface Milestone {
  id: string;
  date: string;
  label: string;
  title: string;
  description: string;
  category: string;
  icon: string;
}

interface HomepageClientProps {
  news: NewsItem[];
  milestones: Milestone[];
  briefing: Briefing;
}

export default function HomepageClient({ news, milestones, briefing }: HomepageClientProps) {
  return (
    <div className="homepage instrument-home">
      <Hero />

      <div className="homepage-content">
        <ObservatoryBriefing briefing={briefing} variant="preview" />

        <div className="homepage-divider" />

        <NewsColumns items={news} />

        <div className="homepage-divider" />

        <ExplainerStrip />

        <div className="homepage-divider" />

        <section className="home-section">
          <div className="research">
            <div className="grid-bg" aria-hidden="true" />
            <div>
              <h2>How a world model sees the future</h2>
              <p>
                Given what it observes, the model reconstructs the present and rolls out what happens next —
                a prediction of physics, not a retrieval of text. Below: a reacher arm, its reconstruction,
                and the model&apos;s forecast, side by side.
              </p>
              <div className="rlinks">
                <Link href="/explainers" className="btn btn-p">Read the explainer</Link>
                <Link href="/research" className="btn btn-s">See the research</Link>
              </div>
            </div>
            <div className="fig">
              <div className="fig-bar"><span className="sq" />Fig.02 — Reacher rollout</div>
              <img src="/reacher_viz_lewm.gif" alt="original, reconstruction, and world-model rollout prediction" />
              <div className="fig-cap">observed → reconstruction → <b>predicted future</b></div>
            </div>
          </div>
        </section>

        <div className="homepage-divider" />

        <TimelinePreview milestones={milestones} />

        <div className="homepage-divider" />

        <section className="home-section subscribe-section">
          <div className="home-section-header">
            <span className="home-section-label">Intelligence Digest</span>
          </div>
          <p className="subscribe-intro">
            Every Monday, The French Tech Journal sends a digest of the latest AMI Labs news — funding, research, hiring, and more. Independent coverage. No spin.
          </p>
          <SubscribeForm />
        </section>
      </div>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">
              <span className="nav-logo-dot" />
              AMI Labs
            </span>
            <span className="footer-tagline">An editorial tracker by The French Tech Journal</span>
          </div>
          <div className="footer-links">
            <a href="/briefing">Briefing</a>
            <a href="/news">News</a>
            <a href="/explainers">Explainers</a>
            <a href="/timeline">Timeline</a>
            <a href="/investors">Investors</a>
            <a href="/org-chart">Team</a>
            <a href="/activity">Activity</a>
          </div>
          <div className="footer-powered">
            Powered by{" "}
            <a href="https://frenchtechjournal.com" target="_blank" rel="noopener noreferrer">
              The French Tech Journal
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
