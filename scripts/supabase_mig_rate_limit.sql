-- 공개판 스팸 대책: 랭킹·문의 등록에 클라이언트별 짧은 간격 제한
-- Supabase 대시보드 → SQL Editor → New query에 붙여넣고 Run
-- 주의: 이 마이그레이션을 실행하면 예전 방식(테이블 직접 insert)은 막히고
-- 새 RPC(insert_ranking/insert_inquiry)로만 등록되므로, 앱 배포와 같이 반영해야 함.

alter table public.rankings add column if not exists client_id text;
alter table public.inquiries add column if not exists client_id text;

create index if not exists rankings_client_created_idx on public.rankings (client_id, created_at desc);
create index if not exists inquiries_client_created_idx on public.inquiries (client_id, created_at desc);

-- 직접 insert 정책 제거 → 아래 RPC로만 등록 가능 (레이트리밋 강제)
drop policy if exists "rankings public insert" on public.rankings;
drop policy if exists "inquiries public insert" on public.inquiries;

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
    where client_id = p_client_id and created_at > now() - interval '20 seconds'
  ) then
    raise exception 'rate_limited';
  end if;
  insert into public.rankings (deck_name, total, sp, rp, bt, named, deck_json, owner_token, client_id)
  values (p_name, p_total, p_sp, p_rp, p_bt, p_named, p_deck, p_token, p_client_id)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.insert_inquiry(
  p_client_id text, p_name text, p_body text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.inquiries
    where client_id = p_client_id and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'rate_limited';
  end if;
  insert into public.inquiries (name, body, client_id) values (p_name, p_body, p_client_id);
  return true;
end;
$$;
