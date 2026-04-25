/* =================================================================
   kepp.terminal — portfolio + timer script
   - tab routing via URL hash (#portfolio / #timer)
   - timer with localStorage persistence + crash-safe current session
   - .ics + .csv export, today/week views, edit/delete sessions
   - portfolio render supports: grouped skills, project period/links,
     cert issuer/note, learning status badges (done/in-progress/
     ongoing/planned) with conditional progress bars
================================================================= */

(() => {
  'use strict';

  // ---------- Constants ----------
  const STORAGE_SESSIONS = 'portfolio.timer.sessions.v1';
  const STORAGE_CURRENT  = 'portfolio.timer.current.v1';
  const VALID_TABS       = ['portfolio', 'timer'];
  const BAR_W            = 20;   // ascii bar width for skills / learning
  const STAT_BAR_W       = 22;   // weekly stats bar width

  // ---------- State ----------
  const state = {
    data: null,
    sessions: [],
    current: null,               // { id, project, memo, startedAt }
    view: 'today',               // 'today' | 'week'
    includeExported: false,
    editingId: null,
    tickHandle: null,
    clockHandle: null,
  };

  // ---------- Utilities ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function pad(n, w = 2){ return String(n).padStart(w, '0'); }

  function uid(prefix = 's'){
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHTML(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function fmtHMS(ms){
    const s = Math.max(0, Math.floor(ms / 1000));
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }

  function fmtHM(ms){
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return (h > 0 ? h + 'h ' : '') + m + 'm';
  }

  function fmtClockHM(d){ return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function isSameDay(a, b){
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
  }

  function startOfDay(d){
    const x = new Date(d); x.setHours(0,0,0,0); return x;
  }

  // Monday 00:00 of the week containing `date` → Monday-next-week 00:00 (exclusive)
  function getWeekRange(date = new Date()){
    const d = startOfDay(date);
    const day = d.getDay();               // 0=Sun .. 6=Sat
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d); monday.setDate(d.getDate() + diff);
    const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
    return { start: monday, end: nextMonday };
  }

  function asciiBar(pct, width = BAR_W, ch = '█', empty = '░'){
    pct = Math.max(0, Math.min(100, pct));
    const filled = Math.round((pct / 100) * width);
    return '[' + ch.repeat(filled) + empty.repeat(width - filled) + ']';
  }

  // Normalize status strings: accept UPPER_CASE, lower-case, spaces, underscores
  function normStatus(s){
    if(!s) return '';
    return String(s).toLowerCase().replace(/[_\s]+/g, '-');
  }

  function statusLabel(s){
    const n = normStatus(s);
    return ({
      'done':        'DONE',
      'in-progress': 'IN PROGRESS',
      'ongoing':     'ONGOING',
      'preparing':   'PREPARING',
      'planned':     'PLANNED',
    })[n] || (n ? n.toUpperCase() : '');
  }

  function ensureHttp(url){
    if(!url) return '';
    if(/^https?:\/\//i.test(url)) return url;
    if(url.startsWith('mailto:')) return url;
    return 'https://' + url;
  }

  // ---------- Storage ----------
  function loadFromStorage(){
    try{
      state.sessions = JSON.parse(localStorage.getItem(STORAGE_SESSIONS) || '[]');
      if(!Array.isArray(state.sessions)) state.sessions = [];
    } catch { state.sessions = []; }
    try{
      state.current = JSON.parse(localStorage.getItem(STORAGE_CURRENT) || 'null');
    } catch { state.current = null; }
  }
  function saveSessions(){
    localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(state.sessions));
  }
  function saveCurrent(){
    if(state.current) localStorage.setItem(STORAGE_CURRENT, JSON.stringify(state.current));
    else              localStorage.removeItem(STORAGE_CURRENT);
  }

  // ---------- Data loading ----------
  async function loadData(){
    try{
      const r = await fetch('data.json', { cache: 'no-cache' });
      if(!r.ok) throw new Error('fetch failed ' + r.status);
      state.data = await r.json();
    } catch(err){
      console.warn('[kepp] data.json load failed — using empty fallback', err);
      state.data = {
        header: { handle: 'kepp', title: 'KEPP.TERMINAL', subtitle: '', boot: [] },
        about: {}, skills: [], contact: {},
        projects: [], certifications: [], learning: [],
        timer: { projectTags: [] }
      };
    }
  }

  // ---------- Boot log animation ----------
  function renderBootLog(){
    const el = $('#boot-log');
    if(!el) return;
    const lines = (state.data.header && state.data.header.boot) || [];
    if(!lines.length){ el.textContent = ''; return; }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced){ el.textContent = lines.join('\n'); return; }

    el.textContent = '';
    let i = 0;
    const step = () => {
      if(i >= lines.length) return;
      el.textContent += (i === 0 ? '' : '\n') + lines[i];
      i++;
      setTimeout(step, 180);
    };
    step();
  }

  // ---------- Portfolio rendering ----------
  function renderPortfolio(){
    const d = state.data;

    renderAbout(d.about || {});
    renderSkills(d.skills || []);
    renderProjects(d.projects || []);
    renderCerts(d.certifications || []);
    renderLearning(d.learning || []);
    renderContact(d.contact || {});
  }

  function renderAbout(a){
    $('#about-role')    .textContent = a.role     || '—';
    $('#about-location').textContent = a.location || '—';
    $('#about-summary') .textContent = a.summary  || '—';
  }

  function renderContact(c){
    const setLinkOrPlaceholder = (elId, value, makeHref) => {
      const el = $(elId);
      if(!el) return;
      if(value){
        const href = makeHref(value);
        el.innerHTML = `<a href="${escapeHTML(href)}" target="_blank" rel="noopener">${escapeHTML(value)}</a>`;
        el.classList.remove('placeholder');
      } else {
        el.textContent = '[ 추후 추가 예정 ]';
        el.classList.add('placeholder');
      }
    };

    // email
    const emailEl = $('#contact-email');
    if(c.email){
      emailEl.innerHTML = `<a href="mailto:${escapeHTML(c.email)}">${escapeHTML(c.email)}</a>`;
      emailEl.classList.remove('placeholder');
    } else {
      emailEl.textContent = '—';
    }

    setLinkOrPlaceholder('#contact-github',   c.github,   ensureHttp);
    setLinkOrPlaceholder('#contact-site',     c.site,     ensureHttp);
    setLinkOrPlaceholder('#contact-blog',     c.blog,     ensureHttp);
    setLinkOrPlaceholder('#contact-linkedin', c.linkedin, ensureHttp);
    setLinkOrPlaceholder('#contact-x',        c.x,        ensureHttp);
    setLinkOrPlaceholder('#contact-resume',   c.resume,   ensureHttp);
  }

  // Skills — simple chip list grouped by category.
  // Accepts either:
  //   { "Languages": ["C", "C++"], "Tools": ["Git", ...] }   ← preferred
  //   [ { group, name }, ... ]                                ← legacy form
  function renderSkills(skills){
    const sk = $('#skills-list');
    if(!sk) return;
    sk.innerHTML = '';

    // normalize to: Map<group, string[]>
    const groups = new Map();
    if(Array.isArray(skills)){
      skills.forEach(s => {
        const g = (s && s.group) || 'Skills';
        if(!groups.has(g)) groups.set(g, []);
        groups.get(g).push(s.name || '');
      });
    } else if(skills && typeof skills === 'object'){
      Object.entries(skills).forEach(([g, items]) => {
        groups.set(g, Array.isArray(items) ? items.slice() : []);
      });
    }

    groups.forEach((items, groupName) => {
      const wrap = document.createElement('div');
      wrap.className = 'skill-group';
      const chipsHtml = items
        .filter(Boolean)
        .map(name => `<span class="chip">${escapeHTML(name)}</span>`)
        .join('');
      wrap.innerHTML = `
        <div class="skill-group-title">${escapeHTML(groupName)}</div>
        <div class="skill-chips">${chipsHtml}</div>
      `;
      sk.appendChild(wrap);
    });
  }

  // Projects — with period, tags, status badge, description, github/demo links
  function renderProjects(projects){
    const pList = $('#projects-list');
    if(!pList) return;
    pList.innerHTML = '';

    projects.forEach(p => {
      const el = document.createElement('div');
      el.className = 'item';
      const st = normStatus(p.status);
      const statusClass = st ? 'status-' + st : '';

      const subBits = [];
      if(p.id)     subBits.push(escapeHTML(p.id));
      if(p.period) subBits.push(escapeHTML(p.period));
      const subLine = subBits.length
        ? `<div class="i-sub">${subBits.join(' · ')}</div>`
        : '';

      const tagsHtml = (p.tags || [])
        .map(t => `<span class="badge">#${escapeHTML(t)}</span>`)
        .join('');

      const linksHtml = [];
      if(p.github){
        linksHtml.push(`<a href="${escapeHTML(ensureHttp(p.github))}" target="_blank" rel="noopener">[github]</a>`);
      }
      if(p.demo){
        linksHtml.push(`<a href="${escapeHTML(ensureHttp(p.demo))}" target="_blank" rel="noopener">[demo]</a>`);
      }

      el.innerHTML = `
        <span class="i-title">&gt; ${escapeHTML(p.title)}</span>
        <span class="badge ${statusClass}">${escapeHTML(statusLabel(p.status) || 'n/a')}</span>
        ${subLine}
        <div class="i-desc">${escapeHTML(p.description || '')}</div>
        ${tagsHtml ? `<div class="i-meta">${tagsHtml}</div>` : ''}
        ${linksHtml.length ? `<div class="i-links">${linksHtml.join('')}</div>` : ''}
      `;
      pList.appendChild(el);
    });
  }

  // Certifications — with issuer and note
  function renderCerts(certs){
    const cList = $('#certs-list');
    if(!cList) return;
    cList.innerHTML = '';

    certs.forEach(cx => {
      const el = document.createElement('div');
      el.className = 'item';
      const st = normStatus(cx.status);
      const statusClass = st ? 'status-' + st : '';

      const whenParts = [];
      if(cx.date)   whenParts.push(`취득 ${escapeHTML(cx.date)}`);
      if(cx.target) whenParts.push(`목표 ${escapeHTML(cx.target)}`);

      const metaBits = [];
      if(cx.issuer) metaBits.push(`<span class="badge">${escapeHTML(cx.issuer)}</span>`);
      whenParts.forEach(w => metaBits.push(`<span class="badge">${w}</span>`));

      el.innerHTML = `
        <span class="i-title">&gt; ${escapeHTML(cx.name)}</span>
        <span class="badge ${statusClass}">${escapeHTML(statusLabel(cx.status) || 'n/a')}</span>
        ${metaBits.length ? `<div class="i-meta">${metaBits.join('')}</div>` : ''}
        ${cx.note ? `<div class="i-note">${escapeHTML(cx.note)}</div>` : ''}
      `;
      cList.appendChild(el);
    });
  }

  // Learning — status-aware.  Shows a progress bar ONLY for IN_PROGRESS.
  // ONGOING → [ ∞ ongoing ∞ ] line.  PLANNED / DONE → badge only.
  function renderLearning(items){
    const lList = $('#learning-list');
    if(!lList) return;
    lList.innerHTML = '';

    items.forEach(x => {
      const el = document.createElement('div');
      el.className = 'item';
      const st = normStatus(x.status) || (typeof x.progress === 'number' ? 'in-progress' : 'planned');
      const statusClass = 'status-' + st;
      const lvl = Number(x.progress) || 0;

      let bodyHtml = '';
      if(st === 'in-progress'){
        bodyHtml = `
          <div class="progress-line">
            <span class="p-bar">${asciiBar(lvl, BAR_W)}</span>
            <span class="p-val">${lvl}%</span>
          </div>`;
      } else if(st === 'ongoing'){
        bodyHtml = `<div class="ongoing-line">[ ∞ ongoing ∞ ]</div>`;
      } // done / planned: badge only

      const metaBits = [];
      if(x.category) metaBits.push(`<span class="badge">${escapeHTML(x.category)}</span>`);

      el.innerHTML = `
        <span class="i-title">&gt; ${escapeHTML(x.topic)}</span>
        <span class="badge ${statusClass}">${escapeHTML(statusLabel(st))}</span>
        ${metaBits.length ? `<div class="i-meta">${metaBits.join('')}</div>` : ''}
        ${bodyHtml}
        ${x.note ? `<div class="i-note">${escapeHTML(x.note)}</div>` : ''}
      `;
      lList.appendChild(el);
    });
  }

  // ---------- Timer: project tag options ----------
  // 자동완성 목록은:
  //   1) data.json 의 timer.projectTags (수동 프리셋, 비어있으면 생략)
  //   2) 과거 타이머 세션에서 실제 사용한 프로젝트명
  // portfolio projects / learning 항목은 자동 포함하지 않음 — 타이머는 독립적으로 관리.
  function projectOptions(){
    const opts = new Set();
    const d = state.data || {};
    (d.timer && d.timer.projectTags || []).forEach(t => opts.add(t));
    state.sessions.forEach(s => { if(s.project) opts.add(s.project); });
    return Array.from(opts);
  }
  function renderProjectTagOptions(){
    const dl = $('#project-options');
    if(!dl) return;
    dl.innerHTML = '';
    projectOptions().forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      dl.appendChild(o);
    });
  }

  // ---------- Timer: current session ----------
  function updateTimerDisplay(){
    const disp = $('#timer-display');
    const statusEl = $('#timer-status');
    if(!disp) return;
    if(state.current){
      const elapsed = Date.now() - state.current.startedAt;
      disp.textContent = fmtHMS(elapsed);
      disp.classList.add('running');
      const proj = state.current.project || '(no project)';
      const memo = state.current.memo ? ' — ' + state.current.memo : '';
      statusEl.innerHTML = `[ running ] ${escapeHTML(proj)}${escapeHTML(memo)}`;
    } else {
      disp.textContent = '00:00:00';
      disp.classList.remove('running');
      statusEl.textContent = '[ idle ] — not tracking';
    }
    const btnStart = $('#btn-start');
    const btnStop  = $('#btn-stop');
    if(state.current){
      btnStart.disabled = true;
      btnStop.disabled  = false;
    } else {
      btnStart.disabled = false;
      btnStop.disabled  = true;
    }
  }

  function startTick(){
    stopTick();
    state.tickHandle = setInterval(updateTimerDisplay, 1000);
  }
  function stopTick(){
    if(state.tickHandle){ clearInterval(state.tickHandle); state.tickHandle = null; }
  }

  function startSession(){
    if(state.current) return;
    const project = ($('#project-input').value || '').trim();
    const memo    = ($('#memo-input').value    || '').trim();
    if(!project){
      flash($('#project-input'));
      return;
    }
    state.current = { id: uid('s'), project, memo, startedAt: Date.now() };
    saveCurrent();
    updateTimerDisplay();
    startTick();
    renderSessionList();
    renderWeeklyStats();
    renderProjectTagOptions();
  }

  function stopSession(){
    if(!state.current) return;
    const endedAt = Date.now();
    if(endedAt - state.current.startedAt < 1000){
      state.current = null;
      saveCurrent();
      updateTimerDisplay();
      stopTick();
      return;
    }
    const sess = {
      id: state.current.id,
      project: state.current.project,
      memo: state.current.memo,
      startedAt: state.current.startedAt,
      endedAt: endedAt,
      exported: false
    };
    state.sessions.push(sess);
    state.sessions.sort((a, b) => b.startedAt - a.startedAt);
    saveSessions();

    state.current = null;
    saveCurrent();

    $('#memo-input').value = '';
    updateTimerDisplay();
    stopTick();
    renderSessionList();
    renderWeeklyStats();
  }

  function flash(el){
    if(!el) return;
    const prev = el.style.borderColor;
    el.style.borderColor = 'var(--red)';
    setTimeout(() => { el.style.borderColor = prev; }, 500);
  }

  // ---------- Session list ----------
  function sessionsInRange(){
    const now = new Date();
    if(state.view === 'today'){
      const s = startOfDay(now).getTime();
      const e = s + 24 * 3600 * 1000;
      return state.sessions.filter(x => x.startedAt >= s && x.startedAt < e);
    } else {
      const { start, end } = getWeekRange(now);
      return state.sessions.filter(x => x.startedAt >= start.getTime() && x.startedAt < end.getTime());
    }
  }

  function renderSessionList(){
    const list = $('#session-list');
    const empty = $('#session-empty');
    if(!list) return;
    list.innerHTML = '';
    const rows = sessionsInRange();
    if(rows.length === 0){
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    rows.forEach(s => {
      const el = (state.editingId === s.id) ? renderEditRow(s) : renderSessionRow(s);
      list.appendChild(el);
    });
  }

  function renderSessionRow(s){
    const row = document.createElement('div');
    row.className = 'session-row';
    const start = new Date(s.startedAt);
    const end   = new Date(s.endedAt);
    const dur   = s.endedAt - s.startedAt;
    const sameDay = isSameDay(start, end);
    const timeStr = sameDay
      ? `${fmtClockHM(start)}–${fmtClockHM(end)}`
      : `${pad(start.getMonth()+1)}/${pad(start.getDate())} ${fmtClockHM(start)} → ${pad(end.getMonth()+1)}/${pad(end.getDate())} ${fmtClockHM(end)}`;
    row.innerHTML = `
      <span class="s-time">${timeStr}</span>
      <span class="s-dur">(${escapeHTML(fmtHM(dur))})</span>
      <span class="s-body">
        <span class="s-project">[${escapeHTML(s.project || '—')}]</span>
        ${s.memo ? `<span class="s-memo">${escapeHTML(s.memo)}</span>` : ''}
        ${s.exported ? `<span class="exp-tag">exported</span>` : ''}
      </span>
      <span class="s-actions">
        <button data-act="edit" data-id="${escapeHTML(s.id)}">[edit]</button>
        <button data-act="del"  data-id="${escapeHTML(s.id)}" class="danger">[x]</button>
      </span>`;
    row.querySelector('[data-act="edit"]').addEventListener('click', () => { state.editingId = s.id; renderSessionList(); });
    row.querySelector('[data-act="del"]') .addEventListener('click', () => onDelete(s.id));
    return row;
  }

  function toLocalInputValue(ts){
    const d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
      + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function renderEditRow(s){
    const box = document.createElement('div');
    box.className = 'session-edit';
    box.innerHTML = `
      <div class="se-field">
        <label>start</label>
        <input type="datetime-local" class="edit-start" value="${toLocalInputValue(s.startedAt)}">
      </div>
      <div class="se-field">
        <label>end</label>
        <input type="datetime-local" class="edit-end" value="${toLocalInputValue(s.endedAt)}">
      </div>
      <div class="se-field">
        <label>project</label>
        <input type="text" class="edit-project" list="project-options" value="${escapeHTML(s.project || '')}">
      </div>
      <div class="se-field">
        <label>memo</label>
        <input type="text" class="edit-memo" value="${escapeHTML(s.memo || '')}">
      </div>
      <div class="se-actions">
        <button class="save primary">[ save ]</button>
        <button class="cancel">[ cancel ]</button>
      </div>`;
    box.querySelector('.cancel').addEventListener('click', () => { state.editingId = null; renderSessionList(); });
    box.querySelector('.save').addEventListener('click', () => {
      const startVal = box.querySelector('.edit-start').value;
      const endVal   = box.querySelector('.edit-end').value;
      const proj     = box.querySelector('.edit-project').value.trim();
      const memo     = box.querySelector('.edit-memo').value.trim();
      const startTs  = new Date(startVal).getTime();
      const endTs    = new Date(endVal).getTime();
      if(isNaN(startTs) || isNaN(endTs) || endTs <= startTs || !proj){
        alert('시간/프로젝트를 올바르게 입력하세요. (end > start)');
        return;
      }
      const idx = state.sessions.findIndex(x => x.id === s.id);
      if(idx >= 0){
        state.sessions[idx] = {
          ...state.sessions[idx],
          startedAt: startTs,
          endedAt:   endTs,
          project:   proj,
          memo:      memo,
          exported:  false
        };
        state.sessions.sort((a, b) => b.startedAt - a.startedAt);
        saveSessions();
      }
      state.editingId = null;
      renderSessionList();
      renderWeeklyStats();
    });
    return box;
  }

  function onDelete(id){
    const s = state.sessions.find(x => x.id === id);
    if(!s) return;
    const tag = s.project ? `[${s.project}]` : '';
    if(!confirm(`세션 삭제할까요?\n${tag} ${fmtClockHM(new Date(s.startedAt))}–${fmtClockHM(new Date(s.endedAt))}`)) return;
    state.sessions = state.sessions.filter(x => x.id !== id);
    saveSessions();
    renderSessionList();
    renderWeeklyStats();
  }

  // ---------- Weekly stats (ASCII bars) ----------
  function renderWeeklyStats(){
    const el = $('#weekly-stats');
    const totalEl = $('#weekly-total');
    if(!el) return;
    const { start, end } = getWeekRange();
    const rows = state.sessions.filter(s => s.startedAt >= start.getTime() && s.startedAt < end.getTime());

    if(rows.length === 0){
      el.innerHTML = '<div class="bar-empty">-- no sessions this week --</div>';
      totalEl.textContent = 'total: 0h 0m';
      return;
    }

    const totals = {};
    rows.forEach(s => {
      const dur = Math.max(0, s.endedAt - s.startedAt);
      const key = s.project || '(no project)';
      totals[key] = (totals[key] || 0) + dur;
    });
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const max = entries[0][1] || 1;
    const grandTotal = entries.reduce((acc, [, v]) => acc + v, 0);

    el.innerHTML = '';
    entries.forEach(([name, ms]) => {
      const pct  = (ms / max) * 100;
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <div class="bar-top">
          <span class="bar-name">${escapeHTML(name)}</span>
          <span class="bar-val">${escapeHTML(fmtHM(ms))}</span>
        </div>
        <div class="bar-fill">${asciiBar(pct, STAT_BAR_W)}</div>`;
      el.appendChild(row);
    });
    totalEl.textContent = 'total: ' + fmtHM(grandTotal);
  }

  // ---------- Tab routing ----------
  function applyRoute(){
    let hash = (location.hash || '').replace(/^#/, '').toLowerCase();
    if(!VALID_TABS.includes(hash)) hash = 'portfolio';
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === hash));
    $$('.tab-content').forEach(c => c.classList.toggle('hidden', c.id !== 'tab-' + hash));
    if(hash === 'timer'){
      renderProjectTagOptions();
      renderSessionList();
      renderWeeklyStats();
      updateTimerDisplay();
    }
  }

  // ---------- ICS export ----------
  function toICSUTC(ts){
    const d = new Date(ts);
    return d.getUTCFullYear()
      + pad(d.getUTCMonth() + 1)
      + pad(d.getUTCDate())
      + 'T'
      + pad(d.getUTCHours())
      + pad(d.getUTCMinutes())
      + pad(d.getUTCSeconds())
      + 'Z';
  }

  function icsEscape(s){
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g,  '\\;')
      .replace(/,/g,  '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function icsFold(line){
    let out = '';
    let buf = line;
    while(buf.length > 73){
      out += buf.slice(0, 73) + '\r\n ';
      buf = buf.slice(73);
    }
    out += buf;
    return out;
  }

  function buildICS(sessions){
    const now = toICSUTC(Date.now());
    const lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//kepp//portfolio-timer//KO');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    sessions.forEach(s => {
      const title = s.memo
        ? `[${s.project || ''}] ${s.memo}`
        : `[${s.project || ''}]`;
      const durStr = fmtHM(Math.max(0, s.endedAt - s.startedAt));
      const desc   = (s.memo ? s.memo + '\n' : '') + 'duration: ' + durStr;
      lines.push('BEGIN:VEVENT');
      lines.push(icsFold('UID:' + s.id + '@portfolio'));
      lines.push('DTSTAMP:' + now);
      lines.push('DTSTART:' + toICSUTC(s.startedAt));
      lines.push('DTEND:'   + toICSUTC(s.endedAt));
      lines.push(icsFold('SUMMARY:'     + icsEscape(title)));
      lines.push(icsFold('DESCRIPTION:' + icsEscape(desc)));
      if(s.project) lines.push(icsFold('CATEGORIES:' + icsEscape(s.project)));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function exportICS(){
    const { start, end } = getWeekRange();
    let pool = state.sessions.filter(s => s.startedAt >= start.getTime() && s.startedAt < end.getTime());
    if(!state.includeExported) pool = pool.filter(s => !s.exported);
    if(pool.length === 0){
      alert(state.includeExported
        ? '이번 주에 세션이 없습니다.'
        : '이번 주 미내보내기 세션이 없습니다. ("이미 내보낸 세션 포함" 토글을 확인하세요.)');
      return;
    }
    const ics = buildICS(pool);
    const yyyymmdd = pad(start.getFullYear(), 4) + pad(start.getMonth()+1) + pad(start.getDate());
    downloadBlob(ics, 'text/calendar;charset=utf-8', `kepp-timer-week-${yyyymmdd}.ics`);

    const ids = new Set(pool.map(s => s.id));
    state.sessions.forEach(s => { if(ids.has(s.id)) s.exported = true; });
    saveSessions();
    renderSessionList();
  }

  // ---------- CSV export ----------
  function csvEscape(v){
    const s = String(v == null ? '' : v);
    if(/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCSV(){
    const { start, end } = getWeekRange();
    let pool = state.sessions.filter(s => s.startedAt >= start.getTime() && s.startedAt < end.getTime());
    if(!state.includeExported) pool = pool.filter(s => !s.exported);
    if(pool.length === 0){
      alert(state.includeExported
        ? '이번 주에 세션이 없습니다.'
        : '이번 주 미내보내기 세션이 없습니다.');
      return;
    }
    const header = ['date','start','end','duration','project','memo','exported'];
    const rows = pool
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt)
      .map(s => {
        const ds = new Date(s.startedAt);
        const de = new Date(s.endedAt);
        const date = ds.getFullYear() + '-' + pad(ds.getMonth()+1) + '-' + pad(ds.getDate());
        return [
          date,
          fmtClockHM(ds),
          fmtClockHM(de),
          fmtHM(s.endedAt - s.startedAt),
          s.project || '',
          s.memo || '',
          s.exported ? 'yes' : 'no'
        ].map(csvEscape).join(',');
      });
    const csv = '\uFEFF' + header.join(',') + '\n' + rows.join('\n') + '\n';
    const yyyymmdd = pad(start.getFullYear(), 4) + pad(start.getMonth()+1) + pad(start.getDate());
    downloadBlob(csv, 'text/csv;charset=utf-8', `kepp-timer-week-${yyyymmdd}.csv`);
  }

  function downloadBlob(content, mime, filename){
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  // ---------- Clock ----------
  function tickClock(){
    const el = $('#system-clock');
    if(!el) return;
    const d = new Date();
    el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // ---------- Event wiring ----------
  function setupEvents(){
    // Tabs
    $$('.tab').forEach(t => t.addEventListener('click', e => {
      e.preventDefault();
      const target = t.dataset.tab;
      if(VALID_TABS.includes(target)){ location.hash = '#' + target; }
    }));
    window.addEventListener('hashchange', applyRoute);

    // Timer
    $('#btn-start').addEventListener('click', startSession);
    $('#btn-stop') .addEventListener('click', stopSession);
    $('#project-input').addEventListener('keydown', e => { if(e.key === 'Enter') startSession(); });
    $('#memo-input')   .addEventListener('keydown', e => { if(e.key === 'Enter') startSession(); });

    // view toggle
    $$('.vt-btn').forEach(b => b.addEventListener('click', () => {
      state.view = b.dataset.view;
      $$('.vt-btn').forEach(x => x.classList.toggle('active', x === b));
      renderSessionList();
    }));

    // exports
    $('#btn-export-ics').addEventListener('click', exportICS);
    $('#btn-export-csv').addEventListener('click', exportCSV);
    $('#include-exported').addEventListener('change', e => {
      state.includeExported = e.target.checked;
    });

    // visibility: sync timer when returning to tab
    document.addEventListener('visibilitychange', () => {
      if(!document.hidden && state.current){ updateTimerDisplay(); }
    });

    // cross-tab sync
    window.addEventListener('storage', ev => {
      if(ev.key === STORAGE_SESSIONS){
        try{ state.sessions = JSON.parse(ev.newValue || '[]'); } catch {}
        renderSessionList();
        renderWeeklyStats();
        renderProjectTagOptions();
      } else if(ev.key === STORAGE_CURRENT){
        try{ state.current = JSON.parse(ev.newValue || 'null'); } catch { state.current = null; }
        updateTimerDisplay();
        if(state.current) startTick(); else stopTick();
      }
    });
  }

  // ---------- Init ----------
  async function init(){
    loadFromStorage();
    await loadData();
    renderBootLog();
    renderPortfolio();
    renderProjectTagOptions();
    renderSessionList();
    renderWeeklyStats();
    updateTimerDisplay();
    if(state.current) startTick();
    setupEvents();
    applyRoute();
    tickClock();
    state.clockHandle = setInterval(tickClock, 1000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
