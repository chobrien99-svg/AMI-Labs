import activityData from "@/data/github-activity.json";
import analysisData from "@/data/github-analysis.json";
import ActivityFeedClient, { type MemberActivity } from "@/components/ActivityFeedClient";
import ActivityCharts, {
  type ProjectBar,
  type ContributorBar,
  type ActivityStats,
} from "@/components/ActivityCharts";

export const metadata = {
  title: "GitHub Activity — AMI Labs",
  description: "Recent public GitHub activity from the AMI Labs team — most active projects and contributors.",
};

export const revalidate = 60;

// Same weighting the analysis pipeline uses (analyze-github-activity.js), so the
// contributor ranking is consistent with the project scores.
const EVENT_WEIGHTS: Record<string, number> = {
  PushEvent: 4, PullRequestEvent: 5, ReleaseEvent: 6, CreateEvent: 3,
  IssuesEvent: 2, PullRequestReviewEvent: 2, PullRequestReviewCommentEvent: 1,
  IssueCommentEvent: 1, MemberEvent: 1, GollumEvent: 1, PublicEvent: 3,
  DeleteEvent: 0, ForkEvent: 0.5, WatchEvent: 0,
};

// Human-readable event nouns for the contributor tooltip breakdown.
const EVENT_NOUNS: Record<string, [string, string]> = {
  PushEvent: ["push", "pushes"],
  PullRequestEvent: ["PR", "PRs"],
  PullRequestReviewEvent: ["review", "reviews"],
  PullRequestReviewCommentEvent: ["review comment", "review comments"],
  IssuesEvent: ["issue", "issues"],
  IssueCommentEvent: ["comment", "comments"],
  CreateEvent: ["create", "creates"],
  ReleaseEvent: ["release", "releases"],
  ForkEvent: ["fork", "forks"],
  WatchEvent: ["star", "stars"],
};

function shortRepo(repo: string): { owner: string; name: string } {
  const i = repo.indexOf("/");
  return i === -1 ? { owner: "", name: repo } : { owner: repo.slice(0, i), name: repo.slice(i + 1) };
}

function buildContributorLeaderboard(members: MemberActivity[]): ContributorBar[] {
  return members
    .map((m) => {
      const counts: Record<string, number> = {};
      let score = 0;
      for (const e of m.events) {
        counts[e.type] = (counts[e.type] ?? 0) + 1;
        score += EVENT_WEIGHTS[e.type] ?? 1;
      }
      const breakdown = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, n]) => {
          const nouns = EVENT_NOUNS[type];
          return nouns ? `${n} ${n === 1 ? nouns[0] : nouns[1]}` : `${n} ${type.replace(/Event$/, "").toLowerCase()}`;
        })
        .join(" · ");
      return {
        slug: m.slug,
        name: m.name,
        username: m.username,
        url: m.githubUrl,
        score,
        count: m.events.length,
        breakdown: breakdown || "no recent public events",
      };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || b.score - a.score)
    .slice(0, 8);
}

type AnalysisProject = {
  repo: string; url: string; owner: string; activityScore: number; stars: number;
  language: string | null; eventSummary: string; contributors: string[];
  ownership: string; isFork: boolean;
};

export default function ActivityPage() {
  const data = activityData as { lastFetched: string | null; members: MemberActivity[] };
  const analysis = analysisData as { windowDays?: number; projects?: AnalysisProject[] };
  const members = data.members ?? [];

  const projects: ProjectBar[] = (analysis.projects ?? []).map((p) => {
    const { owner, name } = shortRepo(p.repo);
    return {
      repo: p.repo,
      owner: p.owner || owner,
      name,
      url: p.url,
      score: p.activityScore ?? 0,
      stars: p.stars ?? 0,
      language: p.language ?? null,
      eventSummary: p.eventSummary ?? "activity",
      contributors: p.contributors ?? [],
      ownership: p.ownership ?? "external",
      isFork: !!p.isFork,
    };
  });

  const contributors = buildContributorLeaderboard(members);

  const stats: ActivityStats = {
    activeRepos: projects.length,
    contributorsActive: members.filter((m) => m.events.length > 0).length,
    totalEvents: members.reduce((n, m) => n + m.events.length, 0),
    windowDays: analysis.windowDays ?? 90,
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Team GitHub Activity</h1>
          <p>Most active projects and contributors from the AMI Labs team — updated from public GitHub events.</p>
        </div>
      </div>

      <main className="actv-main">
        <ActivityCharts projects={projects} contributors={contributors} stats={stats} />
        <ActivityFeedClient members={members} lastFetched={data.lastFetched ?? null} />
      </main>
    </>
  );
}
