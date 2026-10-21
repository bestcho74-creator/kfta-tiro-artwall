-- 보강: 거절될 쓰기가 응원 번호(identity)를 소모하지 않도록 권한 단계에서 차단
-- (RLS는 번호를 뽑은 뒤에 검사하므로, 막힌 시도마다 아트월에 빈자리가 생길 수 있음)
revoke insert on public.pieces from anon, authenticated;
revoke update, delete on public.pieces from anon;
revoke all on public.settings from anon;
revoke insert, delete on public.settings from authenticated;
revoke all on public.admins from anon;
revoke insert, update, delete on public.admins from authenticated;

-- 응원 보내기: 모든 값을 넣기 전에 검사 (실패한 시도가 번호를 쓰지 않게)
create or replace function public.submit_piece(
  p_card int, p_msg text, p_region text, p_member_id text, p_insta text default null, p_prize boolean default false
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_id     text := btrim(coalesce(p_member_id, ''));
  v_msg    text := regexp_replace(btrim(coalesce(p_msg, '')), '[ \t]+', ' ', 'g');
  v_insta  text := nullif(left(btrim(coalesce(p_insta, '')), 40), '');
  v_nick   text;
  v_status text;
  v_n      bigint;
begin
  if char_length(v_id) < 3 or char_length(v_id) > 30 then raise exception 'invalid_member_id'; end if;
  if char_length(v_msg) < 2 or char_length(v_msg) > 100 then raise exception 'invalid_message'; end if;
  if p_card is null or p_card not between 1 and 4 then raise exception 'invalid_card'; end if;
  if p_region is null or p_region not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') then raise exception 'invalid_region'; end if;
  if exists (select 1 from public.pieces where lower(member_id) = lower(v_id)) then raise exception 'already_submitted'; end if;
  v_nick := case when char_length(v_id) <= 3 then left(v_id, 1) || '**'
                 else left(v_id, 3) || repeat('*', least(4, char_length(v_id) - 3)) end;
  select case when s.auto_approve then 'approved' else 'pending' end into v_status from public.settings s where s.id = 1;
  insert into public.pieces (card, msg, region, member_id, nick, insta, prize, status)
  values (p_card, v_msg, p_region, v_id, v_nick, v_insta, coalesce(p_prize, false), coalesce(v_status, 'pending'))
  returning pieces.n into v_n;
  return json_build_object('n', v_n, 'status', v_status, 'nick', v_nick);
exception
  when unique_violation then raise exception 'already_submitted';
end;
$$;
