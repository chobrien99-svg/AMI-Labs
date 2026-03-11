import { notFound } from "next/navigation";
import teamData from "@/data/team.json";
import ProfileClient from "@/components/ProfileClient";

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
  return <ProfileClient member={member} />;
}
