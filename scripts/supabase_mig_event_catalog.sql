-- Requires supabase_mig_event_operator.sql.
begin;
create or replace function public.event_operator_list(p_session text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  perform public._event_operator_auth(p_session);
  select coalesce(jsonb_agg(to_jsonb(e) order by e.opens_at desc,e.id),'[]'::jsonb) into result
    from (select id,title,opens_at,ends_at,published,phase from public.sim_events) e;
  perform set_config('event.operator_id','',true);
  return result;
end $$;
revoke all on function public.event_operator_list(text) from public,anon,authenticated;
grant execute on function public.event_operator_list(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
