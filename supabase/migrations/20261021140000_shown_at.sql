-- 공개 시각(shown_at) 추가: 번호 순서와 상관없이 "새로 공개된 응원"만 가져오기 위함
create or replace view public.pieces_public as
  select n, card, msg, region, nick, created_at, coalesce(reviewed_at, created_at) as shown_at
  from public.pieces
  where status = 'approved';
grant select on public.pieces_public to anon, authenticated;
