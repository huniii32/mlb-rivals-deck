-- 기존 설치용: 게임 덱 인증을 지급 기록의 선행 조건에서 제외합니다.
-- 당첨자, 추첨, 인증 이력, 지급 이력 및 접근 권한을 변경하지 않습니다.
-- 관리자 로그인과 당첨자 확정 조건, 지급 기록의 재요청 중복 방지는 유지합니다.
BEGIN;
create or replace function public.event_admin(p_event text,p_action text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid := public._event_user(); e public.sim_events; champ uuid; ticket uuid; winner uuid; n integer; removed integer; prize text; winner_id uuid; verified timestamptz; delivered timestamptz; recorded timestamptz;
begin
  if not exists(select 1 from public.sim_event_admins where user_id=u) then raise exception 'event_admin_required'; end if;
  select * into e from public.sim_events where id=p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if p_action='publish' then
    if e.published then return public.event_get(p_event); end if;
    if not exists(select 1 from public.sim_event_rules where id=e.rules_id) then raise exception 'event_rules_missing'; end if;
    update public.sim_events set published=true where id=p_event;
    insert into public.sim_event_audit(event_id,action,actor,details) values(p_event,'publish',u,jsonb_build_object('opens_at',e.opens_at,'ends_at',e.ends_at,'rules_id',e.rules_id));
  elsif p_action='unpublish' then
    if not e.published then return public.event_get(p_event); end if;
    update public.sim_events set published=false where id=p_event;
    insert into public.sim_event_audit(event_id,action,actor,details)
      values(p_event,'unpublish',u,'{}');
  elsif p_action='close' then
    if e.phase<>'open' then return public.event_get(p_event); end if;
    if not e.published or clock_timestamp()<e.opens_at then raise exception 'event_not_open'; end if;
    select p.id into champ from public.sim_event_participants p join public.sim_event_attempts a on a.participant_id=p.id
      where p.event_id=p_event order by a.score desc,a.achieved_at,a.id limit 1;
    update public.sim_event_tickets t set eligible=(champ is null or t.participant_id<>champ)
      from public.sim_event_participants p where t.participant_id=p.id and p.event_id=p_event;
    select count(*) filter(where t.eligible),count(*) filter(where not t.eligible) into n,removed
      from public.sim_event_tickets t join public.sim_event_participants p on p.id=t.participant_id where p.event_id=p_event;
    update public.sim_events set phase='closed',closed_at=clock_timestamp(),champion_id=champ where id=p_event;
    insert into public.sim_event_audit(event_id,action,actor,details)
      values(p_event,'close',u,jsonb_build_object('champion_id',champ,'eligible_tickets',n,'excluded_tickets',removed,'tie_rule','earliest_server_achievement'));
  elsif p_action='draw' then
    if e.phase='drawn' then return public.event_get(p_event); end if;
    if e.phase<>'closed' then raise exception 'event_close_first'; end if;
    select count(*) into n from public.sim_event_tickets t join public.sim_event_participants p on p.id=t.participant_id
      where p.event_id=p_event and t.eligible and (e.champion_id is null or p.id<>e.champion_id);
    if n>0 then
      select t.id,p.id into ticket,winner from public.sim_event_tickets t join public.sim_event_participants p on p.id=t.participant_id
        where p.event_id=p_event and t.eligible and (e.champion_id is null or p.id<>e.champion_id)
        order by t.id offset floor(public._event_random()*n)::integer limit 1;
    end if;
    update public.sim_events set phase='drawn',drawn_at=clock_timestamp(),winner_id=winner,winning_ticket=ticket where id=p_event;
    insert into public.sim_event_audit(event_id,action,actor,details)
      values(p_event,'draw',u,jsonb_build_object('eligible_tickets',n,'winner_id',winner,'winning_ticket',ticket));
  elsif p_action in ('verify_champion','verify_winner','deliver_champion','deliver_winner') then
    prize:=split_part(p_action,'_',2);
    winner_id:=case when prize='champion' then e.champion_id else e.winner_id end;
    verified:=case when prize='champion' then e.champion_verified_at else e.winner_verified_at end;
    delivered:=case when prize='champion' then e.champion_delivered_at else e.winner_delivered_at end;
    if winner_id is null or e.phase='open' then raise exception 'event_winner_required'; end if;
    if p_action like 'verify_%' then
      if verified is not null then return public.event_get(p_event); end if;
      recorded:=clock_timestamp();
      if prize='champion' then update public.sim_events set champion_verified_at=recorded where id=p_event;
      else update public.sim_events set winner_verified_at=recorded where id=p_event; end if;
    else
      if delivered is not null then return public.event_get(p_event); end if;
      recorded:=clock_timestamp();
      if prize='champion' then update public.sim_events set champion_delivered_at=recorded where id=p_event;
      else update public.sim_events set winner_delivered_at=recorded where id=p_event; end if;
    end if;
    insert into public.sim_event_audit(event_id,action,actor,details)
      values(p_event,p_action,u,jsonb_build_object('participant_id',winner_id));
  else raise exception 'event_invalid_action'; end if;
  return public.event_get(p_event);
end $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
