/* Juergen's girls. Vanilla JS, no build step.
   Everything is rendered from content.json; edits made on the page are saved back to it.
   Cover and opening wall first. Then the story: one stage that scroll drives, scene by scene.
   The full essay is a long read with a contents list and a photograph that stay in place. */
(async function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = $('#app');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let C, GAL = [];
  try { const r = await fetch('/api/content'); if (!r.ok) throw new Error('no api'); C = await r.json(); }
  catch (e) {
    /* published copy: no server, so read the saved text and switch editing off */
    try { C = await (await fetch('content.json?v=202611211954')).json(); document.body.classList.add('static'); }
    catch (e2) { app.innerHTML = '<p style="padding:90px 40px">Could not load content.json. Start the server with <code>node server.js</code>.</p>'; return; }
  }
  try { GAL = await (await fetch('img/go.json?v=202611211954')).json(); } catch (e) { GAL = []; }
  const galCap = {}; GAL.forEach(g => { galCap[g.file.replace('.jpg', '')] = g.caption; });

  // fonts first, so nothing swaps after the first paint
  try { await Promise.all(['500 16px "Inter Tight"', 'italic 400 16px "Inter Tight"', '16px Inter', '500 16px Inter', '16px "DM Mono"'].map(f => document.fonts.load(f))); } catch (e) {}

  let editing = false, saveTimer = null, introPlayed = false;
  let current = { view: 'cover', n: 0, anchor: '' };
  let mounted = '';
  let variant = 'a', introEnd = () => {}, scenes = [], ticking = false, activeScene = 0, vp = 0, anim = 0, animId = 0, stepLock = false, srcOpen = false;
  let ytReady = null;

  /* ---------- helpers ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const TOK = /\{\{([vsi]):([\w-]+)\|([^}]*)\}\}/g;
  const rich = s => esc(s).replace(TOK, (m, k, id, t) => `<span class="ul ${k}" data-kind="${k}" data-card="${id}">${t}</span>`).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const strip = s => String(s || '').replace(TOK, '$3').replace(/\*/g, '');
  const set = (p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], C)[last] = v; };
  const src = n => /^g\d+$/.test(n) ? `img/go/${n}.jpg` : `img/${n}.jpg`;
  const crop = c => c ? `object-position:${c.x}% ${c.y}%;transform-origin:${c.x}% ${c.y}%;--cz:${c.z || 1}` : '';
  const ab = (a, b) => `style="--a:${a};--b:${b}"`;
  const dp = (p, rch) => `data-path="${p}"${rch ? ' data-rich="1"' : ''}`;

  function ser(el) {
    let out = '';
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) out += n.textContent;
      else if (n.nodeName === 'BR') out += ' ';
      else if (n.classList && n.classList.contains('ul')) out += '{{' + n.dataset.kind + ':' + n.dataset.card + '|' + n.textContent.replace(/[|}]/g, '') + '}}';
      else if (n.nodeName === 'EM' || n.nodeName === 'I') out += '*' + n.textContent.replace(/\*/g, '') + '*';
      else if (n.nodeName === 'DIV' || n.nodeName === 'P') out += ' ' + ser(n);
      else out += ser(n);
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  /* ---------- saving ---------- */
  const statusEl = $('#status');
  const setStatus = t => { statusEl.textContent = t; };
  function queueSave() { setStatus('Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }
  async function save() {
    try {
      const r = await fetch('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(C) });
      const j = await r.json();
      setStatus(j.ok ? 'Saved ✓' : 'Not saved: ' + j.error);
    } catch (e) { setStatus('Not saved: server not running'); }
  }

  /* ---------- routing ---------- */
  function parse() {
    const h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'story' || h[0] === 'book') return { view: 'story', n: clamp(parseInt(h[1] || '1', 10) || 1, 1, C.book.length), anchor: '' };
    if (h[0] === 'essay') return { view: 'essay', n: 0, anchor: h[1] || '' };
    return { view: 'cover', n: 0, anchor: '' };
  }
  const go = h => { location.hash = h; };
  const noScroll = on => { document.documentElement.classList.toggle('noscroll', on); document.body.classList.toggle('noscroll', on); };

  function topbar(view) {
    return `<header class="top"><a class="logo" href="#/">${esc(strip(C.site.title))}</a>
      <nav class="switch"><a href="#/story/${current.view === 'story' ? current.n : 1}" class="${view === 'story' ? 'on' : ''}">Explore</a><a href="#/essay" class="${view === 'essay' ? 'on' : ''}">Full essay</a></nav>
      <button class="contents-btn mono" data-contents type="button">Contents</button></header>`;
  }

  /* ---------- interview cuts: muted, looping, no player chrome ---------- */
  function clipHTML(id) {
    const c = C.cards[id];
    if (!c) return '';
    if (c.kind === 'video') {
      return `<div class="clip" data-clip="${esc(id)}"><div class="clipbox"><img class="poster" alt="" src="https://i.ytimg.com/vi/${esc(c.youtube)}/hqdefault.jpg"><div class="player"></div><span class="tag mono">Teller · interview, cut</span><button class="snd" type="button">Sound off</button></div><div class="clipcap mono">${esc(c.text)}</div></div>`;
    }
    if (c.kind === 'slot' && c.file) {
      return `<div class="clip"><div class="clipbox"><video src="media/${esc(c.file)}" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video><span class="tag mono">Interview, cut</span></div><div class="clipcap mono">${esc(c.text)}</div></div>`;
    }
    return `<div class="clip"><div class="slotbox">${esc(c.text)}</div></div>`;
  }
  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise(res => {
      if (window.YT && window.YT.Player) return res(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(window.YT); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
    });
    return ytReady;
  }
  function parseSegs(c) {
    const out = String(c.segments || '').split(',').map(s => s.trim().split(/\s*[-–]\s*/).map(Number)).filter(a => a.length === 2 && a[1] > a[0]);
    return out.length ? out : [[Math.max(0, Number(c.start) || 0), Number(c.end) || 0]];
  }
  function stopClips(el) {
    (el.__pl || []).forEach(p => { try { clearInterval(p.__iv); p.destroy(); } catch (e) {} });
    el.__pl = []; el.__clips = false;
    $$('.clipbox', el).forEach(b => { b.classList.remove('ready'); if (!$('.player', b)) { const d = document.createElement('div'); d.className = 'player'; b.insertBefore(d, $('.tag', b)); } });
  }
  async function startClips(el) {
    const clips = $$('.clip[data-clip]', el);
    if (!clips.length || el.__clips) return;
    el.__clips = true; el.__pl = [];
    let YT; try { YT = await loadYT(); } catch (e) { return; }
    if (!el.__clips) return;
    clips.forEach(cl => {
      const c = C.cards[cl.dataset.clip]; if (!c || c.kind !== 'video') return;
      const host = $('.player', cl), box = $('.clipbox', cl), snd = $('.snd', cl);
      if (!host) return;
      const segs = parseSegs(c); let si = 0, shown = false;
      const vars = { autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1, cc_load_policy: 1, iv_load_policy: 3, start: segs[0][0], origin: location.origin };
      const pl = new YT.Player(host, {
        videoId: c.youtube, playerVars: vars,
        events: {
          onReady: e => { e.target.mute(); e.target.playVideo(); },
          onStateChange: e => {
            if (e.data === 1 && !shown) { shown = true; setTimeout(() => box.classList.add('ready'), 900); }
            if (e.data === 0) { si = 0; e.target.seekTo(segs[0][0], true); e.target.playVideo(); }
          }
        }
      });
      // jump to the next cut a moment before the end, so YouTube's end screen never shows
      pl.__iv = setInterval(() => {
        try { const t = pl.getCurrentTime(); const [s, e] = segs[si]; if (e > s && t >= e - 0.35) { si = (si + 1) % segs.length; pl.seekTo(segs[si][0], true); } } catch (e) {}
      }, 250);
      el.__pl.push(pl);
      snd.addEventListener('click', ev => { ev.stopPropagation(); try { if (pl.isMuted()) { pl.unMute(); pl.setVolume(100); snd.textContent = 'Sound on'; } else { pl.mute(); snd.textContent = 'Sound off'; } } catch (e) {} });
    });
  }

  /* ---------- opening wall of photographs ---------- */
  async function playIntro() {
    const el = $('#intro');
    const pool = (GAL.length ? GAL.map(g => 'img/go/' + g.file) : ['f1', 'f2', 'f3', 'f4'].map(f => `img/${f}.jpg`));
    await Promise.all(pool.map(u => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = u; })));
    const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const cols = 6, rows = 3, total = cols * rows; let order = shuffle(pool);
    while (order.length < total) order = order.concat(shuffle(pool));
    let tiles = '';
    for (let k = 0; k < total; k++) {
      const pass = Math.floor(k / pool.length); // 0: whole picture, 1+: close crops
      const z = pass === 0 ? 100 : 170 + Math.random() * 260;
      const px = pass === 0 ? 50 : 8 + Math.random() * 84, py = pass === 0 ? 35 : 6 + Math.random() * 88;
      const d = 0.05 + Math.random() * 2.0;
      tiles += `<div class="tile" data-d="${d.toFixed(2)}" style="background-image:url(${order[k]});background-size:${pass === 0 ? 'cover' : z + '%'};background-position:${px}% ${py}%"></div>`;
    }
    el.innerHTML = `<div class="tiles" style="--c:${cols};--r:${rows}">${tiles}</div><div class="introshade"></div><div class="introtitle"><h1>${esc(strip(C.site.title))}</h1><p>Juergen Teller · Go-Sees · 1998–99</p></div><div class="introcount"><span id="ic">0</span><small>photographs, one door</small></div><div class="introbtns"><a class="btn ghost" href="#/story/1">Begin →</a><a class="btn ghost" href="#/essay">Read the full essay</a></div>`;
    el.hidden = false; el.classList.remove('out');
    const t0 = performance.now(); let ended = false;
    // everything on the wall runs off one clock, so the pictures, counter and title always stay in step
    const tl = $$('.tile', el), sh = $('.introshade', el), ti = $('.introtitle', el), bt = $('.introbtns', el);
    const tick = t => {
      if (ended) return;
      const s = (t - t0) / 1000, k = Math.min(1, s / 3.3);
      const c = $('#ic'); if (c) c.textContent = Math.round(462 * (1 - Math.pow(1 - k, 2.2)));
      tl.forEach(tile => { const a = clamp((s - Number(tile.dataset.d)) / 0.7, 0, 1), e = 1 - Math.pow(1 - a, 3); tile.style.opacity = e; tile.style.transform = `scale(${1.18 - 0.18 * e})`; });
      sh.style.opacity = clamp((s - 2.5) / 1, 0, 1); ti.style.opacity = clamp((s - 2.8) / 1, 0, 1); bt.style.opacity = clamp((s - 3.6) / 0.8, 0, 1); bt.style.pointerEvents = s > 3.6 ? 'auto' : 'none';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    el.onclick = null; introEnd = () => { ended = true; };
  }

  /* ---------- cover ---------- */
  function mountCover() {
    noScroll(true); window.scrollTo(0, 0);
    app.innerHTML = topbar('cover'); mounted = 'cover'; scenes = [];
    document.body.classList.remove('ondark');
    playIntro();
  }
  function leaveCover() { const el = $('#intro'); if (!el || el.hidden) return; introEnd(); el.classList.add('out'); setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 1000); }

  /* ---------- story scenes ---------- */
  try { variant = 'a'; } catch (e) {}
  if (!['a', 'b', 'c'].includes(variant)) variant = 'a';
  const T = (i, f, cls, a, b, tag = 'h2') => `<${tag} class="${cls} rv" ${ab(a, b)} ${dp(`book.${i}.${f}`, 1)}>${rich(C.book[i][f] || '')}</${tag}>`;
  const kick = (i, extra = '') => `<div class="mono kick rv" ${ab(0, 0.08).replace('"', `"${extra}`)} ${dp(`book.${i}.kicker`)}>${esc(C.book[i].kicker)}</div>`;
  const capEl = (i, cls = '', f = 'caption') => C.book[i][f] ? `<div class="cap ${cls}" ${dp(`book.${i}.${f}`)}>${esc(C.book[i][f])}</div>` : '';

  function sceneHTML(i) {
    const p = C.book[i], N = C.book.length;
    switch (p.scene) {
      case 'hero':
        return `<section class="scene hero dk" data-dark="1"><div class="bgph" style="--zs:1.06;--ze:1"><img src="${src(p.photo)}" alt="" style="object-position:50% 38%"></div><div class="shade"></div>
          ${kick(i)}${capEl(i)}
          <div class="hlw">${T(i, 'lead', 'lead', 0.02, 0.14)}<div class="count rv" ${ab(0.12, 0.26)}><b data-countx="${p.count}">0</b><span>${rich(p.countLabel || '')}</span></div></div>
          ${T(i, 'body', 'hq', 0.42, 0.56, 'p')}</section>`;
      case 'dilemma': {
        const q = C.cards[p.quote] || {};
        return `<section class="scene dil">${kick(i)}
          <div class="dl">${p.defs.map((d, k) => `<div class="def rv" ${ab(0.05 + k * 0.14, 0.17 + k * 0.14)}><h3 class="defw" ${dp(`book.${i}.defs.${k}.w`)}>${esc(d.w)}</h3><p class="deft" ${dp(`book.${i}.defs.${k}.t`, 1)}>${rich(d.t)}</p></div>`).join('')}
          ${T(i, 'body', 'bodytext dilbody', 0.38, 0.5, 'p')}</div>
          <div class="dr"><img src="${src(p.photo)}" alt="" style="${crop(p.crop)}"></div></section>`; }
      case 'thesis':
        return `<section class="scene thesis">${kick(i)}
          <h2 class="lead xl thq rv" ${ab(0.0, 0.1)} ${dp(`book.${i}.lead`)}>${esc(p.lead || '')}</h2>
          <div class="beamwrap"><div class="beam"><i class="cap l"></i><i class="cap r"></i></div><div class="pivot"></div><div class="base"></div>
            <h3 class="bend l ti" style="--d:.3s" ${dp(`book.${i}.leftLead`)}>${esc(p.leftLead)}</h3><h3 class="bend r ti" style="--d:3.4s" ${dp(`book.${i}.rightLead`)}>${esc(p.rightLead)}</h3></div>
          <ul class="items il">${p.leftItems.map((t, k) => `<li class="ti" style="--d:${(1.1 + k * 0.35).toFixed(2)}s" data-goto="${p.leftGoto[k]}"><span>0${k + 1}</span><b style="font-weight:500" ${dp(`book.${i}.leftItems.${k}`)}>${esc(t)}</b></li>`).join('')}</ul>
          <ul class="items ir">${p.rightItems.map((t, k) => `<li class="ti" style="--d:${(4.1 + k * 0.35).toFixed(2)}s" data-goto="${p.rightGoto[k]}"><span>0${k + 1}</span><b style="font-weight:500" ${dp(`book.${i}.rightItems.${k}`)}>${esc(t)}</b></li>`).join('')}</ul></section>`;
      case 'choose':
        return `<section class="scene choose">${kick(i)}
          <div class="ct">${T(i, 'lead', 'lead xl', 0.02, 0.12)}${T(i, 'body', 'bodytext', 0.1, 0.26, 'p')}</div>
          <div class="cclip"><div class="rv" ${ab(0.05, 0.2)}>${clipHTML(p.clip)}</div></div></section>`;
      case 'personality':
        return `<section class="scene pers"><div class="sd l"><img src="${src(p.photo)}" alt=""></div><div class="sd r"><img src="${src(p.photo2)}" alt="" style="${crop(p.crop2)};transform:scale(var(--cz,1))"></div>${kick(i, 'left:31vw;')}
          <div class="pc">${T(i, 'lead', 'lead xl', 0.02, 0.12)}${T(i, 'body', 'bodytext', 0.1, 0.28, 'p')}</div>
          ${capEl(i, 'l')}<div class="cap r">${esc(p.caption2 || '')}</div></section>`;
      case 'beauty': {
        const q = C.cards[p.quote] || {};
        return `<section class="scene beauty dk" data-dark="1"><div class="bgph" style="--zs:1.05;--ze:1"><img src="${src(p.photo)}" alt="" style="object-position:50% 30%"></div><div class="shade"></div>${kick(i)}${capEl(i)}
          <div class="bt">${T(i, 'lead', 'lead xl', 0.02, 0.14)}</div>
          <blockquote class="bq rv" ${ab(0.18, 0.34)}>${esc(q.text || '')}<cite>${esc(q.cite || '')}</cite></blockquote><div class="bt2">${T(i, 'body', 'bodytext', 0.36, 0.52, 'p')}</div></section>`; }
      case 'door':
        return `<section class="scene door dk" data-dark="1"><div class="dph" id="phframe"><img src="${src(p.photo)}" alt=""><figcaption class="anno"></figcaption></div>${capEl(i)}${kick(i, 'left:47vw;')}
          <div class="dt">${T(i, 'lead', 'lead xl', 0.02, 0.12)}<div class="dclip rv" ${ab(0.12, 0.28)}>${clipHTML(p.clip)}</div>${T(i, 'body', 'bodytext', 0.26, 0.42, 'p')}</div></section>`;
      case 'gate': {
        const pool = (GAL.length ? GAL.map(g => g.file.replace('.jpg', '')) : ['f1', 'f2', 'f3', 'f4']).filter(f => f !== 'g06'), order = pool.map((f, k) => pool[(k * 7) % pool.length]);
        const strip = [...new Set(order)].map(f => `<img src="${src(f)}" alt="">`).join('');
        return `<section class="scene gate"><div class="gs"><div class="gstrip">${strip}${strip}</div></div>${kick(i, 'color:#fff;')}
          <div class="gl">${T(i, 'lead', 'lead', 0.02, 0.14)}</div><div class="gb">${T(i, 'body', 'bodytext', 0.16, 0.34, 'p')}</div></section>`; }
      case 'cost':
        return `<section class="scene cost dk" data-dark="1"><div class="bgph" style="--zs:1.05;--ze:1"><img src="${src(p.photo)}" alt="" style="object-position:50% 40%"></div>${kick(i)}
          <ul class="cf">${p.facts.map((t, k) => `<li class="rv" ${ab(0.05 + k * 0.13, 0.17 + k * 0.13)}><span class="n">0${k + 1}</span><b style="font-weight:500" ${dp(`book.${i}.facts.${k}`, 1)}>${rich(t)}</b></li>`).join('')}</ul>
          <div class="cr">${T(i, 'lead', 'lead', 0.5, 0.62)}${T(i, 'body', 'bodytext', 0.58, 0.74, 'p')}</div></section>`;
      case 'view': {
        const pool = GAL.length ? GAL : [{ file: 'g01.jpg', caption: '' }];
        const keep = new Set([3, 9, 16]); let t = '';
        pool.slice(0, 20).forEach((g, k) => { t += `<div class="vt${keep.has(k) ? ' keep' : ''}" data-cap="${esc(g.caption)}" style="background-image:url(img/go/${g.file})"></div>`; });
        return `<section class="scene view">${kick(i)}<div class="vg">${t}</div><div class="vcap mono" id="vcap">Hover a card.</div>
          <div class="vr">${T(i, 'lead', 'lead', 0.02, 0.12)}${T(i, 'body', 'bodytext', 0.14, 0.3, 'p')}<div class="vslot rv" ${ab(0.32, 0.46)}>${clipHTML(p.clip)}</div></div></section>`; }
      case 'close':
        return `<section class="scene close"><div class="cph2"><img src="${src(p.photo)}" alt=""></div>${capEl(i)}${kick(i)}
          <div class="cl">${T(i, 'lead', 'lead xl', 0.02, 0.14)}${T(i, 'body', 'bodytext', 0.14, 0.3, 'p')}</div></section>`;
      default:
        return `<section class="scene">${kick(i)}<div class="cl">${T(i, 'lead', 'lead', 0.02, 0.14)}</div></section>`;
    }
  }

  function genHTML(i) {
    const p = C.book[i], pool = GAL.length ? GAL : [{ file: 'g01.jpg', caption: '' }], g = k => pool[(i * 3 + k * 5 + 1) % pool.length];
    const lead = p.lead ? `<h2 class="glead rv" ${ab(0.02, 0.12)} ${dp(`book.${i}.lead`, 1)}>${rich(p.lead)}</h2>` : `<h2 class="glead rv" ${ab(0.02, 0.12)}>${esc(p.kicker)}</h2>`;
    let t = '';
    if (p.scene === 'hero') t += `<div class="gcount rv" ${ab(0.1, 0.22)}><b data-countx="${p.count}">0</b> <span>${rich(p.countLabel || '')}</span></div>`;
    if (p.defs) t += p.defs.map((d, k) => `<p class="gdef rv" ${ab(0.08 + k * 0.1, 0.2 + k * 0.1)}><b ${dp(`book.${i}.defs.${k}.w`)}>${esc(d.w)}</b> <span ${dp(`book.${i}.defs.${k}.t`, 1)}>${rich(d.t)}</span></p>`).join('');
    if (p.leftLead) t += `<p class="gdef rv" ${ab(0.1, 0.2)}><b ${dp(`book.${i}.leftLead`)}>${esc(p.leftLead)}</b></p><ul class="gl">${p.leftItems.map((x, k) => `<li class="rv" ${ab(0.14 + k * 0.05, 0.24 + k * 0.05)} data-goto="${p.leftGoto[k]}" ${dp(`book.${i}.leftItems.${k}`)}>${esc(x)}</li>`).join('')}</ul>
      <p class="gdef rv" ${ab(0.34, 0.44)}><b ${dp(`book.${i}.rightLead`)}>${esc(p.rightLead)}</b></p><ul class="gl">${p.rightItems.map((x, k) => `<li class="rv" ${ab(0.38 + k * 0.05, 0.48 + k * 0.05)} data-goto="${p.rightGoto[k]}" ${dp(`book.${i}.rightItems.${k}`)}>${esc(x)}</li>`).join('')}</ul>`;
    if (p.facts) t += `<ul class="gl">${p.facts.map((x, k) => `<li class="rv" ${ab(0.1 + k * 0.1, 0.22 + k * 0.1)} ${dp(`book.${i}.facts.${k}`, 1)}>${rich(x)}</li>`).join('')}</ul>`;
    if (p.body) t += `<p class="gbody rv" ${ab(0.2, 0.36)} ${dp(`book.${i}.body`, 1)}>${rich(p.body)}</p>`;
    if (p.clip) t += `<div class="gclip rv" ${ab(0.3, 0.46)}>${clipHTML(p.clip)}</div>`;
    const cap = x => esc(x.caption || '') + ' · Juergen Teller';
    if (variant === 'b') {
      const a = p.photo && !p.photo.startsWith('f') ? { file: p.photo + '.jpg', caption: (galCap[p.photo] || '') } : g(0);
      return `<section class="scene gen vb">${kick(i)}<figure class="gph rv" ${ab(0.0, 0.14)}><img src="img/go/${a.file}" alt=""><figcaption>${cap(a)}</figcaption></figure><div class="gtx">${lead}${t}</div></section>`;
    }
    const pins = [{ l: 48, t: 14, w: 17, r: -2.2 }, { l: 72, t: 24, w: 17, r: 2.6 }, { l: 56, t: 46, w: 16, r: 1.1 }].map((q, k) => {
      const a = g(k); return `<figure class="pin" style="left:${q.l}vw;top:${q.t}vh;width:${q.w}vw;transform:rotate(${q.r}deg)"><div class="rv" ${ab(0.02 + k * 0.08, 0.14 + k * 0.08)}><img src="img/go/${a.file}" alt=""><figcaption>${cap(a)}</figcaption></div></figure>`;
    }).join('');
    return `<section class="scene gen vc">${kick(i)}<div class="gtx">${lead}${t}</div>${pins}</section>`;
  }

  /* ---------- explore modes: stage (below) or one of the alternatives in alt.js ---------- */
  const phone = matchMedia('(max-width:700px)').matches;
  let xmode = 'book'; try { xmode = localStorage.getItem('gs-explore') || 'book'; } catch (e) {}
  if (phone) xmode = 'book';
  if (!['stage', 'rail', 'minimal', 'editorial', 'book', 'mac', 'site'].includes(xmode) || !window.ALT) xmode = 'stage';
  const TR = [['wipe', 'Wipe'], ['fade', 'Fade'], ['push', 'Push'], ['zoom', 'Zoom'], ['iris', 'Iris']], SC = [['step', 'Step'], ['scrub', 'Scrub']];
  const ls = (k, d, ok) => { try { const v = localStorage.getItem(k); return ok.includes(v) ? v : d; } catch (e) { return d; } };
  let trans = ls('gs-trans', 'push', TR.map(t => t[0])), scrollMode = ls('gs-scroll', 'step', SC.map(t => t[0]));
  function xtrans() {
    let el = $('#xtr'); if (!el) { el = document.createElement('div'); el.id = 'xtr'; el.className = 'xsw xtr mono'; document.body.appendChild(el); }
    el.hidden = !(current.view === 'story' && xmode === 'stage');
    el.innerHTML = `<span>Transition</span>` + TR.map(([k, l]) => `<button type="button" data-trans="${k}" class="${trans === k ? 'on' : ''}">${l}</button>`).join('') + `<span>Scroll</span>` + SC.map(([k, l]) => `<button type="button" data-scroll="${k}" class="${scrollMode === k ? 'on' : ''}">${l}</button>`).join('');
  }
  function xswitch() {
    xtrans();
    let el = $('#xsw'); if (!el) { el = document.createElement('div'); el.id = 'xsw'; el.className = 'xsw mono'; document.body.appendChild(el); }
    el.hidden = current.view !== 'story';
    el.innerHTML = `<span>Explore</span>` + (window.ALT ? window.ALT.modes : [['stage', 'Stage']]).map(([k, l]) => `<button type="button" data-xmode="${k}" class="${xmode === k ? 'on' : ''}">${l}</button>`).join('');
  }
  const GS = { get C() { return C; }, get GAL() { return GAL; }, esc, strip, rich, src, galCap, clipHTML, startClips, stopClips, topbar, go, setEditable, isEditing: () => editing, openCard, queueSave: () => queueSave(),
    setHash: n => { current = { view: 'story', n, anchor: '' }; try { history.replaceState(null, '', '#/story/' + n); } catch (e) {} } };
  function mountAlt(n) {
    noScroll(true); window.scrollTo(0, 0); srcOpen = false; scenes = []; mounted = 'alt';
    document.body.classList.remove('ondark');
    window.ALT.mount(xmode, GS, n); setEditable(); xswitch();
  }

  function mountStory(n) {
    document.body.classList.remove('x-rail');
    if (xmode !== 'stage' && xmode !== 'rail') { mountAlt(n); return; }
    if (window.ALT) window.ALT.destroy();
    const N = C.book.length;
    noScroll(true); window.scrollTo(0, 0); srcOpen = false;
    app.innerHTML = `${topbar('story')}<div class="story" id="story" style="--n:${N}"><div class="pin" id="pin">${C.book.map((_, i) => variant === 'a' ? sceneHTML(i) : genHTML(i)).join('')}
      <div class="hud"><button class="arrow" type="button" data-sprev aria-label="Previous">‹</button><div class="tl"><div class="ticks"></div>${C.book.map((p, k) => `<button class="chap" style="left:${((k + 0.5) / N * 100).toFixed(2)}%" data-goto="${k + 1}" title="${esc(strip(p.lead || p.kicker).slice(0, 50))}" type="button"></button>`).join('')}<i class="mk" id="mk"></i></div><button class="arrow" type="button" data-snext aria-label="Next">›</button><span class="cnt mono" id="cnt"></span><span class="vsw mono" id="vsw">Layout ${['a', 'b', 'c'].map(k => `<button type="button" data-var="${k}" class="${variant === k ? 'on' : ''}">${k.toUpperCase()}</button>`).join('')}</span></div>
      <div class="scrollhint" id="hint">Scroll or press →</div></div></div>
      <section class="endsources" id="endsources"><button class="srcclose mono" type="button" data-srcclose>Back to the story ↑</button><div class="mono" data-path="sources.kicker">Sources</div><h2 data-path="sources.lead">${esc((C.sources || {}).lead || 'Where this comes from.')}</h2><p class="lede" data-path="sources.body">${esc((C.sources || {}).body || '')}</p>
        <ul class="reflist">${C.essay.references.map((r, k) => `<li><span data-path="essay.references.${k}.text">${esc(r.text)}</span>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">open</a>` : ''}</li>`).join('')}</ul></section>
      <aside class="card" id="card" hidden></aside>`;
    mounted = 'story'; scenes = $$('.scene'); scenes.forEach(s => { s.__on = false; });
    if (xmode === 'rail') {
      document.body.classList.add('x-rail');
      const lab = p => { const t = strip(p.lead || ''); return t && t.length <= 48 ? t : p.kicker; };
      app.insertAdjacentHTML('beforeend', `<nav class="xrail">${C.book.map((p, k) => `<button type="button" data-goto="${k + 1}"><i>${String(k + 1).padStart(2, '0')}</i><span>${esc(lab(p))}</span></button>`).join('')}</nav>`);
    }
    applyLayout(); vp = n > 1 ? n - 1 + REST : -0.2; tick(); setEditable();
    if (n <= 1) animateTo(REST, 1900);
  }

  /* ---------- movable blocks (edit mode) ---------- */
  const SKIP = '.kick,.shade,.bgph,.hud,.scrollhint,.gs,.vsw';
  const HOLD = '.vr,.ct,.dt,.cr,.pc,.cl,.gl,.gb,.gtx,.hlw,.cclip';
  function keyOf(el) {
    const sc = el.closest('.scene'); if (!sc) return null;
    const path = []; let n = el;
    while (n && n !== sc) { path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n)); n = n.parentElement; }
    return scenes.indexOf(sc) + ':' + path.join('.');
  }
  function movable(t) {
    for (let n = t; n && n.classList; n = n.parentElement) {
      if (n.classList.contains('scene')) return null;
      const p = n.parentElement; if (!p) return null;
      if (n.matches(SKIP)) return null;
      if (p.classList.contains('scene') || (p.parentElement && p.parentElement.classList.contains('scene') && p.matches(HOLD))) return n;
    }
    return null;
  }
  function applyLayout() {
    const L = C.layout || {};
    scenes.forEach((sc, i) => {
      const all = sc.querySelectorAll('*');
      Object.keys(L).forEach(k => {
        const [si, path] = k.split(':'); if (Number(si) !== i) return;
        let n = sc; for (const j of path.split('.')) { n = n && n.children[Number(j)]; }
        if (n && n !== sc) n.style.translate = `${L[k].x}vw ${L[k].y}vh`;
      });
    });
  }
  let mvEl = null, mvDrag = null, mvTimer = null;
  const mvh = document.createElement('div'); mvh.id = 'mvh'; mvh.textContent = '✥ move · double-click to reset'; mvh.hidden = true; document.body.appendChild(mvh);
  function mvPlace() { if (!mvEl || !editing) { mvh.hidden = true; return; } const r = mvEl.getBoundingClientRect(); mvh.hidden = false; mvh.style.left = Math.max(4, r.left) + 'px'; mvh.style.top = Math.max(4, r.top - 22) + 'px'; }
  document.addEventListener('mouseover', e => { if (!editing || mvDrag) return; if (e.target === mvh) return; const m = movable(e.target); if (m && m !== mvEl) { mvEl = m; mvPlace(); } else if (!m && !e.target.closest('#mvh')) { /* keep last */ } });
  mvh.addEventListener('pointerdown', e => {
    if (!mvEl) return; e.preventDefault(); mvh.setPointerCapture(e.pointerId);
    const k = keyOf(mvEl); C.layout = C.layout || {}; const cur = C.layout[k] || { x: 0, y: 0 };
    mvDrag = { sx: e.clientX, sy: e.clientY, x: cur.x, y: cur.y, k };
  });
  mvh.addEventListener('pointermove', e => {
    if (!mvDrag) return;
    const x = mvDrag.x + (e.clientX - mvDrag.sx) / innerWidth * 100, y = mvDrag.y + (e.clientY - mvDrag.sy) / innerHeight * 100;
    C.layout[mvDrag.k] = { x: +x.toFixed(2), y: +y.toFixed(2) }; mvEl.style.translate = `${x.toFixed(2)}vw ${y.toFixed(2)}vh`; mvPlace();
  });
  const mvEnd = () => { if (!mvDrag) return; mvDrag = null; clearTimeout(mvTimer); mvTimer = setTimeout(save, 500); };
  mvh.addEventListener('pointerup', mvEnd); mvh.addEventListener('pointercancel', mvEnd);
  mvh.addEventListener('dblclick', () => { if (!mvEl) return; const k = keyOf(mvEl); if (C.layout) delete C.layout[k]; mvEl.style.translate = ''; mvPlace(); clearTimeout(mvTimer); mvTimer = setTimeout(save, 300); });
  setInterval(() => { if (!editing) mvh.hidden = true; else if (mvEl && !document.body.contains(mvEl)) { mvEl = null; mvh.hidden = true; } }, 400);

  function tick() {
    ticking = false;
    if (mounted !== 'story') return;
    const p = vp, N = scenes.length;
    let best = -1, act = 0;
    scenes.forEach((el, i) => {
      const x = p - i;
      if (x < -0.3 || x > (trans === 'push' ? 1.55 : 1.3)) { if (el.__on) { el.classList.remove('play'); el.style.visibility = 'hidden'; el.style.opacity = 0; el.__on = false; stopClips(el); } return; }
      if (!el.__on) { el.style.visibility = 'visible'; el.__on = true; }
      el.style.setProperty('--x', x.toFixed(4));
      if (el.classList.contains('thesis')) el.classList.toggle('play', x > 0.3 && x < 1.15);
      const e = i === 0 ? 1 : clamp((x + 0.2) / 0.4, 0, 1), op = 1 - Math.min(1, Math.abs(x - 0.8));
      const out = clamp((x - 0.8) / 0.4, 0, 1); let cp = 'none', tf = 'none', oc = 1 - out * 0.5;
      if (trans === 'wipe') {
        // each scene wipes in over the one before, in a changing direction; the one it covers drifts away
        const v = i % 3, r = (1 - e) * 100;
        cp = e >= 1 ? 'none' : v === 0 ? `inset(${r}% 0 0 0)` : v === 1 ? `inset(0 0 0 ${r}%)` : `inset(0 ${r / 2}% 0 ${r / 2}%)`;
        if (out > 0) tf = `translate3d(${v === 1 ? -out * 7 : 0}%, ${v === 1 ? 0 : -out * 6}%, 0) scale(${1 - out * 0.04})`;
      } else if (trans === 'fade') {
        oc = Math.min(e, 1 - out); tf = `scale(${(1 + (1 - e) * 0.035 - out * 0.03).toFixed(4)})`;
      } else if (trans === 'push') {
        // the push takes a longer stretch of the timeline and is eased on its own, so it glides in and settles
        const pe = i === 0 ? 1 : sine(clamp((x + 0.2) / 0.7, 0, 1)), po = sine(clamp((x - 0.8) / 0.7, 0, 1));
        tf = pe < 1 ? `translate3d(0, ${((1 - pe) * 100).toFixed(3)}%, 0)` : po > 0 ? `translate3d(0, ${(-po * 22).toFixed(3)}%, 0) scale(${(1 - po * 0.035).toFixed(4)})` : 'none'; oc = 1 - po * 0.45;
      } else if (trans === 'zoom') {
        oc = Math.min(e, 1 - out); tf = `scale(${(e < 1 ? 1.16 - 0.16 * e : 1 - out * 0.1).toFixed(4)})`;
      } else if (trans === 'iris') {
        cp = e >= 1 ? 'none' : `circle(${(e * 80).toFixed(1)}% at 50% 52%)`; if (out > 0) tf = `scale(${1 - out * 0.05})`;
      }
      el.style.clipPath = cp; el.style.transform = tf; el.style.opacity = oc; el.style.zIndex = i; el.style.pointerEvents = Math.abs(x - 0.8) < 0.3 ? 'auto' : 'none';
      if (op > best) { best = op; act = i; }
      const want = x > -0.05 && x < 1.05;
      if (want && !el.__clips && $('.clip[data-clip]', el)) startClips(el);
      if (!want && el.__clips) stopClips(el);
      const cx = $('[data-countx]', el); if (cx) cx.textContent = Math.round((Number(cx.dataset.countx) || 0) * clamp((x - 0.1) / 0.45, 0, 1));
    });
    activeScene = act;
    document.body.classList.toggle('ondark', !!scenes[act].dataset.dark && !srcOpen);
    const mk = $('#mk'); if (mk) mk.style.left = (clamp(p - 0.3, 0, N) / N * 100).toFixed(2) + '%';
    const cnt = $('#cnt'); if (cnt) cnt.textContent = `${act + 1} / ${N}`;
    $$('.xrail button').forEach((b, k) => b.classList.toggle('on', k === act));
    const hint = $('#hint'); if (hint) hint.style.opacity = p > 1 ? 0 : 1;
    const pv = $('[data-sprev]'), nx = $('[data-snext]'); if (pv) pv.disabled = act === 0 && !srcOpen; if (nx) nx.disabled = srcOpen;
  }
    const dur = () => trans === 'push' ? 1750 : 1500;
    const REST = 0.8; // where a scene rests: everything revealed
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let animWd = null;
  const sine = t => -(Math.cos(Math.PI * t) - 1) / 2;
  function animateTo(to, ms, done) {
    cancelAnimationFrame(anim); clearInterval(animWd);
    const from = vp, t0 = performance.now(), id = ++animId, vEase = trans === 'push' ? (t => t) : ease; let last = t0;
    const f = () => {
      if (id !== animId) return;
      cancelAnimationFrame(anim); last = performance.now();
      const k = clamp((last - t0) / ms, 0, 1); vp = from + (to - from) * vEase(k); tick();
      if (k < 1) anim = requestAnimationFrame(f); else { clearInterval(animWd); stepLock = false; done && done(); }
    };
    // a timer only steps in when the browser has stopped drawing frames
    animWd = setInterval(() => { if (id !== animId) { clearInterval(animWd); return; } if (performance.now() - last > 120) f(); }, 60);
    stepLock = true; f();
  }
  function openSources(on) {
    srcOpen = on; const el = $('#endsources'); if (el) { el.classList.toggle('open', on); if (on) el.scrollTop = 0; }
    tick();
  }
  function sceneTo(n, smooth) {
    n = clamp(n, 1, C.book.length); const target = n - 1 + REST;
    if (srcOpen) openSources(false);
    if (!smooth) { vp = target; tick(); return; }
    if (stepLock || Math.abs(vp - target) < 0.01) return;
    if (Math.abs(vp - target) <= 1.01) { animateTo(target, dur()); return; }
    // far jump: dissolve out, land just before the scene, play its entrance
    const pin = $('#pin'); stepLock = true;
    if (pin) { pin.style.transition = 'opacity .25s'; pin.style.opacity = 0; }
    setTimeout(() => { vp = n - 1 - 0.2; tick(); if (pin) pin.style.opacity = 1; animateTo(target, dur()); }, 280);
  }
  function stepBy(d) {
    if (mounted !== 'story' || stepLock) return;
    if (srcOpen) { if (d < 0) openSources(false); return; }
    const cur = Math.round(vp - REST) + 1, n = cur + d;
    if (n > C.book.length) { openSources(true); return; }
    if (n < 1) return;
    sceneTo(n, true);
  }
  // one gesture = one step: wheel, swipe, keys
  let wAcc = 0, wT = 0, tY = null, scrubDir = 1, settleT = null;
  window.addEventListener('wheel', e => {
    if (mounted !== 'story' || srcOpen || (e.target.closest && e.target.closest('#card,#cardsPanel,#contents'))) return;
    e.preventDefault();
    if (scrollMode === 'scrub') {
      // the scene follows the wheel, and settles on the nearest one when you stop
      const top = C.book.length - 1 + REST;
      if (vp >= top - 0.001 && e.deltaY > 0) { const now = performance.now(); if (now - wT > 300) wAcc = 0; wT = now; wAcc += e.deltaY; if (wAcc > 140 && !stepLock) { wAcc = 0; stepBy(1); } return; }
      cancelAnimationFrame(anim); animId++; stepLock = false;
      vp = clamp(vp + e.deltaY / 620, REST, top); scrubDir = e.deltaY > 0 ? 1 : -1; tick();
      clearTimeout(settleT); settleT = setTimeout(() => {
        const c = vp - REST, b = Math.floor(c), f = c - b;
        const t = (scrubDir > 0 ? (f > 0.1 ? b + 1 : b) : (f < 0.9 ? b : b + 1)) + REST;
        animateTo(t, 350 + Math.abs(t - vp) * 700);
      }, 130);
      return;
    }
    const now = performance.now(); if (now - wT > 220) wAcc = 0; wT = now; wAcc += e.deltaY;
    if (!stepLock && Math.abs(wAcc) > 40) { const d = wAcc > 0 ? 1 : -1; wAcc = 0; stepBy(d); }
  }, { passive: false });
  document.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('.vt'); const cp = $('#vcap'); if (t && cp) cp.textContent = t.dataset.cap + (t.classList.contains('keep') ? ' · the one I would call back' : ''); });
  window.addEventListener('touchstart', e => { tY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchend', e => { if (tY == null || mounted !== 'story' || srcOpen) return; const dy = tY - e.changedTouches[0].clientY; tY = null; if (Math.abs(dy) > 50) stepBy(dy > 0 ? 1 : -1); }, { passive: true });

  /* ---------- full essay: scrolls, with things that stay ---------- */
  function mountEssay(anchor) {
    const secs = C.essay.sections;
    noScroll(false); window.scrollTo(0, 0);
    const toc = secs.map(s => s.level === 2 ? `<a data-sec="${esc(s.id)}">${esc(strip(s.heading))}</a>` : '').join('') + `<a data-sec="references">References</a>`;
    const FIGM = C.essay.figures || {}, usedFig = new Set();
    const inline = t => {
      if (!phone) return ''; let h = '';
      const m = /Figures?\s+(\d)/.exec(t);
      if (m && FIGM[m[1]] && !usedFig.has(m[1])) { usedFig.add(m[1]); const f = FIGM[m[1]]; h += `<figure class="inl"><img src="${src(f)}" alt=""><figcaption class="mono">Figure ${m[1]}${galCap[f] ? ' · ' + esc(galCap[f]) : ''} · Juergen Teller</figcaption></figure>`; }
      const re = /\{\{v:([^|}]+)\|/g; let q; while ((q = re.exec(t))) { const cd = C.cards[q[1]]; if (cd && cd.kind === 'video') h += `<div class="inl-clip">${clipHTML(q[1])}</div>`; }
      return h;
    };
    const art = secs.map((s, i) => {
      const head = s.heading ? `<h2 class="${s.level === 3 ? 'sub' : ''}" data-path="essay.sections.${i}.heading" data-rich="1">${rich(s.heading)}</h2>` : '';
      const paras = s.paras.map((t, k) => `<p class="${i === 0 && k === 0 ? 'lead2' : ''}" data-path="essay.sections.${i}.paras.${k}" data-rich="1">${rich(t)}</p>${inline(t)}`).join('');
      const pic = phone && s.photo ? `<figure class="inl"><img src="${src(s.photo)}" alt=""><figcaption class="mono">${esc(galCap[s.photo] || '')}${galCap[s.photo] ? ' · ' : ''}Juergen Teller</figcaption></figure>` : '';
      return `<section id="sec-${esc(s.id)}" data-photo="${esc(s.photo || '')}">${head}${pic}${paras}</section>`;
    }).join('');
    const refs = `<section id="sec-references"><h2>References</h2>${C.essay.references.map((r, k) => `<p style="font-size:14px;line-height:1.55;margin:0 0 12px"><span data-path="essay.references.${k}.text">${esc(r.text)}</span>${r.url ? ` <a class="mono" style="color:var(--rust);text-decoration:none;font-size:10px" href="${esc(r.url)}" target="_blank" rel="noopener">open</a>` : ''}</p>`).join('')}<p class="disc" data-path="site.disclosure">${esc((C.site || {}).disclosure || '')}</p></section>`;
    const FIGP = Object.values(C.essay.figures || {}); const figs = [...new Set([...secs.map(s => s.photo), ...FIGP].filter(Boolean))].map(f => `<img data-f="${f}" src="${src(f)}" alt="">`).join('');
    app.innerHTML = `${topbar('essay')}<div class="prog"><i id="progbar"></i></div><div class="essay"><nav class="toc"><div class="mono" style="margin-bottom:6px">Contents</div>${toc}</nav>
      <article class="col"><div class="mono">Full essay</div><h1 data-path="site.title">${esc(C.site.title)}</h1>${art}${refs}</article>
      <aside class="sidecol"><div class="sfig" id="sfig">${figs}</div><div class="mono sfigcap" id="sfigcap"></div><div class="side" id="side"><div class="hint mono">Click an underlined phrase to open the interview, quote or source.</div></div></aside></div>
      <div class="progtext mono" id="progtext"></div><aside class="card" id="card" hidden></aside>`;
    mounted = 'essay'; scenes = []; if (phone) startClips($('.col'));
    document.body.classList.remove('ondark'); document.body.classList.add('inessay');
    essayScroll();
    if (anchor) { const t = $('#sec-' + anchor); if (t) t.scrollIntoView(); }
    setEditable();
  }
  let lastFig = '';
  function essayScroll() {
    const h = document.documentElement, p = clamp(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight), 0, 1);
    const bar = $('#progbar'); if (bar) bar.style.width = (p * 100) + '%';
    const pt = $('#progtext'); if (pt) pt.textContent = `${Math.round(p * 100)}%`;
    let on = null; $$('.col section').forEach(s => { if (s.getBoundingClientRect().top < innerHeight * 0.38) on = s; });
    if (!on) on = $('.col section');
    const id = on.id.replace('sec-', ''), secs = C.essay.sections, idx = secs.findIndex(s => s.id === id); let owner = id;
    if (idx >= 0 && secs[idx].level !== 2) { for (let k = idx; k >= 0; k--) if (secs[k].level === 2) { owner = secs[k].id; break; } }
    // where we are: every contents entry fills as its part is read
    const own = {}; let cur = '';
    secs.forEach(x => { if (x.level === 2) cur = x.id; (own[cur] = own[cur] || []).push(x.id); });
    own.references = ['references'];
    const mid = innerHeight * 0.38; let n = 0, tot = 0;
    $$('.toc a').forEach(a => {
      tot++; const els = (own[a.dataset.sec] || []).map(i => $('#sec-' + i)).filter(Boolean); if (!els.length) return;
      const top = els[0].getBoundingClientRect().top, bot = els[els.length - 1].getBoundingClientRect().bottom;
      const q = clamp((mid - top) / Math.max(1, bot - top), 0, 1); a.style.setProperty('--p', (q * 100).toFixed(1) + '%');
      a.classList.toggle('done', q >= 1); a.classList.toggle('on', a.dataset.sec === owner); if (a.dataset.sec === owner) n = tot;
    });
    const pt2 = $('#progtext'); if (pt2) pt2.textContent = `Part ${n} of ${tot} · ${Math.round(p * 100)}%`;
    // the figure beside the text follows the paragraph being read: if it cites Figure N, show exactly those figures
    let pe = null; $$('.col p[data-path]').forEach(q => { if (q.getBoundingClientRect().top < innerHeight * 0.38) pe = q; });
    const FIG = C.essay.figures || {}, cited = [];
    if (pe) { const re = /Figures?\s+(\d)(?:\s*(?:and|,|&)\s*(\d))?/g; let m; while ((m = re.exec(pe.textContent))) { [m[1], m[2]].forEach(n => { if (n && FIG[n] && !cited.includes(n)) cited.push(n); }); } }
    if (cited.length > 1) cited.length = 1;
    const photos = cited.length ? cited.map(n => FIG[n]) : [on.dataset.photo || (secs[idx] && secs[idx].photo) || ''];
    const key = cited.join(',') + '|' + photos.join(',');
    if (photos[0] && key !== lastFig) {
      lastFig = key; const sf = $('#sfig'); if (sf) sf.classList.toggle('two', photos.length > 1);
      $$('#sfig img').forEach(im => { const at = photos.indexOf(im.dataset.f); im.classList.toggle('on', at >= 0); im.style.left = photos.length > 1 ? (Math.max(at, 0) * 50) + '%' : '0'; im.style.width = photos.length > 1 ? '50%' : '100%'; });
      const cp = $('#sfigcap'); if (cp) cp.innerHTML = photos.map((f, i) => (cited.length ? `<b>Figure ${cited[i]}</b> · ` : '') + esc(galCap[f] || '') + ' · Juergen Teller').join('<br>');
    }
  }
  // an opened card in the essay closes by itself once you scroll on
  window.addEventListener('scroll', () => { if (mounted === 'essay' && $('#side .card') && Math.abs(scrollY - cardY) > 260) closeCard(); }, { passive: true });
  window.addEventListener('scroll', () => {
    if (mounted === 'story' && !ticking) { ticking = true; requestAnimationFrame(tick); }
    else if (mounted === 'essay') essayScroll();
  }, { passive: true });
  window.addEventListener('resize', () => { if (mounted === 'story') tick(); });

  /* ---------- render driver ---------- */
  function render() {
    const r = parse(); current = r; closeSelTool(); if (r.view !== 'cover') leaveCover(); $('#contents').hidden = true; closeCard();
    if (r.view !== 'essay') document.body.classList.remove('inessay');
    if (r.view !== 'story') document.body.classList.remove('x-rail');
    if (mounted === 'alt' && r.view !== 'story') window.ALT.destroy();
    if (r.view === 'story') { if (mounted === 'alt' && window.ALT.cur && window.ALT.cur.goto) window.ALT.cur.goto(r.n); else if (mounted === 'story') sceneTo(r.n, true); else mountStory(r.n); }
    else if (r.view === 'essay') { if (mounted === 'essay') { if (r.anchor) { const t = $('#sec-' + r.anchor); if (t) t.scrollIntoView({ behavior: 'smooth' }); } } else mountEssay(r.anchor); }
    else mountCover();
    document.title = strip(C.site.title); xswitch();
  }
  window.addEventListener('hashchange', render);

  /* ---------- cards ---------- */
  function cardHTML(id) {
    const c = C.cards[id];
    if (!c) return `<p class="note">Missing card “${esc(id)}”.</p><button class="x" type="button" data-close>Close ×</button>`;
    let h = '';
    if (c.kind === 'source') {
      h = `<div class="mono lab src">Source${c.year ? ' · ' + esc(c.year) : ''}</div><p class="ref">${esc(c.text)}</p>${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}${c.url ? `<a class="mono lnk" href="${esc(c.url)}" target="_blank" rel="noopener">Open source →</a>` : ''}`;
    } else if (c.kind === 'quote') {
      h = `<div class="mono lab">Voice · ${esc(c.short)}</div><p class="quote">${esc(c.text)}</p><p class="note">${esc(c.cite || '')}</p>${c.url ? `<a class="mono lnk" href="${esc(c.url)}" target="_blank" rel="noopener">Read on the source →</a>` : ''}`;
    } else if (c.kind === 'video') {
      const sg = parseSegs(c)[0];
      h = `<div class="mono lab">Voice · video</div><div class="video" data-yt="${esc(c.youtube)}" data-start="${sg[0]}" data-end="${sg[1] || 0}"><img alt="" src="https://i.ytimg.com/vi/${esc(c.youtube)}/hqdefault.jpg"><button class="playbtn" type="button" aria-label="Play">▶</button></div><p class="ref">${esc(c.text)}</p><p class="note">${esc(c.cite || '')}</p><a class="mono lnk" href="https://www.youtube.com/watch?v=${esc(c.youtube)}" target="_blank" rel="noopener">Open on YouTube →</a>`;
    } else if (c.kind === 'slot') {
      const f = c.file ? esc(c.file) : '';
      const media = f ? (/\.(mp3|m4a|wav)$/i.test(f) ? `<audio controls src="media/${f}"></audio>` : `<video controls src="media/${f}"></video>`) : '';
      h = `<div class="mono lab">Voice · clip</div>${media || `<div class="slot">${esc(c.text)}</div>`}`;
    } else {
      h = `<div class="mono lab">Photo</div><p class="ref">${esc(c.text)}</p>`;
    }
    return h + `<button class="x" type="button" data-close>Close ×</button>`;
  }
  function openCard(id) {
    const c = C.cards[id]; if (!c) return;
    $$('.hl').forEach(x => x.classList.remove('hl'));
    if (c.kind === 'image') {
      const an = $('.scene .anno', document) || $('.anno');
      if (an) { an.textContent = c.text; an.parentElement.classList.add('hl'); }
      return;
    }
    if (mounted === 'essay') { $('#side').innerHTML = `<div class="card">${cardHTML(id)}</div>`; cardY = scrollY; return; }
    const cd = $('#card'); if (!cd) return; cd.hidden = true; cd.innerHTML = cardHTML(id); void cd.offsetWidth; cd.hidden = false;
  }
  let cardY = 0;
  function closeCard() {
    $$('.hl').forEach(x => x.classList.remove('hl'));
    const cd = $('#card'); if (cd) cd.hidden = true;
    const sd = $('#side'); if (sd) sd.innerHTML = '<div class="hint mono">Click an underlined phrase to open the interview, quote or source.</div>';
  }

  /* ---------- editing ---------- */
  function setEditable() {
    document.body.classList.toggle('editing', editing);
    $('#cardsBtn').hidden = !editing;
    $('#editToggle').textContent = editing ? 'Done' : 'Edit text';
    $$('[data-path]').forEach(el => { if (editing) el.setAttribute('contenteditable', el.dataset.rich ? 'true' : 'plaintext-only'); else el.removeAttribute('contenteditable'); });
    if (!editing) { closeSelTool(); $('#cardsPanel').hidden = true; }
  }
  $('#editToggle').addEventListener('click', () => { editing = !editing; setEditable(); setStatus(editing ? 'Click any text to edit. Changes save by themselves.' : ''); });

  document.addEventListener('input', e => {
    const el = e.target.closest && e.target.closest('[data-path]'); if (!el || !editing) return;
    set(el.dataset.path, el.dataset.rich ? ser(el) : el.textContent.replace(/\s+/g, ' ').trim());
    queueSave();
  });
  document.addEventListener('keydown', e => {
    const inField = /INPUT|TEXTAREA/.test((e.target || {}).tagName || '');
    if (editing && e.key === 'Enter' && e.target.closest && e.target.closest('[data-path]')) e.preventDefault();
    if (e.key === 'Escape') { if (editing) { $('#cardsPanel').hidden = true; closeSelTool(); } closeCard(); $('#contents').hidden = true; return; }
    if (editing || inField) return;
    if (mounted === 'story' && !e.target.closest('input,textarea,[contenteditable=true]')) { const nx = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key), pv = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key); if (nx || pv) { e.preventDefault(); stepBy(nx ? 1 : -1); } if (e.key === 'Escape' && srcOpen) openSources(false); }
  });
  document.addEventListener('paste', e => {
    const el = e.target.closest && e.target.closest('[data-path]'); if (!el || !editing) return;
    e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' '));
  });

  /* selection toolbar */
  const tool = $('#seltool'); let savedRange = null, toolEl = null;
  function closeSelTool() { tool.hidden = true; savedRange = null; }
  const KINDS = { v: ['quote', 'video', 'slot'], s: ['source'], i: ['image'] };
  document.addEventListener('selectionchange', () => {
    if (!editing) return;
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { if (!tool.matches(':hover')) closeSelTool(); return; }
    const a = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
    const el = a && a.closest && a.closest('[data-rich]');
    if (!el || !el.contains(sel.focusNode)) return;
    toolEl = el; savedRange = sel.getRangeAt(0).cloneRange();
    const rect = savedRange.getBoundingClientRect();
    tool.innerHTML = `<button class="k-v" data-mark="v" type="button">Voice</button><button class="k-s" data-mark="s" type="button">Source</button><button data-mark="i" type="button">Photo</button><button data-mark="plain" type="button">Plain</button>`;
    tool.style.left = Math.max(8, Math.min(window.innerWidth - 390, rect.left)) + 'px';
    tool.style.top = Math.max(8, rect.top - 48) + 'px';
    tool.hidden = false;
  });
  tool.addEventListener('mousedown', e => e.preventDefault());
  tool.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !savedRange) return;
    if (b.dataset.mark) {
      if (b.dataset.mark === 'plain') { unmark(); return; }
      const k = b.dataset.mark, ids = Object.keys(C.cards).filter(id => KINDS[k].includes(C.cards[id].kind));
      tool.innerHTML = ids.map(id => `<button data-card="${id}" data-k="${k}" type="button">${esc(C.cards[id].short || id)}</button>`).join('') + `<button data-new="${k}" type="button">+ New</button>`;
      return;
    }
    if (b.dataset.card) mark(b.dataset.k, b.dataset.card);
    if (b.dataset.new) { const k = b.dataset.new, id = k + '-' + Date.now().toString(36); C.cards[id] = k === 's' ? { kind: 'source', short: 'New source', year: '', text: 'Reference text', note: '', url: '' } : k === 'v' ? { kind: 'quote', short: 'New quote', text: '“Quote”', cite: 'Who, where', url: '' } : { kind: 'image', short: 'New note', text: 'What to notice in the photo' }; mark(k, id); queueSave(); openCardsPanel(id); }
  });
  function unwrap(s) { const p = s.parentNode; while (s.firstChild) p.insertBefore(s.firstChild, s); p.removeChild(s); p.normalize(); }
  function commit() { if (toolEl) { set(toolEl.dataset.path, ser(toolEl)); queueSave(); } closeSelTool(); getSelection().removeAllRanges(); }
  function mark(kind, id) {
    const r = savedRange; if (!r) return;
    const span = document.createElement('span'); span.className = 'ul ' + kind; span.dataset.kind = kind; span.dataset.card = id;
    span.appendChild(r.extractContents()); r.insertNode(span);
    $$('.ul .ul', span.parentNode).forEach(unwrap); $$('.ul', span).forEach(unwrap);
    commit();
  }
  function unmark() {
    const r = savedRange; if (!r || !toolEl) return;
    $$('.ul', toolEl).forEach(s => { if (r.intersectsNode(s)) unwrap(s); });
    commit();
  }

  /* cards panel */
  const panel = $('#cardsPanel');
  const FIELDS = { source: ['short', 'year', 'text', 'note', 'url'], quote: ['short', 'text', 'cite', 'url'], video: ['short', 'youtube', 'start', 'end', 'segments', 'text', 'cite'], slot: ['short', 'text', 'file'], image: ['short', 'text'] };
  function openCardsPanel(focusId) {
    panel.innerHTML = `<div class="mono" style="color:var(--ink)">Cards · what the underlined phrases open</div><p class="note" style="font-size:12.5px;color:var(--mid);line-height:1.5">Edit anything. Changes save by themselves. Video cards: start and end are seconds into the YouTube video. For several cuts in a row, fill “segments” like <b>35-50, 90-102</b>. Your own clip: put the file in public/media and type its name into “file”.</p>` +
      Object.keys(C.cards).map(id => {
        const c = C.cards[id];
        return `<div class="cc" id="cc-${id}"><div class="mono">${esc(id)} · ${esc(c.kind)}</div>${(FIELDS[c.kind] || []).map(f => `<label class="mono">${f}${(f === 'text' || f === 'note') ? `<textarea data-cf="${id}.${f}">${esc(c[f] || '')}</textarea>` : `<input data-cf="${id}.${f}" value="${esc(c[f] || '')}">`}</label>`).join('')}<button class="del mono" data-delcard="${id}" type="button">Delete card</button></div>`;
      }).join('');
    panel.hidden = false;
    if (focusId) { const t = $('#cc-' + focusId); if (t) t.scrollIntoView(); }
  }
  $('#cardsBtn').addEventListener('click', () => { panel.hidden ? openCardsPanel() : (panel.hidden = true); });
  panel.addEventListener('input', e => { const f = e.target.dataset.cf; if (!f) return; const [id, field] = f.split('.'); C.cards[id][field] = (field === 'start' || field === 'end') ? Number(e.target.value) || 0 : e.target.value; queueSave(); });
  panel.addEventListener('click', e => { const d = e.target.dataset.delcard; if (d && confirm('Delete this card? Phrases that point to it will open nothing.')) { delete C.cards[d]; queueSave(); openCardsPanel(); } });

  /* ---------- global clicks ---------- */
  document.addEventListener('click', e => {
    const t = e.target;
    const ul = t.closest && t.closest('.ul');
    if (ul && !editing) { openCard(ul.dataset.card); return; }
    if (t.closest && t.closest('[data-close]')) { closeCard(); return; }
    const pb = t.closest && t.closest('.playbtn, #card .video, #side .video');
    if (pb) { const v = pb.closest('.video'); if (v && !v.querySelector('iframe')) v.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.dataset.yt)}?autoplay=1&rel=0&start=${encodeURIComponent(v.dataset.start || 0)}${Number(v.dataset.end) ? '&end=' + encodeURIComponent(v.dataset.end) : ''}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`; return; }
    const op = t.closest && t.closest('[data-open]');
    if (op) { e.preventDefault(); const bo = $('#coverbook'); if (bo) { bo.classList.add('opening'); setTimeout(() => go('#/story/1'), 900); } else go('#/story/1'); return; }
    const xt = t.closest && t.closest('[data-trans],[data-scroll]');
    if (xt) {
      if (xt.dataset.trans) { trans = xt.dataset.trans; try { localStorage.setItem('gs-trans', trans); } catch (er) {} } else { scrollMode = xt.dataset.scroll; try { localStorage.setItem('gs-scroll', scrollMode); } catch (er) {} }
      xtrans();
      if (xt.dataset.trans && mounted === 'story') { const k = activeScene; stepLock = false; animId++; vp = k + REST - 0.62; tick(); animateTo(k + REST, dur()); }
      return;
    }
    const xm = t.closest && t.closest('[data-xmode]'); if (xm) { xmode = xm.dataset.xmode; try { localStorage.setItem('gs-explore', xmode); } catch (er) {} stepLock = false; animId++; mounted = ''; mountStory(current.n || 1); return; }
    const vb = t.closest && t.closest('[data-var]'); if (vb) { variant = vb.dataset.var; try { localStorage.setItem('gs-variant', variant); } catch (er) {} const n = activeScene + 1; stepLock = false; animId++; mountStory(n); return; }
    const g = t.closest && t.closest('[data-goto]'); if (g && !editing) { sceneTo(Number(g.dataset.goto), true); return; }
    if (t.closest && t.closest('[data-sprev]')) { stepBy(-1); return; }
    if (t.closest && t.closest('[data-srcclose]')) { openSources(false); return; }
    if (t.closest && t.closest('[data-snext]')) { stepBy(1); return; }
    const ts = t.closest && t.closest('.toc a'); if (ts) { const x = $('#sec-' + ts.dataset.sec); if (x) x.scrollIntoView({ behavior: 'smooth' }); return; }
    if (t.closest && t.closest('[data-contents]')) { showContents(); return; }
    const sec = t.closest && t.closest('[data-essaysec]'); if (sec) { $('#contents').hidden = true; if (mounted === 'essay') { const x = $('#sec-' + sec.dataset.essaysec); if (x) x.scrollIntoView({ behavior: 'smooth' }); } else go('#/essay/' + sec.dataset.essaysec); return; }
    const sc = t.closest && t.closest('[data-scene]'); if (sc) { $('#contents').hidden = true; const n = Number(sc.dataset.scene); if (mounted === 'story') sceneTo(n, true); else go('#/story/' + n); return; }
    if ($('#contents') && !$('#contents').hidden && !t.closest('.contents ol')) $('#contents').hidden = true;
  });
  function showContents() {
    const c = $('#contents');
    c.innerHTML = `<ol><li style="border:0"><span class="mono">Explore</span></li>${C.book.map((p, i) => `<li><a data-scene="${i + 1}"><span class="mono">${String(i + 1).padStart(2, '0')}</span>${esc(strip(p.lead || p.kicker).slice(0, 70))}</a></li>`).join('')}<li style="border:0"><h3 class="mono">The full essay</h3></li>${C.essay.sections.filter(s => s.level === 2).map(s => `<li><a data-essaysec="${esc(s.id)}"><span class="mono">··</span>${esc(strip(s.heading))}</a></li>`).join('')}<li><a data-essaysec="references"><span class="mono">··</span>References</a></li></ol>`;
    c.hidden = false;
  }

  /* the text cannot be selected, copied or dragged, except by you while editing */
  ['copy', 'cut', 'dragstart', 'selectstart', 'contextmenu'].forEach(ev => document.addEventListener(ev, e => {
    if (editing || (e.target.closest && e.target.closest('input, textarea'))) return;
    e.preventDefault();
  }));

  render();
})();
