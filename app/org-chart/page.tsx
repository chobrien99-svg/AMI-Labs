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
  body?: string;
  tags?: string[];
  reportsTo?: { slug: { current: string } } | null;
};

export type Member = {
  slug: string;
  name: string;
  role: string;
  reportsTo: string | null;
  body: string;
  location: string;
  tenure: string;
};

const TENURE_TAGS = new Set(["Co-Founder", "Founding team", "Founding Team"]);

function extractLocationAndTenure(tags: string[] | undefined): { location: string; tenure: string } {
  if (!tags || !tags.length) return { location: "", tenure: "" };
  let location = "";
  let tenure = "";
  for (const t of tags) {
    if (TENURE_TAGS.has(t)) {
      if (!tenure) tenure = t === "Founding Team" ? "Founding team" : t;
    } else if (!location) {
      location = t;
    }
  }
  return { location, tenure };
}

export default async function OrgChartPage() {
  let team: Member[] = teamData.map((m) => {
    const { location, tenure } = extractLocationAndTenure(m.tags);
    return {
      slug: m.slug,
      name: m.name,
      role: m.role,
      reportsTo: m.reportsTo,
      body: m.body || "",
      location,
      tenure,
    };
  });

  try {
    const persons: SanityPerson[] = await client.fetch(allPersonsQuery, {}, { perspective: "published" });
    if (persons?.length) {
      const sanityMap = new Map(
        persons.map((p) => {
          const { location, tenure } = extractLocationAndTenure(p.tags);
          return [p.slug.current, {
            slug: p.slug.current,
            name: p.name,
            role: p.role,
            reportsTo: p.reportsTo?.slug?.current ?? null,
            body: typeof p.body === "string" ? p.body : "",
            location,
            tenure,
          }];
        })
      );
      team = [
        ...team.map((m) => sanityMap.get(m.slug) ?? m),
        ...persons
          .filter((p) => !team.some((m) => m.slug === p.slug.current))
          .map((p) => {
            const { location, tenure } = extractLocationAndTenure(p.tags);
            return {
              slug: p.slug.current,
              name: p.name,
              role: p.role,
              reportsTo: p.reportsTo?.slug?.current ?? null,
              body: typeof p.body === "string" ? p.body : "",
              location,
              tenure,
            };
          }),
      ];
    }
  } catch (err) {
    console.error("[org-chart] Sanity fetch failed — falling back to team.json:", err);
  }

  return <OrgChartClient team={team} />;
}
