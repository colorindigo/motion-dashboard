// Motion Design · v2 — the Vault Custody dashboard layout over the same data/data.json as v1.
// The hash (m, d, dir, p) is the same as v1's, so a link keeps its period and filters across both versions;
// v=tasks and tab=… open the tasks page, which v1 ignores.

const $ = (id) => document.getElementById(id);
const DAY = 864e5;
const NBSP = ' ';
const SEP = `${NBSP}${NBSP}·  `; // two non-breaking spaces before the dot, two plain after (baseline rule 29)
const nf = new Intl.NumberFormat('ru-RU');
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const DIR_COLOR = { buying: 'var(--dir-buying)', viral: 'var(--dir-viral)', lab: 'var(--dir-lab)', internal: 'var(--dir-internal)' };

const LOG_ROWS = 10;
const TABS = ['done', 'current', 'nolink'];
const state = { data: null, mode: 'year', anchor: startOfDay(new Date()), direction: '', person: '', view: 'dash', tab: 'done', q: '', sort: null };
const dropdowns = {};

/* ───────── helpers ───────── */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
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
const W_PEOPLE = ['моушен', 'моушена', 'моушенов'];
const W_TASKS_ACC = ['задачу', 'задачи', 'задач'];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOf(mode, d) {
  const x = startOfDay(d);
  if (mode === 'week') x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  if (mode === 'month') x.setDate(1);
  if (mode === 'year') x.setMonth(0, 1);
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
const range = (mode, anchor) => { const a = startOf(mode, anchor); return [a, startOf(mode, shift(mode, a, 1))]; };
const fDayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const fDayShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const fMonthYear = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const fMonthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
const fWeekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const fTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const monthGen = (d) => fDayMonth.format(d).replace(/^\d+\s/, '');
const short = (d) => fDayShort.format(d).replace('.', '');

function periodLabel(mode, anchor) {
  const [a, b] = range(mode, anchor);
  const last = new Date(b - DAY);
  if (mode === 'day') return `${cap(fWeekday.format(a))}, ${fDayMonth.format(a)}`;
  if (mode === 'week') return a.getMonth() === last.getMonth() ? `${a.getDate()}–${last.getDate()}${NBSP}${monthGen(a)}` : `${short(a)} – ${short(last)}`;
  if (mode === 'month') return cap(fMonthYear.format(a)).replace(/\s*г\.$/, '');
  return `${a.getFullYear()} год`;
}
function periodPhrase(mode, anchor) {
  const [a] = range(mode, anchor);
  if (mode === 'day') return `За ${fDayMonth.format(a)}`;
  if (mode === 'week') return `За неделю ${periodLabel(mode, anchor)}`;
  if (mode === 'month') return `За ${fMonthYear.format(a).replace(/\s*г\.$/, '')}`;
  return `За ${a.getFullYear()} год`;
}
const prevPhrase = (mode) => ({ day: 'вчерашнему дню', week: 'прошлой неделе', month: 'прошлому месяцу', year: 'прошлому году' }[mode]);
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function workdays(a, b) {
  let n = 0;
  for (let t = new Date(a); t < b; t.setDate(t.getDate() + 1)) if (t.getDay() % 6 !== 0) n++;
  return n;
}
const gcd = (x, y) => (y ? gcd(y, x % y) : x);
// 1080x1920 → 9:16; a size without a short ratio stays as it is
function aspect(r) {
  const m = /^(\d+)x(\d+)$/.exec(r || '');
  if (!m) return '';
  const w = +m[1], hh = +m[2], g = gcd(w, hh);
  return w / g <= 21 && hh / g <= 21 ? `${w / g}:${hh / g}` : `${w}×${hh}`;
}
function fmtDate(ms) {
  const d = new Date(ms);
  return d.getFullYear() === new Date().getFullYear() ? short(d) : `${short(d)} ${d.getFullYear()}`;
}
const initials = (name) => (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '—';
// Fade the end only for words that really overflow; measured again once the web font replaces the wider fallback.
function measureFits(root) {
  const run = () => root.querySelectorAll('[data-fit]').forEach((el) => el.classList.toggle('fits', el.scrollWidth <= el.clientWidth + 1));
  requestAnimationFrame(run);
  document.fonts?.ready.then(run);
}

/* ───────── data ───────── */
async function load() {
  const res = await fetch(`../data/data.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data.json ${res.status}`);
  const data = await res.json();
  data.taskById = new Map(data.tasks.map((t) => [t.id, t]));
  data.videosByTask = new Map();
  for (const v of data.videos) {
    v.time = Date.parse(v.at);
    if (!data.videosByTask.has(v.t)) data.videosByTask.set(v.t, []);
    data.videosByTask.get(v.t).push(v);
  }
  data.dirLabel = Object.fromEntries(data.config.directions.map((d) => [d.id, d.label]));
  return data;
}
function videoOk(v, { ignoreDirection = false, ignorePerson = false } = {}) {
  const t = state.data.taskById.get(v.t);
  if (!t) return false;
  if (!ignoreDirection && state.direction && t.direction !== state.direction) return false;
  if (!ignorePerson && state.person && !v.by.includes(state.person)) return false;
  return true;
}
const videosIn = (a, b, opts) => state.data.videos.filter((v) => v.time >= +a && v.time < +b && videoOk(v, opts));
const creatives = (list) => new Set(list.map((v) => `${v.t}|${v.k}`)).size;
const tasksOf = (list) => new Set(list.map((v) => v.t)).size;

/* ───────── hash ───────── */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (['day', 'week', 'month', 'year'].includes(p.get('m'))) state.mode = p.get('m');
  if (p.get('d') && !Number.isNaN(Date.parse(p.get('d')))) state.anchor = startOfDay(new Date(p.get('d') + 'T00:00:00'));
  state.direction = p.get('dir') || '';
  state.person = p.get('p') || '';
  readView(p);
}
function readView(p = new URLSearchParams(location.hash.slice(1))) {
  state.view = p.get('v') === 'tasks' ? 'tasks' : 'dash';
  state.tab = TABS.includes(p.get('tab')) ? p.get('tab') : 'done';
}
function hashString() {
  const p = new URLSearchParams();
  if (state.mode !== 'year') p.set('m', state.mode); // the year is the start: a link without m opens it
  const a = state.anchor;
  if (+startOf(state.mode, a) !== +startOf(state.mode, new Date())) p.set('d', `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`);
  if (state.direction) p.set('dir', state.direction);
  if (state.person) p.set('p', state.person);
  if (state.view === 'tasks') {
    p.set('v', 'tasks');
    if (state.tab !== 'done') p.set('tab', state.tab);
  }
  return p.toString();
}
// replaceState keeps the entry's marker, so the back arrow knows the dashboard is one step behind
const writeHash = () => history.replaceState(history.state, '', '#' + hashString());
function openTasks(tab = 'done') {
  const fromDash = state.view !== 'tasks';
  state.view = 'tasks'; state.tab = tab; state.sort = null;
  if (fromDash) history.pushState({ v2: 'tasks' }, '', '#' + hashString());
  render();
  scrollTo({ top: 0 });
}
function closeTasks() {
  if (history.state?.v2 === 'tasks') { history.back(); return; } // popstate renders the dashboard
  state.view = 'dash';
  render();
  scrollTo({ top: 0 });
}

/* ───────── render ───────── */
function render() {
  if (!state.data) return;
  const { data } = state;
  const [a, b] = range(state.mode, state.anchor);
  const now = new Date();
  const isCurrent = a <= now && now < b;
  const end = isCurrent ? now : b;

  placeRange();
  $('periodLabel').textContent = periodLabel(state.mode, state.anchor);
  $('nextPeriod').disabled = shift(state.mode, a, 1) > now;

  const tasks = state.view === 'tasks';
  $('dashView').hidden = tasks;
  $('tasksView').hidden = !tasks;
  document.title = tasks ? 'Задачи · Motion Design · v2' : 'Motion Design · v2';
  if (tasks) renderTasksPage(a, b);
  else renderDashboard(a, b, now, isCurrent, end);
  measureFits(document);
  writeHash();
}

// the range lives inside the open period tab; on a phone the tabs are too narrow, so it goes to the top of the sheet
const PHONE = matchMedia('(max-width: 800px)');
function placeRange() {
  for (const tab of $('periodTabs').querySelectorAll('.ptab')) {
    const on = tab.dataset.mode === state.mode;
    tab.classList.toggle('is-on', on);
    tab.querySelector('.ptab-btn').setAttribute('aria-selected', String(on));
  }
  const host = PHONE.matches ? $('rangeSlot') : $('periodTabs').querySelector('.ptab.is-on');
  const range = $('range');
  if (range.parentElement !== host) {
    const moved = range.parentElement.classList.contains('ptab');
    host.append(range);
    range.classList.remove('is-moved');
    if (moved) { void range.offsetWidth; range.classList.add('is-moved'); }
  }
  // the first tab open: the sheet's own corner under it is square
  $('sheet').classList.toggle('is-joined', state.mode === 'day' && !PHONE.matches);
}

function renderDashboard(a, b, now, isCurrent, end) {
  const { data } = state;
  const vids = videosIn(a, b);
  const nVideos = creatives(vids);
  const pa = shift(state.mode, a, -1);
  const pb = isCurrent ? new Date(+pa + (now - a)) : a;
  const pVideos = creatives(videosIn(pa, pb));

  renderVideosCard(vids, nVideos, pVideos, isCurrent);
  renderDaysCard(a, b, end);
  renderWork();
  renderDirectionTiles(a, b);
  renderPeopleTiles(vids);
  renderLog(vids);
  requestAnimationFrame(fitLog);
  document.fonts?.ready.then(fitLog);
}

function renderVideosCard(vids, nVideos, pVideos, isCurrent) {
  $('aCap').textContent = periodPhrase(state.mode, state.anchor);
  $('aValue').textContent = nf.format(nVideos);
  const diff = nVideos - pVideos;
  $('aSub').textContent = `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${nf.format(Math.abs(diff))} к${NBSP}${prevPhrase(state.mode)}${isCurrent ? ' на этот день' : ''}`;
  const dirs = state.data.config.directions;
  const counts = dirs.map((d) => ({ ...d, n: creatives(vids.filter((v) => state.data.taskById.get(v.t).direction === d.id)) }));
  const total = counts.reduce((s, d) => s + d.n, 0);
  const split = $('split');
  split.classList.toggle('is-empty', !total);
  split.setAttribute('aria-label', total ? counts.map((d) => `${d.label} ${Math.round((d.n / total) * 100)}%`).join(', ') : 'Роликов нет');
  split.replaceChildren(...(total ? counts.filter((d) => d.n).map((d) => h('i', { style: `--c:${DIR_COLOR[d.id]};width:calc((100% - ${(counts.filter((x) => x.n).length - 1) * 2}px) * ${d.n / total})`, title: `${d.label}: ${d.n}` })) : []));
  $('splitLegend').replaceChildren(...counts.map((d) => h('span', { class: 'legend-item' }, h('i', { style: `--c:${DIR_COLOR[d.id]}` }), `${d.label}${NBSP}${NBSP}${total ? Math.round((d.n / total) * 100) : 0}%`)));
}

function buckets(a, b) {
  const out = [];
  if (state.mode === 'year') {
    for (let m = 0; m < 12; m++) {
      const s0 = new Date(a.getFullYear(), m, 1), s1 = new Date(a.getFullYear(), m + 1, 1);
      out.push({ a: s0, b: s1, label: fMonthShort.format(s0).replace('.', ''), long: cap(fMonthYear.format(s0)).replace(/\s*г\.$/, '') });
    }
    return out;
  }
  const from = state.mode === 'day' ? new Date(+a - 13 * DAY) : a;
  for (let d = new Date(from); d < b; d.setDate(d.getDate() + 1)) {
    const s0 = new Date(d), s1 = new Date(d); s1.setDate(s1.getDate() + 1);
    out.push({ a: s0, b: s1, label: short(s0), long: `${cap(fWeekday.format(s0))}, ${fDayMonth.format(s0)}` });
  }
  return out;
}

function renderDaysCard(a, b, end) {
  const year = state.mode === 'year';
  $('bTitle').textContent = year ? 'По месяцам' : state.mode === 'day' ? 'За 14 дней' : 'По дням';
  const wd = Math.max(1, workdays(a, end));
  const value = creatives(videosIn(a, b)) / wd;
  const shown = Math.round(value * 10) / 10;
  $('bValue').textContent = nf1.format(shown);
  $('bSub').textContent = `${Number.isInteger(shown) ? plural(shown, W_VIDEOS) : 'ролика'} в рабочий день`;
  const bs = buckets(a, b).map((x) => ({ ...x, n: creatives(videosIn(x.a, x.b)) }));
  const max = Math.max(1, ...bs.map((x) => x.n));
  const best = bs.reduce((m, x) => (x.n > m.n ? x : m), bs[0]);
  $('bCap').textContent = best && best.n ? `Лучший ${year ? 'месяц' : 'день'} — ${year ? best.long.toLowerCase() : fDayMonth.format(best.a)}, ${nf.format(best.n)} ${plural(best.n, W_VIDEOS)}` : 'Роликов в этом периоде нет';
  const today = startOfDay(new Date());
  const tt = $('tooltip');
  $('bars').replaceChildren(...bs.map((x) => {
    const level = x.n / max;
    const isNow = year ? x.a <= today && today < x.b : +x.a === +(state.mode === 'day' ? startOfDay(state.anchor) : today);
    const bar = h('i', { class: isNow ? 'is-now' : '', style: x.n ? `--h:${Math.max(4, Math.round(level * 24))}px;--o:${(0.3 + 0.7 * level).toFixed(2)}` : '', tabindex: '0', 'aria-label': `${x.long}: ${x.n} ${plural(x.n, W_VIDEOS)}` });
    const show = (ev) => {
      tt.replaceChildren(h('span', { text: x.long }), h('br'), h('b', { text: `${nf.format(x.n)} ${plural(x.n, W_VIDEOS)}` }));
      tt.hidden = false;
      const r = tt.getBoundingClientRect();
      const px = ev.clientX ?? bar.getBoundingClientRect().left, py = ev.clientY ?? bar.getBoundingClientRect().top;
      tt.style.left = `${Math.min(innerWidth - r.width - 8, px + 12)}px`;
      tt.style.top = `${Math.max(8, py - r.height - 12)}px`;
    };
    bar.addEventListener('pointermove', show);
    bar.addEventListener('focus', () => show({}));
    bar.addEventListener('pointerleave', () => { tt.hidden = true; });
    bar.addEventListener('blur', () => { tt.hidden = true; });
    return bar;
  }));
  $('barsFrom').textContent = bs[0]?.label || '';
  $('barsTo').textContent = bs[bs.length - 1]?.label || '';
}

function renderWork() {
  const { data } = state;
  const order = data.config.statuses.order;
  const cur = data.tasks.filter((t) => data.config.statuses.current.includes(t.status)
    && (!state.direction || t.direction === state.direction) && (!state.person || t.assignees.includes(state.person)))
    .sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status) || (y.createdAt > x.createdAt ? 1 : -1));
  $('cValue').textContent = nf.format(cur.length);
  $('cSub').textContent = `${plural(cur.length, W_TASKS)} сейчас`;
  const rows = cur.slice(0, 4).map((t) => h('div', { class: 'wrow' },
    h('a', { class: 'n', 'data-fit': '', href: t.url, target: '_blank', rel: 'noopener', text: t.name || 'Без названия' }),
    h('span', { class: 's', text: t.status })));
  $('worklist').replaceChildren(...(rows.length ? rows : [h('p', { class: 'wempty', text: 'Открытых задач нет' })]));
}

function tile({ label, value, capText, act, pressed, onclick, color }) {
  return h('button', { class: 'tile', type: 'button', 'aria-pressed': String(!!pressed), onclick },
    color ? h('i', { class: 'dot', style: `--c:${color}` }) : null,
    h('span', { class: 'tile-label', text: label }),
    h('span', { class: 'tile-value', text: value }),
    h('span', { class: 'tile-cap', text: capText }),
    h('span', { class: 'tile-act', text: act }));
}

function renderDirectionTiles(a, b) {
  // the direction tiles show every direction, whatever is picked, so the picked one can be switched off
  const all = videosIn(a, b, { ignoreDirection: true });
  const total = creatives(all);
  $('dirTiles').replaceChildren(...state.data.config.directions.map((d) => {
    const mine = all.filter((v) => state.data.taskById.get(v.t).direction === d.id);
    const n = creatives(mine), nt = tasksOf(mine), on = state.direction === d.id;
    return tile({
      label: d.label, value: nf.format(n), color: DIR_COLOR[d.id],
      capText: `${nf.format(nt)} ${plural(nt, W_TASKS)}${SEP}${total ? Math.round((n / total) * 100) : 0}%`,
      act: on ? 'Все направления' : 'Показать', pressed: on,
      onclick: () => { state.direction = on ? '' : d.id; render(); },
    });
  }));
}

function renderPeopleTiles() {
  const [a, b] = range(state.mode, state.anchor);
  const all = videosIn(a, b, { ignorePerson: true });
  const names = new Set(all.flatMap((v) => v.by));
  if (state.person) names.add(state.person);
  const rows = [...names].map((n) => {
    const mine = all.filter((v) => v.by.includes(n));
    return { n, videos: creatives(mine), tasks: tasksOf(mine) };
  }).sort((x, y) => y.videos - x.videos || x.n.localeCompare(y.n));
  $('personTiles').replaceChildren(...(rows.length ? rows.slice(0, 4).map((r) => {
    const on = state.person === r.n;
    return tile({
      label: r.n, value: nf.format(r.videos),
      capText: `${nf.format(r.tasks)} ${plural(r.tasks, W_TASKS)}`,
      act: on ? 'Все моушены' : 'Показать', pressed: on,
      onclick: () => { state.person = on ? '' : r.n; render(); },
    });
  }) : [h('p', { class: 'wempty', text: 'За этот период роликов нет' })]));
}

function renderLog(vids) {
  const { data } = state;
  const per = new Map();
  for (const v of vids) {
    const e = per.get(v.t) || { keys: new Set(), last: 0 };
    e.keys.add(v.k); e.last = Math.max(e.last, v.time);
    per.set(v.t, e);
  }
  const list = [...per.entries()].map(([id, e]) => ({ t: data.taskById.get(id), n: e.keys.size, last: e.last })).sort((x, y) => y.last - x.last);
  const today = startOfDay(new Date());
  const rows = list.slice(0, LOG_ROWS).map(({ t, n, last }) => {
    const who = t.assignees[0] || '';
    const when = new Date(last);
    const meta = [t.assignees.join(', ') || 'без исполнителя', data.dirLabel[t.direction], `${nf.format(n)} ${plural(n, W_VIDEOS)}`].join(SEP);
    const href = t.drive ? `https://drive.google.com/drive/folders/${t.drive.id}` : t.url;
    return h('a', { class: 'ev', href, target: '_blank', rel: 'noopener', title: t.drive ? 'Открыть папку с роликами' : 'Открыть задачу в Notion' },
      h('span', { class: 'ev-av', text: initials(who), 'aria-hidden': 'true' }),
      h('span', { class: 'ev-txt' }, h('span', { class: 'ev-name', 'data-fit': '', text: t.name || 'Без названия' }), h('span', { class: 'ev-meta', text: meta })),
      h('span', { class: 'ev-time', text: +startOfDay(when) === +today ? fTime.format(when) : short(when) }));
  });
  const box = $('events');
  box.replaceChildren(...(rows.length ? rows : [h('p', { class: 'ev-empty', text: 'За этот период роликов нет' })]));
  // the rest is not unfolded here: the button opens the tasks page with the same period and filters
  if (list.length) box.append(h('button', { class: 'ev-more', type: 'button', text: list.length > LOG_ROWS ? `Показать все ${nf.format(list.length)}` : 'Подробнее', onclick: () => openTasks('done') }));
}

/* ───────── MUI-style select: an anchored listbox under a field ───────── */
function dropdown(host, onChange) {
  const id = host.id;
  const valueEl = h('span', { class: 'dd-value', id: `${id}-value` });
  const trigger = h('button', { class: 'dd-trigger', type: 'button', id: `${id}-btn`, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': host.dataset.label },
    valueEl, svg('<svg class="ico dd-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 10.5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'));
  const menu = h('ul', { class: 'dd-menu', role: 'listbox', id: `${id}-menu`, tabindex: '-1', 'aria-label': host.dataset.label, hidden: true });
  host.replaceChildren(trigger, menu);
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
  trigger.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); } });
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
  const api = { setOptions(list) { options = list; draw(); }, setValue(v) { if (v !== value) { value = v; draw(); } }, close };
  dropdowns[id] = api;
  return api;
}

/* ───────── the tasks page ───────── */
const taskOk = (t) => (!state.direction || t.direction === state.direction) && (!state.person || t.assignees.includes(state.person));
function summarize(list) {
  const res = new Map(), by = new Set(), keys = new Set();
  let first = Infinity, last = 0;
  for (const v of list) {
    keys.add(v.k);
    const r = aspect(v.r);
    if (r) res.set(r, (res.get(r) || 0) + 1);
    for (const n of v.by) by.add(n);
    first = Math.min(first, v.time); last = Math.max(last, v.time);
  }
  return { videos: keys.size, files: list.length, formats: [...res].sort((x, y) => y[1] - x[1]).map(([r]) => r), by: [...by], first: list.length ? first : 0, last };
}
function taskLists(a, b) {
  const { data } = state;
  const cfg = data.config;
  const per = new Map();
  for (const v of videosIn(a, b)) {
    if (!per.has(v.t)) per.set(v.t, []);
    per.get(v.t).push(v);
  }
  const done = [...per].map(([id, list]) => ({ t: data.taskById.get(id), ...summarize(list) }));
  const current = data.tasks.filter((t) => cfg.statuses.current.includes(t.status) && taskOk(t))
    .map((t) => ({ t, ...summarize(data.videosByTask.get(t.id) || []) }));
  // closed in the period (by deadline, else creation) and no video found in the folder
  const nolink = data.tasks.filter((t) => {
    if (!taskOk(t) || t.status !== 'Done' || (t.types.length && !t.types.includes('video'))) return false;
    const when = Date.parse(t.deadline ? t.deadline + 'T12:00:00' : t.createdAt);
    return when >= +a && when < +b && !(t.drive && t.drive.files);
  }).map((t) => ({ t, ...summarize([]), why: !t.drive ? (t.deliverables ? 'ссылка не на Drive' : 'нет ссылки в Deliverables') : t.drive.ok === false ? 'папка недоступна' : t.drive.ok == null ? 'папка не прочитана' : 'в папке нет видео' }));
  return { done, current, nolink };
}
const STATUS_ON = new Set(['In progress', 'Review']);
const COLS = [
  { key: 'name', label: 'Задача', w: 'minmax(168px, 1fr)', sort: 'name' },
  { key: 'who', label: 'Моушен', w: 'max-content' },
  { key: 'dir', label: 'Направление', w: 'max-content' },
  { key: 'status', label: 'Статус', w: 'max-content', sort: 'status' },
  { key: 'formats', label: 'Форматы', w: 'max-content' },
  { key: 'videos', label: 'Ролики', w: 'max-content', sort: 'videos', r: true },
  { key: 'last', label: 'Последний ролик', w: 'max-content', sort: 'last' },
  { key: 'deadline', label: 'Дедлайн', w: 'max-content', sort: 'deadline' },
  { key: 'open', label: 'Открыть', w: 'max-content', r: true },
];
const DEFAULT_SORT = { done: ['last', -1], current: ['status', 1], nolink: ['deadline', -1] };
function sorter(key, dir) {
  const order = state.data.config.statuses.order;
  const cmp = {
    name: (x, y) => (x.t.name || '').localeCompare(y.t.name || '', 'ru'),
    status: (x, y) => order.indexOf(x.t.status) - order.indexOf(y.t.status),
    videos: (x, y) => x.videos - y.videos || x.files - y.files,
    last: (x, y) => x.last - y.last,
    deadline: (x, y) => (x.t.deadline || '').localeCompare(y.t.deadline || ''),
  }[key];
  const missing = (r) => (key === 'deadline' ? !r.t.deadline : key === 'last' ? !r.last : key === 'status' ? !r.t.status : false);
  // a row without the value goes last in both directions
  return (x, y) => (missing(x) - missing(y)) || dir * cmp(x, y) || y.last - x.last || (y.t.createdAt > x.t.createdAt ? 1 : -1);
}
const ICON_NOTION = '<svg class="ico16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.75h7l4.25 4.25v11a1.25 1.25 0 0 1-1.25 1.25H7A1.25 1.25 0 0 1 5.75 19V5A1.25 1.25 0 0 1 7 3.75z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13.75 3.75V8.25h4.5M9 12.75h6M9 16h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_FOLDER = '<svg class="ico16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.75 7A1.25 1.25 0 0 1 5 5.75h4.2l2 2.25H19A1.25 1.25 0 0 1 20.25 9.25V17A1.25 1.25 0 0 1 19 18.25H5A1.25 1.25 0 0 1 3.75 17z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const prio = (p) => (p || '').replace(/[^\p{L}\s-]/gu, '').trim();
const fit = (cls, text, extra = {}) => h('span', { class: `fit ${cls}`, 'data-fit': '', text, ...extra });

function renderTasksPage(a, b) {
  const { data } = state;
  const lists = taskLists(a, b);
  const q = state.q.toLowerCase();
  const match = (r) => !q || [r.t.name, ...r.t.apps, ...r.t.customers, ...r.t.assignees, data.dirLabel[r.t.direction]].join(' ').toLowerCase().includes(q);
  const shown = Object.fromEntries(TABS.map((k) => [k, lists[k].filter(match)]));
  $('nDone').textContent = nf.format(shown.done.length);
  $('nCurrent').textContent = nf.format(shown.current.length);
  $('nNolink').textContent = nf.format(shown.nolink.length);
  for (const btn of $('taskTabs').querySelectorAll('button')) btn.setAttribute('aria-selected', String(btn.dataset.tab === state.tab));
  $('tcard').classList.toggle('is-joined', state.tab === TABS[0]);

  const rows = shown[state.tab];
  const [key, dir] = state.sort || DEFAULT_SORT[state.tab];
  rows.sort(sorter(key, dir));

  dropdowns.dirFilter.setOptions([{ value: '', label: 'Все направления' }, ...data.config.directions.map((d) => ({ value: d.id, label: d.label }))]);
  dropdowns.dirFilter.setValue(state.direction);
  dropdowns.personFilter.setOptions([{ value: '', label: 'Все моушены' }, ...data.people.filter(Boolean).map((n) => ({ value: n, label: n }))]);
  dropdowns.personFilter.setValue(state.person);
  if ($('taskSearch').value.trim() !== state.q) $('taskSearch').value = state.q;

  const grid = $('tgrid');
  grid.style.setProperty('--cols', COLS.map((c) => c.w).join(' '));
  const head = h('div', { class: 'thead', role: 'row' }, ...COLS.map((c) => {
    const on = c.sort === key;
    const cell = h('span', { class: c.r ? 'r' : '', role: 'columnheader', 'aria-sort': on ? (dir > 0 ? 'ascending' : 'descending') : null });
    if (!c.sort) { cell.textContent = c.label; return cell; }
    cell.append(h('button', { class: 'th-sort' + (on ? ' is-on' : ''), type: 'button', onclick: () => {
      const def = DEFAULT_SORT[state.tab];
      const firstDir = c.sort === 'name' || c.sort === 'status' ? 1 : -1;
      state.sort = [c.sort, on ? -dir : firstDir];
      if (state.sort[0] === def[0] && state.sort[1] === def[1]) state.sort = null;
      render();
    } }, c.label, svg(`<svg class="th-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d="${on && dir > 0 ? 'M3 7.5L6 4.5l3 3' : 'M3 4.5L6 7.5l3-3'}" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`)));
    return cell;
  }));

  const body = rows.map((r) => {
    const { t } = r;
    const meta = [t.apps.join(', '), t.types.join(', '), t.customers.length ? `заказчик ${t.customers.join(', ')}` : ''].filter(Boolean).join(SEP);
    const people = t.assignees.length ? t.assignees : r.by;
    const folder = t.drive ? `https://drive.google.com/drive/folders/${t.drive.id}` : null;
    const d = t.deadline ? Date.parse(t.deadline + 'T12:00:00') : 0;
    const status = t.status || 'Без статуса';
    return h('div', { class: 'tr', role: 'row' },
      h('div', { class: 'td c-name', role: 'cell' },
        h('a', { class: 'fit strong t-name', 'data-fit': '', href: t.url, target: '_blank', rel: 'noopener', text: t.name || 'Без названия' }),
        meta ? fit('cap', meta) : null),
      h('div', { class: 'td person', role: 'cell', 'data-k': 'Моушен' },
        people.length ? h('span', { class: 'av', text: initials(people[0]), 'aria-hidden': 'true' }) : null,
        h('span', { class: 'p-txt' }, people.length ? people[0] : h('span', { class: 'muted', text: 'Без исполнителя' }),
          people.length > 1 ? h('span', { class: 'cap', text: people.slice(1).join(', ') }) : null)),
      h('div', { class: 'td', role: 'cell', 'data-k': 'Направление' },
        h('span', { class: 'dir' }, h('i', { style: `--c:${DIR_COLOR[t.direction]}` }), data.dirLabel[t.direction] || t.direction),
        t.directionReason ? fit('cap reason', t.directionReason, { title: `Определено: ${t.directionReason}` }) : null),
      h('div', { class: 'td', role: 'cell', 'data-k': 'Статус' }, h('span', { class: `chip ${STATUS_ON.has(t.status) ? 'chip-ok' : 'chip-n'}`, text: status })),
      h('div', { class: 'td', role: 'cell', 'data-k': 'Форматы' }, r.formats.length ? fit('formats', r.formats.join(', ')) : h('span', { class: 'muted', text: '—' })),
      h('div', { class: 'td r', role: 'cell', 'data-k': 'Ролики' },
        r.why ? h('span', { class: 'muted', text: r.why }) : h('span', { class: 'num' }, h('b', { text: nf.format(r.videos) }), h('span', { class: 'cap', text: `${nf.format(r.files)} ${plural(r.files, W_FILES)}` }))),
      h('div', { class: 'td', role: 'cell', 'data-k': 'Последний ролик' },
        r.last ? fmtDate(r.last) : h('span', { class: 'muted', text: '—' }),
        r.first && startOfDay(new Date(r.first)) < startOfDay(new Date(r.last)) ? h('span', { class: 'cap', text: `первый ${fmtDate(r.first)}` }) : null),
      h('div', { class: 'td', role: 'cell', 'data-k': 'Дедлайн' },
        d ? fmtDate(d) : h('span', { class: 'muted', text: '—' }),
        prio(t.priority) ? h('span', { class: 'cap', text: prio(t.priority) }) : null),
      h('div', { class: 'td r', role: 'cell', 'data-k': 'Открыть' },
        h('span', { class: 'acts' },
          h('a', { class: 'ibtn', href: t.url, target: '_blank', rel: 'noopener', 'aria-label': 'Открыть задачу в Notion', title: 'Задача в Notion' }, svg(ICON_NOTION)),
          folder ? h('span', { class: 'sep', 'aria-hidden': 'true' }) : null,
          folder ? h('a', { class: 'ibtn', href: folder, target: '_blank', rel: 'noopener', 'aria-label': 'Открыть папку на Drive', title: 'Папка на Drive' }, svg(ICON_FOLDER)) : null)),
    );
  });
  grid.replaceChildren(head, ...body);
  const empty = $('tEmpty');
  empty.hidden = rows.length > 0;
  empty.textContent = q && lists[state.tab].length ? 'По этому запросу задач нет'
    : state.tab === 'current' ? 'Сейчас задач в работе нет'
    : state.tab === 'nolink' ? `Все закрытые задачи периода нашли свои${NBSP}ролики` : 'За этот период роликов нет';
}

// the log shows as many rows as its card has room for: the page never scrolls on a desktop screen
function fitLog() {
  const box = $('events');
  const rows = [...box.querySelectorAll('.ev')];
  rows.forEach((r) => { r.hidden = false; });
  if (!matchMedia('(min-width: 1200px) and (min-height: 640px)').matches) return;
  const more = box.querySelector('.ev-more');
  const room = box.clientHeight;
  let used = more ? more.offsetHeight + 8 : 0, n = 0;
  for (const r of rows) {
    used += r.offsetHeight;
    if (used > room) break;
    n++;
  }
  rows.forEach((r, i) => { r.hidden = i >= Math.max(1, n); });
}

function renderChrome() {
  const { data } = state;
  $('notionLink').href = data.config.notionUrl;
  $('driveLink').href = data.config.driveRootUrl;
}

/* ───────── wire ───────── */
PHONE.addEventListener('change', () => { placeRange(); if (state.view === 'dash') fitLog(); });
$('periodTabs').addEventListener('click', (e) => {
  const m = e.target.closest('.ptab-btn')?.dataset.mode;
  if (m) { state.mode = m; render(); }
});
$('prevPeriod').addEventListener('click', () => { state.anchor = shift(state.mode, startOf(state.mode, state.anchor), -1); render(); });
$('nextPeriod').addEventListener('click', () => {
  const next = shift(state.mode, startOf(state.mode, state.anchor), 1);
  state.anchor = +startOf(state.mode, new Date()) === +next ? startOfDay(new Date()) : next;
  render();
});
$('backBtn').addEventListener('click', closeTasks);
// the browser's own back and forward move between the pages; the period and filters stay as they are now
addEventListener('popstate', () => { readView(); render(); });
$('taskTabs').addEventListener('click', (e) => {
  const t = e.target.closest('button')?.dataset.tab;
  if (t && t !== state.tab) { state.tab = t; state.sort = null; render(); }
});
$('taskSearch').addEventListener('input', (e) => { state.q = e.target.value.trim(); render(); });
dropdown($('dirFilter'), (v) => { state.direction = v; render(); });
dropdown($('personFilter'), (v) => { state.person = v; render(); });
addEventListener('resize', () => { if (state.view === 'dash') fitLog(); });

(async function main() {
  readHash();
  placeRange(); // the range stands in its tab before the data comes
  try {
    state.data = await load();
  } catch (e) {
    $('sheet').prepend(h('p', { class: 'load-error', text: `Не удалось загрузить данные: ${e.message}` }));
    $('app').removeAttribute('aria-busy');
    return;
  }
  renderChrome();
  render();
  $('app').removeAttribute('aria-busy');
})();
