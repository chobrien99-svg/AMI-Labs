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
  const jsonArticles = newsData as unknown as Parameters<typeof NewsPageClient>[0]["articles"];

  let sanityArticles: Parameters<typeof NewsPageClient>[0]["articles"] = [];

  try {
    const fetched: SanityArticle[] = await client.fetch(allArticlesQuery, {}, { perspective: "published" });
    if (fetched?.length) {
      sanityArticles = fetched.map((a) => ({
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
    console.error("[news/page] Sanity fetch failed — falling back to news.json only:", err);
  }

  // Merge: Sanity articles take priority; exclude any JSON articles whose URL
  // matches a Sanity article (avoids duplicates if the workflow ever writes both)
  const sanityUrls = new Set(sanityArticles.map((a) => a.url));
  const dedupedJson = jsonArticles.filter((a) => !sanityUrls.has(a.url));
  const articles = [...sanityArticles, ...dedupedJson];

  return <NewsPageClient articles={articles} />;
}
