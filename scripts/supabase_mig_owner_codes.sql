-- 랭킹 소유 인증 보안 수정: owner_token 노출 차단 + "내 코드(owner code)" 도입
-- Supabase 대시보드 → SQL Editor → New query에 붙여넣고 통째로 Run
--
-- [문제] public.rankings.owner_token 은 글 수정·삭제 권한을 주는 비밀값인데,
--   "rankings public read" 정책(select using true) 때문에 anon 키(웹에 공개)로
--   select=* 하면 전 행의 토큰이 그대로 보였음. Realtime(postgres_changes)도 전체 행을
--   보내므로 컬럼 REVOKE로는 부족 → 비밀을 공개 테이블 밖으로 빼서 해시로만 보관.
--
-- [구조]
--   owners          : 사용자 "내 코드"의 해시만 저장 (코드 원문은 create_owner 응답에서 딱 한 번만 보임)
--   ranking_owners  : 랭킹별 소유 증명 (예전 토큰의 해시 token_hash / 내 코드 소유자 owner_id)
--   두 테이블은 RLS 켬 + 정책 없음 + anon/authenticated 권한 전부 회수 → API로 접근 불가.
--   해시는 내장 함수만 사용 (sha256, gen_random_uuid) — 확장(pgcrypto) 불필요.
--
-- [특성]
--   * 멱등: 여러 번 Run 해도 안전 (전체가 한 트랜잭션 — 중간에 실패하면 아무것도 적용 안 됨).
--   * rankings.owner_token 컬럼을 DROP 함 (되돌릴 수 없음): 원문 토큰은 사라지지만
--     해시가 남아 있어서 기존 사용자 브라우저에 저장된 토큰으로 수정·삭제 검증은 계속 동작.
--   * claim_ranking(예전 토큰 + 내 코드)이 성공하면 그 글의 예전 토큰은 폐기됨(내 코드 전용으로 전환).
--   * [잔존 위험] 이 수정 전까지 owner_token 이 anon에게 공개돼 있었으므로 이미 긁어간 토큰이 있을 수 있음.
--     그 토큰은 "진짜 주인이 claim 하기 전까지" 계속 유효함 (수정·삭제 가능).
--     반대로 긁어간 사람이 자기 코드로 먼저 claim 하면 진짜 주인이 잠길 수 있음.
--     계정(로그인)이 없는 구조에서는 피할 수 없어 감수하는 것으로 판단함 → 새 웹 클라이언트가
--     기존 사용자의 글을 가능한 빨리 자동 claim 하도록 하는 것이 최선의 완화책.
--   * 기존 RPC(insert_ranking / update_ranking / delete_ranking)는 이름·인자·반환형 그대로
--     유지(내부만 해시 비교로 교체) → 옛 웹 클라이언트가 캐시에 남아 있어도 안 깨짐.
--     따라서 새 웹 클라이언트 배포 "전에" 이 스크립트를 먼저 Run 해도 안전.
--   * 적용 순서: supabase_schema → ranking_delete → rate_limit → inquiry_admin → (이 파일)
--   * 알려진 한계: rankings.client_id 는 여전히 anon이 읽을 수 있음 (민감도 낮음, 의도적으로 유지).
--     inquiries / app_config 는 건드리지 않음.

begin;

-- 1) 비공개 테이블 -----------------------------------------------------------
create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.ranking_owners (
  ranking_id uuid primary key references public.rankings(id) on delete cascade,
  token_hash text,
  owner_id uuid references public.owners(id) on delete set null
);

create index if not exists ranking_owners_owner_idx on public.ranking_owners (owner_id);
create index if not exists owners_client_created_idx on public.owners (client_id, created_at desc);

alter table public.owners enable row level security;
alter table public.ranking_owners enable row level security;
-- 정책 없음 → anon/authenticated는 읽기·쓰기 불가 (SECURITY DEFINER 함수만 접근)
revoke all on table public.owners from public, anon, authenticated;
revoke all on table public.ranking_owners from public, anon, authenticated;

-- 2) 비공개 헬퍼 (API로 호출 불가) --------------------------------------------
create or replace function public._hash(p text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- 코드 입력 정규화: 대시·공백·대소문자 무시
create or replace function public._norm_code(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

-- 코드 → owners.id (없으면 null)
create or replace function public._owner_of(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id from public.owners o
  where o.code_hash = public._hash(public._norm_code(p_code));
$$;

revoke all on function public._hash(text) from public, anon, authenticated;
revoke all on function public._norm_code(text) from public, anon, authenticated;
revoke all on function public._owner_of(text) from public, anon, authenticated;

-- 3) 기존 토큰 이관 → 검증 → owner_token 컬럼 삭제 (컬럼이 있을 때만: 멱등) ----------
do $mig$
declare
  v_missing bigint;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rankings' and column_name = 'owner_token'
  ) then
    -- 이관 중 옛 RPC가 새 토큰을 넣고 가는 틈이 없도록 잠금 (커밋까지 유지)
    lock table public.rankings in access exclusive mode;

    -- 빈 문자열 토큰은 인증 수단으로 쓰지 않음 (hash null → 어떤 입력과도 불일치)
    execute $q$
      insert into public.ranking_owners (ranking_id, token_hash)
      select r.id, case when r.owner_token = '' then null else public._hash(r.owner_token) end
      from public.rankings r
      where r.owner_token is not null
      on conflict do nothing
    $q$;

    -- 검증: 토큰이 있던 모든 행이 같은 해시로 이관됐는지. 하나라도 아니면 예외 → 전체 롤백.
    execute $q$
      select count(*) from public.rankings r
      where r.owner_token is not null
        and not exists (
          select 1 from public.ranking_owners o
          where o.ranking_id = r.id
            and o.token_hash is not distinct from
                case when r.owner_token = '' then null else public._hash(r.owner_token) end
        )
    $q$ into v_missing;
    if v_missing > 0 then
      raise exception 'owner_token 이관 검증 실패: % 행 누락 — 롤백', v_missing;
    end if;

    execute 'alter table public.rankings drop column owner_token';
  end if;
end
$mig$;

-- 4) 기존 RPC (이름·인자·반환형 그대로) — ranking_owners 해시 비교로 재구현 -------------
create or replace function public.insert_ranking(
  p_client_id text, p_name text, p_total double precision,
  p_sp double precision, p_rp double precision, p_bt double precision,
  p_named integer, p_deck jsonb, p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if exists (
    select 1 from public.rankings
    where client_id is not distinct from p_client_id and created_at > now() - interval '20 seconds'
  ) then
    raise exception 'rate_limited';
  end if;
  insert into public.rankings (deck_name, total, sp, rp, bt, named, deck_json, client_id)
  values (p_name, p_total, p_sp, p_rp, p_bt, p_named, p_deck, p_client_id)
  returning id into new_id;
  -- 토큰 원문은 저장하지 않고 해시만 (빈 토큰이면 소유 증명 없음)
  if nullif(p_token, '') is not null then
    insert into public.ranking_owners (ranking_id, token_hash)
    values (new_id, public._hash(p_token));
  end if;
  return new_id;
end;
$$;

create or replace function public.update_ranking(
  p_id uuid, p_token text, p_name text,
  p_total double precision, p_sp double precision, p_rp double precision,
  p_bt double precision, p_named integer, p_deck jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(p_token, '') is null then
    return false;
  end if;
  update public.rankings r
  set deck_name = p_name, total = p_total, sp = p_sp, rp = p_rp,
      bt = p_bt, named = p_named, deck_json = p_deck
  where r.id = p_id
    and exists (
      select 1 from public.ranking_owners o
      where o.ranking_id = r.id and o.token_hash = public._hash(p_token)
    );
  return found;
end;
$$;

create or replace function public.delete_ranking(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(p_token, '') is null then
    return false;
  end if;
  delete from public.rankings r
  where r.id = p_id
    and exists (
      select 1 from public.ranking_owners o
      where o.ranking_id = r.id and o.token_hash = public._hash(p_token)
    );
  return found;
end;
$$;

-- 5) 새 RPC (내 코드 방식) ------------------------------------------------------
-- 내 코드 발급: XXXXX-XXXXX-XXXXX-XXXXX (16진 20자 = 80비트). DB에는 해시만 저장하고
-- 원문은 이 응답으로만 돌려준다.
-- 난수 출처: gen_random_uuid() (v4 UUID). v4는 32개 hex 중 13번째(버전 '4')와
-- 17번째(variant 8/9/a/b) 글자가 고정/부분고정이므로 이 둘을 피해 완전한 난수 글자만 쓴다:
-- 1~12번째 12자 + 18~25번째 8자 = 20자.
create or replace function public.create_owner(p_client_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
  v_code text;
begin
  if exists (
    select 1 from public.owners
    where client_id is not distinct from p_client_id and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'rate_limited';
  end if;
  h := upper(replace(gen_random_uuid()::text, '-', ''));
  h := substr(h, 1, 12) || substr(h, 18, 8);
  v_code := substr(h, 1, 5) || '-' || substr(h, 6, 5) || '-' || substr(h, 11, 5) || '-' || substr(h, 16, 5);
  -- 조회 때 _norm_code(대시 제거·대문자)로 정규화하므로 정규화한 값의 해시를 저장
  insert into public.owners (code_hash, client_id)
  values (public._hash(public._norm_code(v_code)), p_client_id);
  return v_code;
end;
$$;

create or replace function public.insert_ranking_owned(
  p_client_id text, p_code text, p_name text, p_total double precision,
  p_sp double precision, p_rp double precision, p_bt double precision,
  p_named integer, p_deck jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  new_id uuid;
begin
  v_owner := public._owner_of(p_code);
  if v_owner is null then
    raise exception 'invalid_code';
  end if;
  if exists (
    select 1 from public.rankings
    where client_id is not distinct from p_client_id and created_at > now() - interval '20 seconds'
  ) then
    raise exception 'rate_limited';
  end if;
  insert into public.rankings (deck_name, total, sp, rp, bt, named, deck_json, client_id)
  values (p_name, p_total, p_sp, p_rp, p_bt, p_named, p_deck, p_client_id)
  returning id into new_id;
  insert into public.ranking_owners (ranking_id, owner_id) values (new_id, v_owner);
  return new_id;
end;
$$;

-- 코드가 틀렸거나 내 글이 아니면 예외 없이 false (구분 불가)
create or replace function public.update_ranking_owned(
  p_id uuid, p_code text, p_name text,
  p_total double precision, p_sp double precision, p_rp double precision,
  p_bt double precision, p_named integer, p_deck jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  v_owner := public._owner_of(p_code);
  if v_owner is null then
    return false;
  end if;
  update public.rankings r
  set deck_name = p_name, total = p_total, sp = p_sp, rp = p_rp,
      bt = p_bt, named = p_named, deck_json = p_deck
  where r.id = p_id
    and exists (
      select 1 from public.ranking_owners o
      where o.ranking_id = r.id and o.owner_id = v_owner
    );
  return found;
end;
$$;

create or replace function public.delete_ranking_owned(p_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  v_owner := public._owner_of(p_code);
  if v_owner is null then
    return false;
  end if;
  delete from public.rankings r
  where r.id = p_id
    and exists (
      select 1 from public.ranking_owners o
      where o.ranking_id = r.id and o.owner_id = v_owner
    );
  return found;
end;
$$;

-- 내 코드로 등록한 글 목록 (최신순). 코드가 틀리면 빈 결과 (에러 없음)
create or replace function public.list_my_rankings(p_code text)
returns table (
  id uuid, deck_name text, total double precision, sp double precision,
  rp double precision, bt double precision, named integer,
  deck_json jsonb, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  v_owner := public._owner_of(p_code);
  if v_owner is null then
    return;
  end if;
  return query
    select r.id, r.deck_name, r.total, r.sp, r.rp, r.bt, r.named, r.deck_json, r.created_at
    from public.rankings r
    join public.ranking_owners o on o.ranking_id = r.id
    where o.owner_id = v_owner
    order by r.created_at desc;
end;
$$;

-- 예전 토큰으로 등록한 글을 내 코드에 귀속 (토큰·코드 둘 다 맞아야 함).
-- 성공하면 owner_id 설정 + token_hash = null → 그 글은 "내 코드 전용"이 되어 예전 토큰은 즉시 무효.
-- (이미 귀속된 글은 token_hash 가 null 이라 옛 토큰으로 다시 claim 해도 false)
create or replace function public.claim_ranking(p_id uuid, p_token text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  v_owner := public._owner_of(p_code);
  if v_owner is null or nullif(p_token, '') is null then
    return false;
  end if;
  update public.ranking_owners o
  set owner_id = v_owner, token_hash = null
  where o.ranking_id = p_id
    and o.token_hash = public._hash(p_token);
  return found;
end;
$$;

-- 6) 실행 권한: API로 부르는 함수만 anon/authenticated에 부여 ---------------------------
revoke all on function public.insert_ranking(text, text, double precision, double precision, double precision, double precision, integer, jsonb, text) from public;
revoke all on function public.update_ranking(uuid, text, text, double precision, double precision, double precision, double precision, integer, jsonb) from public;
revoke all on function public.delete_ranking(uuid, text) from public;
revoke all on function public.create_owner(text) from public;
revoke all on function public.insert_ranking_owned(text, text, text, double precision, double precision, double precision, double precision, integer, jsonb) from public;
revoke all on function public.update_ranking_owned(uuid, text, text, double precision, double precision, double precision, double precision, integer, jsonb) from public;
revoke all on function public.delete_ranking_owned(uuid, text) from public;
revoke all on function public.list_my_rankings(text) from public;
revoke all on function public.claim_ranking(uuid, text, text) from public;

grant execute on function public.insert_ranking(text, text, double precision, double precision, double precision, double precision, integer, jsonb, text) to anon, authenticated;
grant execute on function public.update_ranking(uuid, text, text, double precision, double precision, double precision, double precision, integer, jsonb) to anon, authenticated;
grant execute on function public.delete_ranking(uuid, text) to anon, authenticated;
grant execute on function public.create_owner(text) to anon, authenticated;
grant execute on function public.insert_ranking_owned(text, text, text, double precision, double precision, double precision, double precision, integer, jsonb) to anon, authenticated;
grant execute on function public.update_ranking_owned(uuid, text, text, double precision, double precision, double precision, double precision, integer, jsonb) to anon, authenticated;
grant execute on function public.delete_ranking_owned(uuid, text) to anon, authenticated;
grant execute on function public.list_my_rankings(text) to anon, authenticated;
grant execute on function public.claim_ranking(uuid, text, text) to anon, authenticated;

commit;
