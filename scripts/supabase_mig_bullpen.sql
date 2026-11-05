-- 기존 운영 DB: 불펜 최대 7명(타자9+선발5+불펜7)의 공개 랭킹 등록을 허용한다.
-- Supabase SQL Editor에서 적용. 신규 설치는 supabase_schema.sql에 포함되어 있다.
begin;
alter table public.rankings drop constraint if exists rankings_named_check;
alter table public.rankings add constraint rankings_named_check check (named between 0 and 21);
commit;
