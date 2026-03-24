import newsData from "@/data/news.json";
import NewsPageClient from "@/components/NewsPageClient";
import { client } from "@/sanity/lib/client";
import { allArticlesQuery } from "@/sanity/lib/queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News — AMI Labs Intelligence Hub",
  description: "Latest news, funding announcements, and research updates about AMI Labs.",
};

export const revalidate = 60; // revalidate every 60 seconds

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

export default async function NewsPage() {
  let articles = newsData as unknown as Parameters<typeof NewsPageClient>[0]["articles"];

  try {
    const sanityArticles: SanityArticle[] = await client.fetch(allArticlesQuery);
    if (sanityArticles && sanityArticles.length > 0) {
      articles = sanityArticles.map((a) => ({
        id: a._id,
        title: a.title,
        source: a.source ?? "",
        url: a.externalUrl ?? `/news/${a.slug.current}`,
        publishedAt: a.publishedAt,
        summary: a.summary ?? "",
        tags: a.tags ?? [],
        addedAt: a.publishedAt,
      }));
    }
  } catch (err) {
    console.error("[news/page] Sanity fetch failed — falling back to news.json:", err);
  }

  return <NewsPageClient articles={articles} />;
}
