-- Requires supabase_mig_event_operator.sql. Re-run in Supabase SQL Editor to update the reports.
begin;
create table if not exists public.site_usage_views (
  view_id uuid primary key,
  browser_id uuid not null,
  site text not null,
  page text not null,
  opened_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seq integer not null,
  seconds integer not null,
  active boolean not null
);
create index if not exists site_usage_opened on public.site_usage_views(opened_at);
create index if not exists site_usage_recent on public.site_usage_views(last_seen) where active;
alter table public.site_usage_views enable row level security;
revoke all on public.site_usage_views from public,anon,authenticated;

create or replace function public.record_site_usage(p_view uuid,p_browser uuid,p_site text,p_page text,
 p_seq integer,p_seconds integer,p_active boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_view is null or p_browser is null or p_active is null or p_site is null or p_page is null
    or p_seq is null or p_seq<1 or p_seconds is null or p_seconds<0
    or not (
      (p_site='admin' and p_page in ('admin-login','admin-event','admin-messages','admin-usage'))
      or (p_site in ('service','demo') and p_page in ('lineup','skills','ranking','news','simulator',
        'sim-skills','sim-combination','sim-hof','sim-event','rivals-series'))
      or (p_site='demo' and p_page in ('deck-score','event-demo'))
    ) then raise exception 'invalid_usage'; end if;
  insert into public.site_usage_views as v(view_id,browser_id,site,page,seq,seconds,active)
    values(p_view,p_browser,p_site,p_page,p_seq,least(p_seconds,30),p_active)
    on conflict(view_id) do update set seq=excluded.seq,last_seen=now(),active=excluded.active,
      seconds=greatest(v.seconds,least(p_seconds,ceil(extract(epoch from now()-v.opened_at))::integer+30))
    where excluded.seq>v.seq and v.site=excluded.site and v.page=excluded.page and v.browser_id=excluded.browser_id;
  if p_seq=1 then delete from public.site_usage_views where opened_at<now()-interval '32 days'; end if;
end $$;

create or replace function public.event_operator_usage(p_session text,p_days integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  perform public._event_operator_auth(p_session);
  if p_days is null or p_days not in (1,7,30) then raise exception 'invalid_usage_period'; end if;
  with period_views as (
    select site,page,browser_id,seconds,(opened_at at time zone 'Asia/Seoul')::date as day,
      extract(hour from opened_at at time zone 'Asia/Seoul')::integer as hour
    from public.site_usage_views
    where opened_at >= (((now() at time zone 'Asia/Seoul')::date-(p_days-1))::timestamp at time zone 'Asia/Seoul')
  ), browsers as (
    select site,browser_id,count(distinct day) as visit_days,count(*) as views,sum(seconds) as seconds
    from period_views group by site,browser_id
  ), totals as (
    select site,count(*) as visitors,count(*) filter(where visit_days>=2) as returning_browsers,
      sum(views) as views,sum(seconds) as seconds from browsers group by site
  ), online as (
    select site,count(distinct browser_id) as online from public.site_usage_views
    where active and last_seen>=now()-interval '90 seconds' group by site
  ), pages as (
    select site,page,count(*) as views,count(distinct browser_id) as visitors,sum(seconds) as seconds
    from period_views group by site,page
  ), daily as (
    select day,site,count(*) as views,count(distinct browser_id) as visitors,sum(seconds) as seconds
    from period_views group by site,day
  ), hourly as (
    select site,hour,count(*) as views,count(distinct browser_id) as visitors,sum(seconds) as seconds
    from period_views group by site,hour
  )
  select jsonb_build_object('as_of',now(),'sites',(
    select jsonb_agg(jsonb_build_object('site',k.site,'online',coalesce(o.online,0),
      'returning_browsers',coalesce(t.returning_browsers,0),'visitors',coalesce(t.visitors,0),'views',coalesce(t.views,0),'seconds',coalesce(t.seconds,0)))
    from (values ('service'),('demo'),('admin')) k(site)
    left join totals t using(site) left join online o using(site)),
    'pages',coalesce((select jsonb_agg(to_jsonb(p) order by p.views desc,p.page) from pages p),'[]'::jsonb),
    'hourly',coalesce((select jsonb_agg(to_jsonb(h) order by h.site,h.hour) from hourly h),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day desc,d.site) from daily d),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.record_site_usage(uuid,uuid,text,text,integer,integer,boolean),
  public.event_operator_usage(text,integer) from public;
grant execute on function public.record_site_usage(uuid,uuid,text,text,integer,integer,boolean),
  public.event_operator_usage(text,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
