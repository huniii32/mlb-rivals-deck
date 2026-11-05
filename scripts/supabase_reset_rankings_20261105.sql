-- 운영자 SQL Editor 전용. 비밀번호 마이그레이션을 적용한 뒤 실행한다.
-- 기존 랭킹 및 수정 권한을 비공개 스키마에 보관하고 공개 랭킹만 비운다.
-- 동일 스크립트를 다시 실행해도 새로 등록한 덱은 삭제하지 않는다.
begin;
create schema if not exists ranking_reset_archive;
revoke all on schema ranking_reset_archive from public,anon,authenticated;
create table if not exists ranking_reset_archive.runs (name text primary key, applied_at timestamptz not null default now(), archived_rows bigint not null);
revoke all on ranking_reset_archive.runs from public,anon,authenticated;
do $$
declare n bigint;
begin
  if exists(select 1 from ranking_reset_archive.runs where name='20261105-password-ranking') then return; end if;
  lock table public.rankings in access exclusive mode;
  select count(*) into n from public.rankings;
  create table ranking_reset_archive.rankings_20261105 as table public.rankings;
  create table ranking_reset_archive.owners_20261105 as table public.owners;
  create table ranking_reset_archive.ranking_owners_20261105 as table public.ranking_owners;
  create table ranking_reset_archive.passwords_20261105 as table public.ranking_passwords;
  create table ranking_reset_archive.sessions_20261105 as table public.ranking_password_sessions;
  revoke all on all tables in schema ranking_reset_archive from public,anon,authenticated;
  if (select count(*) from ranking_reset_archive.rankings_20261105)<>n then raise exception 'backup_verification_failed'; end if;
  delete from public.rankings;
  insert into ranking_reset_archive.runs(name,archived_rows) values('20261105-password-ranking',n);
end $$;
alter table public.rankings validate constraint rankings_name_required_check;
commit;
