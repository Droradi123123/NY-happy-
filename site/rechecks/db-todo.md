# Waiting for database access (Supabase zqfscuwkxcoktpjhaebv)

Work done in code while the database could not be written. Move each item into the database
when access returns, then remove the code-side stopgap.

1. **Reviewed deals → database.** `site/src/data/deal-reviews.json` (48 bars, Oct 20). For each:
   `bar_fix_hh(slug, hh, source, evidence = quote, reason = 'menu read <read_from> <read_at>')`
   with the offers (kind `fixed`, or the discount kind for "$N off" / "N% off") and the windows
   when given. The build already prefers the database once a row has offers; empty the file after.
2. **Wrong source page** (the extraction found another venue's page; set the right `hh_source`
   or set the bar to pending): the-copper-still-east-village (source is the Chelsea location),
   top-of-the-standard (page describes The Standard Grill), winter-garden (page describes Cuna
   Bar & Lounge / Café Standard).
3. **Copy that names another neighborhood** (~99 bars): the list is `copy_names_other_hood` in
   `/data/quality.json`. The page renders the record's neighborhood (lib/data.ts `alignHood`);
   rewrite the stored copy so the stopgap is no longer needed.
4. **Title override** in `lib/guides.ts` TITLE_FIX (what-time-do-bars-close-in-nyc): save the title
   in the post row and remove the override.
5. **Stale deals**: bars in `/data/quality.json` `stale` (read over 30 days ago): queue
   `bar_recheck_request` for them.
6. Earlier leftovers: Chela, Rosa's at Park, Casa Felix, Deja Vu; about 70 old Resy links.
