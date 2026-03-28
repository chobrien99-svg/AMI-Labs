import teamData from "@/data/team.json";
import OrgChartClient from "@/components/OrgChartClient";
import { client } from "@/sanity/lib/client";
import { allPersonsQuery } from "@/sanity/lib/queries";
import type { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Org Chart — AMI Labs Intelligence Hub",
  description: "Interactive organizational chart for AMI Labs team.",
};

type SanityPerson = {
  _id: string;
  name: string;
  slug: { current: string };
  role: string;
  reportsTo?: { slug: { current: string } } | null;
};

export default async function OrgChartPage() {
  let team: { slug: string; name: string; role: string; reportsTo: string | null }[] =
    teamData.map((m) => ({ slug: m.slug, name: m.name, role: m.role, reportsTo: m.reportsTo }));

  try {
    const persons: SanityPerson[] = await client.fetch(allPersonsQuery, {}, { perspective: "published" });
    if (persons?.length) {
      const sanityMap = new Map(
        persons.map((p) => [p.slug.current, {
          slug: p.slug.current,
          name: p.name,
          role: p.role,
          reportsTo: p.reportsTo?.slug?.current ?? null,
        }])
      );
      // Override static entries with Sanity data where a match exists, add new Sanity-only entries
      team = [
        ...team.map((m) => sanityMap.get(m.slug) ?? m),
        ...persons
          .filter((p) => !team.some((m) => m.slug === p.slug.current))
          .map((p) => ({
            slug: p.slug.current,
            name: p.name,
            role: p.role,
            reportsTo: p.reportsTo?.slug?.current ?? null,
          })),
      ];
    }
  } catch (err) {
    console.error("[org-chart] Sanity fetch failed — falling back to team.json:", err);
  }

  return <OrgChartClient team={team} />;
}
