-- What the bar and venue pages may show from Google Places: facts only (no ratings or reviews),
-- only for confident matches, and only while fresh (Google allows up to 30 days of caching).
create or replace view public.site_google with (security_invoker = true) as
select subject_kind, subject_key, place_id, maps_uri, phone, website, weekday_hours, business_status, fetched_at::date as checked
from public.gp_places
where verdict = 'matched' and fetched_at > now() - interval '28 days'
  and coalesce(business_status, 'OPERATIONAL') in ('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY');
grant select on public.site_google to anon, authenticated;
