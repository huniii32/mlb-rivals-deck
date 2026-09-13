-- 문의판 관리자 기능 (답글·삭제)
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run
-- ★ '여기에_관리자비번' 을 네가 정한 비번으로 바꿀 것 (repo·코드 어디에도 안 적음)
-- 원리: 비번은 anon이 읽을 수 없는 app_config에만 저장.
--   삭제·답글은 비번이 맞아야 동작하는 RPC로만 가능. 틀리면 false.

alter table public.inquiries
  add column if not exists reply text;

create table if not exists public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;
-- anon 정책 없음 → anon은 읽을 수 없음 (SECURITY DEFINER 함수만 읽음)

insert into public.app_config(key, value)
values ('admin_secret', '여기에_관리자비번')
on conflict (key) do nothing;

create or replace function public.admin_check(p_secret text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_config
    where key = 'admin_secret' and value = p_secret
  );
$$;

create or replace function public.admin_reply_inquiry(p_id uuid, p_secret text, p_reply text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_check(p_secret) then
    return false;
  end if;
  update public.inquiries
  set reply = nullif(trim(p_reply), '')
  where id = p_id;
  return found;
end;
$$;

create or replace function public.admin_delete_inquiry(p_id uuid, p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_check(p_secret) then
    return false;
  end if;
  delete from public.inquiries where id = p_id;
  return found;
end;
$$;
