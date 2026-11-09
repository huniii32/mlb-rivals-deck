-- Apply once in Supabase SQL Editor after the existing ranking migrations.
-- Existing rankings and event participation are retained. Only new writes are checked.
begin;
create or replace function public._ranking_validate_roster(p_deck jsonb) returns integer
language plpgsql immutable set search_path=pg_catalog as $$
declare p jsonb; r integer; seen integer[] := '{}'; role text; named boolean;
  batters integer:=0; starters integer:=0; relief integer:=0; closers integer:=0;
begin
  if jsonb_typeof(p_deck->'players') is distinct from 'array' then raise exception 'ranking_roster_invalid'; end if;
  if jsonb_array_length(p_deck->'players') not between 14 and 21 then raise exception 'ranking_roster_invalid'; end if;
  for p in select value from jsonb_array_elements(p_deck->'players') loop
    if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'name') is distinct from 'string'
      or jsonb_typeof(p->'pos') is distinct from 'string' or jsonb_typeof(p->'excelRow') is distinct from 'number'
      or coalesce(p->>'excelRow','') not in ('11','12','13','14','15','16','17','18','19','22','23','24','25','26','27','28','29','30','31','32','33')
    then raise exception 'ranking_roster_invalid'; end if;
    r := (p->>'excelRow')::integer;
    if r=any(seen) then raise exception 'ranking_roster_invalid'; end if;
    seen := array_append(seen,r);
    if p->>'kind' is distinct from (case when r between 11 and 19 then 'batter' else 'pitcher' end)
    then raise exception 'ranking_roster_invalid'; end if;
    -- Match JS trim for whitespace-only player names, including NBSP/BOM/full-width spaces.
    named := regexp_replace(p->>'name','[[:space:] ﻿　]','','g') <> '';
    if r between 11 and 19 then
      if named then batters:=batters+1; end if;
    elsif r between 22 and 26 then
      if named then starters:=starters+1; end if;
    else
      role := p->>'bullpenRole';
      if p ? 'bullpenRole' and (role is null or role not in ('winning','chasing','long','closer'))
      then raise exception 'ranking_roster_invalid'; end if;
      -- Explicit bullpen role wins over legacy row/position labels, matching bullpenRole().
      if role is null then
        role := case when left(p->>'pos',2)='CP' or r=30 then 'closer'
          when r=28 then 'chasing' when r=29 then 'long' else 'winning' end;
      end if;
      if named then
        if role='closer' then closers:=closers+1; else relief:=relief+1; end if;
      end if;
    end if;
  end loop;
  if batters<9 or starters<5 or relief<3 or closers<1 then
    raise exception 'ranking_roster_incomplete' using detail=jsonb_build_object(
      'batter',batters,'starter',starters,'relief',relief,'closer',closers)::text;
  end if;
  return batters+starters+relief+closers;
end $$;

-- A table trigger covers password, legacy token, owner-code and direct write paths.
-- It also derives the public count from the actual names rather than trusting p_named.
create or replace function public._ranking_enforce_roster() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  new.named := public._ranking_validate_roster(new.deck_json);
  return new;
end $$;
revoke all on function public._ranking_validate_roster(jsonb),public._ranking_enforce_roster() from public,anon,authenticated;
drop trigger if exists rankings_require_roster on public.rankings;
create trigger rankings_require_roster
  before insert or update of deck_json,named,deck_name,total,sp,rp,bt on public.rankings
  for each row execute function public._ranking_enforce_roster();
notify pgrst, 'reload schema';
commit;
