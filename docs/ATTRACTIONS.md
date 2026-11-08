# Attractions section

The /attractions section lists NYC attractions with facts read from each attraction's official site. It is additive: it changes no existing page, URL or sitemap entry, and adds one main-nav link ("Attractions") only while attraction pages exist.

## Status (Nov 8, 2026)

54 attractions are approved and live. On Nov 8, official pages were read for the 4 that had been held and for backlog records: 15 records gained facts, and 5 new attractions were added (Museum of the Moving Image, Children's Museum of Manhattan, Brooklyn Children's Museum, MoMath, Louis Armstrong House Museum), each field marked "official page, read 2026-11-08". Still held: `new-york-historical`, whose official site blocks automated reads (no price captured). Sites that block automated reads or render their hours in JavaScript (the Morgan, the Guggenheim, New Museum, RiseNY, Museum of Sex) stay in the backlog.

## Files

| File | What it is |
|---|---|
| `site/src/data/nyc_attractions.json` | The single source of truth: `metadata` plus 118 `records` (data drop v7, Nov 7, 2026). |
| `site/src/data/attractions-approved.json` | Pages the owner approved after reviewing the rendered page, each with the record as approved (`snapshot`). Starts empty. |
| `site/src/lib/attractions.ts` | Which pages render, derived categories, review queue, happy-hour join. |
| `site/src/pages/attractions/[...path].astro` | Hub, category pages and detail pages. |
| `site/src/components/AttractionCard.astro` | The card on the hub and category pages. |
| `site/scripts/attractions-approve.mjs` | Approves ids (writes the snapshot). |
| `site/scripts/attractions-report.mjs` | Readiness report per candidate and the review queue. |

## Schema

Every record has `id, name, category, borough, neighborhood`, the facts `address, phone, hours_recurring, hours_observed, price_summary`, each with a `*_source`, plus `price_flag` (free / paid / public-space / unknown), `official_url`, `ticket_url`, `lat, lon, coords_source`, `description` (original one-sentence summary), `record_tier`, `launch_candidate`, `indoor_outdoor` + `indoor_outdoor_basis`, `booking_required` + `booking_source`, `good_for_kids`, `typical_visit_duration`, `accessibility` + `accessibility_source`, `source_urls`, `verified_at`, `notes`.

Categories, boroughs and counts on the pages are computed from the records. No category name or count is hardcoded. A category slug is the category name slugified (`Museums - Art` → `museums-art`). The build fails if a slug ever equals an attraction id.

## Tiers and candidacy

- **enriched**: official page read; address plus hours and/or price captured.
- **confirmed**: official page read; some facts captured.
- **confirmed-thin**: official site reached and title-matched; too thin (JS/cookie walls) to capture facts.
- **backlog-listing**, **backlog-wiki-crosschecked**, **backlog-discovery**: no official facts yet.
- **launch_candidate = "yes"**: an official page read with a street address and either recurring weekly hours or a price.

A candidate is not an approved page. Which pages render:

1. **Approved ids** (`attractions-approved.json`). This is the only path to production.
2. **Local review builds only**: `YAY_ATTR_PREVIEW=1` also renders every candidate, so the owner can review the pages before approving them.

A production build with no approvals renders no attraction page, no nav link and no sitemap entry. The other records are an enrichment backlog: no pages, no sitemap entries, no internal links.

```sh
# local review build of every candidate
cd site && YAY_ATTR_PREVIEW=1 YAY_FIXTURE=1 npx astro build
# approve after review
node scripts/attractions-approve.mjs met-museum moma whitney
# readiness report and review queue
node scripts/attractions-report.mjs ../docs/attractions-readiness.md
```

## Provenance conventions

- `address`, `phone` and `price_summary` come only from pages actually read. Blank means not captured: the page shows a "See the official site" link, never filler.
- `hours_recurring` is a stated weekly schedule and the only field shown as a schedule. `hours_observed` is a dated snapshot. It always renders with its date ("Observed on Nov 7, 2026: ... Confirm today's hours") and is never presented as the standing weekly schedule.
- Each fact row shows its own "Checked <verified_at>" label.
- `lat/lon` come from the Wikipedia API (`coords_source`) and are a **secondary cross-check**. They only position the map, captioned "Approximate position". They are never presented as official. Coordinates outside the five-borough box are ignored (no map) and flagged in the readiness report. One known case: `american-indian` has Washington, DC coordinates, the museum's DC building.
- `indoor_outdoor` is **inferred from venue type/category**, not read per site. It is not shown on any page or used as a filter until each value is grounded in a source.
- `booking_required` is shown only where an official page grounds it ("yes"). `accessibility` is shown only where an official page grounds it; blank shows the official-site link. `good_for_kids` and `typical_visit_duration` are unknown everywhere and not shown.
- `description` is original text and is used as-is, with no padding.
- No text or images from official sites, Time Out or Wikipedia. No affiliate or monetization links: buttons go only to `official_url` / `ticket_url`. These are not marked `data-ev="tickets"`, so the party ticket-link rule (ref tag + sponsored) does not apply to them.

## Photos, llms.txt and internal links (Nov 8, 2026)

- **Photos**: 51 of 54 live pages have a freely licensed Wikimedia Commons photo of the place (CC0, public domain, CC BY or CC BY-SA 2.0-4.0), chosen from each article's lead image or Wikidata P18 and checked by hand for subject and license. They are rows in `image_rights` (`subject_kind = 'attraction'`, `subject_key` = attraction id); `scripts/fetch-images.mjs` self-hosts them at build like every other photo, plus a 1200x630 share image. A page shows the photo as its hero with author, license and a link to the file; the card shows the thumbnail with a short credit; JSON-LD `image` and `og:image` use it; `/image-credits` lists each one. Without a photo (nybg: license CC BY-SA 2.5 is not on our list; prospect-park-zoo: too small; ny-aquarium: the lead image shows the boardwalk) the card shows the designed borough card. To remove a photo: set its row's `status` to `removed` and rebuild.
- **llms.txt**: an "NYC attractions" section lists the hub, each category and each attraction with address, stated hours and admission when captured, and the checked date. Blank facts are left out.
- **Internal links**: a happy-hours neighborhood page lists "Attractions in <neighborhood>" when an attraction's neighborhood has the same name (`attractionsIn()`, the same clean name join as the "After your visit" happy hours on attraction pages). No guessing by distance.

## Hub filters: open now, open late, near me

The hub's compact filter bar has search, **Open now**, **Open till 8pm+**, **Free**, **Near me**, borough and category. Each option shows how many places it would leave given the other active filters; an option that would leave none is disabled.

- **Open now / Open till 8pm+** use `site/src/lib/attractionHours.ts`, which parses `hours_recurring` (the stated weekly schedule) strictly. A string is used only when every clause is understood: day ranges, times, "closed …", "… until 9", season date ranges. Anything vague ("varies", "not captured", "select Tue", two venues in one string, no days given) gives no schedule, and the card makes no open/closed claim. Days a schedule does not name stay unknown, never assumed closed. Holiday closures are not modeled, and the page says so. `hours_observed` (a dated snapshot) is never used. Times are computed in New York time in the visitor's browser, and cards show "Open now · until 6 pm", "Closed now · opens 10 am" or "Closed today".
- **Near me** asks the browser for the visitor's location only when tapped. The location stays in the browser and is used to sort by approximate distance from the record's coordinates (Wikipedia, secondary). Places without usable coordinates go last.

## Index policy

- `/attractions` and one page per nonempty category: indexable, self-canonical, in the sitemap (lastmod = newest `verified_at` among their members).
- Detail pages: indexable, self-canonical, in the sitemap (lastmod = `verified_at`).
- Filters on the hub are client-side and never write the URL, so no crawlable URL exists per facet. If a URL arrives with a query string anyway (`?category=…`), the canonical still points to the clean path. A small script also adds `noindex, follow`.
- JSON-LD: `ItemList` + `BreadcrumbList` on hub and category pages; `TouristAttraction` + `BreadcrumbList` on detail pages. The visitor Q&A block is plain content with no FAQPage markup.

## Swapping in a new data drop

1. Replace `site/src/data/nyc_attractions.json` (same schema, new `verified_at`).
2. Run `node scripts/attractions-report.mjs`: readiness per candidate plus the review queue.
3. Build with `YAY_ATTR_PREVIEW=1` to review new candidates; approve them with `attractions-approve.mjs`.

## Review queue: a data drop never deletes or noindexes a live page

For each approved id, `lib/attractions.ts` decides which record a page shows:

- **The current record is present and still a candidate**: the page shows it. If its facts differ from the approved snapshot, the id goes on the review queue as "facts changed since approval". After re-review, `attractions-approve.mjs --refresh <id>`.
- **The current record is missing, or no longer a candidate** (failed re-verification, tier drop, temporary site block): the page **stays live** with the approved snapshot and shows "We're re-verifying these details". The id goes on the review queue. A temporary site block is not a closure.

Taking a page down is a separate decision for the owner, never automatic. It needs a 301 to the category page, or a removal plan.

## Re-verification cadence

- Monthly: full pass over all records.
- Weekly: hours and price for the top 20 pages.
- Pre-season: re-check seasonal-flagged records (records whose notes mention "seasonal", such as Governors Island, Coney Island, Smorgasburg and Brooklyn Flea).

Re-verification means: re-fetch `official_url`, re-extract the facts, bump `verified_at`, diff against the previous drop, then run the report. A failed fetch never deletes or downgrades a live page.
