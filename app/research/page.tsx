import type { Metadata } from "next";
import researchData from "@/data/research.json";
import synthesisData from "@/data/synthesis.json";
import ResearchClient, { normalizeUrl, type ResearchPaper } from "@/components/ResearchClient";
import type { Briefing } from "@/components/ObservatoryBriefing";

export const revalidate = 60;

const FEED_CAP = 40;

export const metadata: Metadata = {
  title: "Research — AMI Labs Intelligence Hub",
  description:
    "The latest papers from the AMI Labs team, with plain-language analysis of what each one is and why it matters — tracked by The French Tech Journal.",
};

export default function ResearchPage() {
  const papers = ((researchData as { papers?: ResearchPaper[] }).papers ?? []).slice(0, FEED_CAP);

  // Attach the synthesis's "why it matters" notes to papers by matching evidence URLs.
  const briefing = synthesisData as unknown as Briefing;
  const notesByUrl: Record<string, string> = {};
  for (const thread of briefing.threads ?? []) {
    if (thread.category !== "research" || !thread.narrative) continue;
    for (const e of thread.evidence ?? []) {
      const key = normalizeUrl(e.url);
      if (key && !notesByUrl[key]) notesByUrl[key] = thread.narrative;
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Research</h1>
          <p>The team&apos;s latest papers — and what they mean.</p>
        </div>
      </div>

      <ResearchClient papers={papers} notesByUrl={notesByUrl} />
    </>
  );
}
