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
    department,
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
    department,
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
  *[_type == "article" && !(_id in path("drafts.**")) && (reviewStatus == "approved" || !defined(reviewStatus))] | order(publishedAt desc) {
    _id,
    title,
    slug,
    source,
    externalUrl,
    publishedAt,
    summary,
    tags,
    "people": people[]->{ "slug": slug.current, name },
    coverImage { asset->, alt },
  }
`;

export const pendingArticlesQuery = groq`
  *[_type == "article" && !(_id in path("drafts.**")) && reviewStatus == "pending"] | order(score desc, publishedAt desc) {
    _id,
    title,
    slug,
    source,
    externalUrl,
    publishedAt,
    summary,
    tags,
    score,
    reviewStatus,
  }
`;

// ── RESEARCH HIGHLIGHTS ───────────────────────────────────────────────────────

export const researchHighlightsQuery = groq`
  *[_type == "researchHighlight" && !(_id in path("drafts.**")) && (reviewStatus == "approved" || !defined(reviewStatus))] | order(pinned desc, publishedAt desc) {
    _id,
    title,
    "slug": slug.current,
    paperUrl,
    matchId,
    venue,
    publishedAt,
    summary,
    pinned,
    "contributors": contributors[]{
      contribution,
      "slug": person->slug.current,
      "name": person->name
    },
    whyItMatters[] {
      ...,
      _type == "image" => { asset->, alt, caption },
    }
  }
`;

export const researchHighlightBySlugQuery = groq`
  *[_type == "researchHighlight" && !(_id in path("drafts.**")) && slug.current == $slug && (reviewStatus == "approved" || !defined(reviewStatus))][0] {
    _id,
    title,
    "slug": slug.current,
    paperUrl,
    matchId,
    venue,
    publishedAt,
    summary,
    pinned,
    "contributors": contributors[]{
      contribution,
      "slug": person->slug.current,
      "name": person->name
    },
    whyItMatters[] {
      ...,
      _type == "image" => { asset->, alt, caption },
    }
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
    "people": people[]->{ "slug": slug.current, name },
    coverImage { asset->, alt },
    body[] {
      ...,
      _type == "image" => { asset->, alt, caption },
    }
  }
`;
