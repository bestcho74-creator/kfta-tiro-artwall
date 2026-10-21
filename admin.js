/* 티로 수능응원 아트월 · 관리자 화면 (검수 · 경품 추첨)
   Supabase REST를 fetch로 바로 부릅니다 (supabase-js 없음).
   ① 로그인(Auth) → ② 관리자 확인(is_admin) → ③ 목록 · 검수 · 인스타 확인 · 삭제 · 자동 공개 설정
   ④ CSV 내보내기 · 경품 추첨 (추첨권 가중치 · 중복 없이 · crypto.getRandomValues) */
(function () {
  'use strict';
  const K = window.KFTA || {};
  const REGIONS = K.REGIONS || ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  const BE = window.KFTA_BACKEND || {};
  const BASE = String(BE.url || '').trim().replace(/\/+$/, '');
  const ANON = String(BE.anonKey || '').trim();
  const SKEY = 'kfta-admin-session';
  const PAGE = 1000;        // 한 번에 받는 행 수 (Supabase 기본 최대 1000)
  const STEP = 150;         // 목록에 한 번에 그리는 행 수
  const AUTO_MS = 30000;    // 자동 새로고침 간격
  const ST = { pending: '검수 대기', approved: '공개', hidden: '숨김' };
  const DONE = { approved: '공개했습니다', hidden: '숨겼습니다', pending: '검수 대기로 돌렸습니다' };
  const ASK = { approved: '공개할까요', hidden: '숨길까요', pending: '검수 대기로 돌릴까요' };
  const TAB_FILE = { pending: '검수대기', approved: '공개', hidden: '숨김', all: '전체' };

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(4, '0');
  const z = v => String(v).padStart(2, '0');
  const num = v => Number(v || 0).toLocaleString('ko-KR');

  // 한국 시간 (DST 없음 → UTC+9 고정). short: "MM.DD HH:mm", full: "YYYY-MM-DD HH:mm:ss"
  function kst(v, full) {
    if (!v) return '';
    const t = v instanceof Date ? v.getTime() : Date.parse(String(v).replace(/(\.\d{3})\d+/, '$1'));
    if (isNaN(t)) return '';
    const d = new Date(t + 9 * 3600e3);
    const md = `${z(d.getUTCMonth() + 1)}.${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
    return full ? `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}` : md;
  }
  const stamp = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}-${z(d.getUTCHours())}${z(d.getUTCMinutes())}`; };

  // 인스타그램 아이디: @ · 주소 앞부분을 떼고 정리
  const igOf = p => String((p && p.insta) || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@+/, '').replace(/[/?#].*$/, '').trim();
  const igValid = s => /^[A-Za-z0-9._]{1,30}$/.test(s);
  const tix = p => 1 + (p.insta_checked ? 1 : 0);   // 추첨권: 기본 1 + 인스타 확인 1 (최대 2)

  /* ===================== 상태 ===================== */
  let session = null;        // { access_token, refresh_token, expires_at(ms), email }
  let items = [];            // 서버의 전체 조각 (n 내림차순)
  let byN = new Map();
  let counts = { all: 0, pending: 0, approved: 0, hidden: 0, prize: 0, instaOk: 0 };
  let igCount = new Map();   // 인스타 아이디별 건수 (중복 의심 표시)
  let settings = null;
  const sel = new Set();     // 선택한 번호
  const F = { tab: 'pending', region: '', extra: '', q: '' };
  let view = [];             // 현재 필터 결과
  let shown = STEP;
  let lastPick = -1;         // Shift 범위 선택 기준
  let lastSig = '', lastLoad = 0, loadErr = '', loadingP = null, timer = null, busy = 0, expiring = false;
  let draw = null;           // 최근 추첨 결과 (화면에만 보관)

  /* ===================== 알림 ===================== */
  function toast(text, type = 'ok') {
    const box = $('#toasts');
    const host = document.querySelector('dialog[open]') || document.body;   // 열린 대화 상자 위에도 보이게
    if (box.parentNode !== host) host.appendChild(box);
    const t = document.createElement('div');
    t.className = 'tst ' + type;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 5200 : 2800);
  }

  /* ===================== 오류 ===================== */
  class ApiError extends Error {
    constructor(status, code, message, extra) { super(message || ''); this.status = status; this.code = code || ''; Object.assign(this, extra || {}); }
  }
  const netErr = () => new ApiError(0, 'network', 'network', { network: true });
  async function parseErr(res) {
    let j = null;
    try { j = await res.json(); } catch (e) {}
    const code = (j && (j.code || j.error_code || j.error)) || '';
    const msg = (j && (j.message || j.msg || j.error_description || j.error)) || res.statusText || '';
    return new ApiError(res.status, String(code), String(msg));
  }
  function errText(e) {
    if (!e) return '알 수 없는 오류가 발생했습니다.';
    if (e.network) return '네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.';
    const m = `${e.message || ''} ${e.code || ''}`;
    if (/not_admin/.test(m)) return '관리자 권한이 없습니다. admins 표에 이메일이 있는지 확인해 주세요.';
    if (/invalid_status/.test(m)) return '잘못된 검수 상태입니다.';
    if (/Invalid login credentials|invalid_credentials/i.test(m)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (/Email not confirmed|email_not_confirmed/i.test(m)) return '이메일 인증이 끝나지 않은 계정입니다. 대시보드에서 계정을 확인해 주세요.';
    if (e.status === 401 || /JWT|PGRST301|refresh token/i.test(m)) return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
    if (e.status === 403 || /42501|permission denied|no_rows/i.test(m)) return '권한이 없습니다. 관리자 계정인지 확인해 주세요.';
    if (e.status === 404 || /PGRST202|PGRST205|42P01|42883/.test(m)) return '서버에 필요한 표나 함수가 없습니다. SQL 마이그레이션을 실행했는지 확인해 주세요.';
    if (e.status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    if (e.status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    return '요청을 처리하지 못했습니다' + (e.message ? ': ' + e.message : '.');
  }
  const fail = e => { if (e && e.expired) return; console.warn('[admin]', e); toast(errText(e), 'err'); };

  /* ===================== 로그인 세션 ===================== */
  function loadSession() { try { const s = JSON.parse(sessionStorage.getItem(SKEY)); return s && s.access_token ? s : null; } catch (e) { return null; } }
  function setSession(d) {
    const prev = session || {};
    session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token || prev.refresh_token || '',
      expires_at: d.expires_at ? d.expires_at * 1000 : Date.now() + (d.expires_in || 3600) * 1000,
      email: (d.user && d.user.email) || prev.email || '',
    };
    try { sessionStorage.setItem(SKEY, JSON.stringify(session)); } catch (e) {}
  }
  function clearSession() { session = null; try { sessionStorage.removeItem(SKEY); } catch (e) {} }

  async function authToken(grant, body) {
    let res;
    try {
      res = await fetch(`${BASE}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    } catch (e) { throw netErr(); }
    if (!res.ok) throw await parseErr(res);
    return res.json();
  }

  // 토큰 갱신 (동시에 여러 요청이 와도 한 번만)
  let refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        if (!session || !session.refresh_token) throw new ApiError(401, 'no_session', 'no session');
        setSession(await authToken('refresh_token', { refresh_token: session.refresh_token }));
      } catch (e) {
        if (e.network) throw e;   // 네트워크 문제면 세션은 남겨 둠
        expire();
        throw new ApiError(401, 'expired', e.message, { expired: true });
      }
    })();
    const done = () => { refreshing = null; };
    refreshing.then(done, done);
    return refreshing;
  }
  // 로그인 만료 → 로그인 화면으로
  function expire() {
    if (expiring) return;
    expiring = true;
    stopTimer(); clearSession(); resetData();
    show('vLogin');
    toast('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'err');
    setTimeout(() => { expiring = false; }, 500);
  }

  /* ===================== REST 호출 ===================== */
  async function api(path, o = {}) {
    if (!session) throw new ApiError(401, 'expired', 'no session', { expired: true });
    if (session.expires_at - 60e3 < Date.now()) await refresh();
    const send = () => {
      const h = { apikey: ANON, Authorization: 'Bearer ' + session.access_token };
      if (o.body !== undefined) h['Content-Type'] = 'application/json';
      if (o.prefer) h.Prefer = o.prefer;
      Object.assign(h, o.headers || {});
      return fetch(BASE + path, { method: o.method || 'GET', headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, cache: 'no-store' })
        .catch(() => { throw netErr(); });
    };
    let res = await send();
    if (res.status === 401) { await refresh(); res = await send(); }   // 만료 직후면 한 번만 다시
    if (res.status === 401) { expire(); throw new ApiError(401, 'expired', 'expired', { expired: true }); }
    if (!res.ok) throw await parseErr(res);
    if (o.raw) return res;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ===================== 화면 전환 ===================== */
  const VIEWS = ['vNoCfg', 'vBoot', 'vLogin', 'vDenied', 'vApp'];
  function show(id) {
    VIEWS.forEach(v => { $('#' + v).hidden = v !== id; });
    const authed = !!session && (id === 'vApp' || id === 'vDenied' || id === 'vBoot');
    $('#who').hidden = $('#btnOut').hidden = !authed;
    $('#who').textContent = session ? session.email : '';
    if (id !== 'vApp') { $('#bulk').hidden = true; document.body.classList.remove('has-sel'); }
    if (id === 'vLogin') { $('#lgErr').textContent = ''; setTimeout(() => $('#lgEmail').focus(), 50); }
    document.title = '아트월 관리자 | 한국교총';
  }
  function bootMsg(text, retry) {
    show('vBoot');
    const m = $('#bootMsg');
    m.textContent = text;
    m.classList.toggle('loading', !retry);
    $('#bootBtns').hidden = !retry;
  }

  // 로그인 후: 관리자인지 확인 → 목록 불러오기
  async function boot() {
    bootMsg('관리자 권한을 확인하는 중…');
    let ok;
    try { ok = await api('/rest/v1/rpc/is_admin', { method: 'POST', body: {} }); }
    catch (e) { if (!e.expired) bootMsg(errText(e), true); return; }
    if (ok !== true) { showDenied(); return; }
    show('vApp');
    applyFilter(); renderAll();
    loadSettings();
    await loadAll();
    startTimer();
  }
  function showDenied() {
    const email = session ? session.email : '';
    $('#dnEmail').textContent = email || '(이메일 없음)';
    $('#dnSql').textContent = `insert into public.admins (email) values ('${email.replace(/'/g, "''")}');`;
    show('vDenied');
  }

  async function logout() {
    const s = session;
    stopTimer(); clearSession(); resetData();
    show('vLogin');
    if (s) {
      try { await fetch(`${BASE}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + s.access_token } }); } catch (e) {}
    }
    toast('로그아웃했습니다.');
  }
  function resetData() {
    items = []; byN = new Map(); igCount = new Map(); sel.clear(); view = []; settings = null; draw = null;
    lastSig = ''; lastLoad = 0; loadErr = ''; shown = STEP; lastPick = -1;
    counts = { all: 0, pending: 0, approved: 0, hidden: 0, prize: 0, instaOk: 0 };
    $('#list').textContent = ''; $('#dOut').innerHTML = ''; $('#dCsv').disabled = true;
  }

  /* ===================== 불러오기 ===================== */
  // 전체 조각을 1000건씩 끝까지 (Range 머리글 + 전체 건수)
  function loadAll(o = {}) {
    if (loadingP) return loadingP;
    loadingP = (async () => {
      $('#btnRefresh').classList.add('spin');
      try {
        const got = new Map();
        let from = 0, total = Infinity;
        for (let guard = 0; guard < 200 && from < total; guard++) {
          let res;
          try {
            res = await api('/rest/v1/pieces?select=*&order=n.desc', { raw: true, prefer: 'count=exact', headers: { 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` } });
          } catch (e) { if (e.status === 416) break; throw e; }   // 범위 밖 (중간에 삭제된 경우)
          const rows = await res.json();
          const m = /\/(\d+|\*)\s*$/.exec(res.headers.get('Content-Range') || '');
          if (m && m[1] !== '*') total = +m[1];
          rows.forEach(r => got.set(r.n, r));
          if (!rows.length || ((!m || m[1] === '*') && rows.length < PAGE)) break;
          from += rows.length;
        }
        if (!session) return false;   // 불러오는 사이 로그아웃함
        const list = [...got.values()].sort((a, b) => b.n - a.n);
        const prevMax = items.length ? items[0].n : 0;
        const fresh = prevMax ? list.filter(p => p.n > prevMax).length : 0;
        const sig = list.map(p => `${p.n}:${p.status}:${p.insta_checked ? 1 : 0}:${p.reviewed_at || ''}`).join('|');
        items = list; byN = new Map(list.map(p => [p.n, p]));
        lastLoad = Date.now(); loadErr = '';
        derive();
        [...sel].forEach(n => { if (!byN.has(n)) sel.delete(n); });
        if (o.quiet && fresh) toast(`새 응원 ${fresh}건이 들어왔습니다.`, 'warn');
        applyFilter();
        if (o.quiet && sig === lastSig) { renderStats(); renderBulk(); return true; }   // 바뀐 게 없으면 목록은 그대로
        lastSig = sig;
        renderAll();
        return true;
      } catch (e) {
        if (!e.expired) { loadErr = errText(e); if (!o.quiet) fail(e); }
        renderUpd();
        return false;
      } finally {
        $('#btnRefresh').classList.remove('spin');
        loadingP = null;
      }
    })();
    return loadingP;
  }

  // 건수 · 인스타 중복 · 검색용 문자열
  function derive() {
    const c = { all: items.length, pending: 0, approved: 0, hidden: 0, prize: 0, instaOk: 0 };
    igCount = new Map();
    items.forEach(p => {
      c[p.status] = (c[p.status] || 0) + 1;
      if (p.prize) c.prize++;
      if (p.insta_checked) c.instaOk++;
      const ig = igOf(p).toLowerCase();
      if (ig) igCount.set(ig, (igCount.get(ig) || 0) + 1);
      p._hay = [p.n, pad(p.n), p.msg, p.member_id, p.nick, p.insta, igOf(p)].join('\n').toLowerCase();
    });
    counts = c;
  }
  const dupOf = p => { const ig = igOf(p).toLowerCase(); return ig ? igCount.get(ig) || 0 : 0; };

  /* ===================== 설정 (자동 공개) ===================== */
  async function loadSettings(quiet) {
    try {
      const rows = await api('/rest/v1/settings?id=eq.1&select=*');
      settings = (rows && rows[0]) || null;
    } catch (e) { if (!quiet) { settings = null; fail(e); } }
    renderAuto();
  }
  function renderAuto() {
    const cb = $('#auto');
    if (cb.dataset.busy) return;
    cb.disabled = !settings;
    cb.checked = !!(settings && settings.auto_approve);
    $('#autoBox').classList.toggle('on', cb.checked);
    $('#autoNote').textContent = !settings ? '설정을 불러오지 못했습니다 (settings 표 확인)'
      : settings.auto_approve ? '켜짐 · 새 응원이 검수 없이 바로 아트월에 공개됩니다'
      : '꺼짐 · 새 응원은 검수 대기로 들어옵니다';
  }
  async function setAuto(on) {
    const cb = $('#auto');
    if (on && !confirm('자동 공개를 켤까요?\n\n지금부터 들어오는 응원은 검수 없이 바로 아트월에 공개됩니다.\n(이미 검수 대기 중인 응원은 그대로 남습니다.)\n부적절한 표현이 그대로 노출될 수 있으니 주의해 주세요.')) { cb.checked = false; return; }
    cb.disabled = true; cb.dataset.busy = '1';
    try {
      const rows = await api('/rest/v1/settings?id=eq.1', { method: 'PATCH', prefer: 'return=representation', body: { auto_approve: on, updated_at: new Date().toISOString() } });
      if (!Array.isArray(rows) || !rows.length) throw new ApiError(403, 'no_rows', '설정을 바꿀 권한이 없습니다');
      settings = rows[0];
      toast(on ? '자동 공개를 켰습니다. 새 응원이 바로 공개됩니다.' : '자동 공개를 껐습니다. 새 응원은 검수 대기로 들어옵니다.', on ? 'warn' : 'ok');
    } catch (e) { fail(e); }
    delete cb.dataset.busy;
    renderAuto();
  }

  /* ===================== 검수 · 인스타 확인 · 삭제 ===================== */
  async function review(ns, status, o = {}) {
    ns = ns.filter(n => byN.has(n) && byN.get(n).status !== status);
    if (!ns.length) { if (o.idx != null) focusRow(o.idx + 1); return; }
    if (o.ask && !confirm(`선택한 ${num(ns.length)}건을 ${ASK[status]}?`)) return;
    busy++;
    try {
      const cnt = await api('/rest/v1/rpc/review_pieces', { method: 'POST', body: { p_ns: ns, p_status: status } });
      const now = new Date().toISOString();
      ns.forEach(n => { const p = byN.get(n); if (p) { p.status = status; p.reviewed_at = now; p.reviewed_by = session ? session.email : ''; } sel.delete(n); });
      derive();
      toast(ns.length === 1 ? `No.${pad(ns[0])} ${DONE[status]}` : `${num(ns.length)}건을 ${DONE[status]}`);
      if (typeof cnt === 'number' && cnt !== ns.length) { toast(`요청 ${ns.length}건 · 실제 반영 ${cnt}건 — 목록을 다시 불러옵니다.`, 'warn'); loadAll({ quiet: true }); }
      applyFilter();
      let fi = null;
      if (o.idx != null) { const still = view.findIndex(p => p.n === ns[0]); fi = still >= 0 ? still + 1 : o.idx; }
      renderAll({ focusIdx: fi });
    } catch (e) { fail(e); }
    finally { busy--; }
  }

  async function setInsta(n, on, input) {
    const p = byN.get(n);
    if (!p || !Number.isInteger(n)) return;
    input.disabled = true;
    busy++;
    try {
      await api(`/rest/v1/pieces?n=eq.${n}`, { method: 'PATCH', prefer: 'return=minimal', body: { insta_checked: on } });
      p.insta_checked = on;
      derive(); renderStats();
      toast(on ? `No.${pad(n)} 인스타 확인 · 추첨권 2장` : `No.${pad(n)} 인스타 확인 해제 · 추첨권 1장`);
    } catch (e) { input.checked = !on; fail(e); }
    finally { input.disabled = false; busy--; }
  }

  async function removePiece(n) {
    const p = byN.get(n);
    if (!p || !Number.isInteger(n)) return;
    if (!confirm(`No.${pad(n)} 응원을 완전히 삭제할까요?\n\n· 삭제한 번호(${n}번째 조각 자리)는 다시 채워지지 않고 빈칸으로 남습니다.\n· 같은 홈페이지 아이디로 다시 응원을 보낼 수 있게 됩니다.\n· 아트월에서 내리기만 하려면 [숨김]을 쓰세요.\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    busy++;
    try {
      const rows = await api(`/rest/v1/pieces?n=eq.${n}`, { method: 'DELETE', prefer: 'return=representation' });
      if (Array.isArray(rows) && !rows.length) throw new ApiError(403, 'no_rows', '삭제되지 않았습니다 (권한 또는 이미 삭제됨)');
      items = items.filter(x => x.n !== n); byN.delete(n); sel.delete(n);
      derive(); applyFilter(); renderAll();
      toast(`No.${pad(n)} 삭제했습니다. 번호 자리는 비어 있게 됩니다.`);
    } catch (e) { fail(e); }
    finally { busy--; }
  }

  /* ===================== 필터 ===================== */
  function matches(p) {
    if (F.tab !== 'all' && p.status !== F.tab) return false;
    if (F.region && p.region !== F.region) return false;
    switch (F.extra) {
      case 'prize': if (!p.prize) return false; break;
      case 'insta': if (!igOf(p)) return false; break;
      case 'insta_todo': if (!igOf(p) || p.insta_checked) return false; break;
      case 'insta_ok': if (!p.insta_checked) return false; break;
      case 'dup': if (dupOf(p) < 2) return false; break;
    }
    if (F.q && (p._hay || '').indexOf(F.q) < 0) return false;
    return true;
  }
  function applyFilter() { view = items.filter(matches); lastPick = -1; }
  // 사용자가 조건을 바꿈 → 보이지 않는 선택은 풀어서 엉뚱한 일괄 처리를 막음
  function filterChanged() {
    applyFilter();
    const inView = new Set(view.map(p => p.n));
    [...sel].forEach(n => { if (!inView.has(n)) sel.delete(n); });
    shown = STEP; lastPick = -1;
    renderAll();
  }
  function setTab(tab, extra) {
    F.tab = tab;
    if (extra !== undefined) { F.extra = extra; $('#fExtra').value = extra; }
    filterChanged();
  }

  /* ===================== 그리기 ===================== */
  function renderAll(o = {}) { renderStats(); renderList(o.focusIdx); renderBulk(); }

  function renderStats() {
    const c = counts;
    const chip = (cls, attr, label, v) => `<button type="button" class="stat ${cls}" ${attr}><span>${label}</span><b>${num(v)}</b></button>`;
    $('#stats').innerHTML = [
      chip('', 'data-tab="all"', '전체', c.all),
      chip('pend' + (c.pending ? ' hot' : ''), 'data-tab="pending"', '검수 대기', c.pending),
      chip('ok', 'data-tab="approved"', '공개', c.approved),
      chip('hid', 'data-tab="hidden"', '숨김', c.hidden),
      chip('gold', 'data-tab="all" data-extra="prize"', '경품 응모', c.prize),
      chip('sky', 'data-tab="all" data-extra="insta_ok"', '인스타 확인', c.instaOk),
    ].join('');
    document.querySelectorAll('#tabs button').forEach(b => {
      const t = b.dataset.tab;
      b.classList.toggle('on', t === F.tab);
      b.setAttribute('aria-selected', t === F.tab);
      b.querySelector('em').textContent = num(t === 'all' ? c.all : c[t]);
    });
    document.title = (c.pending ? `(${c.pending}) ` : '') + '아트월 관리자 | 한국교총';
  }

  function cardOf(p) {
    const d = { card: p.card, msg: p.msg, region: p.region, nick: p.nick };
    try { if (K.cardEl) return K.cardEl(d); } catch (e) {}
    const el = document.createElement('div');   // join.js가 없을 때 대신 보여 줄 글 상자
    el.style.cssText = 'aspect-ratio:1;border-radius:10px;background:#EAF2FF;color:#16325C;font:700 11px/1.4 var(--serif);padding:8px;overflow:hidden;display:grid;place-items:center;text-align:center';
    el.textContent = p.msg || '';
    return el;
  }

  function rowEl(p) {
    const el = document.createElement('article');
    const dup = dupOf(p), ig = igOf(p), no = 'No.' + esc(pad(p.n));
    el.className = `row st-${esc(p.status)}${sel.has(p.n) ? ' sel' : ''}${dup > 1 ? ' dup' : ''}`;
    el.tabIndex = 0;
    el.dataset.n = p.n;
    el.setAttribute('aria-label', `No.${pad(p.n)} ${ST[p.status] || p.status}`);
    const igHtml = !ig ? '<span class="none">없음</span>'
      : igValid(ig) ? `<a href="https://www.instagram.com/${encodeURIComponent(ig)}/" target="_blank" rel="noopener noreferrer">@${esc(ig)}</a>`
      : `<span title="형식이 올바르지 않은 아이디">${esc(p.insta)}</span>`;
    const ab = (s, label, cls) => `<button type="button" class="ab ${cls}" data-act="${s}"${p.status === s ? ' disabled aria-pressed="true"' : ''}>${label}</button>`;
    el.innerHTML = `
      <label class="ck" title="선택 (Shift: 범위 선택)"><input type="checkbox" data-act="sel"${sel.has(p.n) ? ' checked' : ''} aria-label="${no} 선택"></label>
      <div class="pv" data-act="zoom" title="크게 보기"></div>
      <div class="info">
        <div class="rl1">
          <b class="no">${no}</b><span class="bd ${esc(p.status)}">${esc(ST[p.status] || p.status)}</span>
          <span class="rg">${esc(p.region)}교총</span>
          <span class="tm" title="${esc(kst(p.created_at, true))} (KST)">${esc(kst(p.created_at))}</span>
          ${dup > 1 ? `<span class="dupb" title="같은 인스타그램 아이디로 들어온 응원이 ${dup}건 있습니다">인스타 중복 ×${dup}</span>` : ''}
        </div>
        <p class="msg">${esc(p.msg)}</p>
        <div class="rl3">
          <span class="kv"><i>아이디</i><b class="mid">${esc(p.member_id)}</b></span>
          <span class="kv"><i>공개명</i>${esc(p.nick)}</span>
          <span class="kv"><i>인스타</i>${igHtml}</span>
          <span class="kv"><i>경품 응모</i><b class="yn ${p.prize ? 'y' : 'n'}">${p.prize ? 'Y' : 'N'}</b></span>
          <label class="kv swl" title="인스타그램 댓글을 확인하면 추첨권 1장 추가"><input type="checkbox" class="sw" data-act="insta"${p.insta_checked ? ' checked' : ''}><span>인스타 확인</span></label>
        </div>
        <div class="rl4">${p.reviewed_at ? `검수 ${esc(p.reviewed_by || '-')} · ${esc(kst(p.reviewed_at))}` : '검수 전'}</div>
      </div>
      <div class="acts">${ab('approved', '공개', 'ok')}${ab('hidden', '숨김', 'hid')}${ab('pending', '대기로', 'pend')}<button type="button" class="ab del" data-act="del">삭제</button></div>`;
    el.querySelector('.pv').appendChild(cardOf(p));
    return el;
  }

  function emptyText() {
    if (!items.length) return lastLoad ? '아직 들어온 응원이 없습니다.' : '불러오는 중…';
    if (F.q || F.region || F.extra) return '조건에 맞는 응원이 없습니다.';
    return { pending: '검수를 기다리는 응원이 없습니다 ✓', approved: '공개된 응원이 없습니다.', hidden: '숨긴 응원이 없습니다.', all: '응원이 없습니다.' }[F.tab];
  }

  function renderList(focusIdx) {
    const box = $('#list');
    const active = document.activeElement && document.activeElement.closest ? document.activeElement.closest('#list .row') : null;
    const keepN = active ? +active.dataset.n : null;
    if (focusIdx != null) { focusIdx = Math.min(focusIdx, view.length - 1); if (focusIdx >= shown) shown = focusIdx + 1; }
    box.textContent = '';
    $('#cnt').textContent = `${num(view.length)}건` + (view.length > shown ? ` 중 ${num(shown)}건 표시` : '');
    if (!view.length) {
      box.innerHTML = `<div class="empty">${esc(emptyText())}</div>`;
      $('#more').hidden = true;
      return;
    }
    const frag = document.createDocumentFragment();
    view.slice(0, shown).forEach(p => frag.appendChild(rowEl(p)));
    box.appendChild(frag);
    const more = $('#more');
    more.hidden = view.length <= shown;
    more.textContent = `더 보기 (${num(Math.min(STEP, view.length - shown))}건 더 · ${num(shown)}/${num(view.length)})`;
    // 키보드로 검수하던 자리 이어 가기
    let target = null;
    if (focusIdx != null && focusIdx >= 0) target = box.children[focusIdx];
    else if (keepN != null) target = box.querySelector(`.row[data-n="${keepN}"]`);
    if (target) target.focus({ preventScroll: focusIdx == null });
  }

  function renderBulk() {
    const n = sel.size;
    const inView = view.reduce((s, p) => s + (sel.has(p.n) ? 1 : 0), 0);
    $('#bulk').hidden = !n || $('#vApp').hidden;
    document.body.classList.toggle('has-sel', !!n);
    $('#selN').textContent = `선택 ${num(n)}건`;
    $('#bulkAll').textContent = `현재 목록 모두 선택 (${num(view.length)}건)`;
    $('#bulkAll').hidden = inView >= view.length;
    const all = $('#selAll');
    all.checked = view.length > 0 && inView === view.length;
    all.indeterminate = inView > 0 && inView < view.length;
    all.disabled = !view.length;
    $('#selAllTxt').textContent = `현재 목록 모두 선택 (${num(view.length)}건)`;
    renderUpd();
  }

  function renderUpd() {
    const u = $('#upd');
    u.className = 'upd';
    if (loadErr) { u.textContent = '새로고침 실패 · ' + loadErr; u.classList.add('bad'); }
    else if (sel.size) { u.textContent = '선택 중 · 자동 새로고침 멈춤'; u.classList.add('warn'); }
    else u.textContent = lastLoad ? `자동 새로고침 30초 · 마지막 ${kst(new Date(lastLoad), true).slice(11)}` : '';
  }

  function syncSel() {
    document.querySelectorAll('#list .row').forEach(r => {
      const on = sel.has(+r.dataset.n);
      r.classList.toggle('sel', on);
      const c = r.querySelector('[data-act="sel"]');
      if (c) c.checked = on;
    });
    renderBulk();
  }
  function pick(n, on, shift) {
    const i = view.findIndex(p => p.n === n);
    if (shift && lastPick >= 0 && i >= 0) {
      const a = Math.min(i, lastPick), b = Math.max(i, lastPick);
      for (let k = a; k <= b; k++) { if (on) sel.add(view[k].n); else sel.delete(view[k].n); }
    } else if (on) sel.add(n); else sel.delete(n);
    lastPick = i;
    syncSel();
  }
  function focusRow(i) {
    if (!view.length) return;
    i = Math.max(0, Math.min(view.length - 1, i));
    if (i >= shown) { shown = Math.min(view.length, shown + STEP); renderList(i); return; }
    const r = $('#list').children[i];
    if (r) r.focus();
  }

  /* ===================== 카드 크게 보기 ===================== */
  function openCard(n) {
    const p = byN.get(n);
    if (!p) return;
    const box = $('#bigCard');
    box.textContent = '';
    box.appendChild(cardOf(p));
    $('#bigMeta').innerHTML = `<b>No.${esc(pad(p.n))}</b> · ${esc(ST[p.status] || p.status)} · ${esc(p.region)}교총 · ${esc(p.member_id)}<br>${esc(kst(p.created_at, true))} (KST)`;
    $('#bigActs').innerHTML = ['approved', 'hidden', 'pending'].map(s => `<button type="button" class="btn sm ${s === 'approved' ? 'ok' : s === 'hidden' ? 'hid' : 'ghost'}" data-s="${s}"${p.status === s ? ' disabled' : ''}>${s === 'pending' ? '대기로' : ST[s]}</button>`).join('');
    $('#bigActs').dataset.n = n;
    $('#dlgCard').showModal();
  }

  /* ===================== CSV ===================== */
  // 엑셀 수식으로 읽히지 않게 = + - @ 로 시작하는 글은 앞에 ' 를 붙임
  const cell = v => {
    if (v == null) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const toCSV = rows => rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });   // BOM: 엑셀에서 한글 깨짐 방지
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function exportCSV() {
    if (!view.length) { toast('내보낼 응원이 없습니다.', 'err'); return; }
    const head = ['n', 'status', 'region', 'member_id', 'nick', 'insta', 'prize', 'insta_checked', 'msg', 'created_at(KST)', 'reviewed_at', 'reviewed_by'];
    const rows = view.map(p => [p.n, p.status, p.region, p.member_id, p.nick, igOf(p), p.prize ? 'Y' : 'N', p.insta_checked ? 'Y' : 'N', p.msg, kst(p.created_at, true), kst(p.reviewed_at, true), p.reviewed_by || '']);
    download(`티로아트월_${TAB_FILE[F.tab]}${F.region ? '_' + F.region : ''}_${stamp()}.csv`, toCSV([head, ...rows]));
    toast(`${num(view.length)}건을 CSV로 저장했습니다.`);
  }

  /* ===================== 경품 추첨 ===================== */
  const eligible = () => items.filter(p => p.status === 'approved' && p.prize);
  // 0 ≤ r < max 정수 (치우침 없이)
  function randInt(max) {
    const lim = Math.floor(0x100000000 / max) * max, b = new Uint32Array(1);
    do crypto.getRandomValues(b); while (b[0] >= lim);
    return b[0] % max;
  }
  // 추첨권 수만큼 가중치 · 뽑힌 사람은 빼고 다음 추첨 (비복원)
  function drawWeighted(pool, k) {
    const left = pool.slice(), out = [];
    let total = left.reduce((s, x) => s + x.t, 0);
    while (out.length < k && left.length && total > 0) {
      let r = randInt(total), i = 0;
      while (r >= left[i].t) { r -= left[i].t; i++; }
      const w = left.splice(i, 1)[0];
      total -= w.t;
      out.push(w);
    }
    return out;
  }
  function renderDrawInfo() {
    const el = eligible();
    $('#dEl').textContent = num(el.length);
    $('#dTix').textContent = num(el.reduce((s, p) => s + tix(p), 0));
    $('#dTwo').textContent = num(el.filter(p => p.insta_checked).length);
  }
  function openDraw() { renderDrawInfo(); renderDraw(); $('#dlgDraw').showModal(); }

  async function runDraw() {
    const k1 = Math.max(0, Math.floor(+$('#dK1').value || 0)), k2 = Math.max(0, Math.floor(+$('#dK2').value || 0));
    if (!k1 && !k2) { toast('당첨 인원을 1명 이상 적어 주세요.', 'err'); return; }
    if (draw && !confirm('다시 추첨하면 지금 결과는 사라집니다.\n(CSV로 내려받지 않았다면 먼저 저장해 주세요.)\n\n다시 추첨할까요?')) return;
    const btn = $('#dRun');
    btn.disabled = true; btn.textContent = '최신 목록 확인 중…';
    try {
      if (!(await loadAll({ quiet: true }))) { toast('최신 목록을 불러오지 못해 추첨을 멈췄습니다. ' + (loadErr || ''), 'err'); return; }
      renderDrawInfo();
      const pool = eligible().map(p => ({ p, t: tix(p) }));
      if (!pool.length) { toast('추첨 대상이 없습니다. (공개 + 경품 응모)', 'err'); return; }
      const w1 = drawWeighted(pool, k1);
      const won = new Set(w1.map(w => w.p.n));
      const w2 = k2 ? drawWeighted(pool.filter(x => !won.has(x.p.n)), k2) : [];
      draw = { at: new Date(), w1, w2, pool: pool.length, tickets: pool.reduce((s, x) => s + x.t, 0) };
      if (w1.length < k1 || w2.length < k2) toast(`대상 인원(${num(pool.length)}명)이 모자라 뽑을 수 있는 만큼만 뽑았습니다.`, 'warn');
      else toast(`추첨을 마쳤습니다. 당첨 ${num(w1.length)}명${w2.length ? ` · 특별 경품 ${num(w2.length)}명` : ''}`);
      renderDraw();
    } finally { btn.disabled = false; btn.textContent = '추첨하기'; }
  }
  function renderDraw() {
    const out = $('#dOut');
    if (!draw) { out.innerHTML = ''; $('#dCsv').disabled = true; return; }
    const table = (title, list) => `<h4>${esc(title)}<small>${num(list.length)}명</small></h4>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>순번</th><th>No.</th><th>소속</th><th>아이디</th><th>인스타</th><th>추첨권</th></tr></thead><tbody>${
        list.map((w, i) => `<tr><td>${i + 1}</td><td>${esc(pad(w.p.n))}</td><td>${esc(w.p.region)}교총</td><td><b>${esc(w.p.member_id)}</b></td><td>${igOf(w.p) ? '@' + esc(igOf(w.p)) : '-'}</td><td${w.t > 1 ? ' class="t2"' : ''}>${w.t}</td></tr>`).join('')
      }</tbody></table></div>`;
    out.innerHTML = `<p class="dmeta">추첨 시각 ${esc(kst(draw.at, true))} (KST) · 대상 ${num(draw.pool)}명 · 추첨권 ${num(draw.tickets)}장</p>`
      + table('1차 당첨', draw.w1) + (draw.w2.length ? table('특별 경품', draw.w2) : '');
    $('#dCsv').disabled = false;
  }
  function drawCSV() {
    if (!draw) return;
    const head = ['구분', '순번', 'n', 'region', 'member_id', 'nick', 'insta', 'tickets', 'drawn_at(KST)'];
    const at = kst(draw.at, true);
    const rows = [];
    draw.w1.forEach((w, i) => rows.push(['1차 당첨', i + 1, w.p.n, w.p.region, w.p.member_id, w.p.nick, igOf(w.p), w.t, at]));
    draw.w2.forEach((w, i) => rows.push(['특별 경품', i + 1, w.p.n, w.p.region, w.p.member_id, w.p.nick, igOf(w.p), w.t, at]));
    download(`티로아트월_경품당첨자_${stamp()}.csv`, toCSV([head, ...rows]));
  }

  /* ===================== 자동 새로고침 ===================== */
  function startTimer() { stopTimer(); timer = setInterval(tick, AUTO_MS); }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function tick() {
    if (!session || $('#vApp').hidden || document.hidden || sel.size || busy || loadingP) { renderUpd(); return; }
    loadAll({ quiet: true });
    loadSettings(true);
  }

  /* ===================== 이벤트 ===================== */
  function bind() {
    // 로그인
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#lgEmail').value.trim(), pw = $('#lgPw').value, btn = $('#lgBtn'), err = $('#lgErr');
      if (!email || !pw) { err.textContent = '이메일과 비밀번호를 모두 적어 주세요.'; return; }
      btn.disabled = true; btn.textContent = '로그인 중…'; err.textContent = '';
      try {
        setSession(await authToken('password', { email, password: pw }));
        $('#lgPw').value = '';
        await boot();
      } catch (ex) { err.textContent = errText(ex); }
      finally { btn.disabled = false; btn.textContent = '로그인'; }
    });
    $('#btnOut').onclick = logout;
    $('#bootOut').onclick = logout;
    $('#dnOut').onclick = logout;
    $('#bootRetry').onclick = boot;
    $('#dnRetry').onclick = boot;
    $('#dnCopy').onclick = () => {
      const t = $('#dnSql').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('SQL을 복사했습니다.'), () => toast('복사하지 못했습니다. 직접 선택해 복사해 주세요.', 'err'));
    };

    // 자동 공개
    $('#auto').addEventListener('change', e => setAuto(e.target.checked));

    // 통계 칸 → 해당 목록으로
    $('#stats').addEventListener('click', e => {
      const b = e.target.closest('.stat');
      if (b) setTab(b.dataset.tab, b.dataset.extra || '');
    });
    $('#tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (b) setTab(b.dataset.tab);
    });
    $('#fRegion').innerHTML = '<option value="">전체 지역</option>' + REGIONS.map(r => `<option value="${esc(r)}">${esc(r)}교총</option>`).join('');
    $('#fRegion').addEventListener('change', e => { F.region = e.target.value; filterChanged(); });
    $('#fExtra').addEventListener('change', e => { F.extra = e.target.value; filterChanged(); });
    let qt = 0;
    $('#fQ').addEventListener('input', e => {
      clearTimeout(qt);
      qt = setTimeout(() => { F.q = e.target.value.trim().replace(/^@/, '').replace(/^no\.?\s*(?=\d)/i, '').toLowerCase(); filterChanged(); }, 160);
    });
    $('#btnRefresh').onclick = async () => { if (await loadAll()) { loadSettings(true); toast('최신 목록을 불러왔습니다.'); } };
    $('#btnCsv').onclick = exportCSV;
    $('#btnDraw').onclick = openDraw;
    $('#more').onclick = () => { shown += STEP; renderList(); renderBulk(); };

    // 모두 선택
    $('#selAll').addEventListener('change', e => {
      view.forEach(p => { if (e.target.checked) sel.add(p.n); else sel.delete(p.n); });
      syncSel();
    });

    // 목록 (이벤트 위임)
    const list = $('#list');
    list.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'), row = e.target.closest('.row');
      if (!a || !row) return;
      const n = +row.dataset.n, act = a.dataset.act;
      if (act === 'sel') pick(n, a.checked, e.shiftKey);
      else if (act === 'zoom') openCard(n);
      else if (act === 'del') removePiece(n);
      else if (ST[act]) review([n], act);
    });
    list.addEventListener('change', e => {
      const a = e.target.closest('[data-act="insta"]'), row = e.target.closest('.row');
      if (a && row) setInsta(+row.dataset.n, a.checked, a);
    });
    // 키보드: A 공개 · H 숨김 · P 대기 · Space 선택 · ↑↓(J/K) 이동 (한글 입력 상태에서도 되게 e.code 사용)
    list.addEventListener('keydown', e => {
      const row = e.target.closest('.row');
      if (!row || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = +row.dataset.n, idx = view.findIndex(p => p.n === n), onRow = e.target === row;
      const go = { KeyA: 'approved', KeyH: 'hidden', KeyP: 'pending' }[e.code];
      if (go) { e.preventDefault(); review([n], go, { idx }); return; }
      if (!onRow) return;
      if (e.code === 'Space') { e.preventDefault(); pick(n, !sel.has(n), e.shiftKey); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyJ') { e.preventDefault(); focusRow(idx + 1); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyK') { e.preventDefault(); focusRow(idx - 1); }
      else if (e.code === 'Enter') { e.preventDefault(); openCard(n); }
    });

    // 선택 막대
    $('#bulk').addEventListener('click', e => {
      const b = e.target.closest('[data-bulk]');
      if (!b) return;
      const k = b.dataset.bulk;
      if (k === 'clear') { sel.clear(); syncSel(); }
      else if (k === 'all') { view.forEach(p => sel.add(p.n)); syncSel(); }
      else review([...sel], k, { ask: true });
    });

    // 대화 상자: 바깥을 눌렀다 뗄 때만 닫기
    document.querySelectorAll('dialog.dlg').forEach(d => {
      let down = false;
      d.addEventListener('mousedown', e => { down = e.target === d; });
      d.addEventListener('click', e => { if (e.target === d && down) d.close(); down = false; });
      d.querySelector('.x').onclick = () => d.close();
      d.addEventListener('close', () => document.body.appendChild($('#toasts')));
    });
    $('#bigActs').addEventListener('click', e => {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      $('#dlgCard').close();
      review([+$('#bigActs').dataset.n], b.dataset.s);
    });
    $('#dRun').onclick = runDraw;
    $('#dCsv').onclick = drawCSV;

    // 전역 단축키: / 검색 · Esc 선택 해제
    document.addEventListener('keydown', e => {
      if ($('#vApp').hidden || document.querySelector('dialog[open]')) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'checkbox';
      if (e.key === '/' && !typing) { e.preventDefault(); $('#fQ').focus(); }
      else if (e.key === 'Escape' && sel.size && !typing) { sel.clear(); syncSel(); }
    });
    // 탭으로 돌아오면 오래된 목록은 바로 새로고침
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && session && !$('#vApp').hidden && Date.now() - lastLoad > AUTO_MS) tick();
    });
  }

  // 카드 원본(base64 약 90KB)을 짧은 blob 주소로 바꿔 두면 목록에 카드 수백 장을 그려도 가볍습니다
  // (join.js의 cardEl이 같은 배열을 참조하므로 자리에서 바꿈 · 이 화면에서만 적용)
  function lightenCards() {
    const arr = window.ASSETS && window.ASSETS.cards;
    if (!Array.isArray(arr) || !window.Blob || !window.URL || !URL.createObjectURL) return;
    arr.forEach((src, i) => {
      const m = /^data:([^;,]+);base64,/.exec(src || '');
      if (!m) return;
      try {
        const bin = atob(src.slice(m[0].length)), u8 = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
        arr[i] = URL.createObjectURL(new Blob([u8], { type: m[1] }));
      } catch (e) {}
    });
  }

  /* ===================== 시작 ===================== */
  function init() {
    lightenCards();
    bind();
    if (!BASE || !ANON) { show('vNoCfg'); return; }
    session = loadSession();
    if (session) boot(); else show('vLogin');
  }
  init();
})();
