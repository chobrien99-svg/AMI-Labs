import investorsData from "@/data/investors.json";
import teamData from "@/data/team.json";
import ExplorerClient from "@/components/ExplorerClient";

export default function Home() {
  return (
    <ExplorerClient
      investors={investorsData}
      team={teamData}
    />
  );
}
