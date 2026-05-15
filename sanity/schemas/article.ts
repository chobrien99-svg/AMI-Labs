import { defineField, defineType } from "sanity";

export const article = defineType({
  name: "article",
  title: "Article",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "source",
      title: "Source",
      description: "Publication name (e.g. TechCrunch, Les Echos)",
      type: "string",
    }),
    defineField({
      name: "externalUrl",
      title: "External URL",
      description: "Link to the original article (leave empty for original content)",
      type: "url",
    }),
    defineField({
      name: "publishedAt",
      title: "Published At",
      type: "datetime",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      of: [
        {
          type: "string",
          options: {
            list: [
              { title: "Funding", value: "funding" },
              { title: "Research", value: "research" },
              { title: "Hiring", value: "hiring" },
              { title: "Administrative", value: "administrative" },
            ],
          },
        },
      ],
    }),
    defineField({
      name: "summary",
      title: "Summary",
      description: "Short description shown in the news list",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "reviewStatus",
      title: "Review Status",
      type: "string",
      options: {
        list: [
          { title: "Pending", value: "pending" },
          { title: "Approved", value: "approved" },
          { title: "Rejected", value: "rejected" },
        ],
      },
      initialValue: "approved",
    }),
    defineField({
      name: "score",
      title: "Relevance Score",
      description: "Auto-calculated 0–100 relevance score from the news bot",
      type: "number",
      validation: (r) => r.min(0).max(100),
    }),
    defineField({
      name: "coverImage",
      title: "Cover Image",
      type: "image",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          title: "Alt Text",
          type: "string",
        }),
      ],
    }),
    defineField({
      name: "body",
      title: "Body",
      description: "Full article content — supports rich text, images, video embeds, and PDF embeds",
      type: "array",
      of: [
        { type: "block" },
        {
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({ name: "alt", title: "Alt Text", type: "string" }),
            defineField({ name: "caption", title: "Caption", type: "string" }),
          ],
        },
        {
          type: "object",
          name: "videoEmbed",
          title: "Video Embed",
          fields: [
            defineField({
              name: "url",
              title: "Video URL",
              description: "YouTube, Vimeo, or any embeddable video URL",
              type: "url",
              validation: (r) => r.required(),
            }),
            defineField({
              name: "caption",
              title: "Caption",
              type: "string",
            }),
          ],
          preview: {
            select: { title: "url", subtitle: "caption" },
            prepare({ title, subtitle }) {
              return { title: subtitle || "Video", subtitle: title };
            },
          },
        },
        {
          type: "object",
          name: "pdfEmbed",
          title: "PDF Embed",
          fields: [
            defineField({
              name: "url",
              title: "PDF URL",
              description: "Path to a PDF in /documents/ (e.g. /documents/filename.pdf) or a full URL",
              type: "string",
              validation: (r) => r.required(),
            }),
            defineField({
              name: "caption",
              title: "Caption",
              type: "string",
            }),
          ],
          preview: {
            select: { title: "caption", subtitle: "url" },
            prepare({ title, subtitle }) {
              return { title: title || "PDF Document", subtitle };
            },
          },
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "source",
      media: "coverImage",
    },
  },
  orderings: [
    {
      title: "Published Date (newest first)",
      name: "publishedAtDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
  ],
});
