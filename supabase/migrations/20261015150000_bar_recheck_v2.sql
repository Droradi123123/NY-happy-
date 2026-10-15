-- Deal re-checks, version 2 (applied to zqfscuwkxcoktpjhaebv on 2026-10-15).
-- Each day a seventh of the live bars is re-read from its own source page (pg_net); the plain
-- prices we publish are looked for in the page text as numbers. Verdicts:
--   confirmed    every published price is on the page: verified_at moves, `confirmed` lists them
--   partial      some are there: the bar page names which ones were not found
--   changed      the page lists prices but none of ours: out of "cheapest" rankings, noted on the page
--   inconclusive no prices in the page text (JS menus, PDFs, images): nothing changes
--   unreachable  no answer: nothing changes
-- A rebuild never moves a deal's date; only a confirmed re-read does.
-- Cron: bar-recheck-request 07:05 UTC, bar-recheck-apply (ingest + apply) 07:35 UTC.

alter table bar_rechecks add column if not exists missing text[], add column if not exists page_prices int, add column if not exists applied_at timestamptz;

CREATE OR REPLACE FUNCTION public.bar_recheck_request(p_slugs text[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare r record; k int := 0;
begin
  for r in
    select b.slug, b.hh_source url,
      array(select distinct m[1] from jsonb_array_elements(coalesce(b.hh->'offers','[]')) o,
            regexp_matches(o->>'price', '^\$\s*(\d+(?:\.\d{1,2})?)$') m
            where coalesce(o->>'kind','fixed') = 'fixed') needles
    from site_bars b where b.slug = any(p_slugs) and b.hh_source is not null
  loop
    insert into bar_rechecks (request_id, slug, url, needles)
    values (net.http_get(url := r.url, headers := '{"User-Agent":"Mozilla/5.0 (compatible; YaYNYC-check/1.0; +https://yaynyc.com/about)"}'::jsonb, timeout_milliseconds := 25000), r.slug, r.url, r.needles);
    k := k + 1;
  end loop;
  return k;
end $function$;

CREATE OR REPLACE FUNCTION public.bar_recheck_ingest()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare f record; resp record; txt text; hit text[]; miss text[]; n int := 0; pp int; v text;
begin
  for f in select request_id, slug, url, array(select ltrim(x, '$') from unnest(needles) x where x is not null) needles from bar_rechecks where done_at is null loop
    select status_code, content into resp from net._http_response where id = f.request_id;
    if not found then continue; end if;
    txt := regexp_replace(coalesce(resp.content, ''), '<script.*?</script>', ' ', 'gi');
    txt := regexp_replace(txt, '<style.*?</style>', ' ', 'gi');
    txt := regexp_replace(txt, '<noscript.*?</noscript>', ' ', 'gi');
    txt := regexp_replace(txt, '<[^>]+>', ' ', 'g');
    txt := replace(replace(txt, '&#36;', '$'), '&nbsp;', ' ');
    hit := array(select x from unnest(f.needles) x where x is not null and x ~ '^\d+(\.\d+)?$'
             and x::numeric in (select m[1]::numeric from regexp_matches(txt, '\$\s?(\d+(?:\.\d{1,2})?)', 'g') m));
    miss := array(select x from unnest(f.needles) x where x is not null and not (x = any(hit)));
    pp := (select count(*) from regexp_matches(txt, '\$\s?\d', 'g'));
    v := case when resp.status_code is distinct from 200 then 'unreachable'
              when cardinality(f.needles) = 0 then 'inconclusive'
              when cardinality(miss) = 0 then 'confirmed'
              when cardinality(hit) > 0 then 'partial'
              when pp >= 3 then 'changed'
              else 'inconclusive' end;
    update bar_rechecks set done_at = now(), http_status = resp.status_code, found = hit, missing = miss, page_prices = pp, verdict = v
    where request_id = f.request_id;
    n := n + 1;
  end loop;
  return jsonb_build_object('ingested', n, 'pending', (select count(*) from bar_rechecks where done_at is null));
end $function$;

CREATE OR REPLACE FUNCTION public.bar_recheck_apply()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare r record; n int := 0;
begin
  for r in select distinct on (slug) * from bar_rechecks where done_at is not null and applied_at is null order by slug, done_at desc loop
    update h_nyc_happy_hour h set facts = jsonb_set(
        case when r.verdict = 'confirmed'
          then jsonb_set(jsonb_set(h.facts, '{happy_hour,verified_at}', to_jsonb(r.done_at)), '{happy_hour,confirmed}', to_jsonb(r.found))
          else h.facts end,
        '{happy_hour,recheck}', jsonb_build_object('at', r.done_at, 'verdict', r.verdict, 'found', r.found, 'missing', r.missing, 'url', r.url))
    where h.slug = r.slug and h.facts ? 'happy_hour';
    update bar_rechecks set applied_at = now() where slug = r.slug and done_at is not null and applied_at is null;
    n := n + 1;
  end loop;
  return jsonb_build_object('applied', n);
end $function$;

revoke all on function public.bar_recheck_request(text[]), public.bar_recheck_ingest(), public.bar_recheck_apply() from public, anon, authenticated;
-- site_bars gained a last column: hh_recheck = facts->happy_hour->recheck
