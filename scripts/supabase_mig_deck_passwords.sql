-- 같은 이름은 비밀번호를 확인한 뒤 기존 랭킹을 갱신한다. 이름 중복을 막는 고유 인덱스를 포함한다.
-- 새 비밀번호는 숫자 4자리. 이미 적용했다면 이 파일 전체를 다시 실행해 갱신한다.
-- 기존 비밀번호 해시·기기 세션은 보존하며 이전 비밀번호로 가져오기도 계속 지원한다.
-- 선행: 기존 owner_codes 마이그레이션. 운영 데이터 삭제 없이 덱별 비밀번호와 기기별 수정 권한을 추가한다.
begin;
create extension if not exists pgcrypto;
create table if not exists public.ranking_passwords (
  ranking_id uuid primary key references public.rankings(id) on delete cascade,
  password_hash text not null,
  creation_hash text not null unique
);
create table if not exists public.ranking_password_sessions (
  token_hash text primary key,
  ranking_id uuid not null references public.rankings(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ranking_password_sessions_rank_idx on public.ranking_password_sessions(ranking_id);
create table if not exists public.ranking_password_attempts (
  ranking_id uuid primary key references public.rankings(id) on delete cascade,
  started_at timestamptz not null default now(), attempts integer not null default 0
);
alter table public.ranking_passwords enable row level security;
alter table public.ranking_password_sessions enable row level security;
alter table public.ranking_password_attempts enable row level security;
revoke all on public.ranking_passwords, public.ranking_password_sessions, public.ranking_password_attempts from public, anon, authenticated;
alter table public.rankings drop constraint if exists rankings_named_check;
alter table public.rankings add constraint rankings_named_check check (named between 0 and 21);
alter table public.rankings drop constraint if exists rankings_name_required_check;
alter table public.rankings add constraint rankings_name_required_check check (char_length(btrim(deck_name)) between 1 and 50) not valid;
drop policy if exists "rankings public insert" on public.rankings;
revoke insert, update, delete on public.rankings from anon, authenticated;
-- 신규 등록은 비밀번호 필수 RPC로 제한하고 기존 인증 갱신은 이전 완료까지 유지한다.
revoke execute on function public.insert_ranking(text,text,double precision,double precision,double precision,double precision,integer,jsonb,text) from public, anon, authenticated;
revoke execute on function public.insert_ranking_owned(text,text,text,double precision,double precision,double precision,double precision,integer,jsonb) from public, anon, authenticated;

create or replace function public._ranking_hash(p text) returns text
language sql immutable strict set search_path=pg_catalog
as $$ select encode(sha256(convert_to(p,'UTF8')),'hex') $$;

-- bcrypt 입력은 SHA-256 hex(64 bytes)로 고정해 긴 UTF-8 비밀번호도 잘리지 않게 한다.
-- 기존 pgcrypto가 public/ extensions 어느 스키마에 설치되어 있어도 그 위치를 사용한다.
create or replace function public._ranking_password_digest(p text, existing_hash text default null) returns text
language plpgsql security definer set search_path=pg_catalog as $$
declare ns name; result text; input text;
begin
  select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  input := public._ranking_hash(p);
  if existing_hash is null then
    execute format('select %I.crypt($1,%I.gen_salt(''bf'',10))',ns,ns) into result using input;
  else execute format('select %I.crypt($1,$2)',ns) into result using input,existing_hash;
  end if;
  return result;
end $$;

-- 실패를 예외로 던지지 않아 시도 횟수가 트랜잭션 롤백으로 사라지지 않게 한다.
create or replace function public._ranking_check_password(p_id uuid,p_password text) returns text
language plpgsql security definer set search_path=pg_catalog,public as $$
declare h text; n integer;
begin
  select password_hash into h from public.ranking_passwords where ranking_id=p_id for update;
  if not found then return 'invalid_password'; end if;
  insert into public.ranking_password_attempts(ranking_id) values(p_id) on conflict do nothing;
  update public.ranking_password_attempts set attempts=0,started_at=now() where ranking_id=p_id and started_at < now()-interval '1 minute';
  select attempts into n from public.ranking_password_attempts where ranking_id=p_id;
  if n>=10 then return 'rate_limited'; end if;
  update public.ranking_password_attempts set attempts=attempts+1 where ranking_id=p_id;
  if p_password is null or char_length(p_password)>128 or public._ranking_password_digest(p_password,h) is distinct from h then return 'invalid_password'; end if;
  delete from public.ranking_password_attempts where ranking_id=p_id;
  return 'ok';
end $$;

create or replace function public._ranking_validate(p_name text,p_named integer,p_deck jsonb) returns void
language plpgsql set search_path=pg_catalog as $$
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 50 then raise exception 'name_required'; end if;
  if p_named is null or p_named not between 0 and 21 or jsonb_typeof(p_deck->'players') is distinct from 'array' then raise exception 'invalid_deck'; end if;
  if jsonb_array_length(p_deck->'players') not between 14 and 21 then raise exception 'invalid_deck'; end if;
end $$;

-- 앞뒤/연속 공백과 영문 대소문자 차이를 같은 이름으로 취급한다.
create or replace function public._ranking_name(p text) returns text
language sql immutable set search_path=pg_catalog
as $$ select lower(btrim(regexp_replace(coalesce(p,''),'[[:space:]]+',' ','g'))) $$;
revoke all on function public._ranking_name(text) from public,anon,authenticated;
-- 기존 글은 삭제하지 않는다. 이미 중복이 있으면 트랜잭션을 중단하여 원본을 유지한다.
do $$ begin
  if exists(select 1 from public.rankings group by public._ranking_name(deck_name) having count(*)>1)
  then raise exception 'duplicate_ranking_names: resolve existing duplicate names before applying'; end if;
end $$;
create unique index if not exists rankings_name_unique on public.rankings(public._ranking_name(deck_name));

create or replace function public.create_ranking_password(
 p_client_id text,p_deck_id text,p_password text,p_name text,p_total double precision,
 p_sp double precision,p_rp double precision,p_bt double precision,p_named integer,p_deck jsonb,
 p_existing_id uuid default null,p_token text default null,p_code text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare rid uuid; creation text; tok text; verdict text; name_key text;
begin
  perform public._ranking_validate(p_name,p_named,p_deck);
  if p_password is null or char_length(p_password) <> 4 or p_password !~ '^[0-9]{4}$' then raise exception 'password_length'; end if;
  if nullif(p_client_id,'') is null or nullif(p_deck_id,'') is null then raise exception 'invalid_deck'; end if;
  creation:=public._ranking_hash(p_client_id||'|'||p_deck_id);
  name_key:=public._ranking_name(p_name);
  -- 같은 기기/이름의 동시 재시도를 직렬화한다. 비밀번호 확인 전에 어느 글도 변경하지 않는다.
  perform pg_advisory_xact_lock(hashtextextended('ranking-create:'||creation,0));
  perform pg_advisory_xact_lock(hashtextextended('ranking-name:'||name_key,0));
  select id into rid from public.rankings where public._ranking_name(deck_name)=name_key;
  if rid is null then
    select ranking_id into rid from public.ranking_passwords where creation_hash=creation;
    if rid is null then rid:=p_existing_id; end if;
  end if;
  if rid is not null then
    if exists(select 1 from public.ranking_passwords where ranking_id=rid) then
      verdict:=public._ranking_check_password(rid,p_password);
      if verdict<>'ok' then return jsonb_build_object('error',verdict); end if;
    elsif not exists(select 1 from public.ranking_owners o where o.ranking_id=rid and
      ((nullif(p_token,'') is not null and o.token_hash=public._hash(p_token)) or
       (nullif(p_code,'') is not null and o.owner_id=public._owner_of(p_code)))) then
      return jsonb_build_object('error','ownership_required');
    end if;
  else
    if exists(select 1 from public.rankings where client_id=p_client_id and created_at>now()-interval '20 seconds') then return jsonb_build_object('error','rate_limited'); end if;
    insert into public.rankings(deck_name,total,sp,rp,bt,named,deck_json,client_id)
    values(btrim(p_name),p_total,p_sp,p_rp,p_bt,p_named,p_deck-'rank'-'password'-'token',p_client_id) returning id into rid;
  end if;
  insert into public.ranking_passwords(ranking_id,password_hash,creation_hash)
  values(rid,public._ranking_password_digest(p_password),creation) on conflict(ranking_id) do nothing;
  update public.rankings set deck_name=btrim(p_name),total=p_total,sp=p_sp,rp=p_rp,bt=p_bt,named=p_named,
    deck_json=(p_deck-'rank'-'password'-'token')||jsonb_build_object('name',btrim(p_name)) where id=rid;
  delete from public.ranking_owners where ranking_id=rid;
  tok:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.ranking_password_sessions(token_hash,ranking_id) values(public._ranking_hash(tok),rid);
  return jsonb_build_object('id',rid,'token',tok);
end $$;

-- 새 클라이언트는 이 진입점을 사용한다. 마이그레이션 전 서버에서 옛 등록 동작으로
-- 중복을 만들지 않고 함수 미설치 오류를 표시하도록 이름을 분리한다.
create or replace function public.save_ranking_password(
 p_client_id text,p_deck_id text,p_password text,p_name text,p_total double precision,
 p_sp double precision,p_rp double precision,p_bt double precision,p_named integer,p_deck jsonb,
 p_existing_id uuid default null,p_token text default null,p_code text default null
) returns jsonb language sql set search_path=pg_catalog,public as $$
  select public.create_ranking_password(p_client_id,p_deck_id,p_password,p_name,p_total,
    p_sp,p_rp,p_bt,p_named,p_deck,p_existing_id,p_token,p_code)
$$;
revoke all on function public.save_ranking_password(text,text,text,text,double precision,double precision,double precision,double precision,integer,jsonb,uuid,text,text) from public;
grant execute on function public.save_ranking_password(text,text,text,text,double precision,double precision,double precision,double precision,integer,jsonb,uuid,text,text) to anon,authenticated;

create or replace function public.update_ranking_password(
 p_id uuid,p_token text,p_name text,p_total double precision,p_sp double precision,p_rp double precision,
 p_bt double precision,p_named integer,p_deck jsonb
) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.ranking_password_sessions where ranking_id=p_id and token_hash=public._ranking_hash(p_token)) then return false; end if;
  perform public._ranking_validate(p_name,p_named,p_deck);
  perform pg_advisory_xact_lock(hashtextextended('ranking-name:'||public._ranking_name(p_name),0));
  if exists(select 1 from public.rankings where id<>p_id and public._ranking_name(deck_name)=public._ranking_name(p_name))
  then raise exception 'duplicate_name'; end if;
  update public.rankings set deck_name=btrim(p_name),total=p_total,sp=p_sp,rp=p_rp,bt=p_bt,named=p_named,
    deck_json=(p_deck-'rank'-'password'-'token')||jsonb_build_object('name',btrim(p_name)) where id=p_id;
  return found;
end $$;

create or replace function public.restore_ranking_password(p_id uuid,p_password text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare verdict text; tok text; payload jsonb;
begin
  verdict:=public._ranking_check_password(p_id,p_password);
  if verdict<>'ok' then return jsonb_build_object('error',verdict); end if;
  select deck_json into payload from public.rankings where id=p_id;
  tok:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.ranking_password_sessions(token_hash,ranking_id) values(public._ranking_hash(tok),p_id);
  return jsonb_build_object('id',p_id,'deck',payload,'token',tok);
end $$;

create or replace function public.delete_ranking_password(p_id uuid,p_token text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.ranking_password_sessions where ranking_id=p_id and token_hash=public._ranking_hash(p_token)) then return false; end if;
  delete from public.rankings where id=p_id;
  return found;
end $$;

revoke all on function public._ranking_hash(text),public._ranking_password_digest(text,text),public._ranking_check_password(uuid,text),public._ranking_validate(text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.create_ranking_password(text,text,text,text,double precision,double precision,double precision,double precision,integer,jsonb,uuid,text,text),public.update_ranking_password(uuid,text,text,double precision,double precision,double precision,double precision,integer,jsonb),public.restore_ranking_password(uuid,text),public.delete_ranking_password(uuid,text) from public;
grant execute on function public.create_ranking_password(text,text,text,text,double precision,double precision,double precision,double precision,integer,jsonb,uuid,text,text),public.update_ranking_password(uuid,text,text,double precision,double precision,double precision,double precision,integer,jsonb),public.restore_ranking_password(uuid,text),public.delete_ranking_password(uuid,text) to anon,authenticated;
commit;
