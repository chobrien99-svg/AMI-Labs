import newsData from "@/data/news.json";
import NewsPageClient from "@/components/NewsPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News — AMI Labs Intelligence Hub",
  description: "Latest news, funding announcements, and research updates about AMI Labs.",
};

export default function NewsPage() {
  return <NewsPageClient articles={newsData} />;
}
