-- Photos we may use, and the pipeline that finds them.
-- Applied to the NY happy project as three migrations (image_rights, image_paced_refresh,
-- image_search_v2); this file is their combined final state.
--
-- Only freely licensed files from Wikimedia Commons: CC0, public domain, CC BY, CC BY-SA.
-- Each row keeps author, license and source page, so every photo on the site carries a
-- correct credit. Nothing is taken from bar, club or ticket sites, Google or Instagram.
-- Sources, in order of trust:
--   wikipedia_lead  the lead photo of the subject's own English Wikipedia article
--                   (neighborhoods: "Name, Borough"; venues: an article named after the venue)
--   name            a Commons file whose title names the bar or venue, shown to be in NYC,
--                   and not a performer or portrait (someone's likeness, not the place)

create table public.image_rights (
  id bigserial primary key,
  subject_kind text not null check (subject_kind in ('bar','venue','hood')),
  subject_key text not null,
  file_title text not null,
  source text not null default 'wikimedia_commons',
  source_page text not null,
  thumb_url text not null,
  width int, height int, mime text,
  title text, author text, author_url text,
  license text not null, license_url text,
  description text,
  match text not null,
  status text not null default 'approved' check (status in ('approved','rejected','removed')),
  reason text,
  fetched_at timestamptz not null default now(),
  unique (subject_kind, subject_key, file_title)
);
alter table public.image_rights enable row level security;
create policy "public read approved images" on public.image_rights for select using (status = 'approved');

create table public.img_fetches (
  request_id bigint primary key,
  subject_kind text not null,
  subject_key text not null,
  step text not null check (step in ('commons_search','wiki_lead','wiki_search','commons_file')),
  url text not null,
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  result text
);
alter table public.img_fetches enable row level security;

create or replace function public.img_enc(t text) returns text language sql immutable as $$
  select coalesce(string_agg(case when ch ~ '^[A-Za-z0-9_.~-]$' then ch
    else regexp_replace(upper(encode(convert_to(ch, 'UTF8'), 'hex')), '(..)', '%\1', 'g') end, '' order by i), '')
  from regexp_split_to_table(t, '') with ordinality as s(ch, i)
$$;

create or replace function public.img_norm(t text) returns text language sql immutable as $$
  select trim(regexp_replace(lower(unaccent(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.img_strip(t text) returns text language sql immutable as $$
  select nullif(trim(regexp_replace(regexp_replace(coalesce(t, ''), '<[^>]*>', '', 'g'), '\s+', ' ', 'g')), '')
$$;

-- CC0, public domain, CC BY, CC BY-SA. Never NC, ND, GFDL-only, fair use or "all rights reserved".
create or replace function public.img_license_ok(l text) returns boolean language sql immutable as $$
  select l is not null and l !~* '(NC|ND|non-?commercial|no ?deriv|fair use|GFDL|all rights)'
    and l ~* '^(CC0( 1\.0)?|Public domain|PD[- ].*|PD|CC BY(-SA)? [1-4]\.0( [a-z-]+)?|CC BY(-SA)?)$'
$$;

-- the file must say it is in New York (title, description or categories)
create or replace function public.img_nyc(t text) returns boolean language sql immutable as $$
  select coalesce(t, '') ~* '(new york|nyc|manhattan|brooklyn|queens|bronx|staten island|bushwick|williamsburg|greenpoint|ridgewood|maspeth|astoria|harlem|chelsea|soho|tribeca|east village|west village|lower east side|midtown|long island city)'
$$;

-- a person on stage or a portrait is not a picture of the place (and is someone's likeness)
create or replace function public.img_person(title text) returns boolean language sql immutable as $$
  select coalesce(title, '') ~* '(\s(at|@|live at|performing at|in concert at)\s|\(cropped\)|portrait|\bDJ\b|\bperforming\b|\bconcert\b|\bmaking (his|her|their)\b|\bselfie\b)'
$$;

create or replace function public.img_api() returns text language sql immutable as $$
  select '&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=1280'
    || '&iiextmetadatafilter=LicenseShortName%7CLicenseUrl%7CArtist%7CObjectName%7CImageDescription%7CRestrictions%7CCategories'
$$;

create or replace function public.img_ua() returns jsonb language sql immutable as $$
  select '{"User-Agent":"YaYNYC-images/1.0 (https://yaynyc.com/image-credits)"}'::jsonb
$$;

-- Queue a few lookups. Wikimedia asks for gentle, mostly serial use: never more than 8 in flight.
-- A failed lookup (429, timeout, lost) is retried after 10 minutes; a finished one after 60 days.
create or replace function public.img_request(n int default 4) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; k int := 0; u text; step text;
begin
  if (select count(*) from img_fetches where done_at is null) >= 8 then return 0; end if;
  for r in
    with subj as (
      select 'venue'::text kind, v.id key, v.name, 'wiki_search'::text step, 1 pri
        from party_venues v where v.status = 'active' and coalesce(v.kind, '') <> 'placeholder'
      union all
      select 'venue', v.id, v.name, 'commons_search', 1
        from party_venues v where v.status = 'active' and coalesce(v.kind, '') <> 'placeholder'
      union all
      select 'hood', h.slug, h.name || '|' || h.borough, 'wiki_lead', 2 from nyc_hoods h
      union all
      select 'bar', b.slug, b.name, 'commons_search', 3 from h_nyc_happy_hour b where b.status = 'live'
    )
    select s.* from subj s
    where length(img_norm(split_part(s.name, '|', 1))) >= 4
      and not exists (select 1 from img_fetches f where f.subject_kind = s.kind and f.subject_key = s.key and f.step = s.step
                        and (f.done_at is null
                             or (f.requested_at > now() - interval '60 days' and f.result !~ '^(http|lost)')
                             or f.requested_at > now() - interval '10 minutes'))
    order by s.pri, s.key, s.step limit least(n, 8)
  loop
    step := r.step;
    if step = 'wiki_lead' then
      u := 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=name&pilicense=free&titles='
        || img_enc(split_part(r.name, '|', 1) || ', ' || replace(split_part(r.name, '|', 2), 'The Bronx', 'Bronx') || '|' || split_part(r.name, '|', 1));
    elsif step = 'wiki_search' then
      u := 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrlimit=3&prop=pageimages&piprop=name&pilicense=free&gsrsearch='
        || img_enc(r.name || ' New York City');
    else
      u := 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch='
        || img_enc('intitle:"' || r.name || '" filetype:bitmap') || img_api();
    end if;
    insert into img_fetches (request_id, subject_kind, subject_key, step, url)
    values (net.http_get(url := u, headers := img_ua(), timeout_milliseconds := 20000), r.kind, r.key, step, u);
    k := k + 1;
  end loop;
  return k;
end $$;

-- Read finished responses: record every matching file with its verdict, follow lead images to Commons.
create or replace function public.img_ingest() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare f record; resp record; body jsonb; p jsonb; ii jsonb; md jsonb; nm text; lic text; why text; m text; ctx text;
  added int := 0; ok int := 0; done int := 0; lead text;
begin
  for f in select * from img_fetches where done_at is null order by requested_at loop
    select status_code, content, error_msg into resp from net._http_response where id = f.request_id;
    if not found then
      if f.requested_at < now() - interval '30 minutes' then
        update img_fetches set done_at = now(), result = 'lost' where request_id = f.request_id;
      end if;
      continue;
    end if;
    done := done + 1;
    if resp.status_code is distinct from 200 then
      update img_fetches set done_at = now(), result = 'http ' || coalesce(resp.status_code::text, resp.error_msg) where request_id = f.request_id;
      continue;
    end if;
    body := resp.content::jsonb;

    select img_norm(name) into nm from (
      select name from party_venues where f.subject_kind = 'venue' and id = f.subject_key
      union all select name from h_nyc_happy_hour where f.subject_kind = 'bar' and slug = f.subject_key
      union all select name from nyc_hoods where f.subject_kind = 'hood' and slug = f.subject_key) s limit 1;

    if f.step in ('wiki_lead', 'wiki_search') then
      -- wiki_lead: prefer "Name, Borough". wiki_search: only an article named after the venue itself.
      select x->>'pageimage' into lead from jsonb_array_elements(coalesce(body->'query'->'pages', '[]')) x
        where x ? 'pageimage'
          and (f.step = 'wiki_lead' or img_norm(regexp_replace(x->>'title', '\s*\(.*\)$', '')) = nm
               or img_norm(x->>'title') like nm || ' %')
        order by (x->>'title') like '%,%' desc, (x->>'index')::int nulls last limit 1;
      if lead is null then
        update img_fetches set done_at = now(), result = 'no lead image' where request_id = f.request_id;
      else
        insert into img_fetches (request_id, subject_kind, subject_key, step, url)
        select net.http_get(url := u, headers := img_ua(), timeout_milliseconds := 20000), f.subject_kind, f.subject_key, 'commons_file', u
        from (select 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&titles=' || img_enc('File:' || lead) || img_api() u) q;
        update img_fetches set done_at = now(), result = 'lead ' || lead where request_id = f.request_id;
      end if;
      continue;
    end if;

    for p in select * from jsonb_array_elements(coalesce(body->'query'->'pages', '[]')) loop
      ii := p->'imageinfo'->0;
      if ii is null then continue; end if;
      md := ii->'extmetadata';
      lic := md->'LicenseShortName'->>'value';
      ctx := concat_ws(' ', p->>'title', md->'ImageDescription'->>'value', md->'Categories'->>'value', md->'ObjectName'->>'value');
      m := case when f.step = 'commons_file' then 'wikipedia_lead'
                when (' ' || img_norm(p->>'title') || ' ') like '% ' || nm || ' %' then 'name'
                else null end;
      if m is null then continue; end if;  -- unrelated search hit: not worth a row
      why := case
        when coalesce(ii->>'mime', '') not in ('image/jpeg', 'image/png', 'image/webp') then 'not a photo (' || coalesce(ii->>'mime', '?') || ')'
        when not img_license_ok(lic) then 'license ' || coalesce(lic, 'missing')
        when img_strip(md->'Restrictions'->>'value') is not null then 'restrictions: ' || img_strip(md->'Restrictions'->>'value')
        when m = 'name' and not img_nyc(ctx) then 'not shown to be in New York'
        when m = 'name' and img_person(p->>'title') then 'a person, not the place'
        when coalesce((ii->>'width')::int, 0) < 800 then 'too small'
        when img_strip(md->'Artist'->>'value') is null and lic !~* '^(CC0|PD|Public domain)' then 'no author to credit'
        else null end;
      insert into image_rights (subject_kind, subject_key, file_title, source_page, thumb_url, width, height, mime,
        title, author, author_url, license, license_url, description, match, status, reason)
      values (f.subject_kind, f.subject_key, p->>'title', ii->>'descriptionurl', ii->>'thumburl',
        (ii->>'width')::int, (ii->>'height')::int, ii->>'mime',
        img_strip(md->'ObjectName'->>'value'), left(img_strip(md->'Artist'->>'value'), 200),
        substring(md->'Artist'->>'value' from 'href="([^"]+)"'),
        coalesce(lic, 'unknown'), md->'LicenseUrl'->>'value', left(img_strip(md->'ImageDescription'->>'value'), 400),
        m, case when why is null then 'approved' else 'rejected' end, why)
      on conflict (subject_kind, subject_key, file_title) do update set
        thumb_url = excluded.thumb_url, author = excluded.author, author_url = excluded.author_url,
        license = excluded.license, license_url = excluded.license_url, match = excluded.match, fetched_at = now(),
        status = case when image_rights.status = 'removed' then 'removed' else excluded.status end,
        reason = case when image_rights.status = 'removed' then image_rights.reason else excluded.reason end;
      added := added + 1;
      if why is null then ok := ok + 1; end if;
    end loop;
    update img_fetches set done_at = now(), result = 'ok' where request_id = f.request_id;
  end loop;
  return jsonb_build_object('responses', done, 'files', added, 'approved', ok,
    'pending', (select count(*) from img_fetches where done_at is null));
end $$;

-- Takedown: one call removes a file everywhere on the next build, and it stays removed.
create or replace function public.img_remove(p_file text, p_reason text default 'takedown request') returns int
language sql security definer set search_path = public as $$
  with u as (update image_rights set status = 'removed', reason = p_reason where file_title = p_file returning 1)
  select count(*)::int from u
$$;

-- One photo per subject for the site: the subject's own Wikipedia photo first, then landscape, then larger.
create or replace view public.site_images with (security_invoker = true) as
select distinct on (subject_kind, subject_key)
  subject_kind, subject_key, file_title, source_page, thumb_url, width, height, title, author, author_url,
  license, license_url, description, match
from public.image_rights where status = 'approved'
order by subject_kind, subject_key, (match = 'wikipedia_lead') desc, (width >= height) desc, width desc;

grant select on public.site_images to anon, authenticated;
revoke execute on function public.img_request(int), public.img_ingest(), public.img_remove(text, text) from public, anon, authenticated;

-- Every minute: read what came back, then ask for a few more. Idle once everything is fresh.
create extension if not exists pg_cron;
select cron.schedule('yay-images', '* * * * *', $$select public.img_ingest(); select public.img_request(4);$$);
