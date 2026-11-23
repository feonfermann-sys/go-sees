/* Alternative ways to explore the story. app.js hands over a small toolkit (G) and calls ALT.mount(mode, G, n).
   Modes: minimal, mac, site. "stage" is the original and lives in app.js.
   Everything is drawn from content.json, so text edits and cards keep working in every mode. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const ALT = window.ALT = { cur: null, modes: [['stage', 'Stage'], ['minimal', 'Minimal'], ['book', 'Book'], ['mac', 'Mac']] };
  ALT.destroy = () => { if (ALT.cur && ALT.cur.destroy) ALT.cur.destroy(); ALT.cur = null; ['minimal', 'mac', 'site', 'editorial', 'book'].forEach(m => document.body.classList.remove('x-' + m)); };
  ALT.mount = (mode, G, n) => { ALT.destroy(); document.body.classList.add('x-' + mode); ALT.cur = ALT[mode](G, n) || {}; };

  /* ---------- shared: what every mode needs to know about a chapter ---------- */
  function Kit(G) {
    const { C, esc, strip, rich, src, galCap } = G;
    const N = C.book.length, P = i => C.book[i];
    const FB = { thesis: 'g10', view: 'g16' };
    const SHORT = { hero: 'The doorway', dilemma: 'Two definitions', thesis: 'The dilemma', ia: 'Teller does not choose', ib: 'Pure personality', ic: 'The norms of beauty', iia: 'The door is his', iib: 'Before the door', iic: 'The cost around the picture', view: 'My view', conclusion: 'Conclusion' };
    const GROUPS = [{ id: 'open', name: 'Opening', idx: [0, 1, 2] }, { id: 'adm', name: 'I. Admittedly', idx: [3, 4, 5] }, { id: 'how', name: 'II. However', idx: [6, 7, 8] }, { id: 'end', name: 'Conclusion', idx: [9, 10] }];
    const K = {
      N, P, GROUPS,
      photo: i => P(i).photo || FB[P(i).id] || 'g03',
      cap: i => P(i).caption || galCap[K.photo(i)] || '',
      label: i => SHORT[P(i).id] || strip(P(i).lead || P(i).kicker).slice(0, 40),
      group: i => GROUPS.find(g => g.idx.includes(i)),
      letter: i => { const g = K.group(i); return g.id === 'adm' || g.id === 'how' ? 'ABC'[g.idx.indexOf(i)] : String(i + 1).padStart(2, '0'); },
      head(i, tag = 'h2', cls = '') {
        const p = P(i);
        if (p.id === 'hero') return { title: `<${tag} class="${cls}" data-path="site.title">${esc(C.site.title)}</${tag}>`, lede: `<p class="x-lede" data-path="book.${i}.lead" data-rich="1">${rich(p.lead)}</p>`, plain: strip(C.site.title) };
        if (!p.lead) return { title: `<${tag} class="${cls}">${esc(p.id === 'dilemma' ? 'Two definitions' : p.kicker)}</${tag}>`, lede: '', plain: p.kicker };
        return { title: `<${tag} class="${cls}" data-path="book.${i}.lead" data-rich="1">${rich(p.lead)}</${tag}>`, lede: '', plain: strip(p.lead) };
      },
      extras(i, o) {
        const p = P(i); let h = '';
        if (p.defs) h += `<dl class="x-defs">${p.defs.map((d, k) => `<div><dt data-path="book.${i}.defs.${k}.w">${esc(d.w)}</dt><dd data-path="book.${i}.defs.${k}.t" data-rich="1">${rich(d.t)}</dd></div>`).join('')}</dl>`;
        if (p.leftLead) {
          const col = (lead, items, gt, side) => `<div class="x-col"><h3 data-path="book.${i}.${side}Lead">${esc(lead)}</h3><ol>${items.map((t, k) => `<li><a data-xgo="${gt[k]}"><i>0${k + 1}</i><span data-path="book.${i}.${side}Items.${k}">${esc(t)}</span></a></li>`).join('')}</ol></div>`;
          h += `<div class="x-two">${col(p.leftLead, p.leftItems, p.leftGoto, 'left')}${col(p.rightLead, p.rightItems, p.rightGoto, 'right')}</div>`;
        }
        if (p.facts) h += `<ol class="x-facts">${p.facts.map((t, k) => `<li><i>0${k + 1}</i><span data-path="book.${i}.facts.${k}" data-rich="1">${rich(t)}</span></li>`).join('')}</ol>`;
        if (p.id === 'hero') h += `<div class="x-count"><b data-countx="${p.count}">0</b><span>${rich(p.countLabel || '')}</span></div>`;
        const q = p.id !== 'dilemma' && p.quote && C.cards[p.quote]; if (q) h += `<blockquote class="x-bq">${esc(q.text)}<cite>${esc(q.cite || '')}</cite></blockquote>`;
        if (p.body) h += `<p class="x-body" data-path="book.${i}.body" data-rich="1">${rich(p.body)}</p>`;
        if (p.clip && C.cards[p.clip] && !(o && o.noClip)) h += `<div class="x-clip">${G.clipHTML(p.clip)}</div>`;
        return h;
      },
      /* every voice and source the chapter points to, for the site's side column */
      refs(i) {
        const p = P(i), txt = [p.lead, p.body, p.countLabel, ...(p.facts || []), ...(p.defs || []).map(d => d.t)].join(' '), out = [], seen = {};
        const re = /\{\{([vsi]):([\w-]+)\|([^}]*)\}\}/g; let m;
        while ((m = re.exec(txt))) if (!seen[m[2]] && C.cards[m[2]] && C.cards[m[2]].kind !== 'image') { seen[m[2]] = 1; out.push({ k: m[1], id: m[2], t: m[3] }); }
        return out;
      },
      countUp(root) {
        $$('[data-countx]', root).forEach(el => {
          const to = Number(el.dataset.countx) || 0, t0 = performance.now(); clearInterval(el.__iv);
          el.__iv = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / 1600); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k >= 1) clearInterval(el.__iv); }, 32);
        });
      }
    };
    return K;
  }

  /* one gesture = one step: wheel, keys, swipe */
  function stepper(G, fn) {
    let acc = 0, t = 0, lock = false, ty = null;
    const hold = ms => { lock = true; setTimeout(() => { lock = false; }, ms); };
    const scrollable = el => { for (let n = el; n && n !== document.body; n = n.parentElement) if (n.classList && n.classList.contains('x-scroll') && n.scrollHeight > n.clientHeight + 4) return true; return false; };
    const wheel = e => {
      if (e.target.closest && (e.target.closest('#card') || scrollable(e.target))) return;
      e.preventDefault(); const now = performance.now(); if (now - t > 220) acc = 0; t = now; acc += e.deltaY || e.deltaX;
      if (!lock && Math.abs(acc) > 40) { const d = acc > 0 ? 1 : -1; acc = 0; hold(900); fn(d); }
    };
    const key = e => {
      if (G.isEditing() || e.target.closest('input,textarea,[contenteditable=true]')) return;
      const nx = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key), pv = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key);
      if ((nx || pv) && !lock) { e.preventDefault(); hold(700); fn(nx ? 1 : -1); }
    };
    const ts = e => { ty = e.touches[0].clientY; }, te = e => { if (ty == null) return; const dy = ty - e.changedTouches[0].clientY; ty = null; if (Math.abs(dy) > 50 && !lock && !scrollable(e.target)) { hold(700); fn(dy > 0 ? 1 : -1); } };
    window.addEventListener('wheel', wheel, { passive: false }); document.addEventListener('keydown', key);
    window.addEventListener('touchstart', ts, { passive: true }); window.addEventListener('touchend', te, { passive: true });
    return () => { window.removeEventListener('wheel', wheel); document.removeEventListener('keydown', key); window.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te); };
  }

  /* =====================================================================
     1. MINIMAL — one photograph, one thought, nothing else
     ===================================================================== */
  ALT.minimal = function (G, n0) {
    const K = Kit(G), { C, esc, src } = G, N = K.N, app = $('#app');
    let cur = -1, dir = 1;
    app.innerHTML = `${G.topbar('story')}<div class="xm">
      <nav class="xm-rail">${C.book.map((_, i) => `<button type="button" data-i="${i}"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(K.label(i))}</span></button>`).join('')}</nav>
      <div class="xm-stage" id="xmStage"></div>
      <div class="xm-bar"><button class="xm-arrow" type="button" data-d="-1" aria-label="Previous">←</button><span class="mono" id="xmCnt"></span><button class="xm-arrow" type="button" data-d="1" aria-label="Next">→</button></div>
      <div class="xm-line"><i id="xmLine"></i></div>
      <aside class="card" id="card" hidden></aside></div>`;
    const stage = $('#xmStage');
    const page = i => {
      const p = K.P(i), h = K.head(i, 'h2', 'xm-h' + (K.head(i).plain.length > 60 ? ' long' : ''));
      const end = i === N - 1 ? `<a class="xm-cta" href="#/essay">Read the full essay →</a>` : '';
      return `<section class="xm-pg"><figure class="xm-fig"><div class="xm-img"><img src="${src(K.photo(i))}" alt=""></div><figcaption class="mono">${esc(K.cap(i))} · Juergen Teller</figcaption></figure>
        <div class="xm-tx x-scroll"><div class="mono xm-k" style="--r:0">${esc(p.kicker)}</div><div style="--r:1" class="rise">${h.title}</div>${h.lede ? `<div style="--r:2" class="rise">${h.lede}</div>` : ''}<div class="xm-ex rise" style="--r:3">${K.extras(i)}${end}</div></div></section>`;
    };
    function show(i, d) {
      i = Math.max(0, Math.min(N - 1, i)); if (i === cur) return;
      const old = $('.xm-pg.in', stage); dir = d || (i > cur ? 1 : -1);
      if (old) { old.classList.remove('in'); old.classList.add('out'); G.stopClips(old); setTimeout(() => old.remove(), 700); }
      stage.insertAdjacentHTML('beforeend', page(i)); const el = stage.lastElementChild; el.dataset.dir = dir; void el.offsetWidth; el.classList.add('in');
      cur = i; G.setEditable(); K.countUp(el); setTimeout(() => { if (cur === i) G.startClips(el); }, 800);
      $$('.xm-rail button').forEach(b => b.classList.toggle('on', Number(b.dataset.i) === i));
      $('#xmCnt').textContent = `${String(i + 1).padStart(2, '0')} / ${N}`; $('#xmLine').style.width = ((i + 1) / N * 100) + '%'; G.setHash(i + 1);
    }
    const stop = stepper(G, d => { if (cur + d >= N) { G.go('#/essay'); return; } show(cur + d, d); });
    const click = e => {
      const b = e.target.closest('.xm-rail button'); if (b) { show(Number(b.dataset.i)); return; }
      const a = e.target.closest('.xm-arrow'); if (a) { const d = Number(a.dataset.d); if (cur + d >= 0 && cur + d < N) show(cur + d, d); return; }
      const g = e.target.closest('[data-xgo]'); if (g && !G.isEditing()) { e.preventDefault(); show(Number(g.dataset.xgo) - 1); }
    };
    const move = e => { stage.style.setProperty('--mx', ((e.clientX / innerWidth) - .5).toFixed(3)); stage.style.setProperty('--my', ((e.clientY / innerHeight) - .5).toFixed(3)); };
    app.addEventListener('click', click); window.addEventListener('mousemove', move);
    show(n0 - 1, 1);
    return { goto: n => show(n - 1), destroy() { stop(); window.removeEventListener('mousemove', move); G.stopClips(stage); } };
  };


  /* =====================================================================
     EDITORIAL — an old printed book, open on a table: two pages, a gutter, serif type, folios
     ===================================================================== */
  ALT.editorial = function (G, n0) {
    const K = Kit(G), { C, esc, src } = G, N = K.N, app = $('#app');
    let cur = -1; document.body.classList.add('ondark');
    app.innerHTML = `${G.topbar('story')}<div class="ed">
      <svg width="0" height="0" style="position:absolute"><filter id="deckle" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="3" seed="4" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="7"/></filter></svg>
      <nav class="xm-rail">${C.book.map((_, i) => `<button type="button" data-i="${i}"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(K.label(i))}</span></button>`).join('')}</nav>
      <div class="bk" id="bk"><div class="bk-paper"></div><div class="bk-stage" id="edStage"></div><div class="bk-gutter"></div><div class="bk-grain"></div><div class="bk-sweep" id="bkSweep"></div></div>
      <div class="xm-bar"><button class="xm-arrow" type="button" data-d="-1" aria-label="Previous">←</button><span class="mono" id="edCnt"></span><button class="xm-arrow" type="button" data-d="1" aria-label="Next">→</button></div>
      <div class="xm-line"><i id="edLine"></i></div>
      <aside class="card" id="card" hidden></aside></div>`;
    const stage = $('#edStage'), sweep = $('#bkSweep');
    const page = i => {
      const p = K.P(i), h = K.head(i, 'h2', 'ed-h'), side = i % 2 ? 'b' : 'a';
      const end = i === N - 1 ? `<a class="xm-cta" href="#/essay">Read the full essay →</a>` : '';
      const pad = n => String(n).padStart(2, '0');
      return `<section class="ed-pg ed-${side}">
        <figure class="ed-ph"><img src="${src(K.photo(i))}" alt=""><figcaption><i>Fig. ${i + 1}.</i> ${esc(K.cap(i))}. Juergen Teller.</figcaption></figure>
        <div class="ed-vert mono">${esc(p.kicker)}</div>
        <div class="ed-k mono">${esc(p.kicker)}</div>
        <div class="ed-hh">${h.title}</div>
        <div class="ed-tx x-scroll">${h.lede}${K.extras(i)}${end}</div>
        <div class="ed-fl l"><b>${pad(i * 2 + 2)}</b><span>Juergen’s girls.</span></div>
        <div class="ed-fl r"><span>Go-Sees, 1998–99</span><b>${pad(i * 2 + 3)}</b></div></section>`;
    };
    function show(i) {
      i = Math.max(0, Math.min(N - 1, i)); if (i === cur) return;
      const old = $('.ed-pg.in', stage), first = cur < 0;
      if (old) { old.classList.remove('in'); old.classList.add('out'); G.stopClips(old); setTimeout(() => old.remove(), 800); }
      stage.insertAdjacentHTML('beforeend', page(i)); const el = stage.lastElementChild; void el.offsetWidth; el.classList.add('in');
      if (!first) { sweep.classList.remove('go'); void sweep.offsetWidth; sweep.classList.add('go'); }
      cur = i; G.setEditable(); K.countUp(el); setTimeout(() => { if (cur === i) G.startClips(el); }, 1000);
      $$('.xm-rail button', app).forEach(b => b.classList.toggle('on', Number(b.dataset.i) === i));
      $('#edCnt').textContent = `${String(i + 1).padStart(2, '0')} / ${N}`; $('#edLine').style.width = ((i + 1) / N * 100) + '%'; G.setHash(i + 1);
    }
    const stop = stepper(G, d => { if (cur + d >= N) { G.go('#/essay'); return; } show(cur + d); });
    const click = e => {
      const b = e.target.closest('.xm-rail button'); if (b) { show(Number(b.dataset.i)); return; }
      const ar = e.target.closest('.xm-arrow'); if (ar) { const d = Number(ar.dataset.d); if (cur + d >= 0 && cur + d < N) show(cur + d); return; }
      const g = e.target.closest('[data-xgo]'); if (g && !G.isEditing()) { e.preventDefault(); show(Number(g.dataset.xgo) - 1); }
    };
    app.addEventListener('click', click);
    show(n0 - 1);
    return { goto: n => show(n - 1), destroy() { stop(); G.stopClips(stage); document.body.classList.remove('ondark'); } };
  };

  /* =====================================================================
     BOOK — the Scalo book as an object: a closed cover that opens, spreads, full-bleed pages, turning leaves
     ===================================================================== */
  ALT.book = function (G, n0) {
    const K = Kit(G), { C, esc, strip, src, galCap } = G, N = K.N, app = $('#app');
    const pad = n => String(n).padStart(2, '0'), cap = f => galCap[f] || '';
    const LAYS = ['1', '2', '1', '2', '1', '2', '1', '3', '2', '3', '1'];
    const INTER = { 3: { k: 'pair', a: 'g04', b: 'g15' }, 5: { k: 'full', f: 'g12' }, 7: { k: 'full', f: 'g17' }, 9: { k: 'full', f: 'g21' } };
    const seq = [{ k: 'cover' }, { k: 'title' }], chIdx = [];
    for (let i = 0; i < N; i++) { if (i === 3) seq.push({ k: 'part', p: 3 }); chIdx[i] = seq.length; seq.push({ k: 'ch', i, lay: LAYS[i % LAYS.length] }); if (i === 5) seq.push({ k: 'part', p: 6 }); if (INTER[i]) seq.push(INTER[i]); }
    seq.push({ k: 'refs' });
    const last = seq.length - 1;

    /* pages: one sans (Inter Tight) and one mono for the small print */
    C.bookLayout = C.bookLayout || {};
    const LK = i => (i === 'title' ? 'title' : 'ch' + i);
    const blk = (k, side, key) => { const b = (((C.bookLayout[k] || {}).blocks) || {})[side + '.' + key]; return b ? ` style="translate:calc(var(--u) * ${b.x || 0}) calc(var(--v) * ${b.y || 0});${b.w ? `width:calc(var(--u) * ${b.w});` : ''}"` : ''; };
    const fl = (s, side) => `<div class="fl ${side}">${pad(Math.max(0, (s - 1) * 2 + (side === 'r' ? 1 : 0)))}</div>`;
    const bleed = (f, side) => `<div class="pg ph"><img src="${src(f)}" alt=""><div class="cp mono ${side}">${esc(cap(f))}</div></div>`;
    const half = (f, side) => `<div class="pg hf ${side}" style="background-image:url(${src(f)})"><div class="cp mono r">${side === 'r' ? esc(cap(f)) : ''}</div></div>`;
    const text = (i, s, side) => {
      const p = K.P(i), h = K.head(i, 'h2', 'bk-h'), b = key => blk(LK(i), side, key), fin = i === N - 1;
      if (i === 0) h.title = `<h2 class="bk-h" data-path="book.0.bookTitle">${esc(p.bookTitle || 'Intro.')}</h2>`;
      const cn = '';
      const cta = fin ? `<a class="xm-cta" href="#/essay">Read the full essay →</a>` : '';
      const clip = p.clip && C.cards[p.clip] ? `<div class="cl" data-bk="clip"${b('clip')}>${G.clipHTML(p.clip)}</div>` : '';
      return `<div class="pg tx ch${i}${fin ? ' concl' : ''}${clip ? ' hasclip' : ''}"><div class="bcol"><div class="k mono" data-bk="k"${b('k')}>${esc(p.bookKicker || p.kicker)}</div>${p.lead ? `<div class="hh" data-bk="hh"${b('hh')}>${h.title}</div>` : ''}<div class="tx x-scroll" data-bk="tx"${b('tx')}>${h.lede}${K.extras(i, { noClip: 1 })}</div>${cn}${clip}${cta}</div>${fl(s, side)}</div>`;
    };
    const SECOND = { 7: 'g19' };
    const fig2 = (i, side) => SECOND[i] ? `<figure class="f2" data-bk="fig2"${blk(LK(i), side, 'fig2')}><img src="${src(SECOND[i])}" alt=""><figcaption class="mono">${esc(cap(SECOND[i]))}</figcaption></figure>` : '';
    const offset = (i, s, side) => `<div class="pg of"><figure data-bk="fig"${blk(LK(i), side, 'fig')}><img src="${src(K.photo(i))}" alt=""><figcaption class="mono">${esc(galCap[K.photo(i)] || K.cap(i))}</figcaption></figure>${fig2(i, side)}${fl(s, side)}</div>`;
    const cover = `<div class="pg cv"><img class="cvt" src="img/cover-type.png" alt="Juergen Teller, Go-Sees"><img class="cvi" src="img/cover.jpg?v=3" alt="" onload="this.parentNode.classList.add('real')" onerror="this.remove()"></div>`;
    const endpaper = `<div class="pg ep"><div class="mono me"><span data-path="site.byline">${esc(C.site.byline || 'An interactive reading by Felix Onfermann')}</span></div><div class="mono">Scalo · Zürich · 1999<br>Photographs by Juergen Teller<br>London, May 1998 – May 1999</div></div>`;
    const TI = ['g13', 'g01', 'g08', 'g05', 'g02'];
    const title = `<div class="pg ti"><div class="mono" data-bk="k"${blk('title', 'R', 'k')} data-path="site.kicker">${esc(C.site.kicker || '')}</div><h1 data-bk="h"${blk('title', 'R', 'h')} data-path="site.title">${esc(C.site.title)}</h1><p data-bk="p"${blk('title', 'R', 'p')} data-path="site.subtitle">${esc(C.site.subtitle || '')}</p><div class="ti-ph" data-bk="imgs"${blk('title', 'R', 'imgs')}>${TI.map(f => `<img src="${src(f)}" alt="">`).join('')}</div></div>`;
    const REFS = C.essay.references || [], MID = Math.floor(REFS.length * 0.42);
    const refs = (side, s) => {
      const part = side === 'l' ? REFS.slice(0, MID) : REFS.slice(MID), off = side === 'l' ? 0 : MID;
      return `<div class="pg rf"><div class="bcol">${side === 'l' ? `<div class="k mono">References</div><div class="hh"><h2 class="bk-h">Bibliography</h2></div>` : `<div class="k mono">References, continued</div>`}<ol class="rl x-scroll" start="${off + 1}">${part.map((r, k) => `<li><span data-path="essay.references.${off + k}.text">${esc(r.text)}</span>${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">open ↗</a>` : ''}</li>`).join('')}</ol>${side === 'l' ? `<p class="disc" data-path="site.disclosure">${esc((C.site || {}).disclosure || '')}</p>` : ''}</div>${fl(s, side)}</div>`;
    };
    /* the two argument pages (definitions, the dilemma) are set quietly, like the reference spreads */
    const qInner = (i, side) => {
      const p = K.P(i), h = K.head(i, 'h2', 'bk-h'), b = key => blk(LK(i), side, key);
      return `<div class="k" data-bk="k"${b('k')}>${esc(p.kicker)}</div>${p.lead ? `<div class="hh" data-bk="hh"${b('hh')}>${h.title}</div>` : ''}<div class="tx x-scroll" data-bk="tx"${b('tx')}>${h.lede}${K.extras(i, { noClip: 1 })}</div>`;
    };
    const qText = (i, s, side) => `<div class="pg tx q ch${i}"><div class="bcol">${qInner(i, side)}</div>${fl(s, side)}</div>`;
    const qFig = (i, side) => `<figure data-bk="fig"${blk(LK(i), side, 'fig')}><img src="${src(K.photo(i))}" alt=""><figcaption>${esc(galCap[K.photo(i)] || K.cap(i))}</figcaption></figure>`;
    const qOffset = (i, s, side) => `<div class="pg of q">${qFig(i, side)}${fl(s, side)}</div>`;
    const qTitle = (i, s, side) => `<div class="pg tt q"><div class="k" data-bk="k"${blk(LK(i), side, 'k')}>${esc(K.P(i).kicker)}</div>${fl(s, side)}</div>`;
    const qBoth = (i, s, side) => `<div class="pg tx tp q ch${i}"><div class="row"><div class="bcol">${qInner(i, side)}</div>${qFig(i, side)}</div>${fl(s, side)}</div>`;
    /* definitions: a centred pair on one page, the argument on the facing page */
    const dPair = (s, side) => { const p = K.P(1), b = k => blk(LK(1), side, k); return `<div class="pg tt dp q"><div class="dw"><div class="k" data-bk="k"${b('k')}>${esc(p.kicker)}</div><p class="di" data-bk="di"${b('di')} data-path="book.1.defsIntro">${esc(p.defsIntro || '')}</p><div class="dpair" data-bk="dd"${b('dd')}>${p.defs.map((d, k) => `<div><h3 data-path="book.1.defs.${k}.w">${esc(d.w)}</h3><p data-path="book.1.defs.${k}.t" data-rich="1">${G.rich(d.t)}</p></div>`).join('<i>versus</i>')}</div><p class="di" data-bk="do"${b('do')} data-path="book.1.defsOutro">${esc(p.defsOutro || '')}</p></div>${fl(s, side)}</div>`; };
    const dBody = (s, side) => `<div class="pg q ch1 dr"><div class="drw"><figure data-bk="fig"${blk(LK(1), side, 'fig')}><img src="${src(K.photo(1))}" alt=""><figcaption>${esc(galCap[K.photo(1)] || K.cap(1))}</figcaption></figure><p class="x-body" data-bk="tx"${blk(LK(1), side, 'tx')} data-path="book.1.body" data-rich="1">${G.rich(K.P(1).body)}</p></div>${fl(s, side)}</div>`;
    const tText = (s, side) => { const p = K.P(2), b = k => blk(LK(2), side, k); return `<div class="pg tx q ch2 tq"><div class="bcol"><div class="k" data-bk="k"${b('k')}>${esc(p.kicker)}</div><div class="hh" data-bk="hh"${b('hh')}><h2 class="bk-h" data-path="book.2.lead">${esc(p.lead)}</h2></div><div class="tx" data-bk="tx"${b('tx')}>${K.extras(2, { noClip: 1 })}</div></div>${fl(s, side)}</div>`; };
    /* definitions: just the title and the two definitions, low on the left page */
    const dLeft = (s, side) => { const p = K.P(1), b = k => blk(LK(1), side, k); return `<div class="pg dl q"><div class="k" data-bk="k"${b('k')}>${esc(p.kicker)}</div><div class="dls" data-bk="dd"${b('dd')}>${p.defs.map((d, k) => `<div><h3 data-path="book.1.defs.${k}.w">${esc(d.w)}</h3><p data-path="book.1.defs.${k}.t" data-rich="1">${G.rich(d.t)}</p></div>`).join('')}</div>${fl(s, side)}</div>`; };
    /* the dilemma: one photograph across both pages, the question set on it */
    const tHalf = (s, side) => { const p = K.P(2), f = 'g03', b = k => blk(LK(2), side, k); return `<div class="pg hf ${side} tq2" style="background-image:url(${src(f)})"><div class="tqt ${side}" data-bk="tq"${b('tq')}${side === 'l' ? ' aria-hidden="true"' : ''}><div class="k"${side === 'r' ? ' data-path="book.2.kicker"' : ''}>${esc(p.kicker)}</div><p class="lg"${side === 'r' ? ' data-path="book.2.long" data-rich="1"' : ''}>${G.rich(p.long || '')}</p></div>${side === 'l' ? `<div class="cp mono l">${esc(cap(f))}</div>` : ''}</div>`; };
    function pagesOf(s) {
      const x = seq[s];
      if (x.k === 'cover') return { L: null, R: cover };
      if (x.k === 'title') return { L: endpaper, R: title };
      if (x.k === 'full') return { L: half(x.f, 'l'), R: half(x.f, 'r') };
      if (x.k === 'pair') return { L: bleed(x.a, 'l'), R: bleed(x.b, 'r') };
      if (x.k === 'part') { const pt = (C.book[x.p] || {}).part || {}, pp = `book.${x.p}.part`; return { L: `<div class="pg pt pn0"><div class="ptw"><div class="pbig" data-path="${pp}.n">${esc(pt.n || '')}</div></div>${fl(s, 'l')}</div>`, R: `<div class="pg pt"><div class="ptw"><div class="pn">Part <span data-path="${pp}.n">${esc(pt.n || '')}</span></div><h2 class="pk" data-path="${pp}.title">${esc(pt.title || '')}</h2><p class="pl" data-path="${pp}.line">${esc(pt.line || '')}</p></div>${fl(s, 'r')}</div>` }; }
      if (x.k === 'refs') return { L: refs('l', s), R: refs('r', s) };
      const own = (C.bookLayout[LK(x.i)] || {}).lay;
      if (x.i === 1 && (!own || own === '2')) return { L: dLeft(s, 'l'), R: dBody(s, 'r') };
      if (x.i === 2 && !own) return { L: tHalf(s, 'l'), R: tHalf(s, 'r') };
      if (false) return x.i === 1 ? { L: qOffset(1, s, 'l'), R: qText(1, s, 'r') } : { L: qTitle(2, s, 'l'), R: qBoth(2, s, 'r') };
      const f = K.photo(x.i), lay = (C.bookLayout[LK(x.i)] || {}).lay || x.lay;
      if (lay === '4') return { L: offset(x.i, s, 'l'), R: text(x.i, s, 'r') };
      if (lay === '1') return { L: text(x.i, s, 'l'), R: bleed(f, 'r') };
      if (lay === '2') return { L: bleed(f, 'l'), R: text(x.i, s, 'r') };
      return { L: text(x.i, s, 'l'), R: offset(x.i, s, 'r') };
    }

    app.innerHTML = `${G.topbar('story')}<div class="bw shut" id="bw">
      <nav class="xm-rail">${C.book.map((_, i) => `<button type="button" data-i="${i}"><i>${pad(i + 1)}</i><span>${esc(K.label(i))}</span></button>`).join('')}</nav>
      <div class="bkx closed" id="bkx"><div class="sl l empty" id="bL"></div><div class="sl r" id="bR"></div></div>
      <div class="bk-hint mono" id="bkHint">Click the cover, scroll or press → to open</div>
      <div class="xm-bar"><button class="xm-arrow" type="button" data-d="-1" aria-label="Previous">←</button><span class="mono" id="bkCnt"></span><button class="xm-arrow" type="button" data-d="1" aria-label="Next">→</button></div>
      <div class="xm-line"><i id="bkLine"></i></div>
      <aside class="card" id="card" hidden></aside></div>`;
    const bw = $('#bw'), bkx = $('#bkx'), bL = $('#bL'), bR = $('#bR');
    let s = -1, turning = false;
    /* phones: the spread is laid out at full size and scaled down; press and hold to read it through a lens */
    const phone = matchMedia('(max-width:700px)').matches;
    let lens = null, lensStop = () => {};
    if (phone) {
      bw.classList.add('ph');
      const fit = () => { const sc = Math.min(innerWidth * .97 / 1000, (innerHeight - 190) / 667); bw.style.setProperty('--sc', sc); bw.style.setProperty('--scc', Math.min(sc * 1.75, innerWidth * .8 / 500, (innerHeight - 190) / 667)); };
      fit(); window.addEventListener('resize', fit);
      lens = document.createElement('div'); lens.className = 'bk-lens'; lens.hidden = true; lens.innerHTML = '<div class="lin"></div>'; bw.appendChild(lens);
      const ph = document.createElement('div'); ph.className = 'bk-phint mono'; ph.textContent = 'Hold to magnify · swipe up for the next page'; bw.appendChild(ph);
      const inner = lens.firstChild, R = 100, MAG = 3.2; let on = false, timer = null, sx = 0, sy = 0, ate = false;
      const upd = (cx, cy) => {
        const r = bkx.getBoundingClientRect(), sc = r.width / bkx.offsetWidth, px = (cx - r.left) / sc, py = (cy - r.top) / sc, Sl = sc * MAG;
        const lx = Math.max(R + 6, Math.min(innerWidth - R - 6, cx)), ly = Math.max(R + 70, cy - R - 44);
        lens.style.left = (lx - R) + 'px'; lens.style.top = (ly - R) + 'px';
        inner.style.transform = `translate(${R - px * Sl}px,${R - py * Sl}px) scale(${Sl})`;
      };
      const begin = (cx, cy) => {
        if (bkx.classList.contains('closed') || turning) return;
        inner.innerHTML = ''; const cl = bkx.cloneNode(true);
        cl.removeAttribute('id'); cl.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
        cl.querySelectorAll('iframe,video,.x-clip').forEach(e => e.remove());
        cl.querySelectorAll('.pre').forEach(e => e.classList.remove('pre'));
        cl.className = 'bkx lensclone'; cl.style.cssText = `position:absolute;left:0;top:0;margin:0;transition:none;transform:none;perspective:none;width:${bkx.offsetWidth}px;height:${bkx.offsetHeight}px;pointer-events:none`;
        inner.appendChild(cl); on = true; ate = true; lens.hidden = false; upd(cx, cy);
      };
      let t0 = 0, touching = 0;
      const hide = () => { clearTimeout(timer); if (on) { on = false; lens.hidden = true; inner.innerHTML = ''; } };
      const ts = e => { if (e.touches.length !== 1 || e.target.closest('button,a,.xm-bar,.card')) { hide(); return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = performance.now(); clearTimeout(timer); timer = setTimeout(() => begin(sx, sy), 300); };
      const tm = e => { const t = e.touches[0]; if (!t) { hide(); return; } if (on) { e.preventDefault(); upd(t.clientX, t.clientY); } else if (Math.hypot(t.clientX - sx, t.clientY - sy) > 14) clearTimeout(timer); };
      /* one place decides what a lift of the finger means: close the lens, or, after a quick sideways swipe, turn the page */
      const te = e => {
        touching = e.touches ? e.touches.length : 0;
        const was = on, ct = e.changedTouches && e.changedTouches[0];
        clearTimeout(timer); hide();
        if (was) { e.stopImmediatePropagation(); return; }
        if (ct && performance.now() - t0 < 700 && !(e.target.closest && e.target.closest('button,a,.xm-bar,.card'))) {
          const dx = ct.clientX - sx, dy = ct.clientY - sy;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
        }
      };
      const count = e => { touching = e.touches.length; };
      bw.addEventListener('touchstart', ts, { passive: true }); bw.addEventListener('touchmove', tm, { passive: false });
      window.addEventListener('touchstart', count, true); window.addEventListener('touchend', te, true); window.addEventListener('touchcancel', te, true);
      const beat = setInterval(() => { if (on && touching === 0) hide(); }, 300);
      document.addEventListener('visibilitychange', hide);
      const blurArrow = e => { const a = e.target.closest && e.target.closest('.xm-arrow'); if (a) a.blur(); };
      bw.addEventListener('click', blurArrow);
      lensStop = () => { window.removeEventListener('touchstart', count, true); window.removeEventListener('touchend', te, true); window.removeEventListener('touchcancel', te, true); window.removeEventListener('resize', fit); document.removeEventListener('visibilitychange', hide); clearInterval(beat); };
    }
    const put = (el, html) => { el.innerHTML = html || ''; el.classList.toggle('empty', !html); };
    const face = (k, html) => `<div class="fc ${k}">${html || ''}</div>`;
    const popIn = () => [bL, bR].forEach(e => { e.classList.remove('pre', 'pop'); void e.offsetWidth; e.classList.add('pop'); });
    function finish() {
      popIn();
      const x = seq[s]; let ch = -1; for (let k = s; k >= 0 && ch < 0; k--) if (seq[k].k === 'ch') ch = seq[k].i;
      if (x.k === 'ch') ch = x.i;
      $$('.xm-rail button', app).forEach(b => b.classList.toggle('on', Number(b.dataset.i) === ch && s > 1));
      $('#bkCnt').textContent = s === 0 ? 'Cover' : s === 1 ? 'Title' : x.k === 'ch' ? `${pad(x.i + 1)} / ${N}` : x.k === 'refs' ? 'Bibliography' : `${pad(ch + 1)} / ${N} ·`;
      $('#bkLine').style.width = (s / last * 100) + '%'; bw.classList.toggle('shut', s === 0);
      G.setHash(Math.max(1, ch + 1)); G.setEditable(); K.countUp(bkx); if (typeof refreshPanel === 'function') refreshPanel();
      G.stopClips(bkx); setTimeout(() => { if (!turning) G.startClips(bkx); }, 400);
    }
    function go(to, instant) {
      to = Math.max(0, Math.min(last, to)); if (to === s || turning) return;
      const np = pagesOf(to);
      if (s < 0 || instant) { put(bL, np.L); put(bR, np.R); bkx.classList.toggle('closed', to === 0); s = to; finish(); return; }
      const op = pagesOf(s), fwd = to > s, dur = (s === 0 || to === 0) ? 1400 : 1100; turning = true; G.stopClips(bkx);
      const leaf = document.createElement('div'); leaf.className = 'leaf';
      bL.classList.remove('pop'); bR.classList.remove('pop'); (fwd ? bR : bL).classList.add('pre');
      if (fwd) { put(bR, np.R); leaf.innerHTML = face('f', op.R) + face('b', np.L); leaf.style.transform = 'rotateY(0deg)'; }
      else { put(bL, np.L); leaf.innerHTML = face('f', np.R) + face('b', op.L); leaf.style.transform = 'rotateY(-180deg)'; }
      $$('.fc.f [data-countx]', leaf).forEach(e => { e.textContent = e.dataset.countx; }); /* the page that is leaving keeps its full number */
      bkx.appendChild(leaf); bkx.classList.toggle('closed', to === 0); void leaf.offsetWidth;
      leaf.style.transition = `transform ${dur}ms cubic-bezier(.55,.05,.25,1)`; leaf.classList.add('turning'); leaf.style.setProperty('--d', dur + 'ms');
      leaf.style.transform = fwd ? 'rotateY(-180deg)' : 'rotateY(0deg)';
      setTimeout(() => { put(bL, np.L); put(bR, np.R); leaf.remove(); turning = false; s = to; finish(); }, dur + 40);
    }
    /* the end of the book: instead of cutting to the essay, fade in a quiet question */
    const endEl = document.createElement('div'); endEl.className = 'bk-end'; endEl.hidden = true;
    endEl.innerHTML = `<div class="be-in"><div class="mono be-k">End of the book</div><h2>Keep reading?</h2><div class="be-btns"><a class="be-go" href="#/essay">Read the full essay →</a><button type="button" data-be="back">Back to the book</button><button type="button" data-be="again">Start again</button></div></div>`;
    bw.appendChild(endEl);
    let endOpen = false;
    const showEnd = () => { endOpen = true; endEl.hidden = false; void endEl.offsetWidth; endEl.classList.add('on'); };
    const hideEnd = () => { endOpen = false; endEl.classList.remove('on'); setTimeout(() => { if (!endOpen) endEl.hidden = true; }, 600); };
    endEl.addEventListener('click', e => { const b = e.target.closest('[data-be]'); if (b) { hideEnd(); if (b.dataset.be === 'again') go(1); return; } if (e.target === endEl) hideEnd(); });
    const step = d => { if (turning) return; if (endOpen) { if (d < 0) hideEnd(); return; } if (s + d > last) { showEnd(); return; } go(s + d); };
    const stop = stepper(G, step);

    /* edit the layout of a page: choose a layout, drag blocks, drag their width. Everything saves by itself. */
    const panel = document.createElement('div'); panel.className = 'bk-panel mono'; panel.hidden = true;
    panel.innerHTML = `<span>Page layout</span><button type="button" data-lay="1">Text · photo</button><button type="button" data-lay="2">Photo · text</button><button type="button" data-lay="3">Text · small photo</button><button type="button" data-lay="4">Small photo · text</button><button type="button" data-lay="reset" class="r">Reset page</button>`;
    bw.appendChild(panel);
    const mvh = document.createElement('div'); mvh.className = 'bk-mv'; mvh.hidden = true; mvh.innerHTML = `<b data-m="move" title="Drag to move · double-click to reset">✥ move</b><b data-m="size" title="Drag to change the width">↔ width</b>`; bw.appendChild(mvh);
    let target = null, drag = null, saveT = null;
    const lkey = () => { const x = seq[s]; return x.k === 'ch' ? LK(x.i) : x.k === 'title' ? 'title' : null; };
    const entry = (k, key, make) => { const L = C.bookLayout[k] = C.bookLayout[k] || {}; L.blocks = L.blocks || {}; return make ? (L.blocks[key] = L.blocks[key] || { x: 0, y: 0 }) : L.blocks[key]; };
    const keyOfEl = el => { const sl = el.closest('.sl'); return (sl && sl.id === 'bL' ? 'L' : 'R') + '.' + el.dataset.bk; };
    const place = () => { if (!target || !G.isEditing() || turning) { mvh.hidden = true; return; } const r = target.getBoundingClientRect(); mvh.hidden = false; mvh.style.left = Math.max(4, r.left) + 'px'; mvh.style.top = Math.max(70, r.top - 22) + 'px'; };
    const refreshPanel = () => { const k = lkey(); panel.hidden = !(G.isEditing() && k && !turning); if (!panel.hidden) { const cur = (C.bookLayout[k] || {}).lay || (seq[s].k === 'ch' ? seq[s].lay : ''); $$('button[data-lay]', panel).forEach(b => b.classList.toggle('on', b.dataset.lay === cur)); panel.style.display = seq[s].k === 'ch' ? '' : 'none'; } place(); };
    const queue = () => { clearTimeout(saveT); saveT = setTimeout(() => G.queueSave(), 300); };
    function rerender() { if (turning) return; const np = pagesOf(s); put(bL, np.L); put(bR, np.R); G.setEditable(); popIn(); G.stopClips(bkx); G.startClips(bkx); K.countUp(bkx); refreshPanel(); }
    new MutationObserver(refreshPanel).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    bw.addEventListener('mouseover', e => { if (!G.isEditing() || drag) return; const el = e.target.closest && e.target.closest('.sl [data-bk]'); if (el && el !== target) { target = el; place(); } });
    panel.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const k = lkey(); if (!k) return;
      if (b.dataset.lay === 'reset') delete C.bookLayout[k]; else { C.bookLayout[k] = C.bookLayout[k] || {}; C.bookLayout[k].lay = b.dataset.lay; }
      target = null; G.queueSave(); rerender();
    });
    mvh.addEventListener('pointerdown', e => {
      const m = e.target.closest('[data-m]'); if (!m || !target) return; e.preventDefault(); mvh.setPointerCapture(e.pointerId);
      const k = lkey(), key = keyOfEl(target), bx = bkx.getBoundingClientRect(), u = bx.width / 100, v = bx.height / 100, ent = entry(k, key, true);
      drag = { m: m.dataset.m, sx: e.clientX, sy: e.clientY, k, key, u, v, x: ent.x || 0, y: ent.y || 0, w: ent.w || target.offsetWidth / u };
    });
    mvh.addEventListener('pointermove', e => {
      if (!drag) return; const ent = entry(drag.k, drag.key, true);
      if (drag.m === 'move') { ent.x = +(drag.x + (e.clientX - drag.sx) / drag.u).toFixed(2); ent.y = +(drag.y + (e.clientY - drag.sy) / drag.v).toFixed(2); target.style.translate = `calc(var(--u) * ${ent.x}) calc(var(--v) * ${ent.y})`; }
      else { ent.w = +Math.max(8, drag.w + (e.clientX - drag.sx) / drag.u).toFixed(2); target.style.width = `calc(var(--u) * ${ent.w})`; }
      place();
    });
    const dEnd = () => { if (drag) { drag = null; queue(); } };
    mvh.addEventListener('pointerup', dEnd); mvh.addEventListener('pointercancel', dEnd);
    mvh.addEventListener('dblclick', () => { if (!target) return; const k = lkey(), key = keyOfEl(target), L = C.bookLayout[k]; if (L && L.blocks) delete L.blocks[key]; target.style.translate = ''; target.style.width = ''; place(); queue(); });
    const click = e => {
      const b = e.target.closest('.xm-rail button'); if (b) { if (!turning) go(chIdx[Number(b.dataset.i)]); return; }
      const ar = e.target.closest('.xm-arrow'); if (ar) { step(Number(ar.dataset.d)); return; }
      if (e.target.closest('.pg.cv') && s === 0) { step(1); return; }
      const g = e.target.closest('[data-xgo]'); if (g && !G.isEditing()) { e.preventDefault(); if (!turning) go(chIdx[Number(g.dataset.xgo) - 1]); }
    };
    app.addEventListener('click', click);
    go(n0 > 1 ? chIdx[n0 - 1] : 0, true);
    return { goto: n => { if (!turning) go(chIdx[Math.max(1, n) - 1]); }, destroy() { stop(); lensStop(); G.stopClips(bkx); panel.remove(); mvh.remove(); endEl.remove(); } };
  };

  /* =====================================================================
     2. MAC — lock screen, desktop, folders, windows, dock
     ===================================================================== */
  ALT.mac = function (G, n0) {
    const K = Kit(G), { C, esc, strip, src } = G, N = K.N, app = $('#app');
    const coarse = matchMedia('(pointer:coarse)').matches;
    const wall = 'g01';
    const folderIcon = (idx, tint) => `<div class="mx-folder ${tint || ''}"><i class="back"></i><span class="peek">${idx.slice(0, 3).map((i, k) => `<img src="${src(K.photo(i))}" alt="" style="--k:${k}">`).join('')}</span><i class="front"></i></div>`;
    const sheetIcon = (label, rust) => `<div class="mx-sheet ${rust ? 'rust' : ''}"><b></b><b></b><b></b><b class="s"></b><em>${label}</em></div>`;
    const ITEMS = [
      ...K.GROUPS.map(g => ({ id: g.id, name: g.name, kind: 'folder', idx: g.idx })),
      { id: 'sources', name: 'Sources', kind: 'sources' },
      { id: 'essay', name: 'Full essay.pdf', kind: 'essay' }
    ];
    const iconHTML = it => it.kind === 'folder' ? folderIcon(it.idx) : it.kind === 'sources' ? folderIcon([], 'plain') : sheetIcon('ESSAY', true);
    const now = new Date(), pad = x => String(x).padStart(2, '0');
    const tm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const day = d => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const dayS = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

    app.innerHTML = `<div class="mx" id="mx">
      <div class="mx-wall" style="background-image:url(${src(wall)})"></div><div class="mx-veil"></div>
      <div class="mx-menubar"><span class="mx-logo"></span><b>Go-Sees</b><span class="m" data-menu="file">File</span><span class="m" data-menu="go">Go</span><span class="m">View</span><span class="m">Window</span><span class="m">Help</span>
        <span class="sp"></span><button type="button" class="mx-lockbtn" data-lock>Lock</button><svg class="ic" viewBox="0 0 22 14" width="20" height="13"><path d="M2 5a13 13 0 0 1 18 0M5 8a8.5 8.5 0 0 1 12 0M8 11a4 4 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><svg class="ic" viewBox="0 0 28 14" width="26" height="13"><rect x="1" y="2" width="22" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="3" y="4" width="16" height="6" rx="1.5" fill="currentColor"/><rect x="24.5" y="5" width="2" height="4" rx="1" fill="currentColor"/></svg><span id="mxClock">${dayS(now)}  ${tm(now)}</span></div>
      <div class="mx-menu" id="mxMenu" hidden></div>
      <div class="mx-desk" id="mxDesk">${ITEMS.map((it, k) => `<button type="button" class="mx-ic" data-it="${it.id}" style="--k:${k}">${iconHTML(it)}<span>${esc(it.name)}</span></button>`).join('')}</div>
      <div class="mx-hint" id="mxHint" hidden>${coarse ? 'Tap' : 'Double-click'} a folder to open it</div>
      <div class="mx-wins" id="mxWins"></div>
      <div class="mx-dockwrap"><div class="mx-dock" id="mxDock">
        <button type="button" data-dock="finder" data-tip="Go-Sees"><span class="dtile">${folderIcon(K.GROUPS[0].idx, 'mini')}</span></button>
        <button type="button" data-dock="essay" data-tip="Full essay"><span class="dtile dark">${sheetIcon('', true)}</span></button>
        <button type="button" data-dock="sources" data-tip="Sources"><span class="dtile"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 5h14v14H5z" fill="none" stroke="#121212" stroke-width="1.6"/><path d="M8.5 9.5h7M8.5 12.5h7M8.5 15.5h4" stroke="#b5402a" stroke-width="1.6" stroke-linecap="round"/></svg></span></button>
        <i class="sep"></i>
        <button type="button" data-dock="lock" data-tip="Lock screen"><span class="dtile dark"><svg viewBox="0 0 24 24" width="24" height="24"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" fill="#fff"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="#fff" stroke-width="1.7"/></svg></span></button></div></div>
      <div class="mx-lock" id="mxLock"><div class="lk-clock"><div class="lk-day" id="lkDay">${day(now)}</div><div class="lk-time" id="lkTime">${tm(now)}</div></div>
        <div class="lk-user"><div class="lk-av"><img src="${src(K.photo(3))}" alt=""></div><div class="lk-name">Juergen’s girls</div>
          <form class="lk-pw" id="lkForm" autocomplete="off"><input id="lkPw" type="password" placeholder="Enter Password" autocomplete="off" spellcheck="false"><button type="submit" aria-label="Unlock">→</button></form>
          <div class="lk-hint" id="lkHint">Password hint: the name of the door</div></div></div>
      <div class="mx-steps" id="mxSteps"><button type="button" data-tour="-1" aria-label="Previous">‹</button><span class="lab"><b id="msN">01</b><i id="msL"></i></span><button type="button" data-tour="1" aria-label="Next">›</button><button type="button" class="auto" data-auto>Auto</button></div>
      <div class="mx-cur" id="mxCur"><svg width="22" height="28" viewBox="0 0 22 28"><path d="M2 2l0 20 5.2-4.8 3.6 8.4 3.6-1.6-3.6-8.2 7.2-.2z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i></div>
      <aside class="card" id="card" hidden></aside></div>`;

    const mx = $('#mx'), desk = $('#mxDesk'), wins = $('#mxWins'), lock = $('#mxLock'), menu = $('#mxMenu');
    let z = 10, unlocked = false, pending = n0 > 1 ? n0 : 0, hinted = false;
    const reg = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const clock = setInterval(() => { const d = new Date(); $('#mxClock').textContent = `${dayS(d)}  ${tm(d)}`; $('#lkTime').textContent = tm(d); $('#lkDay').textContent = day(d); }, 15000);

    /* lock screen */
    const pw = $('#lkPw');
    let typed = false;
    pw.addEventListener('keydown', () => { typed = true; });
    setTimeout(async () => {   // the password types itself
      if (typed) return; const w = 'door';
      for (let k = 1; k <= w.length; k++) { if (typed) return; pw.value = w.slice(0, k); await sleep(260); }
      await sleep(550); if (!typed && !unlocked) $('#lkForm').requestSubmit();
    }, 1100);
    $('#lkForm').addEventListener('submit', e => {
      e.preventDefault();
      if (!pw.value.trim()) { $('.lk-pw').classList.remove('shake'); void $('.lk-pw').offsetWidth; $('.lk-pw').classList.add('shake'); $('#lkHint').textContent = 'Enter a password to continue'; return; }
      unlock();
    });
    function unlock() {
      unlocked = true; pw.blur(); mx.classList.add('on'); lock.classList.add('open'); pw.value = '';
      setTimeout(() => { lock.hidden = true; const h = $('#mxHint'); if (h) h.hidden = true; const first = pending ? pending - 1 : 0; pending = 0; setTimeout(() => { tourTo(first); }, 1500); }, 900);
    }
    function relock() { auto(false); at = -1; cur.classList.remove('show'); $('#mxSteps').classList.remove('on'); Object.keys(reg).forEach(k => closeWin(k, true)); lock.hidden = false; void lock.offsetWidth; lock.classList.remove('open'); mx.classList.remove('on'); unlocked = false; $('#lkHint').textContent = 'Password hint: the name of the door'; setTimeout(() => pw.focus(), 500); }

    /* windows */
    const dock = $('#mxDock');
    function place(w, h) { const k = Object.keys(reg).length; return { x: Math.max(8, Math.min(innerWidth - w - 8, 120 + k * 34)), y: Math.max(40, Math.min(innerHeight - h - 90, 66 + k * 30)) }; }
    function openWin(id, o) {
      if (reg[id]) { focusWin(id); return reg[id]; }
      const w = Math.min(o.w, innerWidth - 16), h = Math.min(o.h, innerHeight - 130), pos = place(w, h);
      const el = document.createElement('div'); el.className = 'mx-win'; el.dataset.id = id;
      el.style.cssText = `width:${w}px;height:${h}px;left:${pos.x}px;top:${pos.y}px;z-index:${++z}`;
      el.innerHTML = `<div class="mx-tb"><span class="lights"><i class="r" data-act="close"></i><i class="y" data-act="min"></i><i class="g" data-act="zoom"></i></span><b class="ttl">${esc(o.title)}</b><span class="tbr">${o.bar || ''}</span></div><div class="mx-body ${o.cls || ''}">${o.html}</div>`;
      wins.appendChild(el); reg[id] = el; el.__o = o;
      // grow out of the icon it was opened from
      const r = o.from && o.from.getBoundingClientRect(), f = el.getBoundingClientRect();
      if (r) { el.style.transformOrigin = '0 0'; el.style.transition = 'none'; el.style.opacity = '.0'; el.style.transform = `translate(${r.left - f.left}px,${r.top - f.top}px) scale(${Math.max(.08, r.width / f.width)},${Math.max(.08, r.height / f.height)})`; void el.offsetWidth; el.style.transition = 'transform .46s cubic-bezier(.2,.9,.25,1), opacity .25s'; el.style.opacity = '1'; el.style.transform = 'none'; setTimeout(() => { el.style.transition = ''; el.style.transformOrigin = ''; }, 520); }
      else { el.classList.add('pop'); }
      focusWin(id); G.setEditable(); o.after && o.after(el);
      return el;
    }
    function focusWin(id) { const el = reg[id]; if (!el) return; $$('.mx-win', wins).forEach(x => x.classList.toggle('front', x === el)); el.style.zIndex = ++z; }
    function closeWin(id, quick) {
      const el = reg[id]; if (!el) return; delete reg[id]; G.stopClips(el);
      if (quick) { el.remove(); return; }
      el.style.transition = 'transform .28s cubic-bezier(.4,0,.8,.4), opacity .24s'; el.style.transform = 'scale(.9) translateY(14px)'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300);
      const top = Object.keys(reg).sort((a, b) => reg[b].style.zIndex - reg[a].style.zIndex)[0]; if (top) focusWin(top);
    }
    // dragging by the title bar
    let drag = null;
    wins.addEventListener('pointerdown', e => {
      const el = e.target.closest('.mx-win'); if (!el) return; focusWin(el.dataset.id);
      const tb = e.target.closest('.mx-tb'); if (!tb || e.target.closest('[data-act],.tbr button')) return;
      if (el.classList.contains('full')) return;
      drag = { el, sx: e.clientX, sy: e.clientY, x: el.offsetLeft, y: el.offsetTop }; tb.setPointerCapture(e.pointerId); el.classList.add('moving');
    });
    wins.addEventListener('pointermove', e => { if (!drag) return; drag.el.style.left = Math.max(-200, Math.min(innerWidth - 80, drag.x + e.clientX - drag.sx)) + 'px'; drag.el.style.top = Math.max(30, Math.min(innerHeight - 60, drag.y + e.clientY - drag.sy)) + 'px'; });
    const dEnd = () => { if (drag) { drag.el.classList.remove('moving'); drag = null; } };
    wins.addEventListener('pointerup', dEnd); wins.addEventListener('pointercancel', dEnd);

    /* what goes in the windows */
    const fileGrid = idx => `<div class="mx-grid">${idx.map(i => `<button type="button" class="mx-file" data-ch="${i}"><span class="th"><img src="${src(K.photo(i))}" alt=""></span><b>${esc(K.label(i))}</b><small>${esc(K.P(i).kicker)}</small></button>`).join('')}</div>`;
    function openFolder(it, from) {
      if (it.kind === 'essay') { G.go('#/essay'); return; }
      if (it.kind === 'sources') {
        openWin('sources', { title: 'Sources', w: 560, h: 460, from, cls: 'mx-src x-scroll', html: `<p class="mx-note" data-path="sources.body">${esc((C.sources || {}).body || '')}</p><ul class="mx-refs">${C.essay.references.map((r, k) => `<li><span data-path="essay.references.${k}.text">${esc(r.text)}</span>${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">open</a>` : ''}</li>`).join('')}</ul>` });
        return;
      }
      openWin('f-' + it.id, { title: it.name, w: 640, h: 420, from, cls: 'x-scroll', html: `<div class="mx-path mono">Go-Sees › ${esc(it.name)} · ${it.idx.length} items</div>${fileGrid(it.idx)}` });
      const h = $('#mxHint'); if (h) h.hidden = true;
    }
    function chapterHTML(i) {
      const p = K.P(i), h = K.head(i, 'h2', 'mx-h' + (K.head(i).plain.length > 62 ? ' long' : ''));
      return `<div class="mx-doc"><figure class="mx-pic"><img src="${src(K.photo(i))}" alt=""><figcaption class="mono">${esc(K.cap(i))}<br>Juergen Teller</figcaption></figure><div class="mx-txt x-scroll"><div class="mono">${esc(p.kicker)}</div>${h.title}${h.lede}${K.extras(i)}</div></div>`;
    }
    const docBar = i => `<button type="button" data-step="-1" ${i === 0 ? 'disabled' : ''}>‹</button><button type="button" data-step="1" ${i === N - 1 ? 'disabled' : ''}>›</button>`;
    function openChapter(i, from) {
      i = Math.max(0, Math.min(N - 1, i)); G.setHash(i + 1); at = i; stepUI();
      const g = K.group(i), id = 'doc';
      const el = openWin(id, { title: `${K.letter(i)} · ${K.label(i)}`, w: 880, h: 540, from, bar: docBar(i), cls: 'noflow', html: chapterHTML(i), after: e => { e.__i = i; } });
      if (el.__i !== i || !el.__fresh) {
        if (el.__i !== i) { G.stopClips(el); $('.mx-body', el).innerHTML = chapterHTML(i); $('.ttl', el).textContent = `${K.letter(i)} · ${K.label(i)}`; $('.tbr', el).innerHTML = docBar(i); el.__i = i; G.setEditable(); }
      }
      el.__fresh = true; const body = $('.mx-body', el); body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
      K.countUp(el); setTimeout(() => { if (reg[id] === el && el.__i === i) G.startClips(el); }, 700);
      const h = $('#mxHint'); if (h) h.hidden = true;
    }

    /* clicks: windows, desktop, dock, menus */
    const openIt = (it, from) => it.kind === 'folder' || it.kind === 'sources' || it.kind === 'essay' ? openFolder(it, from) : 0;
    app.addEventListener('click', e => {
      const t = e.target;
      if (!t.closest('.mx-menubar .m, .mx-menu')) { menu.hidden = true; }
      const act = t.closest('[data-act]'); if (act) { const w = act.closest('.mx-win'), a = act.dataset.act; if (a === 'close') closeWin(w.dataset.id); else if (a === 'zoom') w.classList.toggle('full'); else if (a === 'min') closeWin(w.dataset.id); return; }
      const st = t.closest('[data-step]'); if (st) { const w = st.closest('.mx-win'); openChapter((w.__i || 0) + Number(st.dataset.step)); return; }
      const go = t.closest('[data-xgo]'); if (go && !G.isEditing()) { e.preventDefault(); openChapter(Number(go.dataset.xgo) - 1); return; }
      const f = t.closest('.mx-file'); if (f) { $$('.mx-file', f.parentElement).forEach(x => x.classList.toggle('sel', x === f)); if (coarse) openChapter(Number(f.dataset.ch), $('.th', f)); return; }
      const ic = t.closest('.mx-ic'); if (ic) { $$('.mx-ic', desk).forEach(x => x.classList.toggle('sel', x === ic)); if (coarse) openIt(ITEMS.find(x => x.id === ic.dataset.it), $('.mx-folder,.mx-sheet', ic)); return; }
      if (t.closest('#mxDesk') === null && !t.closest('.mx-win,.mx-dock,.mx-menubar,.mx-lock')) $$('.mx-ic.sel', desk).forEach(x => x.classList.remove('sel'));
      const dk = t.closest('[data-dock]'); if (dk) {
        const k = dk.dataset.dock; dk.classList.remove('bounce'); void dk.offsetWidth; dk.classList.add('bounce');
        if (k === 'lock') relock(); else if (k === 'essay') G.go('#/essay'); else if (k === 'sources') openFolder({ kind: 'sources' }, $('.dtile', dk)); else openWin('root', { title: 'Go-Sees', w: 640, h: 330, from: $('.dtile', dk), cls: 'x-scroll', html: `<div class="mx-path mono">Go-Sees</div><div class="mx-grid roots">${ITEMS.map(it => `<button type="button" class="mx-file root" data-it="${it.id}"><span class="th ic">${iconHTML(it)}</span><b>${esc(it.name)}</b></button>`).join('')}</div>` });
        return;
      }
      if (t.closest('[data-lock]')) { relock(); return; }
      const m = t.closest('.mx-menubar .m[data-menu]'); if (m) {
        const r = m.getBoundingClientRect(); menu.style.left = r.left + 'px';
        menu.innerHTML = m.dataset.menu === 'go' ? K.GROUPS.map(g => `<div class="mh">${esc(g.name)}</div>` + g.idx.map(i => `<button type="button" data-mch="${i}"><i>${K.letter(i)}</i>${esc(K.label(i))}</button>`).join('')).join('') : `<button type="button" data-mess>Open full essay</button><button type="button" data-lock>Lock screen</button>`;
        menu.hidden = false; return;
      }
      const mc = t.closest('[data-mch]'); if (mc) { menu.hidden = true; openChapter(Number(mc.dataset.mch)); return; }
      if (t.closest('[data-mess]')) { G.go('#/essay'); return; }
    });
    app.addEventListener('dblclick', e => {
      if (coarse) return; const t = e.target;
      const f = t.closest('.mx-file'); if (f) { if (f.dataset.ch != null) openChapter(Number(f.dataset.ch), $('.th', f)); else openIt(ITEMS.find(x => x.id === f.dataset.it), $('.th', f)); return; }
      const ic = t.closest('.mx-ic'); if (ic) openIt(ITEMS.find(x => x.id === ic.dataset.it), $('.mx-folder,.mx-sheet', ic));
    });
    /* the guided tour: a cursor opens the folders and files by itself, one step per gesture */
    const cur = $('#mxCur'); let at = -1, busy = false, queued = null, autoT = null;
    const stepUI = () => { if (at < 0) return; $('#msN').textContent = String(at + 1).padStart(2, '0'); $('#msL').textContent = K.label(at); $('#mxSteps').classList.add('on'); };
    async function moveTo(el, dx = .5, dy = .5) { if (!el) return; const r = el.getBoundingClientRect(); cur.style.transform = `translate(${r.left + r.width * dx}px,${r.top + r.height * dy}px)`; await sleep(1000); }
    async function tap(n = 1) { for (let k = 0; k < n; k++) { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); await sleep(170); } await sleep(160); }
    function showCursor() { if (!cur.classList.contains('show')) { cur.style.transition = 'none'; cur.style.transform = `translate(${innerWidth * .5}px,${innerHeight * .8}px)`; void cur.offsetWidth; cur.style.transition = ''; cur.classList.add('show'); } }
    async function tourTo(i) {
      if (!unlocked) return;
      if (i >= N) { G.go('#/essay'); return; }
      i = Math.max(0, i); if (i === at && reg.doc) return;
      if (busy) { queued = i; return; }
      busy = true; showCursor(); const g = K.group(i), it = ITEMS.find(x => x.id === g.id);
      try {
        if (reg.doc && at >= 0 && K.group(at) === g) {
          const d = i - at, btn = Math.abs(d) === 1 && $(`[data-step="${d}"]`, reg.doc);
          if (btn) { await moveTo(btn); await tap(); }
          openChapter(i); await sleep(500);
        } else {
          Object.keys(reg).forEach(k => { if (k !== 'f-' + g.id) closeWin(k); });
          await sleep(250);
          const ic = $(`.mx-ic[data-it="${g.id}"]`), face = $('.mx-folder', ic);
          $$('.mx-ic', desk).forEach(x => x.classList.toggle('sel', x === ic));
          await moveTo(face); await tap(2);
          if (!reg['f-' + g.id]) { openFolder(it, face); await sleep(850); }
          const fw = reg['f-' + g.id], fl = fw && $(`.mx-file[data-ch="${i}"]`, fw);
          if (fl) { $$('.mx-file', fw).forEach(x => x.classList.toggle('sel', x === fl)); await moveTo($('.th', fl)); await tap(2); }
          openChapter(i, fl && $('.th', fl)); await sleep(700);
          cur.style.transform = `translate(${innerWidth * .62}px,${innerHeight * .74}px)`;
        }
      } catch (e) {}
      busy = false;
      if (queued != null) { const q = queued; queued = null; tourTo(q); }
    }
    function auto(on) { clearInterval(autoT); const b = $('[data-auto]'); b.classList.toggle('on', !!on); if (on) autoT = setInterval(() => { if (!busy && unlocked) tourTo(at + 1); }, 16000); }
    const stop = stepper(G, d => { if (unlocked) { auto(false); tourTo((queued != null ? queued : at) + d); } });
    app.addEventListener('click', e => { const t = e.target.closest('[data-tour]'); if (t) { auto(false); tourTo((queued != null ? queued : at) + Number(t.dataset.tour)); } else if (e.target.closest('[data-auto]')) { const on = !$('[data-auto]').classList.contains('on'); auto(on); if (on && !busy) tourTo(at + 1); } });

    // dock magnification
    dock.addEventListener('mousemove', e => { $$('button', dock).forEach(b => { const r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2)), s = 1 + .7 * Math.pow(Math.max(0, 1 - d / 120), 2); b.style.setProperty('--s', s.toFixed(3)); }); });
    dock.addEventListener('mouseleave', () => $$('button', dock).forEach(b => b.style.setProperty('--s', 1)));
    const key = e => { if (e.key === 'Escape' && unlocked) { const top = Object.keys(reg).sort((a, b) => reg[b].style.zIndex - reg[a].style.zIndex)[0]; if (top && !G.isEditing()) closeWin(top); } };
    document.addEventListener('keydown', key);
    return {
      goto: n => { if (unlocked) tourTo(n - 1); else pending = n; },
      destroy() { clearInterval(clock); clearInterval(autoT); stop(); document.removeEventListener('keydown', key); Object.keys(reg).forEach(k => G.stopClips(reg[k])); }
    };
  };

  /* =====================================================================
     3. SITE — a proper website: nav, landing page, chapter pages, next/previous
     ===================================================================== */
  ALT.site = function (G, n0) {
    const K = Kit(G), { C, esc, strip, src } = G, N = K.N, app = $('#app');
    let cur = null;
    app.innerHTML = `<div class="xs"><header class="xs-nav"><a class="xs-logo" data-xsgo="1">${esc(strip(C.site.title))}</a>
        <nav><a data-xsgo="1" data-nav="home">Home</a><span class="xs-dd"><a data-nav="chapters">Chapters <i>▾</i></a><div class="xs-mega">${K.GROUPS.map(g => `<div><h4 class="mono">${esc(g.name)}</h4>${g.idx.map(i => `<a data-xsgo="${i + 1}"><i>${String(i + 1).padStart(2, '0')}</i>${esc(K.label(i))}</a>`).join('')}</div>`).join('')}</div></span><a data-xsgo="s">Sources</a><a href="#/essay">Full essay</a></nav>
        <a class="xs-btn" href="#/essay">Read the essay</a></header>
      <div class="xs-scroll x-scroll" id="xsScroll"><main id="xsMain"></main>
        <footer class="xs-foot"><div><b>${esc(strip(C.site.title))}</b><p>${esc(C.site.subtitle || '')}</p></div><div><p>Photographs: Juergen Teller, <em>Go-Sees</em> (Scalo, 1999), via Public Delivery (2019).</p><p><a href="#/essay">Full essay</a> · <a data-xsgo="s">Sources</a></p></div></footer></div>
      <aside class="card" id="card" hidden></aside></div>`;
    const main = $('#xsMain'), sc = $('#xsScroll'), nav = $('.xs-nav');
    const card = i => `<a class="xs-card" data-xsgo="${i + 1}"><span class="ph"><img src="${src(K.photo(i))}" alt="" loading="lazy"></span><span class="mono">${esc(K.P(i).kicker)}</span><h3>${esc(K.label(i))}</h3></a>`;
    function home() {
      const p = K.P(0), h = K.head(0, 'h1', 'xs-h1');
      return `<section class="xs-hero"><div class="xs-hero-tx"><div class="mono">${esc(C.site.kicker || p.kicker)}</div>${h.title}${h.lede}
          <div class="xs-cta"><a class="xs-btn big" data-xsgo="2">Start with the argument →</a><a class="xs-link" href="#/essay">or read the full essay</a></div>${K.extras(0).match(/<div class="x-count">.*?<\/div>/s) || ''}</div>
        <figure class="xs-hero-ph"><img src="${src(K.photo(0))}" alt=""><figcaption class="mono">${esc(K.cap(0))} · Juergen Teller</figcaption></figure></section>
        <section class="xs-q"><div class="mono">The question</div><p data-path="book.0.body" data-rich="1">${G.rich(p.body)}</p></section>
        <section class="xs-sec">${K.GROUPS.map(g => { const ix = g.idx.filter(i => i > 0); return ix.length ? `<div class="xs-grp"><div class="xs-grph"><h2>${esc(g.name)}</h2></div><div class="xs-grid">${ix.map(card).join('')}</div></div>` : ''; }).join('')}</section>`;
    }
    function chapter(i) {
      const p = K.P(i), g = K.group(i), h = K.head(i, 'h1', 'xs-h1' + (K.head(i).plain.length > 60 ? ' long' : '')), sib = g.idx, refs = K.refs(i);
      const pn = (j, side) => j < 0 || j >= N ? '<span></span>' : `<a class="xs-pn ${side}" data-xsgo="${j + 1}"><span class="ph"><img src="${src(K.photo(j))}" alt=""></span><span><i class="mono">${side === 'l' ? '← Previous' : 'Next →'}</i><b>${esc(K.label(j))}</b></span></a>`;
      return `<article class="xs-art"><nav class="xs-crumb mono"><a data-xsgo="1">Home</a><i>/</i><span>${esc(g.name)}</span><i>/</i><span>${esc(K.label(i))}</span></nav>
        <div class="mono xs-kick">${esc(p.kicker)}</div>${h.title}${h.lede}
        <figure class="xs-fig"><img src="${src(K.photo(i))}" alt=""><figcaption class="mono">${esc(K.cap(i))} · Juergen Teller</figcaption></figure>
        <div class="xs-cols"><div class="xs-main">${K.extras(i)}</div>
          <aside class="xs-aside"><div class="xs-box"><div class="mono">In this part</div>${sib.map(j => `<a data-xsgo="${j + 1}" class="${j === i ? 'on' : ''}"><i>${K.letter(j)}</i>${esc(K.label(j))}</a>`).join('')}</div>
            ${refs.length ? `<div class="xs-box"><div class="mono">Voices and sources</div>${refs.map(r => `<button type="button" class="xs-chip ul ${r.k}" data-kind="${r.k}" data-card="${r.id}">${esc(r.t)}</button>`).join('')}</div>` : ''}</div></aside></div>
        <div class="xs-pns">${pn(i - 1, 'l')}${i === N - 1 ? `<a class="xs-pn r" href="#/essay"><span><i class="mono">Continue →</i><b>The full essay</b></span></a>` : pn(i + 1, 'r')}</div></article>`;
    }
    function sources() {
      return `<article class="xs-art"><nav class="xs-crumb mono"><a data-xsgo="1">Home</a><i>/</i><span>Sources</span></nav><div class="mono xs-kick">Sources</div><h1 class="xs-h1" data-path="sources.lead">${esc((C.sources || {}).lead || 'Where this comes from.')}</h1><p class="x-lede" data-path="sources.body">${esc((C.sources || {}).body || '')}</p>
        <ul class="xs-refs">${C.essay.references.map((r, k) => `<li><span data-path="essay.references.${k}.text">${esc(r.text)}</span>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Open ↗</a>` : ''}</li>`).join('')}</ul><p class="disc" data-path="site.disclosure">${esc((C.site || {}).disclosure || '')}</p></article>`;
    }
    function show(n) {
      const key = n === 's' ? 's' : Number(n); if (cur === key) return; cur = key; G.stopClips(main);
      main.classList.remove('xs-in'); main.innerHTML = key === 's' ? sources() : key <= 1 ? home() : chapter(key - 1); void main.offsetWidth; main.classList.add('xs-in'); sc.scrollTop = 0;
      $$('.xs-nav nav > a').forEach(a => a.classList.toggle('on', (key <= 1 && a.dataset.nav === 'home') || (key === 's' && a.dataset.xsgo === 's')));
      G.setEditable(); K.countUp(main); if (key !== 's') G.setHash(Math.max(1, key)); setTimeout(() => { if (cur === key) G.startClips(main); }, 500);
    }
    const click = e => { const a = e.target.closest('[data-xsgo]'); if (a && !G.isEditing()) { e.preventDefault(); const v = a.dataset.xsgo; show(v === 's' ? 's' : Number(v)); } };
    const scroll = () => nav.classList.toggle('stuck', sc.scrollTop > 24);
    app.addEventListener('click', click); sc.addEventListener('scroll', scroll, { passive: true });
    show(n0 || 1);
    return { goto: n => show(n), destroy() { G.stopClips(main); } };
  };
})();
