import teamData from "@/data/team.json";
import TeamGridClient from "@/components/TeamGridClient";
import { client } from "@/sanity/lib/client";
import { allPersonsQuery } from "@/sanity/lib/queries";
import imageUrlBuilder from "@sanity/image-url";
import type { Metadata } from "next";

const builder = imageUrlBuilder(client);
// Build a square portrait URL from a Sanity image; null on any malformed source.
function portraitUrl(photo: unknown): string | undefined {
  try {
    return builder
      .image(photo as Parameters<typeof builder.image>[0])
      .width(240).height(240).fit("crop").url();
  } catch {
    return undefined;
  }
}

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
  image?: string; // portrait URL (git-native /team/<slug>.jpg or a Sanity photo)
};

export default async function TeamPage() {
  let team: TeamMember[] = teamData.map((m) => ({
    slug: m.slug,
    name: m.name,
    role: m.role,
    body: m.body || "",
    tags: m.tags || [],
    links: m.links || {},
    image: (m as { image?: string }).image || undefined,
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
          image: p.photo?.asset ? portraitUrl(p.photo) : undefined,
        }])
      );
      team = [
        // Prefer Sanity content, but keep a JSON-provided portrait if Sanity has none.
        ...team.map((m) => {
          const s = sanityMap.get(m.slug);
          return s ? { ...s, image: s.image ?? m.image } : m;
        }),
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
            image: p.photo?.asset ? portraitUrl(p.photo) : undefined,
          })),
      ];
    }
  } catch (err) {
    console.error("[team] Sanity fetch failed — falling back to team.json:", err);
  }

  return <TeamGridClient team={team} />;
}
