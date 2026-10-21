/* 티로 아트월
   ① 미디어아트 전시실: 쿼카 모션랩 '창빛 방' 구조(gdShader · 3D 방 광선 추적 · 빛줄기)를
      어두운 전시실로 바꿔 벽 전체에 성운 영상을 흘리고, 바닥은 검은 유광으로 비춥니다.
   ② 모자이크: 첫 200조각이 티로를 이루고, 201번째부터 바깥으로 넓어집니다. */
(async function () {
  const { CONFIG, REGIONS, Store, dday, keyedTiro, toast, rng } = KFTA;
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  let signage = params.has('signage');
  let theme = KFTA.getTheme();   // 낮 · 밤 장면 (메인에서 고른 값이 이어짐)
  document.body.classList.toggle('night', theme === 'night');

  /* ===================== ① 전시실 (WebGL) ===================== */
  const XW = 4.6;                     // 방 반폭 (뒷벽은 z = 0)
  const ROOM = { ready: false, HC: 3.4 };

  function bgMediaRoom(api) {
    const LOOP = 48;
    const W = api.W, H = api.H, tall = H / W > 1.2;
    const HC = tall ? 5.6 : 3.4;      // 세로 화면은 벽을 높게 세워 화면을 채움
    const frag = `
  uniform vec3 uCam, uFw, uC0, uC1, uC2, uC3, uC4, uMoon;
  uniform vec3 uCloud, uHaze;
  uniform float uFov, uGlow, uStarTh, uSun;
  const float XW = ${XW.toFixed(2)}, HC = ${HC.toFixed(2)};
  // 파란 하늘 (위로 갈수록 진하게)
  vec3 skyAt(float y) { return mix(uC0, uC1, smoothstep(-0.2, HC * 1.25, y)); }
  // 뭉게구름: 윗면은 햇빛, 아랫면은 푸른 그늘
  vec3 neb(vec2 q) {
    float a = turn(1.0);
    vec2 drift = vec2(0.35 * sin(a), 0.0);
    vec2 p = q * vec2(0.55, 0.75) + drift;
    vec2 w = vec2(fbm(p * 0.6 + vec2(1.7, 9.2)), fbm(p * 0.6 + vec2(8.3, 2.8)));
    float c = fbm(p + 0.8 * w);
    float c2 = fbm(p + 0.8 * w + vec2(-0.09, 0.11));
    // 아래쪽(지평선)과 양옆에 구름이 더 많이
    float bias = 0.2 * (1.0 - smoothstep(0.0, HC * 0.75, q.y)) + 0.1 * smoothstep(1.5, 5.0, abs(q.x));
    float d = smoothstep(0.52, 0.72, c + bias);
    float lit = clamp(0.55 + (c - c2) * 7.0, 0.0, 1.0);
    vec3 cloudC = mix(uC2, uCloud, lit);
    vec3 col = skyAt(q.y);
    col = mix(col, cloudC, d);
    // 작은 조각구름
    float s = smoothstep(0.62, 0.76, fbm(p * 2.2 + w * 1.5 + 4.0)) * (1.0 - d) * smoothstep(1.0, HC, q.y);
    col = mix(col, uCloud, s * 0.75);
    // 왼쪽 위 햇살과 빛줄기
    vec2 sp = vec2(-4.2, HC * 1.05);
    vec2 dv = q - sp;
    float r = length(dv);
    float ang = atan(dv.y, dv.x);
    float rays = pow(noise(vec2(ang * 9.0, turn(1.0) * 0.3)), 3.0) * exp(-r * 0.32);
    col += uC4 * (exp(-r * r * 0.18) * 0.85 + rays * 0.45) * uSun;
    col = mix(col, uC3, exp(-r * 0.5) * 0.18);
    // 반짝임
    vec2 g = q * 16.0, gi = floor(g);
    float h = hash(gi);
    vec2 gf = fract(g) - 0.5 - (vec2(hash(gi + 3.1), hash(gi + 7.7)) - 0.5) * 0.6;
    col += vec3(1.0) * step(uStarTh, h) * exp(-dot(gf, gf) * 70.0) * (0.5 + 0.5 * sin(turn(6.0) + h * 50.0)) * 0.8;
    return min(col * uGlow, vec3(1.0));
  }
  void main() {
    vec2 p = px();
    vec2 uv = (p - 0.5 * uSize) / (0.5 * uSize.y);
    uv.y = -uv.y;
    vec3 ro = uCam, fw = uFw;
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw + (uv.x * rt + uv.y * up) * uFov);
    float tF = rd.y < 0.0 ? -ro.y / rd.y : 1e5;
    float tB = rd.z < 0.0 ? -ro.z / rd.z : 1e5;
    float tL = rd.x < 0.0 ? (-XW - ro.x) / rd.x : 1e5;
    float tR = rd.x > 0.0 ? (XW - ro.x) / rd.x : 1e5;
    float t = min(min(tF, tB), min(tL, tR));
    vec3 P = ro + rd * t;
    vec3 col;
    if (t == tF) {
      // 크림색 유광 대리석 바닥: 하늘과 구름이 비침
      vec3 N = vec3(0.0, 1.0, 0.0);
      vec3 R = reflect(rd, N);
      R.xz += (vec2(noise(P.xz * 4.0), noise(P.xz * 4.0 + 7.0)) - 0.5) * 0.02;
      R = normalize(R);
      float sB = R.z < 0.0 ? -P.z / R.z : 1e5;
      float sL = R.x < 0.0 ? (-XW - P.x) / R.x : 1e5;
      float sR = R.x > 0.0 ? (XW - P.x) / R.x : 1e5;
      float s = min(sB, min(sL, sR));
      vec3 Q = P + R * s;
      vec2 q = s == sB ? Q.xy : (s == sL ? vec2(-XW - Q.z, Q.y) : vec2(XW + Q.z, Q.y));
      vec3 refl = neb(q);
      float vein = pow(1.0 - abs(2.0 * fbm(P.xz * vec2(0.9, 1.6) + 3.0) - 1.0), 14.0);
      vec3 floorC = uMoon * (0.97 - 0.06 * vein) + uC4 * 0.04;
      float fres = 0.25 + 0.65 * pow(1.0 - max(dot(-rd, N), 0.0), 2.5);
      col = mix(floorC, refl, fres * 0.6 * exp(-s * 0.04));
      vec2 fl = abs(fract(P.xz * 0.5) - 0.5);
      col *= 1.0 - 0.05 * smoothstep(0.49, 0.5, max(fl.x, fl.y));
      // 바닥 끝은 구름 속으로 흐리게
      col = mix(col, uHaze, smoothstep(0.6, 0.0, P.z) * 0.25);
    } else {
      vec2 q = t == tB ? P.xy : (t == tL ? vec2(-XW - P.z, P.y) : vec2(XW + P.z, P.y));
      col = neb(q);
      // 벽 아래는 지평선처럼 밝게 녹임
      col = mix(col, uHaze, smoothstep(0.5, 0.0, P.y) * 0.6);
    }
    // 햇빛 줄기 + 먼지
    float tm = min(t, 12.0), jt = ign();
    vec3 vol = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float s = (float(i) + jt) / 8.0 * tm;
      vec3 q = ro + rd * s;
      vec3 L = vec3(-3.8, HC + 1.6, 1.5);
      vec3 A = normalize(vec3(0.6 + 0.5 * sin(turn(1.0)), 0.6, 2.0) - L);
      vec3 v = q - L;
      float dl = length(v);
      float cone = smoothstep(0.93, 0.99, dot(v / dl, A));
      vol += uC4 * cone * (0.5 + 0.8 * noise3(q * 2.0 + vec3(0.0, turn(1.0), 0.0)));
    }
    col += vol * tm / 8.0 * 0.03;
    col = min(col, vec3(1.0));
    col += dither() * 2.0;
    gl_FragColor = vec4(col, 1.0);
  }`;
    const sh = gdShader(api, frag, tall ? 0.6 : 0.72, LOOP, tall ? 420000 : 1400000);
    const THEMES = {
      day: { uC0: '#D9EEFF', uC1: '#4A9BEA', uC2: '#B9CBE6', uC3: '#FFD9A0', uC4: [1, 0.97, 0.88], uMoon: '#F3ECE2', uCloud: [1, 0.995, 0.975], uHaze: [1, 0.985, 0.96], uStarTh: 0.992, uSun: 1 },
      night: { uC0: '#24357E', uC1: '#070D2E', uC2: '#26326E', uC3: '#FFB85C', uC4: [1, 0.85, 0.55], uMoon: '#1C2456', uCloud: [0.62, 0.66, 0.9], uHaze: [0.2, 0.26, 0.56], uStarTh: 0.955, uSun: 0.55 }
    };
    let applied = null;
    const applyTheme = () => {
      if (applied === theme) return;
      const T = THEMES[theme];
      Object.keys(T).forEach(k => sh.set(k, typeof T[k] === 'string' ? gdRGB(T[k]) : T[k]));
      applied = theme;
    };
    sh.set('uGlow', 1.0);
    const base = tall ? { cam: [0, 2.5, 7.2], look: [0, 2.6, 0], fov: 0.7 } : { cam: [0, 1.5, 5.4], look: [0, 1.62, 0], fov: 0.56 };
    sh.set('uFov', base.fov);
    const frame = t => {
      const P = api.pointer({ x: W / 2, y: H / 2, down: 0, on: 0 });
      const cam = [
        base.cam[0] + (P.x / W - 0.5) * 0.5 * P.on + Math.sin(t * 0.11) * (signage ? 0.45 : 0.18),
        base.cam[1] - (P.y / H - 0.5) * 0.2 * P.on + Math.sin(t * 0.07) * 0.05,
        base.cam[2]
      ];
      const f = base.look.map((v, i) => v - cam[i]), fl = Math.hypot(f[0], f[1], f[2]), fw = f.map(v => v / fl);
      const rt = [-fw[2], 0, fw[0]], rl = Math.hypot(rt[0], rt[2]); rt[0] /= rl; rt[2] /= rl;
      const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
      applyTheme();
      sh.set('uCam', cam);
      sh.set('uFw', fw);
      sh.draw(t % LOOP);
      Object.assign(ROOM, { ready: true, W, H, HC, cam, fw, rt, up, fov: base.fov, gl: sh.ok, cv: sh.cv });
    };
    frame.dispose = sh.dispose;
    return frame;
  }

  // 월드 좌표 → 화면 좌표 (셰이더와 같은 카메라)
  function project(P) {
    const v = [P[0] - ROOM.cam[0], P[1] - ROOM.cam[1], P[2] - ROOM.cam[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = dot(v, ROOM.fw);
    return [ROOM.W / 2 + dot(v, ROOM.rt) / (z * ROOM.fov) * ROOM.H / 2, ROOM.H / 2 - dot(v, ROOM.up) / (z * ROOM.fov) * ROOM.H / 2];
  }

  qmEngine($('#room'), { speed: 1, bg: '#DCE8FF', live: true, ratio: 'auto', pointerTarget: document.documentElement }, bgMediaRoom);

  /* ===================== ② 모자이크 ===================== */
  // 원본 작품: 장면 이미지(ASSETS.wall 또는 ?wall=파일)가 있으면 장면 전체를 모자이크로,
  // 없으면 티로 캐릭터만으로 모자이크를 만듭니다.
  const tiro = await keyedTiro();
  const scenes = {};
  if (params.get('wall')) scenes.day = scenes.night = await KFTA.loadImg(params.get('wall'));
  else { scenes.day = await KFTA.loadImg(CONFIG.wallDay); scenes.night = await KFTA.loadImg(CONFIG.wallNight); }
  const soft = params.get('wall') ? {} : { day: await KFTA.loadImg(CONFIG.wallDaySoft), night: await KFTA.loadImg(CONFIG.wallNightSoft) };
  if (!scenes.day) scenes.day = scenes.night;
  if (!scenes.night) scenes.night = scenes.day;
  const sceneImg = scenes.day;
  let GC = 10, GR = 10, base = [], core = [], pre = [];
  if (sceneImg) {
    const IW = sceneImg.width, IH = sceneImg.height, fc = CONFIG.focus;
    GC = CONFIG.sceneCols; GR = Math.round(GC * IH / IW);
    const cw = IW / GC, ch = IH / GR;
    for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
      const u = (c + .5) / GC, v = (r + .5) / GR;
      base.push({ c, r, img: sceneImg, sx: c * cw, sy: r * ch, sw: cw, sh: ch, d: Math.hypot((u - fc.x) / fc.rx, (v - fc.y) / fc.ry) });
    }
    const byD = base.slice().sort((x, y) => x.d - y.d);
    core = byD.slice(0, CONFIG.coreSize);   // 1~200번: 가운데 큰 티로
    pre = byD.slice(CONFIG.coreSize);       // 201번부터: 주변 장면을 안쪽부터 채움
  } else {
    const TW = tiro.width, TH = tiro.height, td = tiro.getContext('2d').getImageData(0, 0, TW, TH).data;
    for (let C = 10; C <= 48; C++) {
      const cs = TW / C, R = Math.ceil(TH / cs), cells = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        let on = 0, tot = 0;
        const x0 = Math.floor(c * cs), x1 = Math.min(TW, Math.floor((c + 1) * cs)), y0 = Math.floor(r * cs), y1 = Math.min(TH, Math.floor((r + 1) * cs));
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { tot++; if (td[(y * TW + x) * 4 + 3] > 100) on++; }
        if (tot) cells.push({ c, r, cov: on / tot, img: tiro, sx: c * cs, sy: r * cs, sw: cs, sh: cs });
      }
      const good = cells.filter(x => x.cov > 0.3);
      if (good.length >= CONFIG.coreSize) { GC = C; GR = R; core = good.sort((x, y) => y.cov - x.cov).slice(0, CONFIG.coreSize); break; }
    }
    base = core.slice();
  }
  const keyOf = o => o.c + ',' + o.r;
  const baseByKey = new Map(base.map(k => [keyOf(k), k]));
  // 티로가 고르게 밝아지도록 섞은 순서 (고정 시드 → 번호마다 자리 고정)
  const coreOrder = core.slice();
  { const r = rng(1119); for (let i = coreOrder.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [coreOrder[i], coreOrder[j]] = [coreOrder[j], coreOrder[i]]; } }
  const ccx = (GC - 1) / 2, ccy = (GR - 1) / 2;
  let outer = [];
  function ensureOuter(need) {
    if (outer.length >= need) return;
    let L = Math.max(GC, GR) * 0.75;
    for (;;) {
      const list = [];
      for (let r = Math.floor(ccy - L); r <= Math.ceil(ccy + L); r++) for (let c = Math.floor(ccx - L); c <= Math.ceil(ccx + L); c++) {
        if (baseByKey.has(c + ',' + r)) continue;
        const dx = c - ccx, dy = (r - ccy) * 1.12, d = Math.hypot(dx, dy);
        if (d <= L - 1) list.push({ c, r, d, a: Math.atan2(dy, dx) });
      }
      list.sort((a, b) => a.d - b.d || a.a - b.a);
      if (list.length >= need) { outer = list; return; }
      L *= 1.5;
    }
  }
  const PITCH = sceneImg ? 1.06 : 1.12;
  let pieces = [], byKey = new Map(), byN = new Map();
  function slotOf(n) {
    if (n <= CONFIG.coreSize) return coreOrder[n - 1];
    const i = n - CONFIG.coreSize - 1;
    return i < pre.length ? pre[i] : outer[i - pre.length];
  }
  let topN = 0;   // 가장 큰 응원 번호 (숨김 처리된 번호는 빈자리로 남음)
  // 공유 저장소에서 다시 읽고(fetch) 조각 자리 다시 계산
  async function loadPieces(fetch = true) {
    if (fetch) { try { await Store.load(); } catch (e) { console.warn(e); toast('응원을 불러오지 못했어요. 잠시 후 다시 시도할게요'); } }
    rebuild();
  }
  function rebuild() {
    pieces = Store.list();
    topN = pieces.reduce((m, p) => Math.max(m, p.n), 0);
    ensureOuter(Math.max(0, topN - CONFIG.coreSize - pre.length) + 40);
    byKey.clear(); byN.clear();
    pieces.forEach(p => { const s = slotOf(p.n); p.c = s.c; p.r = s.r; byKey.set(s.c + ',' + s.r, p); byN.set(p.n, p); });
    document.querySelectorAll('[data-count]').forEach(e => e.textContent = pieces.length.toLocaleString('ko-KR'));
    document.querySelectorAll('[data-dday]').forEach(e => e.textContent = dday());
    renderRegions();
  }

  // 지역 현황 그래프
  let hitRegion = null;
  function renderRegions() {
    const cnt = REGIONS.map(r => pieces.filter(p => p.region === r).length), max = Math.max(1, ...cnt);
    const rows = REGIONS.map((r, i) => `<div class="rp-row${r === hitRegion ? ' hit' : ''}"><span class="nm">${r}</span><span class="bk"><i data-w="${(cnt[i] / max * 100).toFixed(1)}"></i></span><span class="ct">${cnt[i]}</span></div>`).join('');
    $('#rpList').innerHTML = rows;
    $('#regs').innerHTML = REGIONS.map((r, i) => `<div class="reg"><div class="t"><span>${r}교총</span><b>${cnt[i]}</b></div><div class="bar2"><i style="width:${(cnt[i] / max * 100).toFixed(1)}%"></i></div></div>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('#rpList i').forEach(i => i.style.width = i.dataset.w + '%')));
  }

  // 타일 그림 캐시
  const TS = 112;
  const cache = new Map();
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  const OUTER_PAL = [[31, 95, 208], [79, 160, 255], [185, 204, 78], [255, 162, 90], [31, 95, 208]];   // 교총 블루 · 하늘 · 티로 그린 · 티로 오렌지
  function outerColor(p) {
    const a = (Math.atan2(p.r - ccy, p.c - ccx) / (Math.PI * 2) + 1) % 1 * (OUTER_PAL.length - 1);
    const i = Math.floor(a), f = a - i, A = OUTER_PAL[i], B = OUTER_PAL[i + 1];
    return A.map((v, k) => Math.round(v + (B[k] - v) * f));
  }
  function tileCanvas(kind, p, lit) {
    const key = kind + ':' + (p.c + ',' + p.r) + ':' + (lit ? 1 : 0) + ':' + theme;
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = TS;
    const g = c.getContext('2d');
    rr(g, 2, 2, TS - 4, TS - 4, TS * 0.16); g.save(); g.clip();
    if (kind === 'img') {
      const sf = !lit && sceneImg && soft[theme];
      if (sf) {
        // 응원이 아직 없는 칸: 40% 투명 원본 → 뒤의 전시실 빛이 비침
        const k = sf.width / scenes[theme].width;
        g.drawImage(sf, p.sx * k, p.sy * k, p.sw * k, p.sh * k, 0, 0, TS, TS);
      } else {
        g.fillStyle = theme === 'night' ? '#141C48' : '#EEF4FF'; g.fillRect(0, 0, TS, TS);
        g.drawImage(sceneImg ? scenes[theme] : tiro, p.sx, p.sy, p.sw, p.sh, 0, 0, TS, TS);
        if (!lit) { g.fillStyle = theme === 'night' ? 'rgba(8,14,44,.48)' : 'rgba(236,243,255,.4)'; g.fillRect(0, 0, TS, TS); }
      }
    } else if (kind === 'outer') {
      const [r0, g0, b0] = outerColor(p), lg = g.createLinearGradient(0, 0, TS, TS);
      lg.addColorStop(0, `rgb(${Math.min(255, r0 + 50)},${Math.min(255, g0 + 50)},${Math.min(255, b0 + 50)})`); lg.addColorStop(1, `rgb(${r0 * .55 | 0},${g0 * .45 | 0},${b0 * .7 | 0})`);
      g.fillStyle = lg; g.fillRect(0, 0, TS, TS);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `${TS * 0.34}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✦', TS / 2, TS / 2 + 2);
    }
    if (lit) {
      const gl = g.createLinearGradient(0, 0, TS * 0.7, TS * 0.7); gl.addColorStop(0, sceneImg ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.32)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(0, 0, TS, TS);
    }
    g.restore();
    if (lit) { rr(g, 3, 3, TS - 6, TS - 6, TS * 0.15); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; g.stroke(); }
    cache.set(key, c);
    return c;
  }
  const pieceTile = p => baseByKey.has(keyOf(p)) ? tileCanvas('img', baseByKey.get(keyOf(p)), true) : tileCanvas('outer', p, true);
  const glowSprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,248,225,.9)'); rg.addColorStop(.4, 'rgba(255,230,170,.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return c;
  })();
  const sparkSprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.translate(32, 32); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -30); g.bezierCurveTo(2, -6, 6, -2, 30, 0); g.bezierCurveTo(6, 2, 2, 6, 0, 30); g.bezierCurveTo(-2, 6, -6, 2, -30, 0); g.bezierCurveTo(-6, -2, -2, -6, 0, -30); g.fill();
    return c;
  })();

  // 캔버스 · 카메라
  const cv = $('#mosaic'), ctx = cv.getContext('2d');
  const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  let DPR = 1, SW = 0, SH = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2); SW = innerWidth; SH = innerHeight;
    cv.width = layer.width = SW * DPR; cv.height = layer.height = SH * DPR;
  }
  resize(); addEventListener('resize', resize);

  const view = { x: 0, y: 0, z: 1 }, home = { s: 1, cx: 0, cy: 0, bx: 0, by: 0 };
  let tween = null, userMoved = false;
  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (c, r) => { x0 = Math.min(x0, c); y0 = Math.min(y0, r); x1 = Math.max(x1, c + 1); y1 = Math.max(y1, r + 1); };
    base.forEach(k => add(k.c, k.r));
    pieces.forEach(p => add(p.c, p.r));
    return { x0: x0 * PITCH, y0: y0 * PITCH, x1: x1 * PITCH, y1: y1 * PITCH };
  }
  function computeHome() {
    // 뒷벽 사각형을 화면에 투영 → 모자이크가 벽에 붙어 있게
    const a = project([-XW + 0.35, ROOM.HC - 0.3, 0]), b = project([XW - 0.35, 0.28, 0]);
    let L = Math.max(a[0], 16), T = Math.max(a[1], 78), R = Math.min(b[0], SW - 16), B = Math.min(b[1], SH - (SW < 720 ? 130 : 84));
    const panel = $('#regPanel');
    if (panel && panel.offsetParent) { const pr = panel.getBoundingClientRect(); if (pr.left < R) R = Math.min(R, pr.left - 16); }
    if (signage) { T = Math.max(T, SH * 0.06); R = Math.min(R, SW * 0.78); L = Math.max(L, SW * (SW > SH ? 0.24 : 0.04)); }
    if (sceneImg) {
      // 장면 모자이크는 화면을 큼직하게 채움 (상단 바 ~ 도구 막대 사이)
      const tb = $('.tools').getBoundingClientRect();
      L = 10; R = SW - 10; T = signage ? SH * 0.02 : 66; B = signage ? SH * 0.98 : (tb.top > 0 ? tb.top - 10 : SH - 80);
    }
    const bb = bounds(), bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
    home.s = Math.max(2, Math.min((R - L) / bw, (B - T) / bh) * (sceneImg ? 1 : 0.94));
    if (sceneImg && SH > SW) home.s = Math.max(2, Math.min((R - L) / bw * 1.9, (B - T) / bh));   // 세로 화면: 가운데 티로를 크게
    home.cx = (L + R) / 2; home.cy = (T + B) / 2; home.bx = (bb.x0 + bb.x1) / 2; home.by = (bb.y0 + bb.y1) / 2;
    home.floor = project([0, 0, 0])[1];
  }
  const S = () => home.s * view.z;
  const toScreen = (wx, wy) => [(wx - view.x) * S() + home.cx, (wy - view.y) * S() + home.cy];
  const toWorld = (sx, sy) => [(sx - home.cx) / S() + view.x, (sy - home.cy) / S() + view.y];
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  function flyTo(x, y, z, ms = 1300) { tween = { from: { ...view }, to: { x, y, z }, t0: performance.now(), ms }; }
  function fitAll(ms) { computeHome(); flyTo(home.bx, home.by, 1, ms); userMoved = false; }
  function flyToPiece(p, ms) { computeHome(); const z = Math.min(16, Math.max(2.4, (SW < 720 ? 170 : 240) / home.s)); flyTo(p.c * PITCH + .5, p.r * PITCH + .5, z, ms); userMoved = true; }

  // 새 조각이 날아오는 연출
  let arrival = null, bursts = [], selected = null;

  function wrap(g, text, maxW) {
    const words = text.split(' '), lines = []; let line = '';
    words.forEach(w => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    lines.push(line); return lines;
  }

  function render(now) {
    requestAnimationFrame(render);
    if (!ROOM.ready) return;
    const t = now / 1000;
    computeHome();
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms), e = ease(k);
      view.x = tween.from.x + (tween.to.x - tween.from.x) * e;
      view.y = tween.from.y + (tween.to.y - tween.from.y) * e;
      view.z = tween.from.z * Math.pow(tween.to.z / tween.from.z, e);
      if (k >= 1) tween = null;
    } else if (!userMoved) { view.x = home.bx; view.y = home.by; view.z = 1; }
    const s = S(), g = lctx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, SW, SH);
    const [wx0, wy0] = toWorld(-s, -s), [wx1, wy1] = toWorld(SW + s, SH + s);
    const c0 = Math.floor(wx0 / PITCH), c1 = Math.ceil(wx1 / PITCH), r0 = Math.floor(wy0 / PITCH), r1 = Math.ceil(wy1 / PITCH);
    const vis = (c, r) => c >= c0 && c <= c1 && r >= r0 && r <= r1;
    const zoomedOut = s < 70;

    // 티로 뒤 후광
    if (zoomedOut && !sceneImg) {
      const [hx, hy] = toScreen(home.bx, home.by), hr = Math.max(GC, GR) * PITCH * s * 0.75;
      const rg = g.createRadialGradient(hx, hy, 0, hx, hy, hr);
      const pulse = 0.5 + 0.12 * Math.sin(t * 0.8);
      rg.addColorStop(0, `rgba(255,255,255,${pulse})`); rg.addColorStop(.55, `rgba(255,246,220,${pulse * .45})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
      g.globalCompositeOperation = 'source-over';
    }

    // 다음 자리 (빈 외곽 조각)
    if (topN >= CONFIG.coreSize + pre.length) {
      g.strokeStyle = 'rgba(31,95,208,.35)'; g.lineWidth = 1; g.setLineDash([3, 3]);
      for (let n = topN + 1; n <= topN + 28; n++) {
        const o = slotOf(n); if (!o || !vis(o.c, o.r)) continue;
        const [x, y] = toScreen(o.c * PITCH, o.r * PITCH); rr(g, x + 1, y + 1, s - 2, s - 2, s * 0.16); g.stroke();
      }
      g.setLineDash([]);
    }

    // 빛 띠가 지나가는 위치
    const sweepP = ((t % 9) / 9) * 1.6 - 0.3, bb = bounds(), diag = (bb.x1 - bb.x0) + (bb.y1 - bb.y0);
    const drawTile = (canvas, c, r, p, lit, h) => {
      const [x, y] = toScreen(c * PITCH, r * PITCH);
      if (lit && zoomedOut && !sceneImg) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.09; g.drawImage(glowSprite, x - s * .45, y - s * .45, s * 1.9, s * 1.9); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      g.drawImage(canvas, x, y, s, s);
      if (lit) {
        const pos = ((c * PITCH - bb.x0) + (r * PITCH - bb.y0)) / diag, band = Math.max(0, 1 - Math.abs(pos - sweepP) / 0.07);
        const tw = Math.pow(Math.max(0, Math.sin(t * 1.3 + h * 60)), 30);
        if (band > 0 || tw > 0.02) {
          g.globalCompositeOperation = 'lighter';
          if (band > 0) { g.globalAlpha = band * (sceneImg ? 0.22 : 0.42); g.fillStyle = '#fff'; rr(g, x + 2, y + 2, s - 4, s - 4, s * 0.15); g.fill(); }
          if (tw > 0.02) { g.globalAlpha = tw; g.drawImage(sparkSprite, x + s * 0.55, y - s * 0.15, s * 0.6, s * 0.6); }
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        }
      }
      if (p && s > 64) {
        g.save(); rr(g, x + 2, y + 2, s - 4, s - 4, s * 0.15); g.clip();
        const sh = g.createLinearGradient(0, y, 0, y + s); sh.addColorStop(0, 'rgba(8,3,20,.55)'); sh.addColorStop(.5, 'rgba(8,3,20,.25)'); sh.addColorStop(1, 'rgba(8,3,20,.7)');
        g.fillStyle = sh; g.fillRect(x, y, s, s);
        g.fillStyle = '#FFD3EA'; g.font = `800 ${s * 0.1}px Pretendard, sans-serif`; g.textBaseline = 'top';
        g.fillText('No.' + String(p.n).padStart(4, '0'), x + s * 0.08, y + s * 0.08);
        g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `600 ${s * 0.085}px Pretendard, sans-serif`; g.textBaseline = 'bottom';
        g.fillText(p.region + '교총 · ' + p.nick, x + s * 0.08, y + s * 0.92);
        if (s > 150) {
          g.fillStyle = '#fff'; g.font = `700 ${s * 0.085}px "Gowun Batang", serif`; g.textBaseline = 'top';
          wrap(g, p.msg, s * 0.84).slice(0, 5).forEach((l, i) => g.fillText(l, x + s * 0.08, y + s * 0.25 + i * s * 0.115));
        }
        g.restore();
      }
      if (selected && p === selected) { g.strokeStyle = '#fff'; g.lineWidth = 2.5; rr(g, x - 2, y - 2, s + 4, s + 4, s * 0.18); g.stroke(); }
    };
    base.forEach(k => {
      if (!vis(k.c, k.r)) return;
      const p = byKey.get(keyOf(k)), lit = !!p && !(arrival && arrival.p === p);
      drawTile(tileCanvas('img', k, lit), k.c, k.r, lit ? p : null, lit, (k.c * 7.13 + k.r * 3.71) % 1);
    });
    pieces.forEach(p => {
      if (baseByKey.has(keyOf(p)) || !vis(p.c, p.r) || (arrival && arrival.p === p)) return;
      drawTile(tileCanvas('outer', p, true), p.c, p.r, p, true, (p.n * 0.618) % 1);
    });

    // 도착 연출
    if (arrival) {
      const k = Math.min(1, (now - arrival.t0) / 1700), e = ease(k), p = arrival.p;
      const [tx, ty] = toScreen(p.c * PITCH, p.r * PITCH), sx = SW / 2 - s, sy = SH + s;
      const x = sx + (tx - sx) * e, y = sy + (ty - sy) * e - Math.sin(e * Math.PI) * SH * 0.18, sc = s * (1 + 2.2 * (1 - e));
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) bursts.push({ x: x + sc / 2, y: y + sc / 2, vx: (Math.random() - .5) * 2, vy: Math.random() * 2, life: 1, hue: Math.random() > .5 ? 215 : 40 });
      g.globalAlpha = .6; g.drawImage(glowSprite, x + sc / 2 - sc * 1.5, y + sc / 2 - sc * 1.5, sc * 3, sc * 3); g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.drawImage(pieceTile(p), x, y, sc, sc);
      if (k >= 1) {
        for (let i = 0; i < 60; i++) { const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 5; bursts.push({ x: tx + s / 2, y: ty + s / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: [215, 40, 75][i % 3] }); }
        arrival = null;
      }
    }
    if (bursts.length) {
      g.globalCompositeOperation = 'lighter';
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.x += b.vx; b.y += b.vy; b.vx *= .96; b.vy = b.vy * .96 + .03; b.life -= .018;
        if (b.life <= 0) { bursts.splice(i, 1); continue; }
        g.fillStyle = `hsla(${b.hue},100%,75%,${b.life})`; g.beginPath(); g.arc(b.x, b.y, 2.2 * b.life + .4, 0, 7); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }

    // 합성: 벽 위 모자이크 + 바닥 반사
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(layer, 0, 0);
    if (view.z < 1.25 && home.floor < SH) {
      const fy = home.floor * DPR;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, fy, cv.width, cv.height - fy); ctx.clip();
      ctx.translate(0, 2 * fy); ctx.scale(1, -1);
      ctx.globalAlpha = 0.24; ctx.filter = 'blur(2px)';
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const fade = ctx.createLinearGradient(0, fy, 0, fy + SH * 0.22 * DPR); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = fade; ctx.fillRect(0, fy, cv.width, cv.height - fy);
      ctx.restore();
    }
  }

  /* ===================== 조작 ===================== */
  const ptrs = new Map();
  let downAt = null, pinch = null;
  function hit(sx, sy) {
    const [wx, wy] = toWorld(sx, sy), c = Math.floor(wx / PITCH), r = Math.floor(wy / PITCH);
    if (wx - c * PITCH > 1 || wy - r * PITCH > 1) return null;
    return { c, r, p: byKey.get(c + ',' + r), base: baseByKey.has(c + ',' + r) };
  }
  function zoomAt(sx, sy, f) {
    const [wx, wy] = toWorld(sx, sy);
    view.z = Math.max(0.6, Math.min(18, view.z * f));
    const [nx, ny] = toWorld(sx, sy);
    view.x += wx - nx; view.y += wy - ny; tween = null; userMoved = true;
  }
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    tween = null; hideHint();
  });
  cv.addEventListener('pointermove', e => {
    const prev = ptrs.get(e.pointerId);
    if (!prev) { hover(e.clientX, e.clientY); return; }
    const cur = { x: e.clientX, y: e.clientY }; ptrs.set(e.pointerId, cur);
    if (ptrs.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (downAt) downAt.moved += Math.abs(dx) + Math.abs(dy);
      if (!downAt || downAt.moved > 5) { view.x -= dx / S(); view.y -= dy / S(); userMoved = true; cv.classList.add('drag'); }
    } else if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoomAt(mx, my, d / pinch.d); view.x -= (mx - pinch.mx) / S(); view.y -= (my - pinch.my) / S();
      pinch = { d, mx, my }; if (downAt) downAt.moved = 99;
    }
  });
  const up = e => {
    ptrs.delete(e.pointerId); cv.classList.remove('drag');
    if (ptrs.size < 2) pinch = null;
    if (downAt && ptrs.size === 0 && downAt.moved < 6 && performance.now() - downAt.t < 500) {
      const h = hit(e.clientX, e.clientY);
      if (h && h.p) openPiece(h.p);
      else if (h && h.base) toast('아직 비어 있는 조각이에요. 응원으로 밝혀 주세요!');
    }
    if (ptrs.size === 0) downAt = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))); hideHint(); }, { passive: false });
  const tip = $('#tip');
  function hover(x, y) {
    const h = hit(x, y);
    if (h && h.p) { tip.innerHTML = `<b>No.${String(h.p.n).padStart(4, '0')}</b>${h.p.region}교총 · ${esc(h.p.nick)}`; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('on'); cv.classList.add('hover'); }
    else { tip.classList.remove('on'); cv.classList.remove('hover'); }
  }
  cv.addEventListener('pointerleave', () => tip.classList.remove('on'));
  let hintT = setTimeout(hideHint, 9000);
  function hideHint() { $('#hint').style.opacity = 0; clearTimeout(hintT); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  $('#zIn').onclick = () => zoomAt(home.cx, home.cy, 1.5);
  $('#zOut').onclick = () => zoomAt(home.cx, home.cy, 1 / 1.5);
  $('#fit').onclick = () => fitAll(900);
  $('#rand').onclick = () => { if (!pieces.length) return toast('아직 공개된 응원이 없어요. 첫 응원을 남겨 주세요!'); const p = pieces[Math.floor(Math.random() * pieces.length)]; flyToPiece(p); setTimeout(() => openPiece(p), 1100); };
  // 지역별 응원 조각: 토글로 열고 닫기
  const regToggle = on => { $('#regPanel').classList.toggle('on', on); $('#regBtn').classList.toggle('on', on); if (on) renderRegions(); };
  $('#regBtn').onclick = () => regToggle(!$('#regPanel').classList.contains('on'));
  $('#rpClose').onclick = () => regToggle(false);
  $('#rpMore').onclick = () => $('#regDlg').showModal();
  // 낮 · 밤 선택
  const themeLabel = () => document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === theme));
  document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { theme = b.dataset.theme; KFTA.setTheme(theme); document.body.classList.toggle('night', theme === 'night'); themeLabel(); });
  themeLabel();
  $('#findBtn').onclick = () => {
    const f = $('#find'); f.classList.toggle('on');
    const mine = Store.mine(); if (mine.length) $('#findIn').value = mine[mine.length - 1].n;
    if (f.classList.contains('on')) $('#findIn').focus();
  };
  const go = () => { const n = parseInt($('#findIn').value, 10), p = byN.get(n); if (!p) { toast('그 번호의 응원 조각을 찾지 못했어요'); return; } selected = p; flyToPiece(p); setTimeout(() => openPiece(p), 1300); };
  $('#findGo').onclick = go;
  $('#findIn').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });

  /* ===================== 응원 카드 보기 ===================== */
  const pieceDlg = $('#pieceDlg');
  let lastMine = null;
  function openPiece(p, info) {
    selected = p;
    const mine = !!p.mine;
    $('#pNo').textContent = mine ? (info ? '내 응원이 아트월에 도착했어요' : '내가 남긴 응원') : '티로의 ' + p.n.toLocaleString('ko-KR') + '번째 응원';
    $('#pTtl').hidden = !mine;
    $('#pTtl').innerHTML = `나는 티로의 <span class="g">${p.n.toLocaleString('ko-KR')}번째</span> 응원입니다`;
    const box = $('#pCard'); box.innerHTML = ''; box.appendChild(KFTA.cardEl(p));
    $('#pMeta').textContent = '조각 위치 ' + posText(p) + (p.n <= CONFIG.coreSize ? ' · 티로를 밝힌 조각' : baseByKey.has(keyOf(p)) ? ' · 작품을 넓힌 조각' : ' · 확장 조각');
    $('#pMine').hidden = !mine; $('#pOther').hidden = mine; $('#pTags').hidden = !mine;
    $('#pTags').classList.remove('flash');
    const tk = $('#pTk');
    tk.hidden = !mine;
    if (mine) {
      lastMine = p;
      tk.textContent = (p.pending ? '검수 대기 중이에요. 승인되면 모든 화면의 아트월에 공개됩니다. ' : '') + (p.prize ? '응모권 1장이 지급됐어요.' : '경품 응모는 선택하지 않으셨어요.') + (p.prize && p.insta ? ' 인스타그램 이벤트 댓글이 확인되면 추가 추첨 기회 1회가 더해집니다.' : '');
    }
    if (!pieceDlg.open) pieceDlg.showModal();
  }
  const posText = p => `가로 ${p.c - Math.round(ccx) >= 0 ? '+' : ''}${p.c - Math.round(ccx)} · 세로 ${Math.round(ccy) - p.r >= 0 ? '+' : ''}${Math.round(ccy) - p.r}`;
  $('#pNext').onclick = () => { if (!pieces.length) return; const p = pieces[Math.floor(Math.random() * pieces.length)]; pieceDlg.close(); flyToPiece(p); setTimeout(() => openPiece(p), 1100); };
  $('#pStay').onclick = () => pieceDlg.close();
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  pieceDlg.addEventListener('close', () => { selected = null; });

  /* ===================== 참여 ===================== */
  // 내 응원이 도착하는 연출: 전체 보기 → 조각이 날아와 박힘 → 확대 → 내 카드 열기
  function welcome(p, info) {
    lastMine = p;
    if (pieceDlg.open) pieceDlg.close();
    hitRegion = p.region; renderRegions(); setTimeout(() => { hitRegion = null; renderRegions(); }, 8000);
    fitAll(700);
    setTimeout(() => { arrival = { p, t0: performance.now() }; }, 800);
    setTimeout(() => { selected = p; flyToPiece(p, 1400); }, 2700);
    setTimeout(() => openPiece(p, info || {}), 4300);
  }
  function openJoin() {
    if (pieceDlg.open) pieceDlg.close();
    KFTA.openJoin({ onDone: (p, info) => { rebuild(); welcome(byN.get(p.n) || p, info); } });
  }
  document.querySelectorAll('[data-join]').forEach(b => b.onclick = openJoin);
  const siteBase = () => CONFIG.shareBase || location.origin + location.pathname.replace(/[^/]*$/, '');   // 사이트 루트 주소
  const myLink = () => siteBase() + 'artwall.html#piece=' + (lastMine ? lastMine.n : '');
  const TAGS = CONFIG.hashtags.join(' ');
  const caption = () => `나는 티로의 ${lastMine.n.toLocaleString('ko-KR')}번째 응원입니다 ✦\n선생님들이 만드는 티로 수능응원 아트월에 함께해 주세요.\n${myLink()}\n\n${TAGS}`;
  async function copyText(text, done) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(done);
  }
  $('#tagList').innerHTML = CONFIG.hashtags.map(t => `<span>${t}</span>`).join('');
  $('#copyTags').onclick = () => copyText(TAGS, '필수 해시태그를 복사했어요. 스토리·피드에 붙여 넣어 주세요');
  $('#copyCaption').onclick = () => copyText(caption(), '피드 문구를 복사했어요. 게시물 본문에 붙여 넣어 주세요');
  $('#copy').onclick = () => copyText(myLink(), '내 조각 링크를 복사했어요');
  $('#share').onclick = async () => {
    // 휴대전화: 스토리 이미지 + 해시태그 문구를 함께 공유 (인스타그램 등)
    try {
      const blob = await storyBlob(lastMine), file = new File([blob], `티로의_${lastMine.n}번째_응원.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { copyText(TAGS, '해시태그를 복사해 두었어요. 올릴 때 붙여 넣어 주세요'); await navigator.share({ files: [file], text: caption() }); return; }
      if (navigator.share) { await navigator.share({ title: '선생님들이 만드는 티로 수능응원 아트월', text: caption() }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    copyText(caption(), '공유 문구를 복사했어요. 원하는 곳에 붙여 넣어 주세요');
  };
  $('#story').onclick = () => storyImage(lastMine);

  // 스토리용 이미지 1080×1920: 아트월 배경 + 내 응원 카드
  async function storyCanvas(p) {
    await KFTA.cardsReady;
    const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = theme === 'night' ? '#0B1236' : '#EAF2FF'; g.fillRect(0, 0, W, H);
    const bg = scenes[theme] || ROOM.cv;
    if (bg) { const bw = bg.width, bh = bg.height, k = Math.max(W / bw, H / bh); g.drawImage(bg, (W - bw * k) / 2, (H - bh * k) / 2, bw * k, bh * k); }
    const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(16,40,110,.75)'); sh.addColorStop(.35, 'rgba(16,40,110,.35)'); sh.addColorStop(1, 'rgba(16,40,110,.85)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    const logo = await KFTA.loadImg(window.ASSETS.logo);
    g.fillStyle = '#fff'; rr(g, 80, 100, 300, 76, 38); g.fill(); if (logo) g.drawImage(logo, 104, 114, 252, 252 * logo.height / logo.width);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 30px Pretendard, sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText('선생님들이 만드는 티로 수능응원 아트월', 80, 250);
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 84px Paperlogy, Pretendard, sans-serif';
    g.fillText('나는 티로의', W / 2, 390);
    g.fillStyle = '#FFD39A'; g.fillText(p.n.toLocaleString('ko-KR') + '번째 응원입니다', W / 2, 490);
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 60; g.shadowOffsetY = 24;
    g.fillStyle = '#fff'; rr(g, 100, 580, 880, 880, 40); g.fill(); g.restore();
    KFTA.drawCard(g, p, 100, 580, 880);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 32px Pretendard, sans-serif';
    g.fillText(p.region + '교총 · ' + p.nick + ' · 조각 ' + posText(p), W / 2, 1560);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '600 30px Pretendard, sans-serif';
    g.fillText('수능 전날 11월 18일, 완성 작품 공개', W / 2, 1620);
    // 필수 해시태그
    g.fillStyle = '#FFD39A'; g.font = '800 36px Pretendard, sans-serif';
    const tags = CONFIG.hashtags, half = Math.ceil(tags.length / 2);
    g.fillText(tags.slice(0, half).join('  '), W / 2, 1730);
    g.fillText(tags.slice(half).join('  '), W / 2, 1790);
    return c;
  }
  const storyBlob = async p => { const c = await storyCanvas(p); return new Promise(r => c.toBlob(r, 'image/png')); };
  async function storyImage(p) {
    const c = await storyCanvas(p);
    let url;
    try { url = c.toDataURL('image/png'); } catch (e) { toast('이 환경에서는 이미지를 저장할 수 없어요. 배포된 주소에서 다시 시도해 주세요'); return; }
    const a = document.createElement('a'); a.download = `티로의_${p.n}번째_응원.png`; a.href = url; a.click();
    // 저장 후 필수 해시태그 안내 → 바로 복사할 수 있게
    const box = $('#pTags'); box.hidden = false; box.classList.add('flash'); box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => box.classList.remove('flash'), 2400);
    toast('스토리 이미지를 저장했어요. 필수 해시태그를 복사해 함께 올려 주세요');
  }

  /* ===================== 사이니지 ===================== */
  let tourT = null;
  function renderQR() {
    const box = $('#qr'); box.innerHTML = '';
    // QR → 메인에서 카드 고르기부터 (보내면 그 휴대전화에서 아트월로 이어짐)
    const url = siteBase() + 'index.html#join';
    if (window.QRCode) new QRCode(box, { text: url, width: 400, height: 400, colorDark: '#14081F', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  }
  function tour() {
    let i = 0;
    const stepTour = () => {
      if (!signage) return;
      const card = $('#sgCard');
      if (i % 4 === 0 || !pieces.length) { card.classList.remove('on'); fitAll(2200); tourT = setTimeout(stepTour, 9000); }
      else {
        const pool = pieces.slice(-40).concat(pieces), p = pool[Math.floor(Math.random() * pool.length)];
        selected = p; flyToPiece(p, 2400);
        setTimeout(() => { $('#sgNo').textContent = '티로의 ' + p.n.toLocaleString('ko-KR') + '번째 응원'; const mc = $('#sgMc'); mc.innerHTML = ''; mc.appendChild(KFTA.cardEl(p)); card.classList.add('on'); }, 1600);
        tourT = setTimeout(() => { card.classList.remove('on'); stepTour(); }, 8000);
      }
      i++;
    };
    stepTour();
  }
  function setSignage(on) {
    signage = on; document.body.classList.toggle('signage', on);
    clearTimeout(tourT); $('#sgCard').classList.remove('on'); selected = null;
    if (on) { renderQR(); tour(); if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); }
    else { fitAll(800); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  }
  $('#sgBtn').onclick = () => setSignage(true);
  addEventListener('keydown', e => {
    if (e.target.matches('input,textarea') || document.querySelector('dialog[open]')) return;
    if (e.key === 's' || e.key === 'S') setSignage(!signage);
    if (e.key === 'Escape' && signage) setSignage(false);
  });

  /* ===================== 시작 ===================== */
  await loadPieces();
  requestAnimationFrame(render);
  // 주소 뒤 #join · #new=N · #piece=N 처리 (처음 열 때와 주소가 바뀔 때 모두)
  function handleHash(delay) {
    const h = location.hash;
    if (h === '#join') setTimeout(openJoin, delay + 400);
    const nw = h.match(/new=(\d+)/);
    if (nw && byN.get(+nw[1])) { const p = byN.get(+nw[1]); history.replaceState(null, '', location.pathname + location.search); setTimeout(() => welcome(p, {}), delay + 200); }
    const m = h.match(/piece=(\d+)/);
    if (m && byN.get(+m[1])) { const p = byN.get(+m[1]); setTimeout(() => { flyToPiece(p); setTimeout(() => openPiece(p), 1400); }, delay + 400); }
  }
  addEventListener('hashchange', () => { rebuild(); handleHash(0); });
  // 새로 공개된 응원을 15초마다 확인 → 아트월에 바로 반영 (사이니지에서는 날아와 박히는 연출)
  setInterval(async () => {
    if (document.hidden) return;
    let fresh = [];
    try { fresh = await Store.pull(); } catch (e) { return; }
    if (!fresh.length) return;
    rebuild();
    const p = byN.get(fresh[fresh.length - 1].n);
    if (p && !arrival && !pieceDlg.open) arrival = { p, t0: performance.now() };
    if (!signage) toast(`새 응원 ${fresh.length}개가 아트월에 도착했어요`);
  }, 15000);
  const start = () => {
    if (!ROOM.ready) return setTimeout(start, 80);
    setTimeout(() => $('#intro').classList.add('off'), 500);
    if (signage) setSignage(true);
    handleHash(500);
  };
  start();
})();
