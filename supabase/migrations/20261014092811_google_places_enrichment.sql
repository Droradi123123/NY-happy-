-- Google Places (New) for bars and party venues: verification (still open? hours, phone,
-- website) and a licensed photo for every place Wikimedia Commons does not cover.
-- Terms we follow: place_id kept indefinitely; everything else refreshed at least every 30 days;
-- a Google photo is always shown with its author attribution and "Google Maps".
-- Key: Vault secret 'google_maps_api_key' (never in code). Nothing runs without it.

create table public.gp_places (
  subject_kind text not null check (subject_kind in ('bar','venue')),
  subject_key text not null,
  place_id text,
  name text, address text, lat double precision, lng double precision,
  distance_m int, name_similarity real,
  verdict text not null default 'pending' check (verdict in ('pending','matched','no_match','error')),
  business_status text,
  weekday_hours text[],
  phone text, website text, maps_uri text,
  photos jsonb,
  photo_uri text,
  photo_author text, photo_author_uri text, photo_w int, photo_h int,
  fetched_at timestamptz, photo_fetched_at timestamptz,
  primary key (subject_kind, subject_key)
);
alter table public.gp_places enable row level security;

create table public.gp_fetches (
  request_id bigint primary key,
  subject_kind text not null, subject_key text not null,
  step text not null check (step in ('search','photo')),
  requested_at timestamptz not null default now(),
  done_at timestamptz, result text
);
alter table public.gp_fetches enable row level security;

create or replace function public.gp_key() returns text language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'google_maps_api_key' limit 1
$$;
revoke execute on function public.gp_key() from public, anon, authenticated;

-- Queue up to n subjects whose data is missing or older than 25 days (inside Google's 30-day limit).
create or replace function public.gp_request(n int default 20) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; k int := 0; key text := gp_key();
begin
  if key is null then return -1; end if;
  if (select count(*) from gp_fetches where done_at is null) >= 20 then return 0; end if;
  for r in
    with subj as (
      select 'venue'::text kind, v.id key, v.name, coalesce(v.address, v.neighborhood, '') || ', New York' addr, v.lat, v.lng, 1 pri
        from party_venues v where v.status = 'active' and coalesce(v.kind, '') <> 'placeholder' and v.lat is not null
      union all
      select 'bar', b.slug, b.name, coalesce(b.address, b.hood) || ', New York', b.lat, b.lng, 2
        from site_bars b where b.lat is not null
    )
    select s.* from subj s left join gp_places g on g.subject_kind = s.kind and g.subject_key = s.key
    where (g.fetched_at is null or g.fetched_at < now() - interval '25 days')
      and not exists (select 1 from gp_fetches f where f.subject_kind = s.kind and f.subject_key = s.key and f.done_at is null)
    order by s.pri, g.fetched_at nulls first, s.key limit least(n, 20)
  loop
    insert into gp_fetches (request_id, subject_kind, subject_key, step)
    values (net.http_post(
      url := 'https://places.googleapis.com/v1/places:searchText',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Goog-Api-Key', key,
        'X-Goog-FieldMask', 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.regularOpeningHours.weekdayDescriptions,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.photos'),
      body := jsonb_build_object('textQuery', r.name || ', ' || r.addr, 'maxResultCount', 3,
        'locationBias', jsonb_build_object('circle', jsonb_build_object('center', jsonb_build_object('latitude', r.lat, 'longitude', r.lng), 'radius', 250))),
      timeout_milliseconds := 20000), r.kind, r.key, 'search');
    k := k + 1;
  end loop;
  return k;
end $$;

-- Accept a place only within 200 m of our pin and with a close name; then ask for the first photo's
-- CDN url (skipHttpRedirect returns JSON, so the key never reaches the site).
create or replace function public.gp_ingest() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare f record; resp record; body jsonb; p jsonb; best jsonb; best_d int; best_s real; our record; key text := gp_key();
  n int := 0; matched int := 0; d int; s real; ph jsonb;
begin
  for f in select * from gp_fetches where done_at is null order by requested_at loop
    select status_code, content into resp from net._http_response where id = f.request_id;
    if not found then
      if f.requested_at < now() - interval '30 minutes' then update gp_fetches set done_at = now(), result = 'lost' where request_id = f.request_id; end if;
      continue;
    end if;
    n := n + 1;
    if resp.status_code is distinct from 200 then
      update gp_fetches set done_at = now(), result = 'http ' || coalesce(resp.status_code::text, '?') || ' ' || left(coalesce(resp.content, ''), 200) where request_id = f.request_id;
      continue;
    end if;
    body := resp.content::jsonb;
    if f.step = 'photo' then
      update gp_places set photo_uri = body->>'photoUri', photo_fetched_at = now()
      where subject_kind = f.subject_kind and subject_key = f.subject_key;
      update gp_fetches set done_at = now(), result = case when body ? 'photoUri' then 'ok' else 'no photoUri' end where request_id = f.request_id;
      continue;
    end if;
    select name, lat, lng into our from (
      select v.name, v.lat, v.lng from party_venues v where f.subject_kind = 'venue' and v.id = f.subject_key
      union all select b.name, b.lat, b.lng from site_bars b where f.subject_kind = 'bar' and b.slug = f.subject_key) x limit 1;
    best := null; best_d := null; best_s := null;
    for p in select * from jsonb_array_elements(coalesce(body->'places', '[]')) loop
      d := round(111320 * sqrt(power((p->'location'->>'latitude')::float - our.lat, 2) + power(((p->'location'->>'longitude')::float - our.lng) * cos(radians(our.lat)), 2)));
      s := similarity(lower(our.name), lower(p->'displayName'->>'text'));
      if d <= 200 and (s >= 0.35 or lower(p->'displayName'->>'text') like '%' || lower(our.name) || '%' or lower(our.name) like '%' || lower(p->'displayName'->>'text') || '%')
         and (best is null or s > best_s) then best := p; best_d := d; best_s := s; end if;
    end loop;
    insert into gp_places (subject_kind, subject_key, place_id, name, address, lat, lng, distance_m, name_similarity, verdict, business_status,
      weekday_hours, phone, website, maps_uri, photos, photo_author, photo_author_uri, photo_w, photo_h, fetched_at)
    values (f.subject_kind, f.subject_key, best->>'id', best->'displayName'->>'text', best->>'formattedAddress',
      (best->'location'->>'latitude')::float, (best->'location'->>'longitude')::float, best_d, best_s,
      case when best is null then 'no_match' else 'matched' end, best->>'businessStatus',
      array(select jsonb_array_elements_text(coalesce(best->'regularOpeningHours'->'weekdayDescriptions', '[]'))),
      best->>'nationalPhoneNumber', best->>'websiteUri', best->>'googleMapsUri',
      (select jsonb_agg(x) from (select x from jsonb_array_elements(coalesce(best->'photos', '[]')) x limit 3) y),
      best->'photos'->0->'authorAttributions'->0->>'displayName', best->'photos'->0->'authorAttributions'->0->>'uri',
      (best->'photos'->0->>'widthPx')::int, (best->'photos'->0->>'heightPx')::int, now())
    on conflict (subject_kind, subject_key) do update set
      place_id = excluded.place_id, name = excluded.name, address = excluded.address, lat = excluded.lat, lng = excluded.lng,
      distance_m = excluded.distance_m, name_similarity = excluded.name_similarity, verdict = excluded.verdict,
      business_status = excluded.business_status, weekday_hours = excluded.weekday_hours, phone = excluded.phone,
      website = excluded.website, maps_uri = excluded.maps_uri, photos = excluded.photos,
      photo_author = excluded.photo_author, photo_author_uri = excluded.photo_author_uri,
      photo_w = excluded.photo_w, photo_h = excluded.photo_h, fetched_at = now(), photo_uri = null;
    if best is not null then matched := matched + 1; end if;
    ph := best->'photos'->0;
    if ph is not null and key is not null and not exists (
      select 1 from image_rights i where i.status = 'approved' and i.subject_kind = f.subject_kind and i.subject_key = f.subject_key) then
      insert into gp_fetches (request_id, subject_kind, subject_key, step)
      values (net.http_get(url := 'https://places.googleapis.com/v1/' || (ph->>'name') || '/media?maxWidthPx=1280&skipHttpRedirect=true&key=' || key,
        timeout_milliseconds := 20000), f.subject_kind, f.subject_key, 'photo');
    end if;
    update gp_fetches set done_at = now(), result = case when best is null then 'no_match' else 'matched' end where request_id = f.request_id;
  end loop;
  return jsonb_build_object('responses', n, 'matched', matched, 'pending', (select count(*) from gp_fetches where done_at is null));
end $$;
revoke execute on function public.gp_request(int), public.gp_ingest() from public, anon, authenticated;

select cron.schedule('yay-google-places', '* * * * *', $$select public.gp_ingest(); select public.gp_request(10);$$);

-- the site's photo list: Commons first; a Google photo (fresh, matched, attributed) where Commons has none
create or replace view public.site_images with (security_invoker = true) as
select subject_kind, subject_key, file_title, source_page, thumb_url, width, height, title, author, author_url, license, license_url, description, match, 'wikimedia_commons'::text as source
from (
  select distinct on (subject_kind, subject_key) *
  from public.image_rights where status = 'approved'
  order by subject_kind, subject_key, (match = 'wikipedia_lead') desc, (width >= height) desc, width desc
) c
union all
select g.subject_kind, g.subject_key, 'google:' || g.subject_key, g.maps_uri, g.photo_uri, g.photo_w, g.photo_h, g.name, g.photo_author, g.photo_author_uri,
  'Google Maps', null, null, 'google_places', 'google_places'
from public.gp_places g
where g.verdict = 'matched' and g.photo_uri is not null and g.photo_fetched_at > now() - interval '28 days'
  and not exists (select 1 from public.image_rights i where i.status = 'approved' and i.subject_kind = g.subject_kind and i.subject_key = g.subject_key);
grant select on public.site_images to anon, authenticated;
create policy "public read matched places" on public.gp_places for select using (verdict = 'matched');
