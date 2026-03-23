import { defineField, defineType } from "sanity";

export const person = defineType({
  name: "person",
  title: "Person",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "role",
      title: "Role / Title",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "body",
      title: "Short Description",
      description: "One-line summary shown in cards and org chart tooltips",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "tags",
      title: "Tags",
      description: "Location, role type, etc. (e.g. Paris, Co-Founder)",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "reportsTo",
      title: "Reports To",
      description: "Manager / direct supervisor — used to build the org chart",
      type: "reference",
      to: [{ type: "person" }],
      options: { disableNew: true },
    }),
    defineField({
      name: "photo",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({ name: "alt", title: "Alt Text", type: "string" }),
      ],
    }),
    defineField({
      name: "biography",
      title: "Biography",
      description: "Full profile — supports rich text, headings, and links",
      type: "array",
      of: [
        { type: "block" },
      ],
    }),
    defineField({
      name: "careerHistory",
      title: "Career History",
      type: "array",
      of: [
        {
          type: "object",
          name: "careerEntry",
          fields: [
            defineField({ name: "org",   title: "Organisation", type: "string", validation: (r) => r.required() }),
            defineField({ name: "title", title: "Job Title",    type: "string", validation: (r) => r.required() }),
            defineField({ name: "years", title: "Years",        type: "string", description: "e.g. 2013–2025", validation: (r) => r.required() }),
          ],
          preview: {
            select: { title: "org", subtitle: "years" },
          },
        },
      ],
    }),
    defineField({
      name: "links",
      title: "Links",
      type: "object",
      fields: [
        defineField({ name: "linkedin", title: "LinkedIn",       type: "url" }),
        defineField({ name: "twitter",  title: "Twitter / X",    type: "url" }),
        defineField({ name: "scholar",  title: "Google Scholar", type: "url" }),
        defineField({ name: "github",   title: "GitHub",         type: "url" }),
        defineField({ name: "website",  title: "Personal Website", type: "url" }),
        defineField({ name: "bilibili", title: "Bilibili",       type: "url" }),
      ],
    }),
    defineField({
      name: "semanticScholarId",
      title: "Semantic Scholar ID",
      description: "Used to auto-fetch top publications by citation count",
      type: "string",
    }),
    defineField({
      name: "featuredPublications",
      title: "Featured Publications",
      description: "Manually curated papers — shown above the auto-fetched list",
      type: "array",
      of: [
        {
          type: "object",
          name: "publication",
          fields: [
            defineField({ name: "title",         title: "Title",        type: "string", validation: (r) => r.required() }),
            defineField({ name: "url",           title: "URL",          type: "url",    validation: (r) => r.required() }),
            defineField({ name: "year",          title: "Year",         type: "number" }),
            defineField({ name: "venue",         title: "Venue / Journal", type: "string" }),
            defineField({ name: "citationCount", title: "Citation Count",  type: "number" }),
            defineField({ name: "note",          title: "Editorial Note",  type: "string", description: "e.g. 'Core JEPA paper'" }),
          ],
          preview: {
            select: { title: "title", subtitle: "venue" },
          },
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "role",
      media: "photo",
    },
  },
  orderings: [
    {
      title: "Name (A–Z)",
      name: "nameAsc",
      by: [{ field: "name", direction: "asc" }],
    },
  ],
});
