import teamData from "@/data/team.json";
import OrgChartClient from "@/components/OrgChartClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Org Chart — AMI Labs Intelligence Hub",
  description: "Interactive organizational chart for AMI Labs team.",
};

export default function OrgChartPage() {
  return <OrgChartClient team={teamData} />;
}
