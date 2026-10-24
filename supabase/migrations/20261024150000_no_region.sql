-- 피드백 반영 (2026-10-24 · 2차)
-- · 소속 시·도교총 선택을 없앰 → region은 비워 둘 수 있음 (예전 값이 있으면 그대로 둠)
-- · submit_piece는 같은 모양을 유지하고 p_region은 null로 받음

alter table public.pieces alter column region drop not null;

create or replace function public.submit_piece(
  p_card int, p_msg text, p_region text, p_nick text,
  p_phone text default null, p_sns text default null, p_youtube text default null, p_prize boolean default false
)
returns json
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_msg     text := regexp_replace(btrim(coalesce(p_msg, '')), '[ \t]+', ' ', 'g');
  v_nick    text := regexp_replace(btrim(coalesce(p_nick, '')), '\s+', ' ', 'g');
  v_region  text := nullif(btrim(coalesce(p_region, '')), '');
  v_phone   text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_sns     text := nullif(left(btrim(coalesce(p_sns, '')), 40), '');
  v_youtube text := nullif(left(btrim(coalesce(p_youtube, '')), 60), '');
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip      text;
  v_hash    text;
  v_status  text;
  v_n       bigint;
  v_token   uuid;
begin
  if p_card is null or p_card not between 1 and 4 then raise exception 'invalid_card'; end if;
  if char_length(v_msg) < 2 or char_length(v_msg) > 100 then raise exception 'invalid_message'; end if;
  if v_region is not null and v_region not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') then raise exception 'invalid_region'; end if;
  if char_length(v_nick) < 2 or char_length(v_nick) > 12 then raise exception 'invalid_nickname'; end if;
  if public.bad_word(v_nick, true) then raise exception 'bad_nickname'; end if;
  if public.bad_word(v_msg, false) then raise exception 'bad_message'; end if;
  if v_phone <> '' and v_phone !~ '^01[016789][0-9]{7,8}$' then raise exception 'invalid_phone'; end if;

  -- 같은 곳에서 10분에 5건까지
  v_ip := coalesce(nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''), v_headers ->> 'cf-connecting-ip');
  if v_ip is not null then
    v_hash := encode(extensions.digest(v_ip || ':kfta-tiro-2026', 'sha256'), 'hex');
    if (select count(*) from public.pieces where ip_hash = v_hash and created_at > now() - interval '10 minutes') >= 5 then
      raise exception 'too_many';
    end if;
  end if;
  -- 똑같은 닉네임 · 메시지는 한 번만
  if exists (select 1 from public.pieces where nick = v_nick and msg = v_msg) then raise exception 'duplicate'; end if;

  select case when s.auto_approve then 'approved' else 'pending' end into v_status from public.settings s where s.id = 1;
  insert into public.pieces (card, msg, region, nick, phone, sns_id, youtube_id, prize, status, ip_hash)
  values (p_card, v_msg, v_region, v_nick,
          case when v_phone = '' then null
               else regexp_replace(v_phone, '^(01[016789])([0-9]{3,4})([0-9]{4})$', '\1-\2-\3') end,
          v_sns, v_youtube, coalesce(p_prize, false), coalesce(v_status, 'pending'), v_hash)
  returning pieces.n, pieces.owner_token into v_n, v_token;
  return json_build_object('n', v_n, 'status', v_status, 'token', v_token);
end;
$$;
revoke all on function public.submit_piece(int, text, text, text, text, text, text, boolean) from public;
grant execute on function public.submit_piece(int, text, text, text, text, text, text, boolean) to anon, authenticated;
