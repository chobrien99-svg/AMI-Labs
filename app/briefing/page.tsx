import type { Metadata } from "next";
import synthesisData from "@/data/synthesis.json";
import ObservatoryBriefing, { type Briefing } from "@/components/ObservatoryBriefing";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Observatory Briefing — AMI Labs Intelligence Hub",
  description:
    "The week in AMI Labs, synthesised: what the latest news, hiring, research, and filings mean — a briefing by The French Tech Journal.",
};

export default function BriefingPage() {
  const briefing = synthesisData as unknown as Briefing;

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Observatory Briefing</h1>
          <p>The week in AMI Labs, drawn together — what the signals mean.</p>
        </div>
      </div>

      <main>
        <ObservatoryBriefing briefing={briefing} variant="full" />
      </main>
    </>
  );
}
