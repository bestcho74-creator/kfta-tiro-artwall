# 선생님들이 만드는 티로 수능응원 아트월

한국교총이 2026년 수능을 앞둔 수험생을 응원하기 위해 준비한 디지털 아트 이벤트용 웹/사이니지입니다. 선생님들이 남긴 응원 메시지가 캐릭터 '티로'와 함께 미디어아트 월에 모여 하나의 작품을 이룹니다. 별도 빌드 과정 없는 정적 사이트로, GitHub Pages에서 그대로 서비스할 수 있습니다.

## 파일 구성

| 경로 | 설명 |
| --- | --- |
| `index.html` | 메인 페이지 (이벤트 소개, 응원 카드 남기기) |
| `artwall.html` | 미디어아트 월 |
| `artwall.html?signage` | 사이니지(대형 화면) 모드 |
| `admin.html` | 관리자 검수 페이지 (로그인 필요) |
| `config.js` | 공유 저장소(Supabase) 주소와 공개 키 |
| `data.js`, `join.js`, `artwall.js`, `admin.js`, `qm-engine.js`, `join.css` | 화면 동작 스크립트와 스타일 |
| `supabase/migrations/` | 데이터베이스 구조와 보안 규칙 |
| `assets.js`, `cards/`, `tiro_*.jpg/png`, `logo.png` | 이미지 및 그래픽 리소스 |

## 공유 저장소 (Supabase)

- 응원은 Supabase 데이터베이스에 저장되어 모든 휴대전화와 사이니지에 같은 조각이 보입니다. 새로 공개된 응원은 15초마다 반영됩니다.
- 공개 화면에는 승인된 응원의 번호 · 카드 · 메시지 · 닉네임만 내려갑니다. 경품용 휴대전화 번호, 한국교총 SNS 팔로우 아이디, 유튜브 구독 아이디, 경품 응모 여부는 관리자만 볼 수 있습니다.
- 방문자는 `submit_piece` 함수로만 응원을 넣을 수 있습니다. 욕설 · 나쁜 의미의 닉네임과 메시지는 화면과 서버(`bad_word`) 양쪽에서 걸러지고, 같은 곳에서 10분에 5건까지만 받습니다.
- 추첨 기회는 1회이며, 관리자가 SNS 팔로우 · 유튜브 구독을 확인하면 1회씩 늘어납니다(최대 3회).
- `config.js`의 `anonKey`는 공개용 키입니다. `service_role` 키나 데이터베이스 비밀번호는 저장소에 넣지 마세요.
- `config.js`의 값을 비우면 이 기기에만 저장하는 미리보기 모드(예시 응원 포함)로 동작합니다. 공유 저장소에 연결된 상태에서도 주소 뒤에 `?demo=1`을 붙이면 예시 화면을 볼 수 있습니다.

## 관리자

1. Supabase 대시보드 → Authentication → Users → **Add user** → 이메일과 비밀번호 입력, **Auto Confirm User** 선택 후 생성
2. 그 이메일이 `admins` 표에 있어야 관리자 권한이 생깁니다. 관리자를 늘릴 때는 SQL Editor에서:
   ```sql
   insert into public.admins (email) values ('새관리자@example.com');
   ```
3. `admin.html`에서 로그인 → 검수 대기 응원을 공개 · 숨김 · 삭제, SNS · 유튜브 확인, 자동 공개 설정, CSV 내보내기, 경품 추첨

새 응원은 '검수 대기'로 들어오며 관리자가 공개해야 아트월에 보입니다(보낸 사람의 기기에는 바로 보임). 관리자 페이지의 '자동 공개'를 켜면 검수 없이 바로 공개됩니다.

## 오픈 직전 번호 초기화

시험 응원을 지운 뒤 첫 응원이 1번이 되도록 SQL Editor에서 한 번 실행합니다.

```sql
delete from public.pieces;
alter sequence public.pieces_n_seq restart with 1;
```

## 데이터베이스 변경

```bash
supabase link --project-ref <프로젝트 ref>
supabase db push
```
