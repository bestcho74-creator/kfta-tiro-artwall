/* 쿼카 모션랩 공통 엔진 · 도구 모음
   - qmEngine: 모션 실행 엔진 (원본 그대로)
   - lpKit / lgBase / lgFlow: 랜딩 모션 도구 (원본 그대로)
   - gdRGB / gdMix / gdShader: WebGL 배경 모션 도구 (원본 그대로)
   새 모션 코드를 받으면 모션 함수만 따로 붙이면 됩니다. */
(function (global) {
  function lpKit(api) {
    const clamp = x => Math.max(0, Math.min(1, x));
    const lp = {
      face: name => `'${name}','Pretendard Variable','Pretendard',sans-serif`,
      clamp: clamp,
      seg: (t, a, b) => clamp((t - a) / (b - a)),
      mix: (a, b, p) => a + (b - a) * p,
      out: x => 1 - Math.pow(1 - clamp(x), 4),
      expo: x => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); },
      into: x => Math.pow(clamp(x), 3),
      io: x => { x = clamp(x); return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2; },
      wave: (t, period) => 0.5 - 0.5 * Math.cos(t / period * Math.PI * 2),
      path(t, keys) {
        const n = keys.length, first = keys[0], end = keys[n - 1];
        let x = first[1], y = first[2];
        if (t >= end[0]) { x = end[1]; y = end[2]; }
        else for (let i = 0; i < n - 1; i++) {
          const a = keys[i], b = keys[i + 1];
          if (t >= a[0] && t < b[0]) { const p = lp.io(lp.seg(t, a[0], b[0])); x = lp.mix(a[1], b[1], p); y = lp.mix(a[2], b[2], p); break; }
        }
        let down = 0;
        keys.forEach(k => { if (k[3]) down = Math.max(down, 1 - clamp(Math.abs(t - k[0]) / 0.16)); });
        const on = Math.min(lp.seg(t, first[0] - 0.3, first[0]), 1 - lp.seg(t, end[0], end[0] + 0.4));
        return { x: x * api.W, y: y * api.H, down: down, on: on };
      },
      cursor(parent, scale) {
        const s = api.u * 0.042 * (scale || 1), NS = 'http://www.w3.org/2000/svg';
        const el = document.createElementNS(NS, 'svg'), body = document.createElementNS(NS, 'path');
        el.setAttribute('viewBox', '0 0 20 24');
        el.setAttribute('width', s);
        el.setAttribute('height', s * 1.2);
        el.style.cssText = `position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:9;transform-origin:0 0;filter:drop-shadow(0 ${s * 0.06}px ${s * 0.12}px rgba(0,0,0,.35));`;
        body.setAttribute('d', 'M2 1.6 L2 19.2 L6.6 14.9 L9.6 21.6 L12.7 20.2 L9.8 13.7 L16.2 13.7 Z');
        body.setAttribute('fill', '#ffffff');
        body.setAttribute('stroke', '#111111');
        body.setAttribute('stroke-width', '1.3');
        body.setAttribute('stroke-linejoin', 'round');
        el.appendChild(body);
        parent.appendChild(el);
        return {
          el: el,
          set(p) {
            el.style.opacity = (p.on * p.fake).toFixed(3);
            el.style.transform = `translate(${p.x - s * 0.1}px,${p.y - s * 0.08}px) scale(${1 - 0.14 * p.down})`;
          }
        };
      },
      glint(parent, px, color) {
        const NS = 'http://www.w3.org/2000/svg', el = document.createElementNS(NS, 'svg'), star = document.createElementNS(NS, 'path');
        el.setAttribute('viewBox', '-10 -10 20 20');
        el.setAttribute('width', px);
        el.setAttribute('height', px);
        el.style.cssText = `position:absolute;left:0;top:0;margin:${-px / 2}px 0 0 ${-px / 2}px;overflow:visible;pointer-events:none;`;
        star.setAttribute('d', 'M0 -10 C0.7 -2.4 2.4 -0.7 10 0 C2.4 0.7 0.7 2.4 0 10 C-0.7 2.4 -2.4 0.7 -10 0 C-2.4 -0.7 -0.7 -2.4 0 -10 Z');
        star.setAttribute('fill', color || '#ffffff');
        el.appendChild(star);
        parent.appendChild(el);
        return el;
      },
      sweep(p, angle, width, alpha, color) {
        const w = width || 14, c = -w + clamp(p) * (100 + 2 * w), rgb = color || '255,255,255';
        return `linear-gradient(${angle == null ? 105 : angle}deg, rgba(${rgb},0) ${c - w}%, rgba(${rgb},${alpha == null ? 0.55 : alpha}) ${c}%, rgba(${rgb},0) ${c + w}%)`;
      },
      glass(dark) {
        return dark
          ? 'background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.04));box-shadow:inset 0 1px 0 rgba(255,255,255,.38),inset 0 0 0 1px rgba(255,255,255,.12),0 24px 48px -16px rgba(0,0,0,.55);'
          : 'background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(255,255,255,.62));box-shadow:inset 0 1px 0 #ffffff,inset 0 0 0 1px rgba(255,255,255,.7),0 22px 44px -18px rgba(18,22,36,.35),0 2px 6px rgba(18,22,36,.08);';
      },
      grain(parent, alpha) {
        if (api.clear) return null;
        const cv = document.createElement('canvas'), g = cv.getContext('2d'), img = g.createImageData(128, 128), r = api.rand(7);
        cv.width = cv.height = 128;
        for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        g.putImageData(img, 0, 0);
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:${alpha == null ? 0.06 : alpha};background:url(${cv.toDataURL()}) 0 0 / ${Math.max(64, api.u * 0.16)}px repeat;`;
        parent.appendChild(el);
        return el;
      },
      canvas(parent) {
        const cv = document.createElement('canvas'), k = Math.min(2, window.devicePixelRatio || 1, 2600 / Math.max(api.W, api.H));
        cv.width = Math.round(api.W * k);
        cv.height = Math.round(api.H * k);
        cv.style.cssText = `position:absolute;left:0;top:0;width:${api.W}px;height:${api.H}px;`;
        (parent || api.root).appendChild(cv);
        const g = cv.getContext('2d');
        g.setTransform(k, 0, 0, k, 0, 0);
        return { cv: cv, g: g, k: k };
      },
      split(parent, text, by) {
        const units = by === 'line' ? String(text).split('\n') : by === 'word' ? String(text).split(/(\s+)/) : Array.from(String(text));
        const parts = [];
        units.forEach(unit => {
          if (!unit) return;
          if (by !== 'line' && /^\s+$/.test(unit)) { parent.appendChild(document.createTextNode(unit.indexOf('\n') >= 0 ? '\n' : ' ')); return; }
          const mask = document.createElement('span'), core = document.createElement('span');
          mask.style.cssText = `display:${by === 'line' ? 'block' : 'inline-block'};overflow:hidden;vertical-align:top;padding:.14em 0;margin:-.14em 0;` + (by === 'line' ? '' : 'white-space:pre;');
          core.style.cssText = `display:${by === 'line' ? 'block' : 'inline-block'};will-change:transform;`;
          core.textContent = unit;
          mask.appendChild(core);
          parent.appendChild(mask);
          parts.push(core);
        });
        return parts;
      },
      label(parent, text, px, color) {
        const el = document.createElement('span');
        el.textContent = text;
        el.style.cssText = `display:block;font:600 ${px}px/1.2 ${lp.face('Pretendard Variable')};letter-spacing:.14em;text-transform:uppercase;color:${color || api.fg};white-space:nowrap;`;
        parent.appendChild(el);
        return el;
      },
      demoScroll(t, loop) {
        t = ((t % loop) + loop) % loop;
        return t < loop * 0.82 ? lp.io(lp.seg(t, loop * 0.06, loop * 0.74)) : 1 - lp.io(lp.seg(t, loop * 0.86, loop));
      }
    };
    return lp;
  }

  function lgBase(api) {
    const W = api.W, H = api.H, u = api.u;
    const hex = c => /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000';
    const lum = c => { c = hex(c); return (parseInt(c.slice(1, 3), 16) * 299 + parseInt(c.slice(3, 5), 16) * 587 + parseInt(c.slice(5, 7), 16) * 114) / 1000; };
    return {
      W: W, H: H, u: u,
      wide: W / H > 1.2,
      tall: H / W > 1.2,
      dark: api.clear || lum(api.bg) < 128,
      shade: api.clear ? 'text-shadow:0 1px 2px rgba(0,0,0,.45),0 0 16px rgba(0,0,0,.25);' : '',
      alpha(c, a) { c = hex(c); return `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`; },
      tint(a) { const c = hex(api.fg), k = api.clear ? 0.5 + a * 0.5 : a; return `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${k})`; },
      plate: api.clear ? 'background:rgba(16,18,24,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),0 8px 24px -10px rgba(0,0,0,.5);' : '',
      div(parent, css, text, tag) {
        const el = document.createElement(tag || 'div');
        el.style.cssText = css || '';
        if (text != null) el.textContent = text;
        parent.appendChild(el);
        return el;
      },
      edge(size, down) {
        const g = `linear-gradient(${down ? 180 : 90}deg,transparent 0,rgba(0,0,0,.2) ${size / 2}px,#000 ${size}px,#000 calc(100% - ${size}px),rgba(0,0,0,.2) calc(100% - ${size / 2}px),transparent 100%)`;
        return `-webkit-mask-image:${g};mask-image:${g};`;
      }
    };
  }

  function lgFlow(loop, rate) {
    const N = 720, acc = [0];
    for (let i = 0; i < N; i++) acc.push(acc[i] + rate((i + 0.5) / N * loop));
    const total = acc[N] || 1, mean = total / N;
    const demo = t => {
      const k = Math.floor(t / loop), f = (t - k * loop) / loop * N, i = Math.min(N - 1, Math.floor(f));
      return k + (acc[i] + (acc[i + 1] - acc[i]) * (f - i)) / total;
    };
    let pos = 0, last = 0, live = false;
    return {
      demo: demo,
      at(t, real, now) {
        if (!real && !live) return demo(t);
        if (!live) { live = true; pos = demo(t); last = t; }
        const dt = t - last;
        last = t;
        if (dt > 0 && dt < 0.5) pos += dt / loop * now / mean;
        return pos;
      }
    };
  }

  function gdRGB(color) {
    return /^#[0-9a-f]{6}$/i.test(color) ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255) : [0, 0, 0];
  }

  function gdMix(a, b, k) {
    const x = gdRGB(a), y = gdRGB(b);
    return x.map((v, i) => v + (y[i] - v) * k);
  }

  function gdShader(api, body, scale, loop, budget) {
    const W = api.W, H = api.H;
    let k = Math.min(2, window.devicePixelRatio || 1, 2200 / Math.max(W, H)) * (scale || 1);
    if (budget && W * H * k * k > budget) k = Math.sqrt(budget / (W * H));
    const cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.round(W * k));
    cv.height = Math.max(2, Math.round(H * k));
    cv.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;`;
    api.root.appendChild(cv);
    const gl = cv.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, alpha: true, antialias: false });
    const stub = { cv: cv, set() {}, draw() {}, dispose() {}, ok: false };
    if (!gl) return stub;
    gl.getExtension('OES_standard_derivatives');
    const head = [
      '#extension GL_OES_standard_derivatives : enable',
      '#ifdef GL_FRAGMENT_PRECISION_HIGH',
      'precision highp float;',
      '#else',
      'precision mediump float;',
      '#endif',
      'uniform vec2 uRes, uSize;',
      'uniform float uK, uT, uLoop, uClear;',
      '#define TAU 6.2831853',
      'vec2 px() { return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uK; }',
      'float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }',
      'float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }',
      'float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
      'float noise3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
      '  float a = mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);',
      '  float b = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);',
      '  return mix(a, b, f.z); }',
      'float fbm(vec2 p) { float n = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { n += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return n / 0.9375; }',
      'float turn(float n) { return TAU * n * uT / uLoop; }',
      'float sq(float x) { return x * x; }',
      'float dither() { return (hash(gl_FragCoord.xy) - 0.5) / 255.0; }',
      'float ign() { return hash(gl_FragCoord.xy * 1.37 + 17.0); }',
      ''
    ].join('\n');
    const make = (type, text) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, make(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }'));
    gl.attachShader(prog, make(gl.FRAGMENT_SHADER, head + body));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return stub; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const spots = {};
    const where = name => name in spots ? spots[name] : (spots[name] = gl.getUniformLocation(prog, name));
    const st = {
      cv: cv,
      ok: true,
      set(name, v) {
        const l = where(name);
        if (!l) return;
        if (typeof v === 'number') gl.uniform1f(l, v);
        else if (v.length === 2) gl.uniform2fv(l, v);
        else if (v.length === 3) gl.uniform3fv(l, v);
        else gl.uniform4fv(l, v);
      },
      draw(t) {
        if (gl.isContextLost()) return;
        st.set('uT', t);
        gl.viewport(0, 0, cv.width, cv.height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
      dispose() { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
    };
    st.set('uRes', [cv.width, cv.height]);
    st.set('uSize', [W, H]);
    st.set('uK', cv.width / W);
    st.set('uLoop', loop || 10);
    st.set('uClear', api.clear ? 1 : 0);
    return st;
  }

  function qmEngine(root, CFG, motion) {
    const COLORS = CFG.colors || ['#ffffff', '#e8ecf3', '#cfd7e6', '#9aa8c4', '#5c7099', '#1f3460', '#6e1a2f', '#15171c'];
    const rand = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const dice = rand(CFG.seed || Math.floor(Math.random() * 1e9) + 1);
    const shift = Math.floor(dice() * 16);
    const IMGS = (CFG.images || []).slice();
    const NIMG = IMGS.some(Boolean) ? IMGS.length : 0;
    const used = new Set(), usedArt = new Set();
    const FONT = '"Pretendard Variable","Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
    const light = color => color === 'transparent' && /^#[0-9a-f]{6}$/i.test(CFG.under || '') ? light(CFG.under) : /^#[0-9a-f]{6}$/i.test(color) ? (parseInt(color.slice(1, 3), 16) * 299 + parseInt(color.slice(3, 5), 16) * 587 + parseInt(color.slice(5, 7), 16) * 114) / 1000 : 0;
    const bright = light(CFG.bg);
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = null, time = CFG.startAt || (still ? 4 : 0), last = 0, raf = 0, timer = 0, size = '';
    let playing = false, seen = true, want = CFG.autoplay !== false && !still, drew = false;
    const LIVE = CFG.live === true || CFG.live === 'try', TRY = CFG.live === 'try';
    const live = { x: 0, y: 0, tx: 0, ty: 0, over: 0, on: false, down: 0, press: false, s: 0, ts: 0, ready: false };

    const api = {
      root: root,
      bg: CFG.bg,
      clear: CFG.bg === 'transparent',
      fg: bright > 150 ? COLORS[7] : COLORS[0],
      ink: COLORS[7],
      colors: COLORS.slice(),
      accent: COLORS[5],
      deep: COLORS[6],
      on: color => light(color) > 150 ? COLORS[7] : '#ffffff',
      tone: i => COLORS[1 + (i % 5 + 5) % 5],
      rand: rand,
      font: FONT,
      ko: text => /[ㄱ-ㆎ가-힣]/.test(text),
      count: NIMG,
      words: CFG.words || [],
      live: LIVE && !TRY,
      cue: CFG.cue || null,
      page: CFG.page || 0,
      pointer(demo) {
        const d = Object.assign({ x: api.W / 2, y: api.H / 2, down: 0, on: 1 }, demo || {});
        if (!LIVE) return { x: d.x, y: d.y, down: d.down, on: d.on, fake: 1 };
        if (!live.ready) return TRY ? { x: d.x, y: d.y, down: d.down, on: d.on, fake: 1 } : { x: d.x, y: d.y, down: 0, on: 0, fake: 0 };
        const k = TRY ? live.over : 1, mix = (a, b) => a + (b - a) * k;
        return { x: mix(d.x, live.x), y: mix(d.y, live.y), down: mix(d.down, live.down), on: TRY ? mix(d.on, live.over) : live.over, fake: 1 - k };
      },
      scroll: demo => LIVE && !TRY ? live.s : demo,
      image: i => { used.add(i); if (!NIMG) return null; const u = IMGS[i % NIMG]; if (u) return u; const a = api.art(i, true); return a ? a.url : null; },
      art: (i, plain) => { drew = true; usedArt.add(i); return typeof global.qmArt === 'function' ? global.qmArt(plain ? i : i + shift, plain) : null; },
      paint: i => {
        used.add(i);
        const u = NIMG ? IMGS[i % NIMG] : null, a = u ? null : api.art(i, NIMG > 0);
        return u ? `url("${u}") center / cover no-repeat, #1c1c1e` : a ? `url(${a.url}) center / cover no-repeat` : `linear-gradient(145deg, ${COLORS[2]}, ${COLORS[5]})`;
      },
      footage(dim) {
        if (api.clear) return null;
        used.add(0);
        const el = document.createElement('div'), n = IMGS[0] ? 1 : 0;
        el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;filter:brightness(' + (dim == null ? 0.85 : dim) + ');background:' + (n ? `url("${IMGS[0]}") center / cover no-repeat` :
          'radial-gradient(55% 32% at 28% 26%, rgba(243,237,226,.5), rgba(243,237,226,0) 70%), radial-gradient(45% 30% at 78% 52%, rgba(154,120,110,.45), rgba(154,120,110,0) 70%), ' +
          'radial-gradient(80% 45% at 50% 108%, rgba(31,52,96,.75), rgba(31,52,96,0) 72%), radial-gradient(40% 25% at 18% 70%, rgba(205,196,184,.28), rgba(205,196,184,0) 70%), linear-gradient(172deg, #4a4f5a, #23262d 60%, #15171c)') + ';';
        root.appendChild(el);
        return el;
      },
      ease: x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); },
      spring: x => { x = Math.max(0, Math.min(1, x)) - 1; return 1 + 2.70158 * x * x * x + 1.70158 * x * x; },
      space(perspective) {
        root.style.perspective = perspective ? perspective + 'px' : 'none';
        return api.group(root, 'left:50%;top:50%;');
      },
      group(parent, extra) {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;transform-style:preserve-3d;' + (extra || '');
        parent.appendChild(el);
        return el;
      },
      box(parent, w, h, css) {
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;left:0;top:0;box-sizing:border-box;width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;font-family:${FONT};` + (css || '');
        parent.appendChild(el);
        return el;
      },
      card(parent, i, w, h, twoSided) {
        const el = api.box(parent, w, h, 'overflow:hidden;'), s = el.style;
        s.borderRadius = Math.min(w, h) * (CFG.radius || 0) + 'px';
        s.backfaceVisibility = s.webkitBackfaceVisibility = twoSided ? 'visible' : 'hidden';
        s.background = api.paint(i);
        return el;
      }
    };

    function build() {
      const W = root.clientWidth, H = root.clientHeight;
      if (!W || !H || size === W + 'x' + H) return;
      size = W + 'x' + H;
      if (frame && frame.dispose) frame.dispose();
      root.textContent = '';
      api.W = W; api.H = H; api.u = Math.min(W, H);
      if (LIVE && !TRY) { measure(); live.s = live.ts; }
      frame = motion(api);
      frame(time);
      runs(root);
      if (watch) watch.takeRecords();
    }
    const LATIN = /^(Anton|Archivo|Instrument Serif|Inter|JetBrains Mono)$/i;
    function runs(top) {
      const walk = document.createTreeWalker(top, NodeFilter.SHOW_TEXT), seen = new Set();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.parentElement) seen.add(n.parentElement);
      seen.forEach(el => {
        let own = '';
        el.childNodes.forEach(c => { if (c.nodeType === 3) own += c.nodeValue; });
        if (!/[ㄱ-ㆎ가-힣]/.test(own) || !/[A-Za-z0-9]/.test(own)) return;
        const list = getComputedStyle(el).fontFamily.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''));
        if (!LATIN.test(list[0])) return;
        el.style.fontFamily = list.filter(f => !LATIN.test(f)).map(f => /^[a-z-]+$/.test(f) ? f : '"' + f + '"').join(',');
      });
    }
    const watch = window.MutationObserver ? new MutationObserver(list => mend(list)) : null;
    const mend = list => list.forEach(r => { const el = r.target.nodeType === 3 ? r.target.parentElement : r.target; if (el && root.contains(el)) runs(el); });
    if (watch) watch.observe(root, { childList: true, characterData: true, subtree: true });
    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
      time += dt * CFG.speed;
      if (CFG.once && time > CFG.once) time = CFG.once;
      last = now;
      if (LIVE) follow(dt);
      if (frame) frame(time);
    }
    function measure() {
      const el = CFG.track ? document.querySelector(CFG.track) : root;
      if (!el) return;
      const r = el.getBoundingClientRect(), vh = window.innerHeight || 1;
      live.ts = Math.max(0, Math.min(1, CFG.track ? -r.top / Math.max(1, r.height - vh) : (vh - r.top) / (vh + r.height)));
    }
    function follow(dt) {
      const k = 1 - Math.exp(-dt * 14);
      live.x += (live.tx - live.x) * k;
      live.y += (live.ty - live.y) * k;
      live.over += ((live.on ? 1 : 0) - live.over) * (1 - Math.exp(-dt * 6));
      live.down += ((live.press ? 1 : 0) - live.down) * (1 - Math.exp(-dt * 18));
      if (!TRY) { measure(); live.s += (live.ts - live.s) * (1 - Math.exp(-dt * 10)); }
    }
    const spot = e => {
      const r = root.getBoundingClientRect();
      live.tx = (e.clientX - r.left) * root.clientWidth / (r.width || 1);
      live.ty = (e.clientY - r.top) * root.clientHeight / (r.height || 1);
      if (!live.ready) { live.x = live.tx; live.y = live.ty; live.ready = true; }
    };
    const poke = () => { if (playing || !frame) return; live.x = live.tx; live.y = live.ty; live.over = live.on ? 1 : 0; live.down = live.press ? 1 : 0; frame(time); };
    const hands = {
      pointerenter: e => { spot(e); live.on = true; poke(); },
      pointermove: e => { spot(e); live.on = true; poke(); },
      pointerleave: () => { live.on = false; live.press = false; poke(); },
      pointerdown: e => { spot(e); live.on = live.press = true; poke(); },
      pointerup: () => { live.press = false; poke(); }
    };
    const target = CFG.pointerTarget || root;
    if (LIVE) Object.keys(hands).forEach(k => target.addEventListener(k, hands[k]));
    function sync() {
      const on = want && seen;
      if (on && !playing) { playing = true; last = performance.now(); raf = requestAnimationFrame(tick); }
      if (!on && playing) { playing = false; cancelAnimationFrame(raf); }
    }

    Object.assign(root.style, { position: root.style.position || 'relative', overflow: 'hidden', background: CFG.bg, aspectRatio: CFG.ratio });
    build();
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(build, 100); });
    const io = new IntersectionObserver(e => { seen = e[e.length - 1].isIntersecting; sync(); });
    const refit = () => { if (frame && (frame.fonts || drew)) { size = ''; build(); } };
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refit);
    ro.observe(root);
    io.observe(root);
    sync();

    return {
      play() { want = true; sync(); },
      pause() { want = false; sync(); },
      restart() { time = 0; if (frame) frame(time); },
      seek(t) { time = t; if (frame) frame(time); if (watch) mend(watch.takeRecords()); },
      now() { return time; },
      motion() { return frame; },
      slots() { return used.size || usedArt.size; },
      destroy() { want = false; sync(); if (LIVE) Object.keys(hands).forEach(k => target.removeEventListener(k, hands[k])); ro.disconnect(); io.disconnect(); if (watch) watch.disconnect(); clearTimeout(timer); if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', refit); if (frame && frame.dispose) frame.dispose(); root.textContent = ''; }
    };
  }

  Object.assign(global, { lpKit, lgBase, lgFlow, gdRGB, gdMix, gdShader, qmEngine });
})(window);
