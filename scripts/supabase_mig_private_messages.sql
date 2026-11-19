-- Private operator-to-deck inbox. Apply AFTER deck_passwords, events and event_operator.
-- No storage bucket/public URL: image bytes are returned only by authenticated RPCs.
begin;
create table if not exists public.deck_private_messages (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.rankings(id) on delete cascade,
 sender_id uuid not null references public.sim_event_operator_credentials(user_id),
 request_id uuid not null,
 subject text not null check(char_length(subject) between 1 and 100),
 body text not null check(char_length(body) between 1 and 2000),
 image_mime text,
 image_bytes bytea,
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz,
 unique(sender_id,request_id),
 check ((image_mime is null and image_bytes is null) or
   (image_mime in ('image/png','image/jpeg','image/webp') and image_bytes is not null and octet_length(image_bytes) between 12 and 2097152))
);
create index if not exists deck_private_messages_recipient_idx on public.deck_private_messages(recipient_id,created_at desc,id);
alter table public.deck_private_messages enable row level security;
revoke all on public.deck_private_messages from public,anon,authenticated;

create or replace function public._mailbox_owner(p_id uuid,p_token text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if nullif(p_token,'') is null or not exists(select 1 from public.ranking_password_sessions where ranking_id=p_id and token_hash=public._ranking_hash(p_token))
 then raise exception 'mailbox_owner_required'; end if;
end $$;
create or replace function public._mailbox_json(m public.deck_private_messages,p_content boolean) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',m.id,'recipient_id',m.recipient_id,'subject',m.subject,'created_at',m.created_at,'read_at',m.read_at,'has_image',m.image_bytes is not null)
 || case when p_content then jsonb_build_object('body',m.body,'image_mime',m.image_mime,'image_base64',encode(m.image_bytes,'base64')) else '{}'::jsonb end
$$;
create or replace function public.mailbox_list(p_ranking_id uuid,p_token text,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public._mailbox_owner(p_ranking_id,p_token);
 select coalesce(jsonb_agg(public._mailbox_json(m,false) order by m.created_at desc,m.id),'[]') into result
 from (select * from public.deck_private_messages where recipient_id=p_ranking_id order by created_at desc,id limit 50 offset greatest(0,coalesce(p_offset,0))) m;
 return result;
end $$;
create or replace function public.mailbox_read(p_ranking_id uuid,p_token text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.deck_private_messages;
begin
 perform public._mailbox_owner(p_ranking_id,p_token);
 update public.deck_private_messages set read_at=coalesce(read_at,clock_timestamp()) where id=p_id and recipient_id=p_ranking_id returning * into m;
 if not found then raise exception 'mailbox_message_unavailable'; end if;
 return public._mailbox_json(m,true);
end $$;
create or replace function public.mailbox_operator_recipients(p_session text,p_event text,p_query text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public._event_operator_auth(p_session);
 select coalesce(jsonb_agg(row_to_json(r)),'[]') into result from (
 select r.id,r.deck_name,
 case when exists(select 1 from sim_events e join sim_event_participants p on p.id=e.champion_id where e.id=p_event and p.ranking_id=r.id) then '스킬 점수 1위'
 when exists(select 1 from sim_events e join sim_event_participants p on p.id=e.winner_id where e.id=p_event and p.ranking_id=r.id) then '응모권 추첨 당첨자' else null end as award
 from rankings r where strpos(lower(r.deck_name),lower(coalesce(p_query,'')))>0
 order by r.deck_name,r.id limit 50 offset greatest(0,coalesce(p_offset,0))) r;
 perform set_config('event.operator_id','',true);
 return result;
end $$;
create or replace function public.mailbox_operator_list(p_session text,p_ranking_id uuid,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public._event_operator_auth(p_session);
 select coalesce(jsonb_agg(public._mailbox_json(m,false) order by m.created_at desc,m.id),'[]') into result
 from (select * from deck_private_messages where recipient_id=p_ranking_id order by created_at desc,id limit 50 offset greatest(0,coalesce(p_offset,0))) m;
 perform set_config('event.operator_id','',true);
 return result;
end $$;
create or replace function public.mailbox_operator_read(p_session text,p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.deck_private_messages;
begin
 perform public._event_operator_auth(p_session);
 select * into m from deck_private_messages where id=p_id;
 if not found then raise exception 'mailbox_message_unavailable'; end if;
 perform set_config('event.operator_id','',true);
 return public._mailbox_json(m,true);
end $$;
create or replace function public.mailbox_operator_send(p_session text,p_ranking_id uuid,p_request_id uuid,p_subject text,p_body text,p_image_mime text default null,p_image_base64 text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare sender uuid; bytes bytea; m public.deck_private_messages;
begin
 perform public._event_operator_auth(p_session);
 sender:=public._event_user();
 if p_request_id is null or p_subject is null or char_length(btrim(p_subject)) not between 1 and 100 or p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'mailbox_invalid_message'; end if;
 if p_image_base64 is not null or p_image_mime is not null then
  if p_image_base64 is null or p_image_mime is null or p_image_mime not in ('image/png','image/jpeg','image/webp') or length(p_image_base64)>2796204 then raise exception 'mailbox_invalid_image'; end if;
  begin bytes:=decode(p_image_base64,'base64'); exception when others then raise exception 'mailbox_invalid_image'; end;
  if octet_length(bytes) not between 12 and 2097152 or not (
   (p_image_mime='image/png' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')) or
   (p_image_mime='image/jpeg' and substring(bytes from 1 for 3)=decode('ffd8ff','hex')) or
   (p_image_mime='image/webp' and substring(bytes from 1 for 4)=convert_to('RIFF','UTF8') and substring(bytes from 9 for 4)=convert_to('WEBP','UTF8'))
  ) then raise exception 'mailbox_invalid_image'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('mailbox:'||sender::text||':'||p_request_id::text,0));
 select * into m from deck_private_messages where sender_id=sender and request_id=p_request_id;
 if found then
  if m.recipient_id is distinct from p_ranking_id or m.subject is distinct from btrim(p_subject) or m.body is distinct from btrim(p_body) or m.image_mime is distinct from p_image_mime or m.image_bytes is distinct from bytes then raise exception 'mailbox_request_conflict'; end if;
 else
  if not exists(select 1 from rankings where id=p_ranking_id) then raise exception 'mailbox_recipient_unavailable'; end if;
  insert into deck_private_messages(recipient_id,sender_id,request_id,subject,body,image_mime,image_bytes)
  values(p_ranking_id,sender,p_request_id,btrim(p_subject),btrim(p_body),p_image_mime,bytes) returning * into m;
 end if;
 perform set_config('event.operator_id','',true);
 return public._mailbox_json(m,false);
end $$;
revoke all on function public._mailbox_owner(uuid,text),public._mailbox_json(public.deck_private_messages,boolean) from public,anon,authenticated;
revoke all on function public.mailbox_list(uuid,text,integer),public.mailbox_read(uuid,text,uuid),public.mailbox_operator_recipients(text,text,text,integer),public.mailbox_operator_list(text,uuid,integer),public.mailbox_operator_read(text,uuid),public.mailbox_operator_send(text,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mailbox_list(uuid,text,integer),public.mailbox_read(uuid,text,uuid),public.mailbox_operator_recipients(text,text,text,integer),public.mailbox_operator_list(text,uuid,integer),public.mailbox_operator_read(text,uuid),public.mailbox_operator_send(text,uuid,uuid,text,text,text,text) to anon,authenticated;
commit;
