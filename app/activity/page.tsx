import activityData from "@/data/github-activity.json";
import ActivityFeedClient from "@/components/ActivityFeedClient";
import type { MemberActivity } from "@/components/ActivityFeedClient";

export const metadata = {
  title: "GitHub Activity — AMI Labs",
  description: "Recent public GitHub activity from the AMI Labs team.",
};

export default function ActivityPage() {
  const data = activityData as { lastFetched: string | null; members: MemberActivity[] };
  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Team GitHub Activity</h1>
          <p>Recent public activity from AMI Labs researchers</p>
        </div>
      </div>
      <ActivityFeedClient members={data.members ?? []} lastFetched={data.lastFetched ?? null} />
    </>
  );
}
