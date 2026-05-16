import teamData from "@/data/team.json";
import TeamGridClient from "@/components/TeamGridClient";
import { client } from "@/sanity/lib/client";
import { allPersonsQuery } from "@/sanity/lib/queries";
import type { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Team — AMI Labs Intelligence Hub",
  description: "Meet the AMI Labs team — founders, researchers, and engineers building advanced machine intelligence.",
};

type SanityPerson = {
  _id: string;
  name: string;
  slug: { current: string };
  role: string;
  body?: string;
  tags?: string[];
  department?: string;
  reportsTo?: { slug: { current: string } } | null;
  photo?: { asset: Record<string, unknown>; alt?: string | null } | null;
  links?: Record<string, string | undefined>;
};

export type TeamMember = {
  slug: string;
  name: string;
  role: string;
  body: string;
  tags: string[];
  department?: string;
  links: Record<string, string | undefined>;
};

export default async function TeamPage() {
  let team: TeamMember[] = teamData.map((m) => ({
    slug: m.slug,
    name: m.name,
    role: m.role,
    body: m.body || "",
    tags: m.tags || [],
    links: m.links || {},
  }));

  try {
    const persons: SanityPerson[] = await client.fetch(allPersonsQuery, {}, { perspective: "published" });
    if (persons?.length) {
      const sanityMap = new Map(
        persons.map((p) => [p.slug.current, {
          slug: p.slug.current,
          name: p.name,
          role: p.role,
          body: typeof p.body === "string" ? p.body : "",
          tags: p.tags ?? [],
          department: p.department,
          links: p.links ?? {},
        }])
      );
      team = [
        ...team.map((m) => sanityMap.get(m.slug) ?? m),
        ...persons
          .filter((p) => !team.some((m) => m.slug === p.slug.current))
          .map((p) => ({
            slug: p.slug.current,
            name: p.name,
            role: p.role,
            body: typeof p.body === "string" ? p.body : "",
            tags: p.tags ?? [],
            department: p.department,
            links: p.links ?? {},
          })),
      ];
    }
  } catch (err) {
    console.error("[team] Sanity fetch failed — falling back to team.json:", err);
  }

  return <TeamGridClient team={team} />;
}
