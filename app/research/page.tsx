import type { Metadata } from "next";
import researchData from "@/data/research.json";
import synthesisData from "@/data/synthesis.json";
import ResearchClient, {
  normalizeUrl,
  type ResearchPaper,
  type ResearchHighlight,
} from "@/components/ResearchClient";
import type { Briefing } from "@/components/ObservatoryBriefing";
import { stripBriefingScaffolding } from "@/scripts/lib/strip-scaffolding";
import { client } from "@/sanity/lib/client";
import { researchHighlightsQuery } from "@/sanity/lib/queries";

export const revalidate = 60;

const FEED_CAP = 40;

export const metadata: Metadata = {
  title: "Research — AMI Labs Intelligence Hub",
  description:
    "The latest papers from the AMI Labs team, with plain-language analysis of what each one is and why it matters — tracked by The French Tech Journal.",
};

// A feed paper is "covered" by a highlight when they refer to the same paper, so we
// don't render both the plain auto-row and the curated highlight. Match by matchId
// (arXiv id or Semantic Scholar paperId, substring-tolerant of the feed's DOI form)
// or by canonical URL.
function isCoveredByHighlight(p: ResearchPaper, highlights: ResearchHighlight[]): boolean {
  const pUrlKey = normalizeUrl(p.url);
  const pUrlLower = (p.url ?? "").toLowerCase();
  return highlights.some((h) => {
    const id = (h.matchId ?? "").trim().toLowerCase();
    if (id && (p.paperId === h.matchId || pUrlLower.includes(id))) return true;
    const hKey = normalizeUrl(h.paperUrl);
    return !!hKey && hKey === pUrlKey;
  });
}

export default async function ResearchPage() {
  let highlights: ResearchHighlight[] = [];
  try {
    const fetched = await client.fetch<ResearchHighlight[]>(
      researchHighlightsQuery,
      {},
      { perspective: "published" }
    );
    if (fetched?.length) highlights = fetched;
  } catch {
    // Sanity unreachable — fall back to the auto-feed only.
  }

  const allPapers = (researchData as { papers?: ResearchPaper[] }).papers ?? [];
  const papers = allPapers.filter((p) => !isCoveredByHighlight(p, highlights)).slice(0, FEED_CAP);

  // Attach the synthesis's "why it matters" notes to papers.
  //
  // A briefing thread's `evidence` is "sources that support this thread's
  // argument", not "papers this narrative explains". So we only borrow a
  // thread's narrative for a paper when the thread is genuinely *about that one
  // paper* — i.e. it cites exactly one source and that source resolves to the
  // paper. Thematic threads that cite several papers (or cite a paper only as
  // tangential evidence) are left alone, so a paper never inherits a narrative
  // that isn't specifically about it, and the same narrative is never duplicated
  // across every paper a thread happens to touch. Any editorial scaffolding
  // (e.g. an "Administrative note: …" preamble) is stripped before display.
  const briefing = synthesisData as unknown as Briefing;
  const notesByUrl: Record<string, string> = {};
  for (const thread of briefing.threads ?? []) {
    if (thread.category !== "research" || !thread.narrative) continue;
    const evidence = thread.evidence ?? [];
    if (evidence.length !== 1) continue;
    const key = normalizeUrl(evidence[0].url);
    if (!key || notesByUrl[key]) continue;
    const note = stripBriefingScaffolding(thread.narrative);
    if (note) notesByUrl[key] = note;
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Research</h1>
          <p>The team&apos;s latest papers — and what they mean.</p>
        </div>
      </div>

      <ResearchClient papers={papers} highlights={highlights} notesByUrl={notesByUrl} />
    </>
  );
}
