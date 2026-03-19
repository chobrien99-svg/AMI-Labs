import type { Metadata } from "next";
import docsData from "@/data/documents.json";
import DocsClient from "@/components/DocsClient";

export const metadata: Metadata = {
  title: "Documents — AMI Labs Intelligence Hub",
  description:
    "Official AMI Labs documents — pitchdeck, reports, and public filings.",
};

export default function DocsPage() {
  return <DocsClient documents={docsData} />;
}
