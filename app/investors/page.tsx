import type { Metadata } from "next";
import investorsData from "@/data/investors.json";
import teamData from "@/data/team.json";
import ExplorerClient from "@/components/ExplorerClient";

export const metadata: Metadata = {
  title: "Investors — AMI Labs Intelligence Hub",
  description:
    "Explore AMI Labs' investors and strategic partners — corporate backers, venture capital firms, and business angels behind the $1.03B seed round.",
};

export default function InvestorsPage() {
  return <ExplorerClient investors={investorsData} team={teamData} />;
}
