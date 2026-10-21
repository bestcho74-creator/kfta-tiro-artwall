-- 티로 수능응원 아트월 · 공유 저장소 (Supabase / PostgreSQL)
-- 공개: 승인된 응원의 안전한 칸만 (pieces_public 뷰)
-- 비공개: 홈페이지 아이디 · 인스타그램 아이디 · 경품 응모 · 검수 상태 (관리자만)

-- 응원 조각
create table if not exists public.pieces (
  n             bigint generated always as identity primary key,  -- 티로의 N번째 응원 = 조각 자리
  card          smallint not null check (card between 1 and 4),
  msg           text not null check (char_length(msg) between 2 and 100),
  region        text not null check (region in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주')),
  member_id     text not null check (char_length(member_id) between 3 and 30),   -- 한국교총 홈페이지 아이디 (비공개)
  nick          text not null,                                                   -- 공개용: 아이디 앞 3자리 + ***
  insta         text,                                                            -- 인스타그램 아이디 (선택, 비공개)
  prize         boolean not null default false,                                  -- 경품 응모 동의
  insta_checked boolean not null default false,                                  -- 관리자: 인스타 댓글 확인 → 추가 추첨 기회
  status        text not null default 'pending' check (status in ('pending','approved','hidden')),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   text
);
create unique index if not exists pieces_member_once on public.pieces (lower(member_id));   -- 아이디당 1건
create index if not exists pieces_status_n on public.pieces (status, n);

-- 관리자 목록 (Supabase Auth 이메일 기준)
create table if not exists public.admins (
  email text primary key
);

-- 운영 설정 (한 줄)
create table if not exists public.settings (
  id           int primary key default 1 check (id = 1),
  auto_approve boolean not null default false,   -- true면 검수 없이 바로 공개
  updated_at   timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.pieces   enable row level security;
alter table public.admins   enable row level security;
alter table public.settings enable row level security;

-- 관리자 여부: 로그인한 사용자의 이메일이 admins에 있는지
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- 관리자만 표 전체 읽기 · 고치기 · 지우기 (익명 사용자에게는 정책이 없어 접근 불가)
drop policy if exists pieces_admin_all on public.pieces;
create policy pieces_admin_all on public.pieces for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists settings_admin_read on public.settings;
create policy settings_admin_read on public.settings for select to authenticated using (public.is_admin());
drop policy if exists settings_admin_update on public.settings;
create policy settings_admin_update on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admins_admin_read on public.admins;
create policy admins_admin_read on public.admins for select to authenticated using (public.is_admin());

-- 공개 뷰: 승인된 응원의 공개 칸만 (뷰 소유자 권한으로 읽어 RLS를 거치지 않음)
create or replace view public.pieces_public as
  select n, card, msg, region, nick, created_at
  from public.pieces
  where status = 'approved';
revoke all on public.pieces_public from anon, authenticated;
grant select on public.pieces_public to anon, authenticated;

-- 응원 보내기: 익명 사용자는 이 함수로만 넣을 수 있음
create or replace function public.submit_piece(
  p_card int, p_msg text, p_region text, p_member_id text, p_insta text default null, p_prize boolean default false
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_id     text := btrim(coalesce(p_member_id, ''));
  v_msg    text := regexp_replace(btrim(coalesce(p_msg, '')), '[ \t]+', ' ', 'g');
  v_nick   text;
  v_status text;
  v_n      bigint;
begin
  if char_length(v_id) < 3 or char_length(v_id) > 30 then raise exception 'invalid_member_id'; end if;
  if char_length(v_msg) < 2 or char_length(v_msg) > 100 then raise exception 'invalid_message'; end if;
  if p_card not between 1 and 4 then raise exception 'invalid_card'; end if;
  if exists (select 1 from public.pieces where lower(member_id) = lower(v_id)) then raise exception 'already_submitted'; end if;
  v_nick := case when char_length(v_id) <= 3 then left(v_id, 1) || '**'
                 else left(v_id, 3) || repeat('*', least(4, char_length(v_id) - 3)) end;
  select case when s.auto_approve then 'approved' else 'pending' end into v_status from public.settings s where s.id = 1;
  insert into public.pieces (card, msg, region, member_id, nick, insta, prize, status)
  values (p_card, v_msg, p_region, v_id, v_nick, nullif(btrim(coalesce(p_insta, '')), ''), coalesce(p_prize, false), coalesce(v_status, 'pending'))
  returning pieces.n into v_n;
  return json_build_object('n', v_n, 'status', v_status, 'nick', v_nick);
end;
$$;
revoke all on function public.submit_piece(int, text, text, text, text, boolean) from public;
grant execute on function public.submit_piece(int, text, text, text, text, boolean) to anon, authenticated;

-- 내 응원의 검수 상태 확인 (번호 + 아이디가 맞을 때만)
create or replace function public.my_piece_status(p_n bigint, p_member_id text)
returns text
language sql stable security definer set search_path = public
as $$
  select status from public.pieces where n = p_n and lower(member_id) = lower(btrim(p_member_id));
$$;
revoke all on function public.my_piece_status(bigint, text) from public;
grant execute on function public.my_piece_status(bigint, text) to anon, authenticated;

-- 공개 통계 (승인된 조각 수 · 지역별)
create or replace function public.public_stats()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'total', (select count(*) from public.pieces where status = 'approved'),
    'regions', coalesce((select json_object_agg(region, c) from (select region, count(*) c from public.pieces where status = 'approved' group by region) t), '{}'::json)
  );
$$;
grant execute on function public.public_stats() to anon, authenticated;

-- 검수: 관리자가 상태 바꾸기 (여러 건 한 번에)
create or replace function public.review_pieces(p_ns bigint[], p_status text)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('pending', 'approved', 'hidden') then raise exception 'invalid_status'; end if;
  update public.pieces set status = p_status, reviewed_at = now(), reviewed_by = auth.jwt() ->> 'email' where n = any(p_ns);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.review_pieces(bigint[], text) from public;
grant execute on function public.review_pieces(bigint[], text) to authenticated;
