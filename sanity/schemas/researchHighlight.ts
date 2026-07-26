import { defineField, defineType } from "sanity";

// A manually curated, featured research paper for the /research page. Unlike the
// auto-fetched Semantic Scholar feed, a highlight carries an editorial write-up
// (whyItMatters) and explicit per-author contribution notes linked to AMI people.
export const researchHighlight = defineType({
  name: "researchHighlight",
  title: "Research Highlight",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      description: "The paper's title",
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
      name: "paperUrl",
      title: "Paper URL",
      description: "Link to the paper (arXiv / DOI). The highlight title links here.",
      type: "url",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "matchId",
      title: "Match ID (arXiv id or Semantic Scholar paperId)",
      description:
        "Optional. If this paper is also in the auto-fetched feed, put its arXiv id (e.g. 2602.07050) or Semantic Scholar paperId here so the plain auto-row collapses into this highlight instead of showing twice.",
      type: "string",
    }),
    defineField({
      name: "venue",
      title: "Venue",
      description: "e.g. \"arXiv · Meta (FAIR)\"",
      type: "string",
    }),
    defineField({
      name: "publishedAt",
      title: "Published At",
      type: "datetime",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "summary",
      title: "Summary",
      description: "Short blurb shown on the highlight card",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "contributors",
      title: "Contributors",
      description:
        "AMI people who authored this paper, with a note on each one's contribution. Links to their profile.",
      type: "array",
      of: [
        {
          type: "object",
          name: "contributor",
          fields: [
            defineField({
              name: "person",
              title: "Person",
              type: "reference",
              to: [{ type: "person" }],
              validation: (r) => r.required(),
            }),
            defineField({
              name: "contribution",
              title: "Contribution",
              description: "e.g. \"Co-author; later joined AMI as MTS\"",
              type: "string",
            }),
          ],
          preview: {
            select: { title: "person.name", subtitle: "contribution" },
          },
        },
      ],
    }),
    defineField({
      name: "whyItMatters",
      title: "Why It Matters",
      description: "Editorial write-up — supports rich text, images, video embeds, and PDF embeds",
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
            defineField({ name: "caption", title: "Caption", type: "string" }),
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
            defineField({ name: "caption", title: "Caption", type: "string" }),
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
    defineField({
      name: "pinned",
      title: "Pinned",
      description: "Show at the top of the Research page",
      type: "boolean",
      initialValue: true,
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
  ],
  preview: {
    select: { title: "title", subtitle: "venue" },
  },
  orderings: [
    {
      title: "Published Date (newest first)",
      name: "publishedAtDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
  ],
});
