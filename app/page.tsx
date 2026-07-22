import newsData from "@/data/news.json";
import timelineData from "@/data/timeline.json";
import synthesisData from "@/data/synthesis.json";
import HomepageClient from "@/components/HomepageClient";
import type { Briefing } from "@/components/ObservatoryBriefing";
import { client } from "@/sanity/lib/client";
import { allArticlesQuery } from "@/sanity/lib/queries";

export const revalidate = 60;

type SanityArticle = {
  _id: string;
  title: string;
  slug: { current: string };
  source?: string;
  externalUrl?: string;
  publishedAt: string;
  summary?: string;
  tags?: string[];
};

export default async function Home() {
  // Filter news.json: only show approved articles and legacy articles (no status field).
  const jsonArticles = (newsData as unknown as {
    id: string;
    title: string;
    source: string;
    url: string;
    publishedAt: string;
    tags: string[];
    status?: string;
  }[]).filter((a) => !a.status || a.status === "approved");

  let sanityArticles: typeof jsonArticles = [];

  try {
    const fetched: SanityArticle[] = await client.fetch(allArticlesQuery, {}, { perspective: "published" });
    if (fetched?.length) {
      sanityArticles = fetched.map((a) => ({
        id: a._id,
        title: a.title,
        source: a.source ?? "",
        url: a.externalUrl ?? `/news/${a.slug.current}`,
        publishedAt: a.publishedAt,
        tags: a.tags ?? [],
      }));
    }
  } catch (err) {
    console.error("[page] Sanity fetch failed — falling back to news.json only:", err);
  }

  const sanityUrls = new Set(sanityArticles.map((a) => a.url));
  const dedupedJson = jsonArticles.filter((a) => !sanityUrls.has(a.url));
  const news = [...sanityArticles, ...dedupedJson].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return (
    <HomepageClient
      news={news}
      milestones={timelineData}
      briefing={synthesisData as unknown as Briefing}
    />
  );
}
