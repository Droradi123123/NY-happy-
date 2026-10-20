# Database follow-ups (Supabase zqfscuwkxcoktpjhaebv)

Done on Oct 20, 2026, once database access returned:

1. The 48 reviewed deals are in the database (`bar_fix_hh`, evidence = the quote, read Oct 20).
   `site/src/data/deal-reviews.json` is empty again; the overlay in lib/data.ts stays for future
   reviews made while the database is unreachable. `rechecks/deal-reviews-db.json` is the patch
   file the database read.
2. Wrong source pages: the-copper-still-east-village, the-top-of-the-standard-west-village and
   winter-garden-nolita are pending, with the reason recorded. The Copper Still East Village has
   its own happy-hour menu as an image at https://www.thecopperstillnyc.com/east-village-happy-hour-menu:
   read it (OCR) and re-add the bar with that source.
3. The 99 bar descriptions that named another neighborhood were rewritten in the database
   (same rule as lib/data.ts `alignHood`, which stays as a guard).
4. The "what time do bars close" title is stored in the post; the code override is gone.
5. The 133 bars read over 30 days ago were re-checked by the database (3 confirmed, 98
   inconclusive, 24 unreachable, 8 changed or partial); the rendered re-check job
   (recheck-deals.yml) takes the inconclusive ones.
6. Chela (Sunday 4-7pm window) and Rosa's at Park (Monday and Wednesday all day, full drink list)
   fixed from their sites. Deja Vu is live at its real address (33-22 28th Ave, Astoria; the old
   record had a Midtown address) with a new description; the duplicate legal-name record is
   rejected. Casa Felix stays pending: its page still gives hours without days.

Still open:
- The Copper Still East Village (see 2).
- About 70 Resy links in the old widget format: they work; convert when convenient.
