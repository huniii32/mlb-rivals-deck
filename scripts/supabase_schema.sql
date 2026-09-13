-- Rivals Deck 공개 랭킹·문의판 스키마
-- Supabase 대시보드 → SQL Editor → New query에 붙여넣고 Run
-- Data API 설정: RLS는 아래에서 테이블마다 직접 켬 (자동 RLS 꺼져 있어도 OK)

create extension if not exists pgcrypto;

-- 1) 전체 공개 랭킹 (덱 투고)
create table if not exists public.rankings (
  id uuid primary key default gen_random_uuid(),
  deck_name text not null check (char_length(deck_name) between 1 and 50),
  total double precision not null,
  sp double precision not null default 0,
  rp double precision not null default 0,
  bt double precision not null default 0,
  named integer not null default 0 check (named between 0 and 18),
  deck_json jsonb,
  created_at timestamptz not null default now()
);
alter table public.rankings enable row level security;

drop policy if exists "rankings public read" on public.rankings;
create policy "rankings public read"
  on public.rankings for select to anon using (true);

drop policy if exists "rankings public insert" on public.rankings;
create policy "rankings public insert"
  on public.rankings for insert to anon with check (true);

-- 2) 문의판 (공개 글)
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null default '익명' check (char_length(name) between 1 and 20),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.inquiries enable row level security;

drop policy if exists "inquiries public read" on public.inquiries;
create policy "inquiries public read"
  on public.inquiries for select to anon using (true);

drop policy if exists "inquiries public insert" on public.inquiries;
create policy "inquiries public insert"
  on public.inquiries for insert to anon with check (true);
