-- Separate password-based operator entry. Run after supabase_mig_events.sql.
-- Passwords are generated with 256 bits of entropy by build-event-setup.cjs.
-- Never put the generated password or its provisioning SQL in a public build.
begin;
create table if not exists public.sim_event_operator_credentials (
  user_id uuid primary key references public.sim_event_admins(user_id) on delete cascade,
  password_hash text not null check(length(password_hash)=64)
);
create table if not exists public.sim_event_operator_sessions (
  token_hash text primary key,
  user_id uuid not null references public.sim_event_operator_credentials(user_id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.sim_event_operator_credentials enable row level security;
alter table public.sim_event_operator_sessions enable row level security;
revoke all on public.sim_event_operator_credentials,public.sim_event_operator_sessions from public,anon,authenticated;

-- Only the authenticated wrappers below set this transaction-local identity.
-- It is never derived from request headers, URL parameters or a client user ID.
create or replace function public._event_user() returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid := nullif(current_setting('event.operator_id',true),'')::uuid;
begin
  if u is not null and exists(select 1 from public.sim_event_operator_credentials where user_id=u)
  then return u; end if;
  u := auth.uid();
  if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and email is not null)
  then raise exception 'event_login_required'; end if;
  return u;
end $$;
create or replace function public._event_is_admin() returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  return exists(select 1 from public.sim_event_admins where user_id=public._event_user());
exception when others then return false;
end $$;

create or replace function public.event_operator_login(p_password text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid; token text; expires timestamptz := clock_timestamp()+interval '1 hour';
begin
  -- A random 256-bit password is required, not a human-selected short password.
  if p_password is null or length(p_password)<>64 then raise exception 'event_invalid_credentials'; end if;
  select c.user_id into u from public.sim_event_operator_credentials c
    join public.sim_event_admins a on a.user_id=c.user_id
    where c.password_hash=public._ranking_hash(p_password);
  if u is null then raise exception 'event_invalid_credentials'; end if;
  delete from public.sim_event_operator_sessions where expires_at<=clock_timestamp();
  token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.sim_event_operator_sessions values(public._ranking_hash(token),u,expires);
  return jsonb_build_object('token',token,'expires_at',expires);
end $$;
create or replace function public._event_operator_auth(p_session text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid;
begin
  if p_session is null or length(p_session)<>64 then raise exception 'event_operator_session_expired'; end if;
  select s.user_id into u from public.sim_event_operator_sessions s
    join public.sim_event_operator_credentials c on c.user_id=s.user_id
    join public.sim_event_admins a on a.user_id=s.user_id
    where s.token_hash=public._ranking_hash(p_session) and s.expires_at>clock_timestamp();
  if u is null then raise exception 'event_operator_session_expired'; end if;
  perform set_config('event.operator_id',u::text,true);
end $$;
create or replace function public.event_operator_get(p_session text,p_event text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  perform public._event_operator_auth(p_session);
  result:=public.event_get(p_event);
  perform set_config('event.operator_id','',true);
  return result;
end $$;
create or replace function public.event_operator_action(p_session text,p_event text,p_action text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  perform public._event_operator_auth(p_session);
  result:=public.event_admin(p_event,p_action);
  perform set_config('event.operator_id','',true);
  return result;
end $$;
create or replace function public.event_operator_logout(p_session text) returns void
language sql security definer set search_path=pg_catalog,public as $$
  delete from public.sim_event_operator_sessions where token_hash=public._ranking_hash(p_session)
$$;
revoke all on function public._event_operator_auth(text) from public,anon,authenticated;
revoke all on function public._event_user(),public._event_is_admin() from public,anon,authenticated;
revoke all on function public.event_operator_login(text),public.event_operator_get(text,text),
  public.event_operator_action(text,text,text),public.event_operator_logout(text) from public,anon,authenticated;
grant execute on function public.event_operator_login(text),public.event_operator_get(text,text),
  public.event_operator_action(text,text,text),public.event_operator_logout(text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
