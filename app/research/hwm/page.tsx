import type { Metadata } from "next";
import LeHWMClient from "@/components/LeHWMClient";

export const metadata: Metadata = {
  title: "HWM — Hierarchical Planning with Latent World Models | AMI Labs",
  description:
    "Interactive explainer for HWM: hierarchical planning across two latent world models, lifting real-robot pick-&-place from 0% to 70% on a single goal image while using up to 4× less compute than flat planners.",
};

export default function HWMPage() {
  return <LeHWMClient />;
}
