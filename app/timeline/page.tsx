import type { Metadata } from "next";
import timelineData from "@/data/timeline.json";
import TimelinePageClient from "@/components/TimelinePageClient";

export const metadata: Metadata = {
  title: "Timeline — AMI Labs Intelligence Hub",
  description:
    "Key milestones in AMI Labs history — from founding in Paris to the $1.03B seed round and beyond.",
};

export default function TimelinePage() {
  return <TimelinePageClient milestones={timelineData} />;
}
