# Founder & team portraits

Drop portrait image files in this folder, then point the member at the file by adding an
`image` field in `data/team.json`, e.g.:

```json
{
  "slug": "yann-lecun",
  "name": "Yann LeCun",
  "image": "/team/yann-lecun.jpg",
  ...
}
```

(Alternatively, upload a `photo` on the person in Sanity Studio — the team page reads that too
and prefers it over the JSON path.)

If no image is set, or the file is missing, the page shows a typographic monogram (initials) —
so it always looks intentional.

## Portrait spec

- **Aspect ratio:** 4:5 (vertical). The frame crops to this ratio; you don't have to pre-crop exactly.
- **Master file:** 1200 × 1500 px (minimum 800 × 1000 px).
- **Format:** WebP or AVIF preferred, JPEG fallback. Target ~100–250 KB each.
- **Crop:** mid-chest up, eyes ~35–40% from the top, face near the horizontal centre.
- **Treatment:** the page applies a monochrome/duotone filter automatically, so mixed sources
  still read as one coherent set. No need to desaturate before uploading.
- **Consistency:** keep camera distance, shoulder scale, and lighting similar across the six founders.

## Fine-tuning the crop

The default focal point is `object-position: center 25%`. If a specific portrait sits too high or
low in its frame, adjust that portrait individually rather than re-exporting — ask and it can be
wired per-member.
