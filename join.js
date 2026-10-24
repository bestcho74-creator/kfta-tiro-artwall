/* 메시지 카드 · 응원 남기기 (메인 · 아트월 공용)
   ① 카드 4종 중 고르기 → ② 카드 위에 바로 응원 쓰기 → ③ 닉네임 · 경품 응모(선택) → 보내기 */
(function (global) {
  const { CARDS, Store } = global.KFTA;
  const SRC = global.ASSETS.cards;
  const MAX = 100;
  const NICK_EX = ['국어쌤', '3학년 담임', '수학하는 티로', '보건실 지킴이', '응원단장'];   // 닉네임 예시

  const sizeClass = n => n <= 24 ? 'l1' : n <= 50 ? 'l2' : n <= 80 ? 'l3' : 'l4';
  const signOf = p => p.nick || '닉네임';

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
    if (opts.editable) { try { t.contentEditable = 'plaintext-only'; } catch (e) {} if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true'; t.dataset.ph = '여기에 수험생에게 전할 응원을 적어 주세요'; t.spellcheck = false; }
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
      <button type="button">지금까지 쌓아 온 시간이 너를 지켜 줄 거야.</button>
      <button type="button">시험장 문을 나서는 순간, 이미 충분히 잘 해낸 거예요.</button>
    </div>
    <p class="jx-warn" id="jxMsgWarn" hidden>응원 메시지에 쓸 수 없는 표현이 있어요. 고운 말로 바꿔 주세요.</p>
    <div class="jx-row"><button class="jx-btn jx-ghost" type="button" data-go="1">이전</button><button class="jx-btn jx-main" type="button" id="jxTo3" disabled>다음</button></div>
  </section>
  <section data-s="3" hidden>
    <div class="jx-step">STEP 3 · 보내는 선생님</div>
    <h3>닉네임을 적어 주세요</h3>
    <div class="jx-mini"><div id="jxMini"></div><p>카드 아래에 <b>닉네임</b>이 그대로 표시됩니다.</p></div>
    <label class="jx-field"><span>닉네임 · 아트월에 공개 (2~12자)</span><input id="jxNick" maxlength="12" autocomplete="off" spellcheck="false" placeholder="예) 국어쌤, 3학년 담임, 티로팬"></label>
    <div class="jx-chips jx-nicks" aria-label="닉네임 예시">${NICK_EX.map(n => `<button type="button">${n}</button>`).join('')}</div>
    <p class="jx-help" id="jxNickHelp">욕설이나 나쁜 의미가 담긴 닉네임은 쓸 수 없어요.</p>
    <div class="jx-prize">
      <div class="jx-prize-h"><b>경품 응모 (선택)</b><span>채워 넣을수록 당첨 확률이 높아져요</span></div>
      <label class="jx-field"><span>휴대전화 번호 · 경품 발송용</span><input id="jxPhone" type="tel" inputmode="numeric" maxlength="13" autocomplete="tel" placeholder="010-0000-0000"></label>
      <label class="jx-field"><span>한국교총 SNS 팔로우 아이디 <em>당첨 확률 UP</em></span><input id="jxSns" maxlength="40" autocapitalize="off" spellcheck="false" placeholder="교총 SNS를 팔로우한 내 아이디 (@아이디)"></label>
      <label class="jx-field"><span>한국교총 유튜브 구독 아이디 <em>당첨 확률 UP</em></span><input id="jxYt" maxlength="60" autocapitalize="off" spellcheck="false" placeholder="교총 유튜브를 구독한 내 채널명 (@핸들)"></label>
      <p class="jx-help">SNS 팔로우와 유튜브 구독이 확인되면 추첨 기회가 1회씩 늘어나 당첨 확률이 높아집니다 (최대 3회). 입력한 정보는 공개되지 않고 경품 추첨과 발송에만 쓰입니다.</p>
    </div>
    <div class="jx-cons">
      <label class="jx-check"><input type="checkbox" id="jxC1"><span><b>[필수]</b> 닉네임 · 응원 메시지가 아트월에 공개되는 것에 동의합니다.</span></label>
      <label class="jx-check"><input type="checkbox" id="jxC3"><span><b>[선택]</b> 경품 추첨에 응모하며, 위에 적은 휴대전화 번호 · SNS · 유튜브 아이디를 추첨과 경품 발송에만 쓰는 것에 동의합니다. (이벤트 종료 후 파기)</span></label>
    </div>
    <div class="jx-row"><button class="jx-btn jx-ghost" type="button" data-go="2">이전</button><button class="jx-btn jx-main" type="button" id="jxSend" disabled>응원 보내기 ✦</button></div>
    <p class="jx-err" id="jxErr" role="alert" hidden></p>
    <p class="jx-small">보내 주신 응원은 검수 후 아트월에 공개됩니다. 개인정보나 부적절한 표현이 담긴 응원은 공개되지 않을 수 있습니다.</p>
  </section>
</div>`;
    document.body.appendChild(dlg);
    $('.jx-x').onclick = () => dlg.close();
    // 바깥(배경)을 눌렀다 뗄 때만 닫기 — 글자 선택 드래그로 닫히지 않게
    let downOnBackdrop = false;
    dlg.addEventListener('mousedown', e => { downOnBackdrop = e.target === dlg; });
    dlg.addEventListener('click', e => { if (e.target === dlg && downOnBackdrop) dlg.close(); downOnBackdrop = false; });
    dlg.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(+b.dataset.go));
    $('.jx-cards').addEventListener('click', e => {
      const b = e.target.closest('.jx-pick'); if (!b) return;
      state.card = +b.dataset.card; mark(); go(2);
    });
    $('.jx-chips').addEventListener('click', e => {
      if (e.target.tagName !== 'BUTTON') return;
      state.msg = e.target.textContent; renderPreview(); validate();
    });
    $('#jxNick').addEventListener('input', () => { state.nick = $('#jxNick').value.replace(/\s+/g, ' ').trimStart(); renderMini(); validate(); });
    $('.jx-nicks').addEventListener('click', e => {
      if (e.target.tagName !== 'BUTTON') return;
      $('#jxNick').value = state.nick = e.target.textContent; renderMini(); validate();
    });
    // 휴대전화: 숫자만 받아 010-0000-0000 꼴로
    $('#jxPhone').addEventListener('input', () => {
      const d = $('#jxPhone').value.replace(/\D/g, '').slice(0, 11);
      $('#jxPhone').value = d.length <= 3 ? d : d.length <= 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : d.length <= 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
      validate();
    });
    ['#jxSns', '#jxYt'].forEach(id => $(id).addEventListener('input', validate));
    ['#jxC1', '#jxC3'].forEach(id => $(id).addEventListener('change', validate));
    $('#jxTo3').onclick = () => go(3);
    $('#jxSend').onclick = send;
  }
  function mark() {
    dlg.querySelectorAll('.jx-pick').forEach(b => b.classList.toggle('on', +b.dataset.card === state.card));
  }
  const draft = () => ({ card: state.card, msg: state.msg, nick: state.nick.trim() });
  function renderPreview() {
    const box = $('#jxPrev'); box.innerHTML = '';
    const el = cardEl(draft(), { editable: true });
    box.appendChild(el);
    const t = el.querySelector('.mc-t');
    const sync = () => {
      let v = t.innerText.replace(/\n{3,}/g, '\n\n');
      if (v.length > MAX) { v = v.slice(0, MAX); t.textContent = v; placeCaret(t); }
      state.msg = v.trim() ? v : '';
      t.className = 'mc-t ' + sizeClass(v.length);
      $('#jxLen').textContent = v.length; validate();
    };
    // 한글 조합 중에는 글자 수를 자르지 않음 (조합이 끝난 뒤 정리)
    t.addEventListener('input', e => { if (e.isComposing) { $('#jxLen').textContent = t.innerText.length; return; } sync(); });
    t.addEventListener('compositionend', sync);
    t.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text')); });
    $('#jxLen').textContent = state.msg.length;
    return t;
  }
  function placeCaret(el) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function renderMini() { const m = $('#jxMini'); m.innerHTML = ''; m.appendChild(cardEl(draft())); }
  // 입력 검사: 닉네임 2~12자 · 나쁜 말 없음, 메시지 나쁜 말 없음, 경품 칸을 채웠으면 응모 동의 필요
  const phoneDigits = () => $('#jxPhone').value.replace(/\D/g, '');
  const prizeFilled = () => !!(phoneDigits() || $('#jxSns').value.trim() || $('#jxYt').value.trim());
  function validate() {
    const msgBad = global.KFTA.badWord(state.msg, false);
    $('#jxMsgWarn').hidden = !msgBad;
    $('#jxTo3').disabled = state.msg.trim().length < 2 || msgBad;
    const nick = state.nick.trim(), nickBad = global.KFTA.badWord(nick, true);
    const help = $('#jxNickHelp');
    help.classList.toggle('bad', nickBad);
    help.textContent = nickBad ? '이 닉네임은 쓸 수 없어요. 다른 닉네임을 적어 주세요.' : '욕설이나 나쁜 의미가 담긴 닉네임은 쓸 수 없어요.';
    const phoneOk = !phoneDigits() || /^01[016789]\d{7,8}$/.test(phoneDigits());
    $('#jxPhone').classList.toggle('bad', !phoneOk);
    const needConsent = prizeFilled() && !$('#jxC3').checked;
    $('#jxC3').closest('.jx-check').classList.toggle('need', needConsent);
    $('#jxSend').disabled = !(nick.length >= 2 && !nickBad && phoneOk && !needConsent && $('#jxC1').checked && state.msg.trim().length >= 2 && !msgBad);
  }
  function go(n) {
    dlg.querySelectorAll('[data-s]').forEach(s => s.hidden = +s.dataset.s !== n);
    dlg.querySelectorAll('.jx-prog i').forEach((i, k) => i.classList.toggle('on', k < n));
    if (n === 2) { const t = renderPreview(); t.focus(); placeCaret(t); }   // 탭한 순간 바로 포커스 → 휴대전화 키보드가 열림
    if (n === 3) renderMini();
    validate();
  }
  async function send() {
    const btn = $('#jxSend'), err = $('#jxErr');
    btn.disabled = true; btn.textContent = '보내는 중…'; err.hidden = true;
    try {
      const prize = $('#jxC3').checked, sns = $('#jxSns').value.trim(), youtube = $('#jxYt').value.trim(), phone = phoneDigits();
      const p = await Store.add({ card: state.card, msg: state.msg.trim().replace(/[ \t]+/g, ' '), nick: state.nick.trim(), phone: prize ? phone : '', sns: prize ? sns : '', youtube: prize ? youtube : '', prize });
      const from = $('#jxPrev .mcard') || $('#jxMini .mcard');
      dlg.close();
      if (onDoneCb) onDoneCb(p, { prize, sns: prize && !!sns, youtube: prize && !!youtube, from });
    } catch (e) {
      err.textContent = global.KFTA.errorText(e); err.hidden = false;
      err.scrollIntoView({ block: 'nearest' });
    } finally {
      btn.textContent = '응원 보내기 ✦'; validate();
    }
  }
  function openJoin(opts = {}) {
    if (!dlg) build();
    onDoneCb = opts.onDone || null;
    state = { card: 0, msg: '', nick: '' };
    ['#jxNick', '#jxPhone', '#jxSns', '#jxYt'].forEach(id => $(id).value = ''); ['#jxC1', '#jxC3'].forEach(id => $(id).checked = false);
    $('#jxErr').hidden = true;
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

  Object.assign(global.KFTA, { cardEl, drawCard, cardsReady: ready, openJoin, sendAway, signOf });
})(window);
