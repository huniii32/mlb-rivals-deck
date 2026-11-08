-- Read-only pre-release checks. Does not publish, modify decks or erase records.
select 'event_public' as check_name,
  exists(select 1 from public.sim_events where id='coffee-20261109' and published and phase='open') as passed
union all
select 'password_operator_configured',
  exists(select 1 from public.sim_event_operator_credentials c join public.sim_event_admins a on a.user_id=c.user_id)
union all
select 'rules_present',
  exists(select 1 from public.sim_events e join public.sim_event_rules r on r.id=e.rules_id
    where e.id='coffee-20261109' and jsonb_array_length(r.data->'skills')>0)
union all
select 'no_production_test_entries',
  not exists(select 1 from public.sim_event_participants where event_id='coffee-20261109')
union all
select 'private_read_guard_installed',
  position('event_public' in pg_get_functiondef('public.event_get(text,uuid,text)'::regprocedure))>0;
