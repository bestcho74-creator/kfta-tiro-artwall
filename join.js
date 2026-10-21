/* 메시지 카드 · 응원 남기기 (메인 · 아트월 공용)
   ① 카드 4종 중 고르기 → ② 카드 위에 바로 응원 쓰기 → ③ 소속 교총 · 홈페이지 아이디 → 보내기 */
(function (global) {
  const { CARDS, REGIONS, Store } = global.KFTA;
  const SRC = global.ASSETS.cards;
  const MAX = 100;

  // 아트월 · 사이니지에는 아이디 앞 3자리만 공개
  const maskId = id => { id = String(id || '').trim(); return id.length <= 3 ? id.slice(0, 1) + '**' : id.slice(0, 3) + '*'.repeat(Math.min(4, id.length - 3)); };
  const sizeClass = n => n <= 24 ? 'l1' : n <= 50 ? 'l2' : n <= 80 ? 'l3' : 'l4';
  const signOf = p => (p.region ? p.region + '교총' : '소속 교총') + ' · ' + (p.nick || '아이디');

  // 카드 한 장 (HTML)
  function cardEl(p, opts = {}) {
    const c = Math.min(4, Math.max(1, p.card || 1));
    const el = document.createElement('div');
    el.className = 'mcard';
    el.style.setProperty('--ink', CARDS[c - 1].ink);
    el.innerHTML = `<img src="${SRC[c - 1]}" alt="${CARDS[c - 1].name} 카드"><div class="mc-m"><div class="mc-t"></div></div><div class="mc-s"></div>`;
    const t = el.querySelector('.mc-t'), s = el.querySelector('.mc-s');
    t.textContent = p.msg || '';
    t.className = 'mc-t ' + sizeClass((p.msg || '').length);
    s.textContent = opts.sign === false ? '' : signOf(p);
    if (opts.editable) { t.contentEditable = 'plaintext-only'; if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true'; t.dataset.ph = '여기에 수험생에게 전할 응원을 적어 주세요'; t.spellcheck = false; }
    return el;
  }

  // 카드 한 장 (캔버스) — 스토리 이미지 · 메인 카드용
  const imgs = SRC.map(src => { const i = new Image(); i.src = src; return i; });
  const ready = Promise.all(imgs.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
  function wrapLines(g, text, maxW) {
    const out = [];
    String(text).split('\n').forEach(par => {
      let line = '';
      par.split(' ').forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (g.measureText(test).width <= maxW) { line = test; return; }
        if (line) out.push(line);
        line = '';
        for (const ch of word) { if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
      });
      out.push(line);
    });
    return out;
  }
  function drawCard(g, p, x, y, S) {
    const c = Math.min(4, Math.max(1, p.card || 1)), ink = CARDS[c - 1].ink;
    g.drawImage(imgs[c - 1], x, y, S, S);
    const fs = { l1: .07, l2: .06, l3: .052, l4: .046 }[sizeClass((p.msg || '').length)] * S, lh = fs * 1.5;
    g.save();
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${fs}px "Gowun Batang", serif`;
    const lines = wrapLines(g, p.msg || '', S * 0.86).slice(0, Math.floor(S * 0.6 / lh));
    const top = y + S * 0.45 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => g.fillText(l, x + S / 2, top + i * lh));
    g.textAlign = 'left'; g.globalAlpha = .78; g.font = `700 ${S * 0.036}px Pretendard, sans-serif`; g.textBaseline = 'top';
    g.fillText(signOf(p), x + S * 0.07, y + S * 0.87);
    g.restore();
  }

  // 응원 남기기 창
  let dlg = null, state = null, onDoneCb = null;
  const $ = s => dlg.querySelector(s);
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'jx';
    dlg.setAttribute('aria-label', '응원 남기기');
    dlg.innerHTML = `
<div class="jx-sheet">
  <button class="jx-x" type="button" aria-label="닫기">✕</button>
  <div class="jx-prog"><i></i><i></i><i></i></div>
  <section data-s="1">
    <div class="jx-step">STEP 1 · 카드 고르기</div>
    <h3>응원 카드를 골라 주세요</h3>
    <p class="jx-sub">고른 카드에 선생님의 응원을 적어 아트월로 보냅니다.</p>
    <div class="jx-cards">${CARDS.map((c, i) => `<button class="jx-pick" type="button" data-card="${c.id}"><img src="${SRC[i]}" alt=""><span>${c.name}</span></button>`).join('')}</div>
  </section>
  <section data-s="2" hidden>
    <div class="jx-step">STEP 2 · 응원 쓰기</div>
    <h3>수험생에게 한마디</h3>
    <p class="jx-sub">카드 위 빈칸을 눌러 바로 적어 주세요.</p>
    <div class="jx-preview" id="jxPrev"></div>
    <div class="jx-meta"><span>카드를 바꾸려면 이전으로</span><span><b id="jxLen">0</b> / ${MAX}</span></div>
    <div class="jx-chips">
      <button type="button">평소처럼, 연습한 그대로! 넌 할 수 있어.</button>
      <button type="button">긴장되는 건 그만큼 준비했다는 뜻이에요.</button>
      <button type="button">선생님들이 시험장 밖에서 응원할게요.</button>
    </div>
    <div class="jx-row"><button class="jx-btn jx-ghost" type="button" data-go="1">이전</button><button class="jx-btn jx-main" type="button" id="jxTo3" disabled>다음</button></div>
  </section>
  <section data-s="3" hidden>
    <div class="jx-step">STEP 3 · 보내는 선생님</div>
    <h3>소속과 아이디를 적어 주세요</h3>
    <div class="jx-mini"><div id="jxMini"></div><p>카드 아래에 <b>소속 교총 · 아이디 앞 3자리</b>가 함께 표시됩니다.</p></div>
    <div class="jx-label">소속 시·도교총</div>
    <div class="jx-regions">${REGIONS.map(r => `<button type="button">${r}</button>`).join('')}</div>
    <label class="jx-field"><span>한국교총 홈페이지 아이디</span><input id="jxId" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="교총 홈페이지에 가입한 아이디"></label>
    <p class="jx-help">회원 확인과 경품 추첨에만 쓰이며, 아트월에는 앞 3자리만 보입니다. (예: kft***)</p>
    <label class="jx-field"><span>인스타그램 아이디 (선택)</span><input id="jxInsta" maxlength="30" autocapitalize="off" spellcheck="false" placeholder="@아이디"></label>
    <p class="jx-help">한국교총 인스타그램 이벤트 게시물에 댓글을 남기면 추가 추첨 기회 1회를 드려요. 공개되지 않습니다.</p>
    <div class="jx-cons">
      <label class="jx-check"><input type="checkbox" id="jxC1"><span><b>[필수]</b> 소속 교총 · 아이디 일부 · 응원 메시지가 아트월에 공개되는 것에 동의합니다.</span></label>
      <label class="jx-check"><input type="checkbox" id="jxC2"><span><b>[필수]</b> 회원 확인과 이벤트 운영을 위한 개인정보(아이디) 수집 · 이용에 동의합니다.</span></label>
      <label class="jx-check"><input type="checkbox" id="jxC3"><span><b>[선택]</b> 경품 추첨에 응모합니다.</span></label>
    </div>
    <div class="jx-row"><button class="jx-btn jx-ghost" type="button" data-go="2">이전</button><button class="jx-btn jx-main" type="button" id="jxSend" disabled>응원 보내기 ✦</button></div>
    <p class="jx-small">개인정보나 부적절한 표현이 담긴 응원은 검수 후 공개되지 않을 수 있습니다.</p>
  </section>
</div>`;
    document.body.appendChild(dlg);
    $('.jx-x').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(+b.dataset.go));
    $('.jx-cards').addEventListener('click', e => {
      const b = e.target.closest('.jx-pick'); if (!b) return;
      state.card = +b.dataset.card; mark(); go(2);
    });
    $('.jx-chips').addEventListener('click', e => {
      if (e.target.tagName !== 'BUTTON') return;
      state.msg = e.target.textContent; renderPreview(); validate();
    });
    $('.jx-regions').addEventListener('click', e => {
      if (e.target.tagName !== 'BUTTON') return;
      state.region = e.target.textContent; mark(); renderMini(); validate();
    });
    $('#jxId').addEventListener('input', () => { state.id = $('#jxId').value.replace(/\s/g, ''); renderMini(); validate(); });
    ['#jxC1', '#jxC2', '#jxC3'].forEach(id => $(id).addEventListener('change', validate));
    $('#jxTo3').onclick = () => go(3);
    $('#jxSend').onclick = send;
  }
  function mark() {
    dlg.querySelectorAll('.jx-pick').forEach(b => b.classList.toggle('on', +b.dataset.card === state.card));
    dlg.querySelectorAll('.jx-regions button').forEach(b => b.classList.toggle('on', b.textContent === state.region));
  }
  const draft = () => ({ card: state.card, msg: state.msg, region: state.region, nick: state.id ? maskId(state.id) : '' });
  function renderPreview() {
    const box = $('#jxPrev'); box.innerHTML = '';
    const el = cardEl(draft(), { editable: true });
    box.appendChild(el);
    const t = el.querySelector('.mc-t');
    t.addEventListener('input', () => {
      let v = t.innerText.replace(/\n{3,}/g, '\n\n');
      if (v.length > MAX) { v = v.slice(0, MAX); t.textContent = v; placeCaret(t); }
      state.msg = v.trim() ? v : '';
      t.className = 'mc-t ' + sizeClass(v.length);
      $('#jxLen').textContent = v.length; validate();
    });
    t.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text')); });
    $('#jxLen').textContent = state.msg.length;
    return t;
  }
  function placeCaret(el) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function renderMini() { const m = $('#jxMini'); m.innerHTML = ''; m.appendChild(cardEl(draft())); }
  function validate() {
    $('#jxTo3').disabled = state.msg.trim().length < 2;
    $('#jxSend').disabled = !(state.region && state.id.length >= 3 && $('#jxC1').checked && $('#jxC2').checked && state.msg.trim().length >= 2);
  }
  function go(n) {
    dlg.querySelectorAll('[data-s]').forEach(s => s.hidden = +s.dataset.s !== n);
    dlg.querySelectorAll('.jx-prog i').forEach((i, k) => i.classList.toggle('on', k < n));
    if (n === 2) { const t = renderPreview(); setTimeout(() => { t.focus(); placeCaret(t); }, 60); }
    if (n === 3) renderMini();
    validate();
  }
  function send() {
    const p = Store.add({ card: state.card, msg: state.msg.trim().replace(/[ \t]+/g, ' '), region: state.region, nick: maskId(state.id), memberId: state.id, insta: $('#jxInsta').value.trim(), prize: $('#jxC3').checked });
    const from = $('#jxPrev .mcard') || $('#jxMini .mcard');
    dlg.close();
    if (onDoneCb) onDoneCb(p, { prize: $('#jxC3').checked, insta: !!$('#jxInsta').value.trim(), from });
  }
  function openJoin(opts = {}) {
    if (!dlg) build();
    onDoneCb = opts.onDone || null;
    state = { card: 0, msg: '', region: '', id: '' };
    $('#jxId').value = ''; $('#jxInsta').value = ''; ['#jxC1', '#jxC2', '#jxC3'].forEach(id => $(id).checked = false);
    mark(); go(1); dlg.showModal();
  }

  // 메인 → 아트월로 보내는 연출
  function sendAway(p, url) {
    const veil = document.createElement('div');
    veil.className = 'jx-veil';
    veil.innerHTML = `티로의 ${p.n.toLocaleString('ko-KR')}번째 응원이<br>아트월로 날아갑니다<small>잠시 후 미디어아트월에서 내 응원을 확인하세요</small>`;
    const card = cardEl(p);
    card.classList.add('jx-fly');
    const W = Math.min(360, innerWidth * 0.7);
    Object.assign(card.style, { width: W + 'px', left: (innerWidth - W) / 2 + 'px', top: (innerHeight - W) / 2 + 'px' });
    document.body.append(veil, card);
    requestAnimationFrame(() => { veil.classList.add('on'); });
    setTimeout(() => { card.style.transform = `translateY(${-innerHeight * 0.7}px) scale(.25) rotate(-8deg)`; card.style.opacity = '0'; }, 900);
    setTimeout(() => { location.href = url; }, 1900);
  }

  Object.assign(global.KFTA, { maskId, cardEl, drawCard, cardsReady: ready, openJoin, sendAway, signOf });
})(window);
