import type { Metadata } from "next";
import ExplainersClient from "@/components/ExplainersClient";

export const metadata: Metadata = {
  title: "Explainers — AMI Labs Intelligence Hub",
  description:
    "What is AMI Labs? What are World Models? Learn about Advanced Machine Intelligence and the science behind it.",
};

export default function ExplainersPage() {
  return <ExplainersClient />;
}
