/* 공용 데이터 · 저장소 · 유틸
   config.js에 Supabase 주소가 있으면 공유 저장소, 없으면 이 기기에만 저장하는 미리보기 모드 */
(function (global) {
  const CONFIG = {
    examDay: '2026-11-19',
    revealDay: '2026-11-18', // 완성 작품 공개: 수능 전날
    demo: true,              // 미리보기용 예시 응원 포함
    demoCount: 236,          // 예시 응원 수 (200개 넘으면 외곽 확장까지 보임)
    coreSize: 200,           // 티로를 이루는 첫 조각 수
    wallDay: 'tiro_day.jpg',     // 아트월 원본 (낮)
    wallNight: 'tiro_night.jpg', // 아트월 원본 (밤)
    wallDaySoft: 'tiro_day_soft.png',     // 응원이 아직 없는 칸 (낮, 40% 투명)
    wallNightSoft: 'tiro_night_soft.png', // 응원이 아직 없는 칸 (밤, 40% 투명)
    sceneCols: 32,           // 장면 모자이크 가로 조각 수 (세로는 이미지 비율로)
    focus: { x: 0.49, y: 0.5, rx: 0.2, ry: 0.46 },  // 장면 속 큰 티로 위치 (첫 200조각)
    hashtags: ['#한국교총', '#선생님의수능응원', '#2026수능대박나세요', '#전국수험생화이팅', '#티로아트월'],   // 필수 해시태그
    shareBase: '',           // 사이트 루트 주소(끝에 /). 비우면 현재 주소 기준
  };

  // 메시지 카드 4종 (layout.json 기준: 메시지 영역 x7% y15% w86% h60%, 닉네임 x7% y90.5%)
  const CARDS = [
    { id: 1, name: '밤 · 별빛 응원', ink: '#16325C' },
    { id: 2, name: '낮 · 연필 응원', ink: '#244E6B' },
    { id: 3, name: '밤 · 응원 편지', ink: '#2F2E50' },
    { id: 4, name: '낮 · 반가운 응원', ink: '#315E62' },
  ];

  const REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const WEIGHT = [14, 7, 5, 6, 3, 3, 2, 2, 20, 3, 3, 4, 3, 3, 5, 6, 1];

  // 예시 응원 문장 (미리보기용)
  const MESSAGES = [
    '지금까지 쌓아 온 시간이 시험장에서 너를 지켜 줄 거야.',
    '긴장되는 건 그만큼 준비했다는 뜻이에요. 평소처럼만!',
    '어려운 문제는 잠시 넘기고, 다음 문제에 마음을 두세요.',
    '아침밥 든든히 먹고, 수험표 두 번 확인하고 출발해요.',
    '시험장 문을 나서는 순간, 이미 충분히 잘 해낸 거예요.',
    '결과보다 오늘까지 버텨 온 너를 먼저 칭찬하고 싶다.',
    '평소처럼, 연습한 그대로. 그거면 충분합니다.',
    '한 문제에 흔들리지 말고 끝까지 너의 속도로 가자.',
    '깊게 숨 한 번 쉬고, 첫 문제부터 천천히.',
    '시험 끝나면 하고 싶었던 일부터 꼭 해 보길 바라요.',
    '쉬는 시간엔 지난 교시는 내려놓기! 다음 교시만 보자.',
    '너의 열아홉 살을 진심으로 응원한다.',
    '마킹 확인, 시간 확인, 그리고 너 자신을 믿기.',
    '교실에서 보던 그 집중력이면 충분해.',
    '따뜻한 물 한 병, 손난로도 잊지 마세요.',
    '오늘의 떨림은 내일의 자신감이 될 거예요.',
    '선생님들이 시험장 밖에서 같은 마음으로 기다리고 있어요.',
    '모르는 문제는 다른 친구들도 어렵다. 침착하게!',
    '네가 쌓은 노력은 어디 가지 않아. 걱정 말고 다녀와.',
    '시험은 하루지만 너의 가능성은 그보다 훨씬 길다.',
    '실수해도 괜찮아. 다음 문제가 기다리고 있어.',
    '마지막 교시까지 체력 안배! 점심은 가볍게.',
    '꾸준히 걸어온 길을 믿어 보자. 넌 할 수 있어.',
    '3년 동안 애 많이 썼다. 이제 보여 주고 오자.',
    '수능은 끝이 아니라 새로운 시작의 문이에요.',
    '티로처럼 씩씩하게! 선생님은 늘 네 편이야.',
    '떨리면 손바닥을 꾹 눌러 봐. 천천히 숨 쉬고.',
    '오늘까지 잘 해 왔으니, 내일도 잘 해낼 거야.',
    '시험 잘 보고 와서 맛있는 거 먹자!',
    '문제 끝까지, 선지 끝까지 읽기. 이것만 기억!',
    '너는 혼자가 아니야. 응원하는 사람이 이렇게 많아.',
    '그동안 흘린 땀이 오늘 빛날 거예요.',
  ];
  // 예시 닉네임
  const NICKS = ['국어쌤', '3학년 담임', '수학하는 티로', '보건실 지킴이', '진로쌤', '칠판지기', '분필요정', '봄날의 교실', '응원단장', '티로팬', '1교시 지킴이', '교무실 커피', '종례는 짧게', '영어샘', '과학 선생님', '체육쌤', '음악샘', '미술쌤', '사서샘', '상담 선생님', '특수교사', '영양 선생님', '고3 부장', '초등 담임', '중등 국어', '한문쌤'];

  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pickW = (r, w) => { let s = w.reduce((a, b) => a + b, 0), x = r() * s; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; } return 0; };

  function demoPieces() {
    if (!CONFIG.demo) return [];
    const r = rng(2026), out = [];
    for (let i = 1; i <= CONFIG.demoCount; i++) {
      const region = REGIONS[pickW(r, WEIGHT)], nick = NICKS[Math.floor(r() * NICKS.length)], msg = MESSAGES[Math.floor(r() * MESSAGES.length)];
      out.push({ n: i, region, nick, msg, card: 1 + Math.floor(r() * 4), demo: true });
    }
    return out;
  }

  // ===== 저장소 =====
  const B = global.KFTA_BACKEND || {};
  const REMOTE = !!(B.url && B.anonKey);
  const q = new URLSearchParams(location.search);
  const DEMO = q.has('demo') ? q.get('demo') !== '0' : !REMOTE && CONFIG.demo;   // 공유 저장소에서는 예시 응원을 섞지 않음
  const KEY = REMOTE ? 'kfta-tiro-2026-mine' : 'kfta-tiro-2026-pieces';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = l => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {} };

  // Supabase REST (라이브러리 없이 fetch)
  async function api(path, opts = {}) {
    const res = await fetch(B.url.replace(/\/$/, '') + path, Object.assign({}, opts, {
      headers: Object.assign({ apikey: B.anonKey, Authorization: 'Bearer ' + B.anonKey, 'Content-Type': 'application/json' }, opts.headers || {})
    }));
    if (!res.ok) {
      let body = null; try { body = await res.json(); } catch (e) {}
      const err = new Error((body && (body.message || body.error)) || res.statusText);
      err.code = body && body.message; err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  const PUBLIC_COLS = 'n,card,msg,region,nick,shown_at';

  let cache = [], lastShown = '', lastFull = 0;   // lastShown: 가장 최근 공개 시각
  // 내 응원(이 기기에서 보낸 것) 합치기: 검수 대기 중이어도 내 화면에는 보임
  function merge(rows) {
    const byN = new Map(rows.map(r => [r.n, r]));
    load().forEach(m => {
      const r = byN.get(m.n);
      if (r) Object.assign(r, { mine: true, prize: m.prize, sns: m.sns, youtube: m.youtube, status: 'approved', pending: false });
      else if (m.status !== 'hidden') { const x = Object.assign({}, m, { mine: true, pending: true }); delete x.token; rows.push(x); }
    });
    rows.sort((a, b) => a.n - b.n);
    return rows;
  }
  async function checkMine() {
    const mine = load(); let changed = false;
    for (const m of mine) {
      if (m.status !== 'pending' || !m.token) continue;
      try { const st = await api('/rest/v1/rpc/my_piece_status', { method: 'POST', body: JSON.stringify({ p_n: m.n, p_token: m.token }) }); if (st && st !== m.status) { m.status = st; changed = true; } } catch (e) {}
    }
    if (changed) save(mine);
  }

  const Store = {
    remote: REMOTE,
    demo: DEMO,
    // 전체 불러오기
    async load() {
      if (!REMOTE) {
        const base = demoPieces();
        load().forEach(p => base.push(Object.assign({}, p, { n: base.length + 1, mine: true })));
        cache = base;
      } else {
        const rows = [];
        for (let off = 0; ; off += 1000) {
          const r = await api(`/rest/v1/pieces_public?select=${PUBLIC_COLS}&order=n.asc&limit=1000&offset=${off}`);
          rows.push(...r); if (r.length < 1000) break;
        }
        await checkMine();
        cache = merge(rows);
        lastFull = Date.now();
      }
      lastShown = cache.reduce((m, p) => (p.shown_at && p.shown_at > m ? p.shown_at : m), lastShown);
      return cache;
    },
    // 새로 공개된 응원만 가져오기 (공개 시각 기준이라 번호 순서와 무관). 30분마다 전체 다시 읽기(숨김 반영)
    async pull() {
      if (!REMOTE) return [];
      if (Date.now() - lastFull > 30 * 60e3) { const before = new Set(cache.map(p => p.n)); await Store.load(); return cache.filter(p => !before.has(p.n)); }
      const since = lastShown ? `&shown_at=gt.${encodeURIComponent(lastShown)}` : '';
      const r = await api(`/rest/v1/pieces_public?select=${PUBLIC_COLS}${since}&order=shown_at.asc&limit=500`);
      if (!r.length) return [];
      const have = new Map(cache.map(p => [p.n, p]));
      const fresh = r.filter(x => { const old = have.get(x.n); if (old) { Object.assign(old, x, { pending: false }); return false; } return true; });
      cache = merge(cache.filter(p => !p.pending).concat(fresh));
      lastShown = r.reduce((m, x) => (x.shown_at > m ? x.shown_at : m), lastShown);
      return fresh;
    },
    list() { return cache; },
    // 응원 보내기
    async add(p) {
      if (!REMOTE) {
        const mine = load(); mine.push({ region: p.region, nick: p.nick, msg: p.msg, card: p.card || 1, prize: !!p.prize, sns: !!p.sns, youtube: !!p.youtube, at: Date.now() }); save(mine);
        await Store.load(); return cache[cache.length - 1];
      }
      const r = await api('/rest/v1/rpc/submit_piece', { method: 'POST', body: JSON.stringify({ p_card: p.card, p_msg: p.msg, p_region: p.region, p_nick: p.nick, p_phone: p.phone || null, p_sns: p.sns || null, p_youtube: p.youtube || null, p_prize: !!p.prize }) });
      // 이 기기에는 확인용 값과 응모 여부만 남김 (전화번호 · SNS 아이디는 저장하지 않음)
      const piece = { n: r.n, card: p.card, msg: p.msg, region: p.region, nick: p.nick, status: r.status, prize: !!p.prize, sns: !!p.sns, youtube: !!p.youtube, at: Date.now() };
      const mine = load(); mine.push(Object.assign({ token: r.token }, piece)); save(mine);
      cache = merge(cache.filter(x => !x.pending));
      return cache.find(x => x.n === r.n) || Object.assign(piece, { mine: true, pending: r.status !== 'approved' });
    },
    mine() { return cache.filter(p => p.mine); },
  };

  // 보내기 오류를 사람이 읽을 문장으로
  function errorText(e) {
    const c = (e && (e.code || e.message)) || '';
    if (/bad_nickname/.test(c)) return '이 닉네임은 쓸 수 없어요. 다른 닉네임을 적어 주세요.';
    if (/bad_message/.test(c)) return '응원 메시지에 쓸 수 없는 표현이 있어요. 고운 말로 바꿔 주세요.';
    if (/invalid_nickname/.test(c)) return '닉네임을 2~12자로 적어 주세요.';
    if (/invalid_phone/.test(c)) return '휴대전화 번호를 010-0000-0000 형식으로 적어 주세요.';
    if (/invalid_message/.test(c)) return '응원 메시지를 2~100자로 적어 주세요.';
    if (/duplicate/.test(c)) return '같은 닉네임으로 같은 응원을 이미 보내셨어요.';
    if (/too_many/.test(c) || (e && e.status === 429)) return '응원이 몰리고 있어요. 10분 뒤에 다시 시도해 주세요.';
    return '전송하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  }

  // 욕설 · 나쁜 의미 낱말 (서버의 bad_word와 같은 목록 · 화면에서 먼저 알려 주는 용도)
  const BAD = ['씨발','시발','씨빨','시빨','씨바','씹','ㅅㅂ','ㅆㅂ','ㅄ','ㅂㅅ','병신','븅신','빙신','병딱','개새','개색','개쌔','개세끼','좆','존나','졸라','지랄','ㅈㄹ','염병','썅','쌍년','니미','니애미','느금','애미','애비','엠창','후장','섹스','쎅스','야동','보지','자지','강간','fuck','shit','bitch','asshole','pussy','dick','porn','sex'];
  const BAD_NICK = ['미친','미쳤','새끼','꺼져','닥쳐','등신','또라이','돌아이','호로','뒤져','뒈져','죽어','죽여','자살','일베','한남','한녀','메갈','틀딱','급식충','맘충','짱깨','쪽바리','관리자','운영자','admin'];
  function badWord(t, strict) {
    const s = String(t || '').toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z]/g, '');
    return BAD.some(w => s.includes(w)) || (strict && BAD_NICK.some(w => s.includes(w)));
  }

  // 메인 카드 기둥용 예시 응원 (실제 응원이 적을 때 채움)
  function samplePieces(k) { const save = CONFIG.demo; CONFIG.demo = true; const s = demoPieces().slice(0, k); CONFIG.demo = save; return s.map(p => Object.assign(p, { sample: true })); }

  function dday() {
    const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const d = Math.round((Date.parse(CONFIG.examDay) - Date.parse(kst)) / 86400e3);
    return d > 0 ? 'D-' + d : d === 0 ? 'D-DAY' : '수능 완료';
  }

  function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

  // 티로 원본의 흰 배경을 가장자리부터 지워 투명하게
  async function keyedTiro() {
    const img = await loadImg(global.ASSETS.tiro);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data, W = c.width, H = c.height;
    const bg = i => a[i] > 222 && a[i + 1] > 222 && a[i + 2] > 222 && Math.max(a[i], a[i + 1], a[i + 2]) - Math.min(a[i], a[i + 1], a[i + 2]) < 22;
    const seen = new Uint8Array(W * H), st = [];
    for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); }
    while (st.length) {
      const p = st.pop(); if (seen[p]) continue; seen[p] = 1;
      if (!bg(p * 4)) continue;
      a[p * 4 + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1); if (y > 0) st.push(p - W); if (y < H - 1) st.push(p + W);
    }
    // 가장자리 부드럽게
    for (let p = 0; p < W * H; p++) {
      if (a[p * 4 + 3] === 0) continue;
      const x = p % W, y = (p / W) | 0;
      let n = 0;
      if (x > 0 && a[(p - 1) * 4 + 3] === 0) n++; if (x < W - 1 && a[(p + 1) * 4 + 3] === 0) n++;
      if (y > 0 && a[(p - W) * 4 + 3] === 0) n++; if (y < H - 1 && a[(p + W) * 4 + 3] === 0) n++;
      if (n) a[p * 4 + 3] = 150;
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  // 낮 · 밤: 주소(?theme=) > 직접 고른 값 > 한국 시간(07~18시 낮)
  const THEME_KEY = 'kfta-tiro-theme';
  function getTheme() {
    const q = new URLSearchParams(location.search).get('theme');
    if (q === 'day' || q === 'night') return q;
    try { const s = localStorage.getItem(THEME_KEY); if (s === 'day' || s === 'night') return s; } catch (e) {}
    const h = new Date(Date.now() + 9 * 3600e3).getUTCHours();
    return h >= 7 && h < 18 ? 'day' : 'night';
  }
  function setTheme(t) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }

  function toast(text) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = text; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  Object.assign(global, { KFTA: { CONFIG, CARDS, REGIONS, errorText, samplePieces, badWord, MESSAGES, Store, dday, loadImg, keyedTiro, toast, rng, getTheme, setTheme } });
})(window);
