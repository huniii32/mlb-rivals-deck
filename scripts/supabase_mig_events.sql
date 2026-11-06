-- Server-authoritative coffee event. Requires the existing deck-password schema.
-- Apply event-rules-v1.sql after this migration. Publishing is a separate admin action.
begin;
-- Logging in must preserve access to the existing public ranking and inquiry lists.
-- Only columns already displayed publicly are needed by the authenticated client.
revoke select on public.rankings,public.inquiries from authenticated;
grant select(id,deck_name,total,sp,rp,bt,named,deck_json,created_at) on public.rankings to authenticated;
grant select(id,name,body,reply,created_at) on public.inquiries to authenticated;
drop policy if exists "rankings authenticated read" on public.rankings;
create policy "rankings authenticated read" on public.rankings for select to authenticated using(true);
drop policy if exists "inquiries authenticated read" on public.inquiries;
create policy "inquiries authenticated read" on public.inquiries for select to authenticated using(true);
create table if not exists public.sim_event_rules (
  id text primary key, data jsonb not null
);
create table if not exists public.sim_events (
  id text primary key, title text not null, rules_id text not null,
  opens_at timestamptz not null, ends_at timestamptz,
  published boolean not null default false,
  phase text not null default 'open' check (phase in ('open','closed','drawn')),
  closed_at timestamptz, drawn_at timestamptz,
  champion_id uuid, winner_id uuid, winning_ticket uuid,
  check (ends_at is null or ends_at > opens_at),
  check (winner_id is null or champion_id is null or winner_id <> champion_id)
);
create table if not exists public.sim_event_admins (user_id uuid primary key);
create table if not exists public.sim_event_participants (
  id uuid primary key default gen_random_uuid(), event_id text not null references public.sim_events(id),
  ranking_id uuid not null, deck_name text not null, deck_snapshot jsonb,
  joined_at timestamptz not null default clock_timestamp(),
  unique(event_id,ranking_id)
);
-- Upgrade the earlier email pilot without resetting any participation or attempts.
alter table public.sim_event_participants drop column if exists user_id;
alter table public.sim_event_participants add column if not exists deck_snapshot jsonb;
alter table public.sim_events add column if not exists champion_verified_at timestamptz;
alter table public.sim_events add column if not exists champion_delivered_at timestamptz;
alter table public.sim_events add column if not exists winner_verified_at timestamptz;
alter table public.sim_events add column if not exists winner_delivered_at timestamptz;

-- Remove the old Auth-only overloads so no API path bypasses deck ownership checks.
drop function if exists public.event_get(text);
drop function if exists public.event_attempt(text,uuid);
drop function if exists public.event_experience(text,text);
drop function if exists public.event_pick_moment(text,integer);
drop function if exists public.event_claim(text,text);
drop function if exists public._event_member(text);

create table if not exists public.sim_event_attempts (
  id bigint generated always as identity primary key,
  participant_id uuid not null references public.sim_event_participants(id),
  request_id uuid not null, number integer not null check (number between 1 and 5),
  board jsonb not null, score numeric not null,
  achieved_at timestamptz not null default clock_timestamp(),
  unique(participant_id,request_id), unique(participant_id,number)
);
create table if not exists public.sim_event_evidence (
  participant_id uuid not null references public.sim_event_participants(id),
  mission text not null check (mission in ('deck','skills','moment','hof')),
  at timestamptz not null default clock_timestamp(), primary key(participant_id,mission)
);
create table if not exists public.sim_event_tickets (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.sim_event_participants(id),
  mission text not null check (mission in ('deck','skills','moment','hof')),
  issued_at timestamptz not null default clock_timestamp(),
  eligible boolean not null default true, unique(participant_id,mission)
);
create table if not exists public.sim_event_experiences (
  participant_id uuid not null references public.sim_event_participants(id),
  mission text not null check (mission in ('moment','hof')),
  preview jsonb, shuffled jsonb, result jsonb, chosen_slot integer,
  primary key(participant_id,mission)
);
create table if not exists public.sim_event_audit (
  id bigint generated always as identity primary key,
  event_id text not null references public.sim_events(id), action text not null,
  actor uuid not null, at timestamptz not null default clock_timestamp(), details jsonb not null
);
do $$ declare t text; begin
  foreach t in array array['sim_event_rules','sim_events','sim_event_admins','sim_event_participants',
    'sim_event_attempts','sim_event_evidence','sim_event_tickets','sim_event_experiences','sim_event_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
  end loop;
end $$;

-- Core PostgreSQL UUID generation uses cryptographic randomness. The first 32 bits
-- are random (not the UUID version/variant bits), so every value is in [0,1).
create or replace function public._event_random() returns double precision
language sql volatile set search_path=pg_catalog as $$
  select ('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint::double precision / 4294967296.0
$$;
create or replace function public._event_user() returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid := auth.uid();
begin
  if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and email is not null)
  then raise exception 'event_login_required'; end if;
  return u;
end $$;
create or replace function public._event_open(p_event text) returns public.sim_events
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.sim_events;
begin
  select * into e from public.sim_events where id=p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if not e.published or clock_timestamp()<e.opens_at then raise exception 'event_not_open'; end if;
  if e.phase<>'open' or (e.ends_at is not null and clock_timestamp()>=e.ends_at) then raise exception 'event_closed'; end if;
  return e;
end $$;
-- A session token is issued by the existing deck-password verification RPC.
-- Every private read and participant mutation verifies it, regardless of Auth login.
create or replace function public._event_deck(p_ranking_id uuid,p_token text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_ranking_id is null or nullif(p_token,'') is null or not exists(
    select 1 from public.ranking_password_sessions
    where ranking_id=p_ranking_id and token_hash=public._ranking_hash(p_token))
  then raise exception 'event_deck_ownership_required'; end if;
end $$;
create or replace function public._event_member(p_event text,p_ranking_id uuid,p_token text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p uuid;
begin
  perform public._event_deck(p_ranking_id,p_token);
  select id into p from public.sim_event_participants where event_id=p_event and ranking_id=p_ranking_id for update;
  if p is null then raise exception 'event_join_required'; end if;
  return p;
end $$;

-- Public view intentionally excludes email, auth IDs, ownership tokens and hidden cards.
create or replace function public.event_get(p_event text,p_ranking_id uuid default null,p_token text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.sim_events; me public.sim_event_participants; rankings jsonb; tickets jsonb; mine jsonb;
begin
  select * into e from public.sim_events where id=p_event;
  if not found then raise exception 'event_not_found'; end if;
  if p_ranking_id is not null or p_token is not null then
    perform public._event_deck(p_ranking_id,p_token);
    select * into me from public.sim_event_participants where event_id=p_event and ranking_id=p_ranking_id;
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.rank),'[]') into rankings from (
    select row_number() over(order by a.score desc,a.achieved_at,a.id) as rank,
      p.id,p.deck_name,a.score,a.achieved_at,a.board
    from public.sim_event_participants p cross join lateral (
      select * from public.sim_event_attempts where participant_id=p.id order by score desc,achieved_at,id limit 1
    ) a where p.event_id=p_event
  ) r;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'participant_id',p.id,'deck_name',p.deck_name,
    'mission',t.mission,'issued_at',t.issued_at,'eligible',t.eligible) order by t.issued_at,t.id),'[]')
  into tickets from public.sim_event_tickets t join public.sim_event_participants p on p.id=t.participant_id where p.event_id=p_event;
  if me.id is not null then
    mine:=jsonb_build_object('id',me.id,'ranking_id',me.ranking_id,'deck_name',me.deck_name,
      'attempts',(select coalesce(jsonb_agg(jsonb_build_object('number',number,'request_id',request_id,'board',board,'score',score,'achieved_at',achieved_at) order by number),'[]') from public.sim_event_attempts where participant_id=me.id),
      'evidence',(select coalesce(jsonb_object_agg(mission,at),'{}') from public.sim_event_evidence where participant_id=me.id),
      'experiences',(select coalesce(jsonb_object_agg(mission,jsonb_build_object('preview',preview,'result',result,'chosen_slot',chosen_slot)),'{}') from public.sim_event_experiences where participant_id=me.id));
  end if;
  return jsonb_build_object('event',to_jsonb(e),'server_now',clock_timestamp(),'me',mine,
    'is_admin',exists(select 1 from public.sim_event_admins where user_id=auth.uid()),
    'verification_decks',case when exists(select 1 from public.sim_event_admins where user_id=auth.uid()) then
      (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'deck_name',p.deck_name,'joined_at',p.joined_at,'deck',p.deck_snapshot)),'[]')
       from public.sim_event_participants p where p.event_id=p_event and p.id in (e.champion_id,e.winner_id)) else '[]'::jsonb end,
    'rankings',rankings,'tickets',tickets,
    'audit',(select coalesce(jsonb_agg(jsonb_build_object('action',action,'at',at,'details',details) order by id),'[]') from public.sim_event_audit where event_id=p_event));
end $$;

create or replace function public.event_join(p_event text,p_ranking_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.sim_event_participants; r public.rankings;
begin
  -- Event lock serializes registration, attempts, claims and closing in the same order.
  perform 1 from public.sim_events where id=p_event for update;
  perform public._event_deck(p_ranking_id,p_token);
  select * into p from public.sim_event_participants where event_id=p_event and ranking_id=p_ranking_id;
  if found then return public.event_get(p_event,p_ranking_id,p_token); end if;
  perform public._event_open(p_event);
  select * into r from public.rankings where id=p_ranking_id;
  if not found or r.named<1 then raise exception 'event_registered_deck_required'; end if;
  insert into public.sim_event_participants(event_id,ranking_id,deck_name,deck_snapshot)
  values(p_event,r.id,r.deck_name,r.deck_json) returning * into p;
  insert into public.sim_event_evidence(participant_id,mission) values(p.id,'deck');
  return public.event_get(p_event,p_ranking_id,p_token);
end $$;

create or replace function public.event_attempt(p_event text,p_request_id uuid,p_ranking_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.sim_events; p uuid; n integer; rules jsonb; tier text; pool jsonb;
  chosen jsonb; board jsonb := '[]'; used text[] := '{}'; score numeric := 0; total numeric; roll numeric; i integer;
begin
  perform 1 from public.sim_events where id=p_event for update;
  p:=public._event_member(p_event,p_ranking_id,p_token);
  if p_request_id is null then raise exception 'event_request_required'; end if;
  -- A timed-out request can be retried even after the fifth attempt or closing.
  if exists(select 1 from public.sim_event_attempts where participant_id=p and request_id=p_request_id)
  then return public.event_get(p_event,p_ranking_id,p_token); end if;
  e:=public._event_open(p_event);
  select count(*)+1 into n from public.sim_event_attempts where participant_id=p;
  if n>5 then raise exception 'event_attempt_limit'; end if;
  select data into rules from public.sim_event_rules where id=e.rules_id;
  if rules is null then raise exception 'event_rules_missing'; end if;
  for i in 1..3 loop
    roll:=public._event_random();
    tier:=case when i=1 then 'Gold' when roll<0.35 then 'Bronze' when roll<0.75 then 'Silver' else 'Gold' end;
    select jsonb_agg(v),sum((v->>'weight')::numeric) into pool,total from jsonb_array_elements(rules->'skills') v
      where v->>'tier'=tier and not (v->>'name'=any(used));
    if total is null or total<=0 then raise exception 'event_rules_invalid'; end if;
    roll:=public._event_random()*total;
    for chosen in select value from jsonb_array_elements(pool) loop
      roll:=roll-(chosen->>'weight')::numeric;
      exit when roll<0;
    end loop;
    used:=array_append(used,chosen->>'name');
    score:=score+(chosen->>'score')::numeric;
    board:=board||jsonb_build_array((chosen-'weight')||jsonb_build_object('level','S'));
  end loop;
  insert into public.sim_event_attempts(participant_id,request_id,number,board,score)
    values(p,p_request_id,n,board,round(score,2));
  insert into public.sim_event_evidence(participant_id,mission) values(p,'skills') on conflict do nothing;
  return public.event_get(p_event,p_ranking_id,p_token);
end $$;

create or replace function public.event_experience(p_event text,p_mission text,p_ranking_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.sim_events; p uuid; rules jsonb; pool jsonb; preview jsonb := '[]'; hidden jsonb;
  chosen jsonb; grade text; roll numeric; total numeric; i integer;
begin
  perform 1 from public.sim_events where id=p_event for update;
  p:=public._event_member(p_event,p_ranking_id,p_token);
  if p_mission is null or p_mission not in ('moment','hof') then raise exception 'event_invalid_mission'; end if;
  if exists(select 1 from public.sim_event_experiences where participant_id=p and mission=p_mission)
  then return public.event_get(p_event,p_ranking_id,p_token); end if;
  e:=public._event_open(p_event);
  select data into rules from public.sim_event_rules where id=e.rules_id;
  if rules is null then raise exception 'event_rules_missing'; end if;
  if p_mission='hof' then
    select sum((v->>'weight')::numeric) into total from jsonb_array_elements(rules->'hof') v;
    if total is null or total<=0 then raise exception 'event_rules_invalid'; end if;
    roll:=public._event_random()*total;
    for chosen in select value from jsonb_array_elements(rules->'hof') loop
      roll:=roll-(chosen->>'weight')::numeric; exit when roll<0;
    end loop;
    insert into public.sim_event_experiences(participant_id,mission,result) values(p,'hof',chosen-'weight');
    insert into public.sim_event_evidence(participant_id,mission) values(p,'hof') on conflict do nothing;
  else
    for i in 1..5 loop
      grade:=case when public._event_random()<0.15 then 'supreme' else 'moment' end;
      select jsonb_agg(v) into pool from jsonb_array_elements(rules->'moment') v where v->>'grade'=grade;
      if pool is null then raise exception 'event_rules_invalid'; end if;
      chosen:=pool->floor(public._event_random()*jsonb_array_length(pool))::integer;
      preview:=preview||jsonb_build_array(chosen);
    end loop;
    -- Cryptographic random ordering is kept private until a single slot is selected.
    select jsonb_agg(value order by gen_random_uuid()) into hidden from jsonb_array_elements(preview);
    insert into public.sim_event_experiences(participant_id,mission,preview,shuffled) values(p,'moment',preview,hidden);
  end if;
  return public.event_get(p_event,p_ranking_id,p_token);
end $$;

create or replace function public.event_pick_moment(p_event text,p_slot integer,p_ranking_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p uuid; x public.sim_event_experiences;
begin
  perform 1 from public.sim_events where id=p_event for update;
  p:=public._event_member(p_event,p_ranking_id,p_token);
  if p_slot is null or p_slot not between 0 and 4 then raise exception 'event_invalid_slot'; end if;
  select * into x from public.sim_event_experiences where participant_id=p and mission='moment';
  if not found then raise exception 'event_experience_required'; end if;
  if x.result is not null then return public.event_get(p_event,p_ranking_id,p_token); end if;
  perform public._event_open(p_event);
  update public.sim_event_experiences set result=shuffled->p_slot,chosen_slot=p_slot where participant_id=p and mission='moment';
  insert into public.sim_event_evidence(participant_id,mission) values(p,'moment') on conflict do nothing;
  return public.event_get(p_event,p_ranking_id,p_token);
end $$;

create or replace function public.event_claim(p_event text,p_mission text,p_ranking_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p uuid;
begin
  perform 1 from public.sim_events where id=p_event for update;
  p:=public._event_member(p_event,p_ranking_id,p_token);
  if p_mission is null or p_mission not in ('deck','skills','moment','hof') then raise exception 'event_invalid_mission'; end if;
  if exists(select 1 from public.sim_event_tickets where participant_id=p and mission=p_mission)
  then return public.event_get(p_event,p_ranking_id,p_token); end if;
  perform public._event_open(p_event);
  if not exists(select 1 from public.sim_event_evidence where participant_id=p and mission=p_mission)
  then raise exception 'event_evidence_required'; end if;
  insert into public.sim_event_tickets(participant_id,mission) values(p,p_mission);
  return public.event_get(p_event,p_ranking_id,p_token);
end $$;

create or replace function public.event_admin(p_event text,p_action text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid := public._event_user(); e public.sim_events; champ uuid; ticket uuid; winner uuid; n integer; removed integer; prize text; winner_id uuid; verified timestamptz; delivered timestamptz; recorded timestamptz;
begin
  if not exists(select 1 from public.sim_event_admins where user_id=u) then raise exception 'event_admin_required'; end if;
  select * into e from public.sim_events where id=p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if p_action='publish' then
    if e.phase<>'open' then raise exception 'event_closed'; end if;
    if e.published then return public.event_get(p_event); end if;
    if not exists(select 1 from public.sim_event_rules where id=e.rules_id) then raise exception 'event_rules_missing'; end if;
    update public.sim_events set published=true where id=p_event;
    insert into public.sim_event_audit(event_id,action,actor,details) values(p_event,'publish',u,jsonb_build_object('opens_at',e.opens_at,'ends_at',e.ends_at,'rules_id',e.rules_id));
  elsif p_action='close' then
    if e.phase<>'open' then return public.event_get(p_event); end if;
    if not e.published or clock_timestamp()<e.opens_at then raise exception 'event_not_open'; end if;
    select p.id into champ from public.sim_event_participants p join public.sim_event_attempts a on a.participant_id=p.id
      where p.event_id=p_event order by a.score desc,a.achieved_at,a.id limit 1;
    update public.sim_event_tickets t set eligible=(champ is null or t.participant_id<>champ)
      from public.sim_event_participants p where t.participant_id=p.id and p.event_id=p_event;
    select count(*) filter(where t.eligible),count(*) filter(where not t.eligible) into n,removed
      from public.sim_event_tickets t join public.sim_event_participants p on p.id=t.participant_id where p.event_id=p_event;
    update public.sim_events set phase='closed',closed_at=clock_timestamp(),champion_id=champ where id=p_event;
    insert into public.sim_event_audit(event_id,action,actor,details)
      values(p_event,'close',u,jsonb_build_object('champion_id',champ,'eligible_tickets',n,'excluded_tickets',removed,'tie_rule','earliest_server_achievement'));
  elsif p_action='draw' then
    if e.phase='drawn' then return public.event_get(p_event); end if;
    if e.phase<>'closed' then raise exception 'event_close_first'; end if;
    select count(*) into n from public.sim_event_tickets t join public.sim_event_participants p on p.id=t.participant_id
      where p.event_id=p_event and t.eligible and (e.champion_id is null or p.id<>e.champion_id);
    if n>0 then
      select t.id,p.id into ticket,winner from public.sim_event_tickets t join public.sim_event_participants p on p.id=t.participant_id
        where p.event_id=p_event and t.eligible and (e.champion_id is null or p.id<>e.champion_id)
        order by t.id offset floor(public._event_random()*n)::integer limit 1;
    end if;
    update public.sim_events set phase='drawn',drawn_at=clock_timestamp(),winner_id=winner,winning_ticket=ticket where id=p_event;
    insert into public.sim_event_audit(event_id,action,actor,details)
      values(p_event,'draw',u,jsonb_build_object('eligible_tickets',n,'winner_id',winner,'winning_ticket',ticket));
  elsif p_action in ('verify_champion','verify_winner','deliver_champion','deliver_winner') then
    prize:=split_part(p_action,'_',2);
    winner_id:=case when prize='champion' then e.champion_id else e.winner_id end;
    verified:=case when prize='champion' then e.champion_verified_at else e.winner_verified_at end;
    delivered:=case when prize='champion' then e.champion_delivered_at else e.winner_delivered_at end;
    if winner_id is null or e.phase='open' then raise exception 'event_winner_required'; end if;
    if p_action like 'verify_%' then
      if verified is not null then return public.event_get(p_event); end if;
      recorded:=clock_timestamp();
      if prize='champion' then update public.sim_events set champion_verified_at=recorded where id=p_event;
      else update public.sim_events set winner_verified_at=recorded where id=p_event; end if;
    else
      if verified is null then raise exception 'event_verification_required'; end if;
      if delivered is not null then return public.event_get(p_event); end if;
      recorded:=clock_timestamp();
      if prize='champion' then update public.sim_events set champion_delivered_at=recorded where id=p_event;
      else update public.sim_events set winner_delivered_at=recorded where id=p_event; end if;
    end if;
    insert into public.sim_event_audit(event_id,action,actor,details)
      values(p_event,p_action,u,jsonb_build_object('participant_id',winner_id));
  else raise exception 'event_invalid_action'; end if;
  return public.event_get(p_event);
end $$;

-- Helpers are private. Participant RPCs authenticate deck sessions; only admin actions require Auth.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like '\_event\_%' escape '\' or p.proname in
      ('event_get','event_join','event_attempt','event_experience','event_pick_moment','event_claim','event_admin')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.proname='event_admin' then execute format('grant execute on function %s to authenticated',f.signature);
    elsif f.proname not like '\_event\_%' escape '\' then execute format('grant execute on function %s to anon,authenticated',f.signature); end if;
  end loop;
end $$;
insert into public.sim_events(id,title,rules_id,opens_at)
values('coffee-20261109','스킬 챌린지 & 커피 이벤트','coffee-sp-s-v1','2026-11-09T00:00:00+09:00') on conflict(id) do nothing;
notify pgrst, 'reload schema';
commit;
