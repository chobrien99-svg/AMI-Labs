import { groq } from "next-sanity";

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
