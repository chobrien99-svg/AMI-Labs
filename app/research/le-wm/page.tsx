import type { Metadata } from "next";
import LeWMClient from "@/components/LeWMClient";

export const metadata: Metadata = {
  title: "LeWorldModel — JEPA World Model | AMI Labs",
  description:
    "Interactive explainer for LeWorldModel: the first JEPA that trains stably end-to-end from raw pixels using only two loss terms, enabling 48× faster planning than foundation-model-based alternatives.",
};

export default function LeWMPage() {
  return <LeWMClient />;
}
