import newsData from "@/data/news.json";
import NewsPageClient from "@/components/NewsPageClient";
import { client } from "@/sanity/lib/client";
import { allArticlesQuery } from "@/sanity/lib/queries";
import imageUrlBuilder from "@sanity/image-url";
import type { Metadata } from "next";

const builder = imageUrlBuilder(client);
function coverUrl(image: unknown): string | undefined {
  try {
    return builder.image(image as Parameters<typeof builder.image>[0]).width(640).url();
  } catch {
    return undefined;
  }
}

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
  coverImage?: { asset?: Record<string, unknown>; alt?: string | null } | null;
};

export default async function NewsPage() {
  // Filter news.json: only show approved articles and legacy articles (no status field).
  // Pending/rejected articles are hidden until approved via /admin/review.
  const jsonArticles = (newsData as unknown as (Parameters<typeof NewsPageClient>[0]["articles"][number] & { status?: string })[])
    .filter((a) => !a.status || a.status === "approved");
  // Images are captured git-native into news.json; index them by URL so they can
  // fill a Sanity article that has no curated coverImage of its own.
  const jsonImageByUrl = new Map(jsonArticles.filter((a) => a.image).map((a) => [a.url, a.image]));

  let sanityArticles: Parameters<typeof NewsPageClient>[0]["articles"] = [];

  try {
    const fetched: SanityArticle[] = await client.fetch(allArticlesQuery, {}, { perspective: "published" });
    if (fetched?.length) {
      sanityArticles = fetched.map((a) => {
        const url = a.externalUrl ?? `/news/${a.slug.current}`;
        // Curated Sanity coverImage wins; otherwise use the git-native captured image.
        const image = (a.coverImage?.asset ? coverUrl(a.coverImage) : undefined) ?? jsonImageByUrl.get(url);
        return {
          id: a._id,
          title: a.title,
          source: a.source ?? "",
          url,
          publishedAt: a.publishedAt,
          summary: a.summary ?? "",
          tags: a.tags ?? [],
          addedAt: a.publishedAt,
          image,
        };
      });
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
