import { groq } from "next-sanity";

// ── PERSONS ─────────────────────────────────────────────────────────────────

export const allPersonsQuery = groq`
  *[_type == "person" && !(_id in path("drafts.**"))] | order(name asc) {
    _id,
    name,
    slug,
    role,
    body,
    tags,
    reportsTo->{ slug },
    photo { asset->, alt },
    links,
    semanticScholarId,
  }
`;

export const personBySlugQuery = groq`
  *[_type == "person" && !(_id in path("drafts.**")) && slug.current == $slug][0] {
    _id,
    name,
    slug,
    role,
    body,
    tags,
    reportsTo->{ slug },
    photo { asset->, alt },
    biography,
    careerHistory,
    links,
    semanticScholarId,
    featuredPublications,
  }
`;

// ── ARTICLES ─────────────────────────────────────────────────────────────────


export const allArticlesQuery = groq`
  *[_type == "article" && !(_id in path("drafts.**"))] | order(publishedAt desc) {
    _id,
    title,
    slug,
    source,
    externalUrl,
    publishedAt,
    summary,
    tags,
    coverImage { asset->, alt },
  }
`;

export const articleBySlugQuery = groq`
  *[_type == "article" && !(_id in path("drafts.**")) && slug.current == $slug][0] {
    _id,
    title,
    slug,
    source,
    externalUrl,
    publishedAt,
    summary,
    tags,
    coverImage { asset->, alt },
    body[] {
      ...,
      _type == "image" => { asset->, alt, caption },
    }
  }
`;
