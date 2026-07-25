# Adding a notable article (and attaching it to people)

How to hand-add a research paper or news item so it shows on the site **and** flows into
the per-person dossiers and the periodic report — attached to the right people.

## 1. Create the article in Sanity Studio

Open the Studio → **Article** → **Create new**, and fill:

| Field | What to enter |
| --- | --- |
| **Title** *(required)* | The headline / paper title. |
| **Published At** *(required)* | The paper/news date. |
| **Source** | Publication or venue — e.g. "arXiv", "Nature", "TechCrunch". |
| **External URL** | The link to the paper/news item. *Leave empty only for original content authored on the site* — it then lives at `/news/<slug>`. |
| **Summary** | 1–3 sentences (shown in the news list, and used as a fallback for people detection). |
| **People** | **Pick the AMI people this is about.** Start typing a name and select the person. **This is the field that attaches the article to people in the dossiers/report.** |
| **Body** | Optional — full content for original pieces (rich text, images, video/PDF embeds). |
| **Review Status** | Defaults to **Approved**, which publishes it and lets it sync. Set to *Pending*/*Rejected* to withhold it from both the site and the report system. |

### About the People field
- **What you tag wins.** The people you select are authoritative and are used verbatim.
- **If you leave it empty**, the sync falls back to the same conservative full-name detector
  the news bot uses (matches full names in the title + summary). It's best-effort — explicit
  tagging is always preferred, especially for papers where the person isn't named in the title.
- Only people who exist in the roster (`data/team.json`, synced from Sanity persons) surface
  in dossiers; tagging someone not on the roster is harmless but won't appear there.

## 2. It syncs automatically

`scripts/export-sanity-news.js` pulls visible Sanity articles (with their `people` tags) into
`data/news.json`; `scripts/build-dossiers.js` then joins them into `data/people/<slug>.json`,
and `scripts/generate-report.js` reads those. All three run in the **Build Person Dossiers**
workflow (`.github/workflows/build-dossiers.yml`):

- **Automatically:** daily at 07:45 UTC.
- **Immediately:** trigger *Build Person Dossiers* from the Actions tab (`workflow_dispatch`).

After it runs, the article appears in each tagged person's dossier `news[]` and in the next
generated report's news section.

## 3. Editing later
Re-tagging people (or editing the title/summary) in the Studio propagates on the next sync —
the article is matched by its Sanity id, so its `people` (and, for sync-owned rows, the
Sanity-sourced fields) refresh without creating a duplicate. Changing **Review Status** to
*Rejected* removes it from the site and stops it refreshing (its existing `news.json` row is
left in place; deletion isn't automatic).

## Verify a change end-to-end
```
node scripts/export-sanity-news.js        # needs network + (optional) SANITY_API_READ_TOKEN
git diff data/news.json                    # shows the appended/refreshed row(s)
node scripts/build-dossiers.js
# → data/people/<slug>.json "news" now lists the article
node scripts/generate-report.js
# → the article appears in data/report.json news.notable / news.aboutPeople (within the window)
```
Offline, the sync fails safe: it refuses to touch `news.json` if Sanity can't be read.
