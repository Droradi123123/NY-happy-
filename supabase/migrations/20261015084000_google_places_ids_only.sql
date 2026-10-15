-- Applied 2026-10-15 as: site_views_commons_only_place_ids, google_places_ids_only_functions,
-- google_places_purge_cached_content. Combined here in order.
--
-- Google Maps Platform terms (ToS 3.2.3(b); Places policies: "don't cache photo URIs or photos",
-- photo names expire and may not be cached) forbid storing Places content other than Place IDs.
-- So: no Google photos on the site, no Google hours/phone/website/status, only the Place ID.

create or replace view public.site_images as
select c.subject_kind, c.subject_key, c.file_title, c.source_page, c.thumb_url, c.width, c.height, c.title, c.author, c.author_url,
  c.license, c.license_url, c.description, c.match, 'wikimedia_commons'::text as source
from (select distinct on (subject_kind, subject_key) * from public.image_rights where status = 'approved'
      order by subject_kind, subject_key, (match = 'wikipedia_lead') desc, (width >= height) desc, width desc) c;

-- same columns as before so the view could be replaced in place; the content columns are always null
create or replace view public.site_google with (security_invoker = true) as
select subject_kind, subject_key, place_id, null::text as maps_uri, null::text as phone, null::text as website,
  null::text[] as weekday_hours, null::text as business_status, fetched_at::date as checked
from public.gp_places where verdict = 'matched' and place_id is not null;

-- gp_request: field mask places.id,places.displayName,places.location (enough to match), refresh after 300 days
-- gp_ingest: keeps place_id + our own distance/similarity/verdict; any queued photo fetch is dropped
-- (full bodies as applied; see the function definitions in the database)

update public.gp_places set name = null, address = null, lat = null, lng = null, business_status = null, weekday_hours = null,
  phone = null, website = null, maps_uri = null, photos = null, photo_uri = null, photo_author = null, photo_author_uri = null,
  photo_w = null, photo_h = null, photo_fetched_at = null
where coalesce(name, address, business_status, phone, website, maps_uri, photo_uri, photo_author) is not null or lat is not null or photos is not null or weekday_hours is not null;
