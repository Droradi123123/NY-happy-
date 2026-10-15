-- Applied 2026-10-15 as: images_nearby_street_layer, img_fetches_allow_commons_geo, images_nearby_ingest,
-- images_nearby_tighten, page_copy (plus an in-place fix of img_request's WHERE precedence).
-- Summary (full function bodies as applied live in the database):
--
-- 1. Photos, layer 2: image_rights gains distance_m and taken. img_request adds step 'commons_geo'
--    (Commons geosearch, 70 m for bars / 120 m for venues, colimit=max, DateTimeOriginal) for every bar
--    and venue without an approved photo of its own. img_ingest stores only passing candidates as
--    match = 'nearby': free license, jpeg/png/webp, >= 1000 px wide, landscape, taken 2005 or later,
--    not a person, title passes img_streetish() (street/building words, no events, vehicles, people,
--    murals, Mapillary). site_images prefers the place's own photo, then the nearest street photo.
-- 2. page_copy (kind, key, intro, picks, sections, faq, sources, status, written_by, written_at) with RLS
--    (public read of published rows), page_copy_save() (security definer, not callable by anon): refuses
--    short intros, em dashes, dollar amounts, cliches, unknown bar slugs, thin picks, < 3 FAQ.
--    View site_page_copy for the build.

alter table public.image_rights add column if not exists distance_m int, add column if not exists taken text;
alter table public.img_fetches drop constraint if exists img_fetches_step_check;
alter table public.img_fetches add constraint img_fetches_step_check check (step in ('commons_search', 'commons_file', 'wiki_lead', 'wiki_search', 'commons_geo'));

create table if not exists public.page_copy (
  kind text not null check (kind in ('hood', 'borough', 'tag', 'day', 'bar', 'venue', 'near')),
  key text not null,
  intro text not null,
  picks jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  sources text[] not null default '{}',
  status text not null default 'published' check (status in ('draft', 'published', 'withdrawn')),
  written_by text,
  written_at timestamptz not null default now(),
  primary key (kind, key)
);

-- Also applied 2026-10-15: mta_stations (official MTA stops, data.ny.gov 39hk-dx4f) and bars_subway_lines_from_mta
-- (each bar's lines = daytime routes of its matched station complex, replacing OSM lines that included
-- trains passing without stopping); bar_set_location() (security definer) fixed six bars that carried a
-- placeholder point; blog_posts + blog_post_save() + site_blog_posts (posts written into the database,
-- prose only, keyword/title/description checks, no prices in prose).

-- Also applied 2026-10-15: image_rights subject_kind 'page' (photos for whole pages; the Halloween hub
-- uses "New York's Village 2025 Halloween Parade.jpg", CC BY 4.0, Tzim78) and page_copy kind 'parties'
-- (party hub copy; picks may be published party slugs).
