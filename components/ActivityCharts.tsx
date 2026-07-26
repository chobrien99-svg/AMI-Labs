import Link from "next/link";

export type ProjectBar = {
  repo: string;
  owner: string;
  name: string;
  url: string;
  score: number;
  stars: number;
  language: string | null;
  eventSummary: string;
  contributors: string[];
  ownership: string;
  isFork: boolean;
};

export type ContributorBar = {
  slug: string;
  name: string;
  username: string;
  url: string;
  score: number;
  count: number;
  breakdown: string;
};

export type ActivityStats = {
  activeRepos: number;
  contributorsActive: number;
  totalEvents: number;
  windowDays: number;
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// One horizontal bar. Value is always direct-labeled (col 3) so tiny bars stay legible.
function Bar({
  label,
  href,
  external,
  pct,
  value,
  hue,
  tip,
}: {
  label: React.ReactNode;
  href: string;
  external?: boolean;
  pct: number;
  value: number;
  hue: "blue" | "clay";
  tip: string;
}) {
  return (
    <div className="actv-bar-row" title={tip}>
      <div className="actv-bar-label">
        {external ? (
          <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
        ) : (
          <Link href={href}>{label}</Link>
        )}
      </div>
      <div className="actv-bar-track">
        <div
          className={`actv-bar-fill actv-bar-${hue}`}
          style={{ width: `${Math.max(pct, 1.5)}%` }}
        />
        <span className="actv-bar-tip">{tip}</span>
      </div>
      <div className="actv-bar-val">{value.toLocaleString()}</div>
    </div>
  );
}

export default function ActivityCharts({
  projects,
  contributors,
  stats,
}: {
  projects: ProjectBar[];
  contributors: ContributorBar[];
  stats: ActivityStats;
}) {
  const maxProject = Math.max(1, ...projects.map((p) => p.score));
  const maxContributor = Math.max(1, ...contributors.map((c) => c.count));

  return (
    <div className="actv-top">
      <div className="actv-stats">
        <div className="actv-stat">
          <span className="actv-stat-num">{stats.activeRepos}</span>
          <span className="actv-stat-label">Active repos</span>
        </div>
        <div className="actv-stat">
          <span className="actv-stat-num">{stats.contributorsActive}</span>
          <span className="actv-stat-label">Contributors</span>
        </div>
        <div className="actv-stat">
          <span className="actv-stat-num">{stats.totalEvents}</span>
          <span className="actv-stat-label">Recent events</span>
        </div>
        <div className="actv-stat">
          <span className="actv-stat-num">{stats.windowDays}d</span>
          <span className="actv-stat-label">Window</span>
        </div>
      </div>

      <div className="actv-charts">
        <section className="actv-chart">
          <div className="actv-chart-head">
            <span className="actv-chart-eyebrow"><span className="actv-blip actv-blip-blue" />Most active projects</span>
            <span className="actv-chart-sub">by weighted activity · last {stats.windowDays} days</span>
          </div>
          <div className="actv-bars">
            {projects.length === 0 ? (
              <p className="actv-empty">No repository activity tracked yet.</p>
            ) : (
              projects.map((p) => (
                <Bar
                  key={p.repo}
                  label={<><span className="actv-bar-owner">{p.owner}/</span>{p.name}</>}
                  href={p.url}
                  external
                  pct={(p.score / maxProject) * 100}
                  value={p.score}
                  hue="blue"
                  tip={`${p.eventSummary}${p.stars ? ` · ${p.stars.toLocaleString()}★` : ""}${p.language ? ` · ${p.language}` : ""}${p.isFork ? " · fork" : ""}`}
                />
              ))
            )}
          </div>
        </section>

        <section className="actv-chart">
          <div className="actv-chart-head">
            <span className="actv-chart-eyebrow"><span className="actv-blip actv-blip-clay" />Most active contributors</span>
            <span className="actv-chart-sub">by recent public GitHub events</span>
          </div>
          <div className="actv-bars">
            {contributors.length === 0 ? (
              <p className="actv-empty">No contributor activity tracked yet.</p>
            ) : (
              contributors.map((c) => (
                <Bar
                  key={c.slug || c.username}
                  label={
                    <span className="actv-contrib">
                      <span className="actv-avatar" aria-hidden>{initials(c.name)}</span>
                      {c.name}
                    </span>
                  }
                  href={c.slug ? `/team/${c.slug}` : c.url}
                  external={!c.slug}
                  pct={(c.count / maxContributor) * 100}
                  value={c.count}
                  hue="clay"
                  tip={c.breakdown}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
