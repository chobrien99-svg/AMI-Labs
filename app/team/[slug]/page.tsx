import { notFound } from "next/navigation";
import teamData from "@/data/team.json";
import publicationsData from "@/data/publications.json";
import ProfileClient from "@/components/ProfileClient";
import type { Publication } from "@/components/ProfileClient";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return teamData.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const member = teamData.find((m) => m.slug === slug);
  if (!member) return {};
  return {
    title: `${member.name} — AMI Labs`,
    description: member.body,
  };
}

export default async function TeamProfilePage({ params }: Props) {
  const { slug } = await params;
  const member = teamData.find((m) => m.slug === slug);
  if (!member) notFound();
  const publications: Publication[] = (publicationsData as Record<string, Publication[]>)[slug] ?? [];
  return <ProfileClient member={member} publications={publications} />;
}
