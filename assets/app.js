// Motion Design dashboard — reads data/data.json (built by scripts/sync.mjs) and renders everything client-side.

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const DAY = 864e5;
const NBSP = ' ';
const SEP = `${NBSP}${NBSP}·  `; // rule 29: two non-breaking spaces before the dot, two plain after
const nf = new Intl.NumberFormat('ru-RU');
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

const state = { data: null, mode: 'month', anchor: startOfDay(new Date()), direction: '', person: '', tab: 'done', showAll: false };

/* ───────── helpers ───────── */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) k === 'text' ? (el.textContent = v) : el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid) el.append(kid);
  return el;
}
function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
const W_VIDEOS = ['ролик', 'ролика', 'роликов'];
const W_FILES = ['файл', 'файла', 'файлов'];
const W_TASKS = ['задача', 'задачи', 'задач'];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOf(mode, d) {
  const x = startOfDay(d);
  if (mode === 'week') x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  if (mode === 'month') x.setDate(1);
  if (mode === 'year') { x.setMonth(0, 1); }
  return x;
}
function shift(mode, d, n) {
  const x = new Date(d);
  if (mode === 'day') x.setDate(x.getDate() + n);
  if (mode === 'week') x.setDate(x.getDate() + 7 * n);
  if (mode === 'month') x.setMonth(x.getMonth() + n, 1);
  if (mode === 'year') x.setFullYear(x.getFullYear() + n, 0, 1);
  return x;
}
function range(mode, anchor) { const a = startOf(mode, anchor); return [a, startOf(mode, shift(mode, a, 1))]; }

const fmtDayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const fmtDayMonthShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const fmtMonthYear = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const fmtWeekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const fmtMonthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
const fmtTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const monthGen = (d) => fmtDayMonth.format(d).replace(/^\d+\s/, '');

function periodLabel(mode, anchor) {
  const [a, b] = range(mode, anchor);
  const last = new Date(b - DAY);
  if (mode === 'day') return `${cap(fmtWeekday.format(a))}, ${fmtDayMonth.format(a)}`;
  if (mode === 'week') {
    return a.getMonth() === last.getMonth()
      ? `${a.getDate()}–${last.getDate()}${NBSP}${monthGen(a)}`
      : `${fmtDayMonthShort.format(a)} – ${fmtDayMonthShort.format(last)}`;
  }
  if (mode === 'month') return cap(fmtMonthYear.format(a)).replace(/\s*г\.$/, '');
  return String(a.getFullYear());
}
function prevPhrase(mode) { return { day: 'вчерашнему дню', week: 'прошлой неделе', month: 'прошлому месяцу', year: 'прошлому году' }[mode]; }
function prevName(mode) { return { day: 'вчера', week: 'прошлая неделя', month: 'прошлый месяц', year: 'прошлый год' }[mode]; }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? fmtDayMonthShort.format(d) : `${fmtDayMonthShort.format(d)} ${d.getFullYear()}`;
}
function fmtStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${fmtDayMonthShort.format(d)}, ${fmtTime.format(d)}`;
}
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function workdays(a, b) {
  let n = 0;
  for (let t = new Date(a); t < b; t.setDate(t.getDate() + 1)) if (t.getDay() % 6 !== 0) n++;
  return n;
}

/* ───────── dropdown: MUI Select behaviour ─────────
   Trigger shows the value with the ArrowDropDown triangle; the menu is an anchored listbox under it.
   Keyboard as in MUI: ↓/↑/Enter/Space open, ↑↓ Home End move, Enter/Space pick, Esc closes, Tab leaves. */
const dropdowns = {};
function dropdown(host, onChange) {
  const id = host.id;
  const arrow = s('svg', { class: 'dd-arrow', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'M7 10l5 5 5-5z', fill: 'currentColor' }));
  const valueEl = h('span', { class: 'dd-value', id: `${id}-value` });
  const trigger = h('button', { class: 'dd-trigger', type: 'button', id: `${id}-btn`, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-labelledby': `${id}-label ${id}-value` }, valueEl, arrow);
  const menu = h('ul', { class: 'dd-menu', role: 'listbox', id: `${id}-menu`, tabindex: '-1', 'aria-labelledby': `${id}-label`, hidden: true });
  host.replaceChildren(h('span', { class: 'dd-label', id: `${id}-label`, text: host.dataset.label }), trigger, menu);
  let options = [], value = '', focus = -1;

  function draw() {
    const cur = options.find((o) => o.value === value) || options[0];
    valueEl.textContent = cur ? cur.label : '';
    host.classList.toggle('active', !!value);
    menu.replaceChildren(...options.map((o, i) => h('li', {
      class: 'dd-option' + (i === focus ? ' focused' : ''), role: 'option', id: `${id}-opt-${i}`, 'aria-selected': String(o.value === value),
      onclick: () => pick(i), onpointermove: () => setFocus(i, false), text: o.label,
    })));
  }
  function setFocus(i, scroll = true) {
    focus = i;
    menu.querySelectorAll('.dd-option').forEach((li, j) => li.classList.toggle('focused', j === i));
    menu.setAttribute('aria-activedescendant', `${id}-opt-${i}`);
    if (scroll) menu.children[i]?.scrollIntoView({ block: 'nearest' });
  }
  function outside(e) { if (!host.contains(e.target)) close(false); }
  function open() {
    if (!menu.hidden) return;
    for (const other of Object.values(dropdowns)) if (other !== api) other.close(false);
    focus = Math.max(0, options.findIndex((o) => o.value === value));
    draw();
    menu.hidden = false;
    host.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    menu.focus({ preventScroll: true });
    setFocus(focus);
    document.addEventListener('pointerdown', outside, true);
  }
  function close(returnFocus = true) {
    if (menu.hidden) return;
    menu.hidden = true;
    host.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (returnFocus) trigger.focus();
  }
  function pick(i) {
    const v = options[i]?.value ?? '';
    close();
    if (v !== value) { value = v; draw(); onChange(v); }
  }
  trigger.addEventListener('click', () => (menu.hidden ? open() : close()));
  trigger.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
  });
  menu.addEventListener('keydown', (e) => {
    const last = options.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(Math.min(last, focus + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(Math.max(0, focus - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setFocus(0); }
    else if (e.key === 'End') { e.preventDefault(); setFocus(last); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(focus); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  });
  const api = {
    setOptions(list) { options = list; draw(); },
    setValue(v) { value = v; draw(); },
    close,
  };
  dropdowns[id] = api;
  return api;
}

/* ───────── data ───────── */
async function load(bust = false) {
  const res = await fetch(`data/data.json${bust ? `?t=${Date.now()}` : ''}`, { cache: bust ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`data.json ${res.status}`);
  const data = await res.json();
  data.taskById = new Map(data.tasks.map((t) => [t.id, t]));
  for (const v of data.videos) v.time = Date.parse(v.at);
  data.directionLabel = Object.fromEntries(data.config.directions.map((d) => [d.id, d.label]));
  return data;
}

function videoOk(v) {
  const t = state.data.taskById.get(v.t);
  if (!t) return false;
  if (state.direction && t.direction !== state.direction) return false;
  if (state.person && !v.by.includes(state.person)) return false;
  return true;
}
function taskOk(t) {
  if (state.direction && t.direction !== state.direction) return false;
  if (state.person && !t.assignees.includes(state.person)) return false;
  return true;
}
function videosIn(a, b, extra = () => true) {
  const ta = +a, tb = +b;
  return state.data.videos.filter((v) => v.time >= ta && v.time < tb && videoOk(v) && extra(v));
}
const creatives = (list) => new Set(list.map((v) => `${v.t}|${v.k}`)).size;

/* ───────── state ↔ URL ───────── */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (['day', 'week', 'month', 'year'].includes(p.get('m'))) state.mode = p.get('m');
  if (p.get('d') && !Number.isNaN(Date.parse(p.get('d')))) state.anchor = startOfDay(new Date(p.get('d') + 'T00:00:00'));
  state.direction = p.get('dir') || '';
  state.person = p.get('p') || '';
  if (['done', 'current', 'nolink'].includes(p.get('tab'))) state.tab = p.get('tab');
}
function writeHash() {
  const p = new URLSearchParams();
  p.set('m', state.mode);
  const a = state.anchor;
  const today = startOfDay(new Date());
  if (+startOf(state.mode, a) !== +startOf(state.mode, today)) p.set('d', `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`);
  if (state.direction) p.set('dir', state.direction);
  if (state.person) p.set('p', state.person);
  if (state.tab !== 'done') p.set('tab', state.tab);
  history.replaceState(null, '', '#' + p.toString());
}

/* ───────── render ───────── */
function render() {
  if (!state.data) return; // a resize can fire before data.json arrives
  const { data } = state;
  const [a, b] = range(state.mode, state.anchor);
  const now = new Date();
  const isCurrent = a <= now && now < b;
  const end = isCurrent ? now : b;

  // tabs + pager
  for (const btn of $('periodTabs').querySelectorAll('button')) btn.setAttribute('aria-selected', String(btn.dataset.mode === state.mode));
  $('periodLabel').textContent = periodLabel(state.mode, state.anchor);
  $('nextPeriod').disabled = shift(state.mode, a, 1) > now;
  dropdowns.directionFilter.setValue(state.direction);
  dropdowns.personFilter.setValue(state.person);

  // period numbers
  const vids = videosIn(a, b);
  const nVideos = creatives(vids);
  const nTasks = new Set(vids.map((v) => v.t)).size;

  // previous period, cut to the same elapsed time when this one is still running
  const pa = shift(state.mode, a, -1);
  const pb = isCurrent ? new Date(+pa + (now - a)) : a;
  const prev = videosIn(pa, pb);
  const pVideos = creatives(prev);
  const pTasks = new Set(prev.map((v) => v.t)).size;

  renderHeroGauge(nVideos, a);
  renderMetric('mVideos', nVideos, '', pVideos, isCurrent, vids.length);
  renderMetric('mTasks', nTasks, '', pTasks, isCurrent);
  renderChart(a, b);
  renderDirections(vids, a, end);
  renderPeople(vids, a, b);
  renderPace(vids, a, end);
  renderStatus();
  renderTasks(vids, a, b);
  renderChecks();
  writeHash();
}

function renderMetric(id, value, unit, prevValue, isCurrent, files) {
  $(id).textContent = nf.format(value);
  $(id + 'Unit').textContent = '';
  const note = $(id + 'Note');
  note.replaceChildren();
  const diff = value - prevValue;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
  note.title = isCurrent ? `Сравнение с тем же отрезком: ${prevName(state.mode)} на этот момент` : `Сравнение: ${prevName(state.mode)}`;
  note.append(h('b', { text: `${sign}${nf.format(Math.abs(diff))}` }), ` к${NBSP}${prevPhrase(state.mode)}`);
  if (files != null) note.append(h('br'), `${nf.format(files)} ${plural(files, W_FILES)}`);
}

function renderHeroGauge(value, periodStart) {
  // scale: the best of the last 12 periods, so the knob shows where this one stands
  let best = value;
  for (let i = 1; i <= 12; i++) {
    const s0 = shift(state.mode, periodStart, -i);
    best = Math.max(best, creatives(videosIn(s0, shift(state.mode, s0, 1))));
  }
  const max = niceMax(best || 4);
  const svg = $('heroGauge');
  svg.replaceChildren();
  const R = 230, cx = -30, cy = 179, A = (43 * Math.PI) / 180; // arc 22–336, readout stays inside the 380 box
  const pt = (t, r = R) => [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  const [x1, y1] = pt(-A), [x2, y2] = pt(A);
  svg.append(s('path', { class: 'g-arc', d: `M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}` }));
  svg.append(s('circle', { class: 'g-dot', cx: x1, cy: y1, r: 2 }), s('circle', { class: 'g-dot', cx: x2, cy: y2, r: 2 }));
  const t = A - 2 * A * Math.min(value / max, 1);
  const [kx, ky] = pt(t);
  for (const f of [0, 0.25, 0.5, 1]) {
    const tl = A - 2 * A * f;
    const [lx, ly] = pt(tl, R + 22);
    if (Math.abs(ly - ky) < 44) continue; // the readout sits there — a scale label would collide with it
    svg.append(s('text', { x: lx, y: ly + 6, text: nf.format(Math.round(max * f)) }));
  }
  const knob = s('g', { transform: `translate(${kx - 16} ${ky - 16})` });
  knob.append(s('circle', { cx: 16, cy: 16, r: 16, fill: '#FEFE02', opacity: 0.25 }), s('circle', { cx: 16, cy: 16, r: 7, fill: '#FEFE02' }));
  svg.append(knob);
  svg.append(s('text', { class: 'g-value', x: kx + 44, y: ky + 18, text: nf.format(value) }));
  svg.append(s('text', { class: 'g-unit', x: kx + 46, y: ky + 42, text: plural(value, W_VIDEOS) }));
  $('gaugeLabel').textContent = `${nf.format(value)} ${plural(value, W_VIDEOS)} за период, шкала до ${nf.format(max)}`;
}

function buckets(a, b) {
  const out = [];
  if (state.mode === 'year') {
    for (let m = 0; m < 12; m++) {
      const s0 = new Date(a.getFullYear(), m, 1), s1 = new Date(a.getFullYear(), m + 1, 1);
      out.push({ a: s0, b: s1, label: fmtMonthShort.format(s0).replace('.', ''), long: cap(fmtMonthYear.format(s0)).replace(/\s*г\.$/, '') });
    }
    return out;
  }
  let from = a, to = b;
  if (state.mode === 'day') { from = new Date(+a - 13 * DAY); to = b; }
  for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
    const s0 = new Date(d), s1 = new Date(d); s1.setDate(s1.getDate() + 1);
    const label = state.mode === 'month' ? String(s0.getDate()) : `${fmtWeekday.format(s0)} ${s0.getDate()}`;
    out.push({ a: s0, b: s1, label, long: `${cap(fmtWeekday.format(s0))}, ${fmtDayMonth.format(s0)}`, weekend: s0.getDay() % 6 === 0 });
  }
  return out;
}

function renderChart(a, b) {
  const box = $('chart');
  $('chartTitle').textContent = state.mode === 'year' ? 'Ролики по месяцам' : state.mode === 'day' ? 'Ролики за 14 дней' : 'Ролики по дням';
  const bs = buckets(a, b).map((x) => {
    const list = videosIn(x.a, x.b);
    return { ...x, files: list.length, videos: creatives(list) };
  });
  const W = Math.max(box.clientWidth, 280), H = Math.max(box.clientHeight, 230);
  const padL = 40, padR = 8, padT = 12, padB = 36;
  const max = niceMax(Math.max(1, ...bs.map((x) => x.files)));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const step = plotW / bs.length;
  const y = (v) => padT + plotH - (v / max) * plotH;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${$('chartTitle').textContent}: столбцы по ${bs.length} отрезкам` });
  for (const f of [0, 0.5, 1]) {
    const v = max * f;
    if (!Number.isInteger(v)) continue; // clean ticks only
    svg.append(s('text', { class: 'axis', x: 0, y: y(v) + 6, text: nf.format(v) }));
    if (f === 0) svg.append(s('line', { class: 'grid-line', x1: padL, x2: W - padR, y1: y(0) + 0.5, y2: y(0) + 0.5 }));
  }
  const today = startOfDay(new Date());
  const every = bs.length > 16 ? Math.ceil(bs.length / 8) : 1;
  const barW = 4, gap = 2;
  const bar = (x, v, cls) => {
    if (!v) return null;
    const top = y(v), r = 2, bottom = y(0);
    return s('path', { class: cls, d: `M${x} ${bottom}V${top + r}a${r} ${r} 0 0 1 ${r} ${-r}a${r} ${r} 0 0 1 ${r} ${r}V${bottom}Z` });
  };
  bs.forEach((x, i) => {
    const cx = padL + step * i + step / 2;
    const g = s('g', { class: 'col', tabindex: 0, role: 'img', 'aria-label': `${x.long}: ${x.videos} ${plural(x.videos, W_VIDEOS)}, ${x.files} ${plural(x.files, W_FILES)}` });
    g.append(s('rect', { class: 'hit', x: cx - step / 2, y: padT, width: step, height: plotH + padB }));
    const b1 = bar(cx - barW - gap / 2, x.files, 'bar-files');
    const b2 = bar(cx + gap / 2, x.videos, 'bar-videos');
    if (b1) g.append(b1);
    if (b2) g.append(b2);
    const isNow = state.mode === 'year' ? x.a <= today && today < x.b : +x.a === +startOfDay(state.mode === 'day' ? state.anchor : today);
    if (i % every === 0 || isNow) g.append(s('text', { class: 'xlab' + (isNow ? ' now' : ''), x: cx, y: H - 8, 'text-anchor': 'middle', text: x.label }));
    const show = (ev) => tooltip(ev, x.long, [['ролики', x.videos, 'var(--chart-power)'], ['файлы', x.files, 'var(--chart-wind)']]);
    g.addEventListener('pointermove', show);
    g.addEventListener('focus', (ev) => show({ clientX: g.getBoundingClientRect().left + step / 2, clientY: g.getBoundingClientRect().top }));
    g.addEventListener('pointerleave', hideTooltip);
    g.addEventListener('blur', hideTooltip);
    svg.append(g);
  });
  box.replaceChildren(svg);
}

function tooltip(ev, head, rows) {
  const tt = $('tooltip');
  tt.replaceChildren(h('div', { class: 'tt-head', text: head }), ...rows.map(([k, v, c]) => h('div', { class: 'tt-row' }, h('i', { class: 'tt-key', style: `background:${c}` }), h('b', { text: nf.format(v) }), k)));
  tt.hidden = false;
  const r = tt.getBoundingClientRect();
  let x = ev.clientX + 14, y2 = ev.clientY - r.height - 12;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y2 < 8) y2 = ev.clientY + 16;
  tt.style.left = `${x}px`;
  tt.style.top = `${y2}px`;
}
function hideTooltip() { $('tooltip').hidden = true; }

function levelRow({ label, value, small, ratio, pressed, onclick, title }) {
  const row = h('button', { class: 'level-row' + (value ? '' : ' zero'), type: 'button', 'aria-pressed': String(!!pressed), title, onclick },
    h('div', { class: 'level-track' }, h('div', { class: 'level-fill', style: `width:${Math.max(ratio, 0) * 100}%` })),
    h('div', { class: 'level-base' }),
    h('div', { class: 'level-ticks' }),
    h('div', { class: 'level-labels' }, h('span', { class: 'lv-label', text: label }), h('span', { class: 'lv-value' }, nf.format(value), small ? h('small', { text: small }) : null)),
  );
  return row;
}

function renderDirections(vids, a, end) {
  const dirs = state.data.config.directions;
  const counts = Object.fromEntries(dirs.map((d) => [d.id, creatives(vids.filter((v) => state.data.taskById.get(v.t).direction === d.id))]));
  const total = Object.values(counts).reduce((x, y) => x + y, 0);
  const max = Math.max(1, ...Object.values(counts));
  $('directionRows').replaceChildren(...dirs.map((d) => levelRow({
    label: d.label,
    value: counts[d.id],
    small: total ? `${Math.round((counts[d.id] / total) * 100)}%` : '',
    ratio: counts[d.id] / max,
    pressed: state.direction === d.id,
    title: state.direction === d.id ? 'Снять фильтр' : `Показать только: ${d.label}`,
    onclick: () => { state.direction = state.direction === d.id ? '' : d.id; render(); },
  })));
  // period stats
  const days = Math.max(1, Math.ceil((end - a) / DAY));
  const files = vids.length;
  const firstByCreative = new Map();
  for (const v of vids) if (v.d && !firstByCreative.has(`${v.t}|${v.k}`)) firstByCreative.set(`${v.t}|${v.k}`, v.d);
  const minutes = [...firstByCreative.values()].reduce((x, y) => x + y, 0) / 60;
  const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v }));
  $('stats').replaceChildren(
    stat('В среднем за день', nf1.format(total / days)),
    stat('Форматов на ролик', total ? nf1.format(files / total) : '—'),
    stat('Минут видео', firstByCreative.size ? nf1.format(minutes) : '—'),
  );
}

function renderPeople(vids, a, b) {
  const data = state.data;
  const names = new Set(vids.flatMap((v) => v.by));
  for (const t of data.tasks) if (data.config.statuses.current.includes(t.status)) t.assignees.forEach((n) => names.add(n));
  if (state.person) names.add(state.person);
  const rows = [...names].map((n) => {
    const mine = vids.filter((v) => v.by.includes(n));
    return { n, videos: creatives(mine), tasks: new Set(mine.map((v) => v.t)).size };
  }).sort((x, y) => y.videos - x.videos || x.n.localeCompare(y.n));
  const max = Math.max(1, ...rows.map((r) => r.videos));
  $('peopleRows').replaceChildren(...(rows.length ? rows.slice(0, 5).map((r) => levelRow({
    label: r.n,
    value: r.videos,
    small: r.tasks ? `${r.tasks}${NBSP}${plural(r.tasks, W_TASKS)}` : '',
    ratio: r.videos / max,
    pressed: state.person === r.n,
    title: state.person === r.n ? 'Снять фильтр' : `Показать только: ${r.n}`,
    onclick: () => { state.person = state.person === r.n ? '' : r.n; render(); },
  })) : [h('p', { class: 'empty', text: 'За этот период роликов нет' })]));
}

function renderPace(vids, a, end) {
  const wd = Math.max(1, workdays(a, end));
  const value = creatives(vids) / wd;
  // scale: the busiest single day in the last 90 days
  const today = startOfDay(new Date());
  const perDay = new Map();
  for (const v of state.data.videos) {
    if (v.time < +today - 90 * DAY || !videoOk(v)) continue;
    const k = startOfDay(new Date(v.time)).getTime();
    const set = perDay.get(k) || new Set();
    set.add(`${v.t}|${v.k}`);
    perDay.set(k, set);
  }
  const max = niceMax(Math.max(value, ...[...perDay.values()].map((x) => x.size), 4));
  const S = 420, c = S / 2, R1 = 196, R2 = 186, RA = 150;
  const svg = s('svg', { viewBox: `0 0 ${S} ${S}`, 'aria-hidden': 'true' });
  const start = (135 * Math.PI) / 180, sweep = (270 * Math.PI) / 180;
  for (let i = 0; i <= 36; i++) {
    const t = start + (sweep * i) / 36;
    const major = i % 9 === 0;
    const r0 = major ? R2 - 6 : R2, r1 = R1;
    svg.append(s('line', { class: major ? 'tick-major' : 'tick-minor', x1: c + r0 * Math.cos(t), y1: c + r0 * Math.sin(t), x2: c + r1 * Math.cos(t), y2: c + r1 * Math.sin(t) }));
  }
  svg.append(s('circle', { class: 'track', cx: c, cy: c, r: RA }));
  const f = Math.min(value / max, 1);
  const tEnd = start + sweep * f;
  const p = (t) => `${c + RA * Math.cos(t)} ${c + RA * Math.sin(t)}`;
  if (f > 0.001) svg.append(s('path', { class: 'arc', d: `M${p(start)} A${RA} ${RA} 0 ${sweep * f > Math.PI ? 1 : 0} 1 ${p(tEnd)}` }));
  svg.append(s('circle', { class: 'knob', cx: c + RA * Math.cos(tEnd), cy: c + RA * Math.sin(tEnd), r: 5 }));
  svg.append(s('text', { class: 'scale', x: c + (R1 + 4) * Math.cos(start) - 18, y: c + (R1 + 4) * Math.sin(start) + 22, text: '0' }));
  svg.append(s('text', { class: 'scale', x: c + (R1 + 4) * Math.cos(start + sweep) + 4, y: c + (R1 + 4) * Math.sin(start + sweep) + 22, text: nf.format(max) }));
  const shown = Math.round(value * 10) / 10;
  const unit = Number.isInteger(shown) ? plural(shown, W_VIDEOS) : 'ролика'; // fractions take the genitive singular
  const center = h('div', { class: 'dial-center' },
    h('div', { class: 'k', text: state.mode === 'day' ? 'за день' : 'в рабочий день' }),
    h('div', { class: 'v', text: nf1.format(shown) }),
    h('div', { class: 'u', text: unit }));
  const dial = $('paceDial');
  dial.title = `Шкала до ${nf.format(max)} — лучший день за последние 90 дней`;
  dial.replaceChildren(svg, center);
}

function renderStatus() {
  const { data } = state;
  const order = data.config.statuses.order;
  const cur = data.tasks.filter((t) => data.config.statuses.current.includes(t.status) && taskOk(t))
    .sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status) || (y.createdAt > x.createdAt ? 1 : -1));
  $('currentCount').textContent = nf.format(cur.length);
  const rows = cur.slice(0, 3).map((t) => h('div', { class: 'status-row' },
    h('span', { class: 'k', text: t.status }),
    h('a', { class: 'v', href: t.url, target: '_blank', rel: 'noopener', text: t.name || 'Без названия' })));
  $('statusRows').replaceChildren(...(rows.length ? rows : [h('p', { class: 'status-empty', text: 'Сейчас задач в работе нет' })]));
  requestAnimationFrame(() => { for (const v of $('statusRows').querySelectorAll('.v')) v.classList.toggle('fits', v.scrollWidth <= v.clientWidth); });
}

function statusChip(status) {
  if (!status) return h('span', { class: 'muted', text: 'без статуса' });
  return h('span', { class: 'status-chip' + (status === 'In progress' ? ' live' : ''), text: status });
}

function renderTasks(vids, a, b) {
  const { data } = state;
  const cfg = data.config;
  // done in period: tasks with videos inside the period
  const per = new Map();
  for (const v of vids) {
    const e = per.get(v.t) || { files: 0, keys: new Set(), last: 0 };
    e.files++; e.keys.add(v.k); e.last = Math.max(e.last, v.time);
    per.set(v.t, e);
  }
  const done = [...per.entries()].map(([id, e]) => ({ t: data.taskById.get(id), videos: e.keys.size, files: e.files, last: e.last }))
    .sort((x, y) => y.last - x.last);
  const current = data.tasks.filter((t) => cfg.statuses.current.includes(t.status) && taskOk(t))
    .sort((x, y) => cfg.statuses.order.indexOf(x.status) - cfg.statuses.order.indexOf(y.status))
    .map((t) => ({ t, videos: t.drive?.videos || 0, files: t.drive?.files || 0, last: t.drive?.lastAt ? Date.parse(t.drive.lastAt) : 0 }));
  // tasks closed in the period (by deadline, else creation) whose folder has no videos
  const nolink = data.tasks.filter((t) => {
    if (!taskOk(t) || t.status !== 'Done' || (t.types.length && !t.types.includes('video'))) return false;
    const when = Date.parse(t.deadline ? t.deadline + 'T12:00:00' : t.createdAt);
    return when >= +a && when < +b && !(t.drive && t.drive.files);
  }).map((t) => ({ t, videos: 0, files: 0, last: 0, why: !t.drive ? (t.deliverables ? 'ссылка не на Drive' : 'нет ссылки в Deliverables') : t.drive.ok === false ? 'папка недоступна' : t.drive.ok == null ? 'папка ещё не прочитана' : 'в папке нет видео' }));

  $('tabDoneN').textContent = nf.format(done.length);
  $('tabCurrentN').textContent = nf.format(current.length);
  $('tabNolinkN').textContent = nf.format(nolink.length);
  for (const btn of $('taskTabs').querySelectorAll('button')) btn.setAttribute('aria-selected', String(btn.dataset.tab === state.tab));

  const list = { done, current, nolink }[state.tab];
  const limit = state.showAll ? list.length : 40;
  const rows = list.slice(0, limit).map(({ t, videos, files, last, why }) => {
    const folder = t.drive ? `https://drive.google.com/drive/folders/${t.drive.id}` : null;
    const meta = [t.apps.join(', '), t.types.join(', '), t.customers.length ? `заказчик ${t.customers.join(', ')}` : ''].filter(Boolean).join(SEP);
    return h('tr', {},
      h('td', {}, h('a', { class: 'task-name', href: t.url, target: '_blank', rel: 'noopener', text: t.name || 'Без названия' }), meta ? h('span', { class: 'task-meta', text: meta }) : null),
      h('td', { 'data-k': 'Моушен:', text: t.assignees.length ? t.assignees.join(', ') : '—' }),
      h('td', { 'data-k': 'Направление:', title: `Определено: ${t.directionReason}`, text: data.directionLabel[t.direction] || t.direction }),
      h('td', { 'data-k': 'Статус:' }, statusChip(t.status)),
      h('td', { class: 'num', 'data-k': 'Ролики:' }, why ? h('span', { class: 'muted', text: why }) : folder ? h('a', { href: folder, target: '_blank', rel: 'noopener', title: 'Открыть папку на Drive', text: nf.format(videos) }) : '—'),
      h('td', { class: 'num', 'data-k': 'Файлы:', text: why ? '' : nf.format(files) }),
      h('td', { 'data-k': 'Последний ролик:', class: last ? '' : 'muted', text: last ? fmtDate(new Date(last).toISOString()) : '—' }),
    );
  });
  if (list.length > limit) {
    rows.push(h('tr', { class: 'more-row' }, h('td', { colspan: 7 }, h('button', { class: 'btn-ghost', type: 'button', onclick: () => { state.showAll = true; render(); }, text: `Показать все ${nf.format(list.length)}` }))));
  }
  $('taskRows').replaceChildren(...rows);
  $('tasksEmpty').hidden = list.length > 0;
  $('tasksEmpty').textContent = state.tab === 'current' ? 'Сейчас задач в работе нет' : state.tab === 'nolink' ? 'Все закрытые задачи периода нашли свои ролики' : 'За этот период роликов нет';
}

function renderChecks() {
  const { data } = state;
  const c = data.checks;
  const parts = [
    data.sources.notion === 'api' ? `Notion: ${nf.format(c.tasks)} ${plural(c.tasks, W_TASKS)}` : `Notion: снимок от ${fmtStamp(data.sources.notionExportedAt)}, ${nf.format(c.tasks)} ${plural(c.tasks, W_TASKS)}`,
    data.sources.drive === 'none'
      ? 'Drive ещё не подключён'
      : `Drive: прочитано ${nf.format(c.driveRootsRead)} из ${nf.format(c.driveFolders ?? c.withDriveLink)} папок${c.driveRootsFailed ? `, недоступно ${nf.format(c.driveRootsFailed)}` : ''}${data.sources.drive === 'snapshot' ? ` (снимок от ${fmtStamp(data.sources.driveFetchedAt)})` : ''}`,
    `найдено ${nf.format(c.videosFound)} ${plural(c.videosFound, W_FILES)} в ${nf.format(c.tasksWithVideos)} ${c.tasksWithVideos % 10 === 1 && c.tasksWithVideos % 100 !== 11 ? 'задаче' : 'задачах'}`,
  ];
  $('checks').textContent = parts.join(SEP) + '. Ролик — один креатив во всех форматах, дата ролика — когда файл появился на Drive.';
}

function renderChrome() {
  const { data } = state;
  $('appTitle').textContent = data.config.title;
  $('notionLink').href = data.config.notionUrl;
  $('driveLink').href = data.config.driveRootUrl;
  // Freshness is the age of the oldest source: a rebuild from snapshots is not an update.
  const live = data.sources.notion === 'api' && data.sources.drive === 'live';
  const stamps = [data.sources.notion === 'api' ? data.generatedAt : data.sources.notionExportedAt,
    data.sources.drive === 'live' ? data.generatedAt : data.sources.driveFetchedAt].filter(Boolean).sort();
  const freshAt = stamps[0] || data.generatedAt;
  document.querySelector('.updated-label').textContent = live ? 'Обновлено' : 'Данные на';
  $('updatedAt').textContent = fmtStamp(freshAt);
  $('updatedAt').title = live ? 'Notion и Drive прочитаны при последней синхронизации' : 'Часть данных взята из последнего снимка — подключи ключи синхронизации';
  const d = new Date();
  $('today').textContent = `${cap(fmtWeekday.format(d))}, ${fmtDayMonth.format(d)}`;
  $('dataAge').replaceChildren('данные', h('br'), fmtTime.format(new Date(freshAt)));
  dropdowns.directionFilter.setOptions([{ value: '', label: 'Все' }, ...data.config.directions.map((x) => ({ value: x.id, label: x.label }))]);
  dropdowns.personFilter.setOptions([{ value: '', label: 'Все' }, ...data.people.filter(Boolean).map((n) => ({ value: n, label: n }))]);
}

/* ───────── wire up ───────── */
function wire() {
  $('periodTabs').addEventListener('click', (e) => {
    const m = e.target.closest('button')?.dataset.mode;
    if (m) { state.mode = m; state.showAll = false; render(); }
  });
  $('prevPeriod').addEventListener('click', () => { state.anchor = shift(state.mode, startOf(state.mode, state.anchor), -1); state.showAll = false; render(); });
  $('nextPeriod').addEventListener('click', () => {
    const next = shift(state.mode, startOf(state.mode, state.anchor), 1);
    const today = startOfDay(new Date());
    state.anchor = +startOf(state.mode, today) === +next ? today : next;
    state.showAll = false; render();
  });
  dropdown($('directionFilter'), (v) => { state.direction = v; state.showAll = false; render(); });
  dropdown($('personFilter'), (v) => { state.person = v; state.showAll = false; render(); });
  $('taskTabs').addEventListener('click', (e) => {
    const t = e.target.closest('button')?.dataset.tab;
    if (t) { state.tab = t; state.showAll = false; render(); }
  });
  document.querySelector('[data-tab-link="current"]').addEventListener('click', () => { state.tab = 'current'; render(); });
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 120); });
}

(async function main() {
  readHash();
  wire();
  try {
    state.data = await load(true);
  } catch (e) {
    $('checks').textContent = `Не удалось загрузить данные: ${e.message}`;
    $('app').removeAttribute('aria-busy');
    return;
  }
  renderChrome();
  render();
  $('app').removeAttribute('aria-busy');
})();
