-- Applied 2026-10-14 as: bar_rechecks, site_bar_rechecks, party_status_fix_and_house_rule,
-- party_drop_false_house_tags, site_rebuild_hook. Combined here in order.

-- Re-checks of a bar's happy-hour source page: does the page still state the price we hold?
-- Read-only with respect to the bar record; guides only cite "price seen on <date>" from here.
create table public.bar_rechecks (
  request_id bigint primary key,
  slug text not null,
  url text not null,
  needles text[] not null,
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  http_status int,
  found text[],
  verdict text                       -- confirmed | not_found | unreachable
);
alter table public.bar_rechecks enable row level security;

create or replace function public.bar_recheck_request(p_slugs text[]) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; k int := 0;
begin
  for r in
    select b.slug, b.hh_source url,
      array(select distinct '$' || trim(trailing '.' from trim(trailing '0' from (regexp_match(o->>'price', '^\$\s*(\d+(?:\.\d+)?)$'))[1]))
            from jsonb_array_elements(coalesce(b.hh->'offers','[]')) o where (o->>'price') ~ '^\$\s*\d') needles
    from site_bars b where b.slug = any(p_slugs) and b.hh_source is not null
  loop
    insert into bar_rechecks (request_id, slug, url, needles)
    values (net.http_get(url := r.url, headers := '{"User-Agent":"Mozilla/5.0 (compatible; YaYNYC-check/1.0; +https://yaynyc.com/about)"}'::jsonb, timeout_milliseconds := 25000), r.slug, r.url, r.needles);
    k := k + 1;
  end loop;
  return k;
end $$;

create or replace function public.bar_recheck_ingest() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare f record; resp record; txt text; hit text[]; n int := 0;
begin
  for f in select * from bar_rechecks where done_at is null loop
    select status_code, content into resp from net._http_response where id = f.request_id;
    if not found then continue; end if;
    txt := regexp_replace(regexp_replace(coalesce(resp.content, ''), '<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', 'gi'), '<[^>]+>', ' ', 'g');
    hit := array(select x from unnest(f.needles) x where position(x in txt) > 0 or position(replace(x, '$', '$ ') in txt) > 0);
    update bar_rechecks set done_at = now(), http_status = resp.status_code, found = hit,
      verdict = case when resp.status_code is distinct from 200 then 'unreachable' when cardinality(hit) > 0 then 'confirmed' else 'not_found' end
    where request_id = f.request_id;
    n := n + 1;
  end loop;
  return jsonb_build_object('ingested', n, 'pending', (select count(*) from bar_rechecks where done_at is null));
end $$;
revoke execute on function public.bar_recheck_request(text[]), public.bar_recheck_ingest() from public, anon, authenticated;

create or replace view public.site_bar_rechecks with (security_invoker = true) as
select distinct on (slug) slug, verdict, found, done_at::date as checked
from public.bar_rechecks where done_at is not null and verdict is not null
order by slug, done_at desc;
create policy "public read rechecks" on public.bar_rechecks for select using (true);
grant select on public.site_bar_rechecks to anon, authenticated;

-- review/rejected with a reason fell through to "bad status"
create or replace function public.party_event_status(p_id text, p_status text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare b text[];
begin
  if p_status in ('ready','published') then
    b := party_publish_blockers(p_id);
    if cardinality(b) > 0 then raise exception 'cannot % %: %', p_status, p_id, array_to_string(b, '; '); end if;
  elsif p_status in ('review','rejected') then
    if coalesce(p_reason, '') = '' then raise exception 'a reason is required'; end if;
  elsif p_status not in ('draft','ended') then
    raise exception 'bad status %', p_status;
  end if;
  update party_events set publish_status = p_status, review_reason = case when p_status in ('ready','published') then null else p_reason end, updated_at = now()
  where id = p_id;
  return p_status;
end $$;

-- "house" the genre, not "house party", "haunted house" or "House of Yes"
update public.party_rules
set pattern = '(?<!haunted )\m(deep |tech |afro |latin |progressive |soulful |funky )?house\M(?!\s+(party|parties|rager|of\M|show|band|dj|kitchen))'
where slug = 'house' and kind = 'genre';

-- drop "house" where only those phrases had matched
update public.party_events e
set genres = array_remove(e.genres, 'house'), updated_at = now()
where 'house' = any(e.genres) and e.night_date >= current_date
  and not ('house' = any(public.party_match('genre',
    e.title || ' ' || coalesce(e.raw->>'description', '') || ' ' || coalesce(e.raw->>'dice_tags', '') || ' ' || coalesce(e.raw->'workbook'->>'genres', '') || ' ' || coalesce(e.raw->'workbook'->>'genre', ''))));

-- Rebuild yaynyc.com through its Cloudflare Workers Builds Deploy Hook (URL in Vault as
-- 'cf_deploy_hook'). Twice a day: ended parties leave, new ones and new photos arrive.
create or replace function public.site_rebuild(p_reason text default 'scheduled') returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare hook text;
begin
  select decrypted_secret into hook from vault.decrypted_secrets where name = 'cf_deploy_hook' limit 1;
  if hook is null then return -1; end if;
  return net.http_post(url := hook, body := jsonb_build_object('reason', p_reason), timeout_milliseconds := 20000);
end $$;
revoke execute on function public.site_rebuild(text) from public, anon, authenticated;
select cron.schedule('yay-rebuild-morning', '15 9 * * *', $$select public.site_rebuild('daily morning');$$);
select cron.schedule('yay-rebuild-evening', '15 21 * * *', $$select public.site_rebuild('daily evening');$$);
