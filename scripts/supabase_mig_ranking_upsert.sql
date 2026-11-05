-- Apply after supabase_mig_owner_codes.sql. Backwards-compatible RPC signatures.
-- Repeated submissions of the same owner's name update one row, including concurrent tabs.
-- Names alone never establish ownership. Existing duplicate rows are retained.
begin;

create or replace function public._rank_name(p text)
returns text language sql immutable set search_path = pg_catalog
as $$ select lower(btrim(regexp_replace(coalesce(p, ''), '[[:space:]]+', ' ', 'g'))); $$;
revoke all on function public._rank_name(text) from public, anon, authenticated;

create or replace function public.insert_ranking_owned(
  p_client_id text, p_code text, p_name text, p_total double precision,
  p_sp double precision, p_rp double precision, p_bt double precision,
  p_named integer, p_deck jsonb
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_owner uuid; v_id uuid;
begin
  v_owner := public._owner_of(p_code);
  if v_owner is null then raise exception 'invalid_code'; end if;
  if public._rank_name(p_name) = '' then raise exception 'invalid_name'; end if;
  -- A single lock per owner serializes inserts and renames, even for different names.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select r.id into v_id from public.rankings r
    join public.ranking_owners o on o.ranking_id = r.id
    where o.owner_id = v_owner and public._rank_name(r.deck_name) = public._rank_name(p_name)
    order by r.created_at desc, r.id limit 1;
  if v_id is not null then
    update public.rankings set deck_name = btrim(p_name), total = p_total, sp = p_sp,
      rp = p_rp, bt = p_bt, named = p_named, deck_json = p_deck where id = v_id;
    return v_id;
  end if;
  if exists (select 1 from public.rankings where client_id is not distinct from p_client_id
    and created_at > now() - interval '20 seconds') then raise exception 'rate_limited'; end if;
  insert into public.rankings(deck_name,total,sp,rp,bt,named,deck_json,client_id)
    values(btrim(p_name),p_total,p_sp,p_rp,p_bt,p_named,p_deck,p_client_id) returning id into v_id;
  insert into public.ranking_owners(ranking_id,owner_id) values(v_id,v_owner);
  return v_id;
end;
$$;

create or replace function public.update_ranking_owned(
  p_id uuid, p_code text, p_name text, p_total double precision,
  p_sp double precision, p_rp double precision, p_bt double precision,
  p_named integer, p_deck jsonb
) returns boolean language plpgsql security definer set search_path = public
as $$
declare v_owner uuid;
begin
  v_owner := public._owner_of(p_code);
  if v_owner is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  if not exists(select 1 from public.ranking_owners where ranking_id = p_id and owner_id = v_owner) then return false; end if;
  if public._rank_name(p_name) = '' then raise exception 'invalid_name'; end if;
  -- Allow editing a historical duplicate without creating more duplicates by rename.
  if exists(select 1 from public.rankings r where r.id = p_id
    and public._rank_name(r.deck_name) <> public._rank_name(p_name))
    and exists(select 1 from public.rankings r join public.ranking_owners o on o.ranking_id = r.id
      where o.owner_id = v_owner and r.id <> p_id and public._rank_name(r.deck_name) = public._rank_name(p_name))
  then raise exception 'duplicate_owned_name'; end if;
  update public.rankings set deck_name=btrim(p_name), total=p_total, sp=p_sp, rp=p_rp,
    bt=p_bt, named=p_named, deck_json=p_deck where id=p_id;
  return found;
end;
$$;

revoke all on function public.insert_ranking_owned(text,text,text,double precision,double precision,double precision,double precision,integer,jsonb) from public;
revoke all on function public.update_ranking_owned(uuid,text,text,double precision,double precision,double precision,double precision,integer,jsonb) from public;
grant execute on function public.insert_ranking_owned(text,text,text,double precision,double precision,double precision,double precision,integer,jsonb) to anon, authenticated;
grant execute on function public.update_ranking_owned(uuid,text,text,double precision,double precision,double precision,double precision,integer,jsonb) to anon, authenticated;
commit;
