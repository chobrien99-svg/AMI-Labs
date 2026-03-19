import newsData from "@/data/news.json";
import timelineData from "@/data/timeline.json";
import HomepageClient from "@/components/HomepageClient";

export default function Home() {
  return (
    <HomepageClient
      news={newsData}
      milestones={timelineData}
    />
  );
}
