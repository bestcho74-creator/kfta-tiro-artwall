-- 피드백 반영 (2026-10-24)
-- · 홈페이지 아이디 대신 닉네임 (아트월에 그대로 공개, 욕설·나쁜 의미 필터)
-- · 경품용 선택 입력: 휴대전화 번호, 한국교총 SNS 팔로우 아이디, 한국교총 유튜브 구독 아이디
-- · 추첨 기회 = 1 + SNS 확인 + 유튜브 확인 (최대 3)
-- · 같은 곳에서 10분에 5건 넘게 보내면 잠시 막기 (IP는 해시로만 보관)

create extension if not exists pgcrypto with schema extensions;

drop index if exists public.pieces_member_once;
alter table public.pieces drop column if exists member_id;
alter table public.pieces rename column insta to sns_id;
alter table public.pieces rename column insta_checked to sns_checked;
alter table public.pieces
  add column if not exists youtube_id      text,
  add column if not exists youtube_checked boolean not null default false,
  add column if not exists phone           text,
  add column if not exists owner_token     uuid not null default gen_random_uuid(),   -- 보낸 사람 기기만 아는 확인용 값
  add column if not exists ip_hash         text;
alter table public.pieces drop constraint if exists pieces_nick_len;
alter table public.pieces add constraint pieces_nick_len check (char_length(nick) between 2 and 12);
create index if not exists pieces_ip_time on public.pieces (ip_hash, created_at);

-- 욕설 · 나쁜 의미 낱말 검사
-- 띄어쓰기 · 숫자 · 기호를 지운 뒤 비교 (예: "시 1 발" → "시발")
-- strict = 닉네임용(넓게), 아니면 메시지용(심한 욕설만)
create or replace function public.bad_word(t text, strict boolean)
returns boolean
language sql immutable
as $$
  with x as (select regexp_replace(lower(coalesce(t, '')), '[^가-힣ㄱ-ㅎㅏ-ㅣa-z]', '', 'g') as s)
  select exists (
    select 1 from x, unnest(
      array['씨발','시발','씨빨','시빨','씨바','씹','ㅅㅂ','ㅆㅂ','ㅄ','ㅂㅅ','병신','븅신','빙신','병딱','개새','개색','개쌔','개세끼','좆','존나','졸라','지랄','ㅈㄹ','염병','썅','쌍년','니미','니애미','느금','애미','애비','엠창','후장','섹스','쎅스','야동','보지','자지','강간','fuck','shit','bitch','asshole','pussy','dick','porn','sex']
      || case when strict then array['미친','미쳤','새끼','꺼져','닥쳐','등신','또라이','돌아이','호로','뒤져','뒈져','죽어','죽여','자살','일베','한남','한녀','메갈','틀딱','급식충','맘충','짱깨','쪽바리','관리자','운영자','admin'] else array[]::text[] end
    ) as w
    where x.s like '%' || w || '%'
  );
$$;
grant execute on function public.bad_word(text, boolean) to anon, authenticated;

-- 응원 보내기 (새 입력 칸)
drop function if exists public.submit_piece(int, text, text, text, text, boolean);
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
  if p_region is null or p_region not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') then raise exception 'invalid_region'; end if;
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
  values (p_card, v_msg, p_region, v_nick,
          case when v_phone = '' then null
               else regexp_replace(v_phone, '^(01[016789])([0-9]{3,4})([0-9]{4})$', '\1-\2-\3') end,
          v_sns, v_youtube, coalesce(p_prize, false), coalesce(v_status, 'pending'), v_hash)
  returning pieces.n, pieces.owner_token into v_n, v_token;
  return json_build_object('n', v_n, 'status', v_status, 'token', v_token);
end;
$$;
revoke all on function public.submit_piece(int, text, text, text, text, text, text, boolean) from public;
grant execute on function public.submit_piece(int, text, text, text, text, text, text, boolean) to anon, authenticated;

-- 내 응원의 검수 상태 (보낸 기기의 확인용 값으로만)
drop function if exists public.my_piece_status(bigint, text);
create or replace function public.my_piece_status(p_n bigint, p_token uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select status from public.pieces where n = p_n and owner_token = p_token;
$$;
revoke all on function public.my_piece_status(bigint, uuid) from public;
grant execute on function public.my_piece_status(bigint, uuid) to anon, authenticated;

-- 지역 현황을 쓰지 않으므로 공개 통계 함수 정리
drop function if exists public.public_stats();
