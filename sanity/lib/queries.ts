import { groq } from "next-sanity";

// ── PERSONS ─────────────────────────────────────────────────────────────────

export const allPersonsQuery = groq`
  *[_type == "person"] | order(name asc) {
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
  *[_type == "person" && slug.current == $slug][0] {
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
  *[_type == "article"] | order(publishedAt desc) {
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
  *[_type == "article" && slug.current == $slug][0] {
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
