-- Read-only pre-release checks. Does not publish, modify decks or erase records.
select 'event_private' as check_name,
  exists(select 1 from public.sim_events where id='coffee-20261109' and not published and phase='open') as passed
union all
select 'one_confirmed_operator',
  (select count(*)=1 from public.sim_event_admins) and
  (select count(*)=1 from public.sim_event_admins a join auth.users u on u.id=a.user_id
    where u.email_confirmed_at is not null and u.email is not null)
union all
select 'rules_present',
  exists(select 1 from public.sim_events e join public.sim_event_rules r on r.id=e.rules_id
    where e.id='coffee-20261109' and jsonb_array_length(r.data->'skills')>0)
union all
select 'no_production_test_entries',
  not exists(select 1 from public.sim_event_participants where event_id='coffee-20261109')
union all
select 'private_read_guard_installed',
  position('event_private' in pg_get_functiondef('public.event_get(text,uuid,text)'::regprocedure))>0;
