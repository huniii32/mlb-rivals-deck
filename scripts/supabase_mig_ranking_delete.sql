-- 전체 공개 랭킹: 본인 글 삭제 지원
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run
-- 원리: 등록 때 무작위 토큰을 함께 저장(내 브라우저에만 보관).
-- 삭제는 토큰이 맞는 행만 지우는 RPC 함수로만 가능. 토큰 모르면 남 글 삭제 불가.

alter table public.rankings
  add column if not exists owner_token text;

create or replace function public.delete_ranking(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.rankings
  where id = p_id
    and owner_token is not null
    and owner_token = p_token;
  return found;
end;
$$;

-- 등록 후 덱을 고치면 점수·덱JSON 자동 갱신 (토큰 일치 행만)
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
  update public.rankings
  set deck_name = p_name, total = p_total, sp = p_sp, rp = p_rp,
      bt = p_bt, named = p_named, deck_json = p_deck
  where id = p_id
    and owner_token is not null
    and owner_token = p_token;
  return found;
end;
$$;
