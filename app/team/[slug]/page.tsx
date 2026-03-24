import { notFound } from "next/navigation";
import teamData from "@/data/team.json";
import publicationsData from "@/data/publications.json";
import ProfileClient from "@/components/ProfileClient";
import type { Publication } from "@/components/ProfileClient";
import { client } from "@/sanity/lib/client";
import { allPersonsQuery, personBySlugQuery } from "@/sanity/lib/queries";
import type { PortableTextBlock } from "@portabletext/react";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

type SanityPerson = {
  _id: string;
  name: string;
  slug: { current: string };
  role: string;
  body?: string;
  tags?: string[];
  reportsTo?: { slug: { current: string } } | null;
  photo?: { asset: Record<string, unknown>; alt?: string | null } | null;
  biography?: PortableTextBlock[];
  careerHistory?: { org: string; title: string; years: string }[];
  links?: {
    linkedin?: string;
    twitter?: string;
    scholar?: string;
    github?: string;
    website?: string;
    bilibili?: string;
  };
  semanticScholarId?: string | null;
  featuredPublications?: Publication[];
};

export async function generateStaticParams() {
  try {
    const persons: SanityPerson[] = await client.fetch(allPersonsQuery);
    if (persons?.length) return persons.map((p) => ({ slug: p.slug.current }));
  } catch { /* fall through */ }
  return teamData.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const person: SanityPerson | null = await client.fetch(personBySlugQuery, { slug });
    if (person) return { title: `${person.name} — AMI Labs`, description: person.body };
  } catch { /* fall through */ }
  const member = teamData.find((m) => m.slug === slug);
  if (!member) return {};
  return { title: `${member.name} — AMI Labs`, description: member.body };
}

export default async function TeamProfilePage({ params }: Props) {
  const { slug } = await params;

  // Try Sanity first
  try {
    const person: SanityPerson | null = await client.fetch(personBySlugQuery, { slug });
    if (person) {
      const autoPubs: Publication[] =
        (publicationsData as Record<string, Publication[]>)[slug] ?? [];
      return (
        <ProfileClient
          member={{
            slug: person.slug.current,
            name: person.name,
            role: person.role,
            body: person.body ?? "",
            tags: person.tags ?? [],
            biography: null,
            biographyPortable: person.biography ?? null,
            careerHistory: person.careerHistory ?? [],
            links: person.links ?? {},
            semanticScholarId: person.semanticScholarId ?? null,
          }}
          publications={autoPubs}
          featuredPublications={person.featuredPublications ?? []}
        />
      );
    }
  } catch { /* fall through to JSON */ }

  // Fall back to team.json
  const member = teamData.find((m) => m.slug === slug);
  if (!member) notFound();
  const publications: Publication[] =
    (publicationsData as Record<string, Publication[]>)[slug] ?? [];
  return (
    <ProfileClient
      member={{
        ...member,
        biography: member.biography ?? null,
        biographyPortable: null,
      }}
      publications={publications}
      featuredPublications={[]}
    />
  );
}
