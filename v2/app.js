// Motion Design · v2 — the Vault Custody dashboard layout over the same data/data.json as v1.
// The hash (m, d, dir, p) is the same as v1's, so a link keeps its period and filters across both versions.

const $ = (id) => document.getElementById(id);
const DAY = 864e5;
const NBSP = ' ';
const SEP = `${NBSP}${NBSP}·  `; // two non-breaking spaces before the dot, two plain after (baseline rule 29)
const nf = new Intl.NumberFormat('ru-RU');
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const DIR_COLOR = { buying: 'var(--dir-buying)', viral: 'var(--dir-viral)', lab: 'var(--dir-lab)', internal: 'var(--dir-internal)' };

const state = { data: null, mode: 'month', anchor: startOfDay(new Date()), direction: '', person: '', logLimit: 10 };

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
const initials = (name) => (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '—';
function stamp(iso) {
  const d = new Date(iso);
  return `${short(d)}, ${fTime.format(d)}`;
}
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
  for (const v of data.videos) v.time = Date.parse(v.at);
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
}
function writeHash() {
  const p = new URLSearchParams();
  p.set('m', state.mode);
  const a = state.anchor;
  if (+startOf(state.mode, a) !== +startOf(state.mode, new Date())) p.set('d', `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`);
  if (state.direction) p.set('dir', state.direction);
  if (state.person) p.set('p', state.person);
  history.replaceState(null, '', '#' + p.toString());
  $('fullLink').href = `../#${p.toString()}`;
}

/* ───────── render ───────── */
function render() {
  if (!state.data) return;
  const { data } = state;
  const [a, b] = range(state.mode, state.anchor);
  const now = new Date();
  const isCurrent = a <= now && now < b;
  const end = isCurrent ? now : b;

  for (const btn of $('periodTabs').querySelectorAll('button')) btn.setAttribute('aria-selected', String(btn.dataset.mode === state.mode));
  $('periodLabel').textContent = periodLabel(state.mode, state.anchor);
  $('nextPeriod').disabled = shift(state.mode, a, 1) > now;

  const vids = videosIn(a, b);
  const nVideos = creatives(vids), nFiles = vids.length, nTasks = tasksOf(vids);
  const pa = shift(state.mode, a, -1);
  const pb = isCurrent ? new Date(+pa + (now - a)) : a;
  const pVideos = creatives(videosIn(pa, pb));

  // folder tab: what the page is scoped to
  const scope = [state.direction ? data.dirLabel[state.direction] : '', state.person].filter(Boolean);
  $('scopeLabel').textContent = scope.length ? scope.join(SEP) : 'Все ролики';
  $('scopeLabel').setAttribute('data-fit', '');
  $('tabValue').textContent = `${nf.format(nVideos)} ${plural(nVideos, W_VIDEOS)}`;
  const tabCap = $('tabCap');
  tabCap.replaceChildren(`${nf.format(nFiles)} ${plural(nFiles, W_FILES)}${SEP}${nf.format(nTasks)} ${plural(nTasks, W_TASKS)}`);
  if (scope.length) tabCap.append(SEP, h('button', { type: 'button', text: 'сбросить', onclick: () => { state.direction = ''; state.person = ''; render(); } }));

  renderVideosCard(vids, nVideos, pVideos, isCurrent);
  renderDaysCard(a, b, end);
  renderWork();
  renderDirectionTiles(a, b);
  renderPeopleTiles(vids);
  renderLog(vids);
  measureFits(document);
  writeHash();
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
      onclick: () => { state.direction = on ? '' : d.id; state.logLimit = 10; render(); },
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
      onclick: () => { state.person = on ? '' : r.n; state.logLimit = 10; render(); },
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
  const rows = list.slice(0, state.logLimit).map(({ t, n, last }) => {
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
  if (list.length > state.logLimit) box.append(h('button', { class: 'ev-more', type: 'button', text: `Показать ещё ${nf.format(Math.min(10, list.length - state.logLimit))}`, onclick: () => { state.logLimit += 10; render(); } }));
}

function renderChrome() {
  const { data } = state;
  const live = data.sources.notion === 'api' && data.sources.drive === 'live';
  const stamps = [data.sources.notion === 'api' ? data.generatedAt : data.sources.notionExportedAt,
    data.sources.drive === 'live' ? data.generatedAt : data.sources.driveFetchedAt].filter(Boolean).sort();
  $('updated').textContent = `${live ? 'Обновлено' : 'Данные на'} ${stamp(stamps[0] || data.generatedAt)}`;
  $('notionLink').href = data.config.notionUrl;
  $('driveLink').href = data.config.driveRootUrl;
  const c = data.checks;
  $('foot').textContent = `Notion: ${nf.format(c.tasks)} ${plural(c.tasks, W_TASKS)}${SEP}Drive: прочитано ${nf.format(c.driveRootsRead)} из ${nf.format(c.driveFolders ?? c.withDriveLink)} папок${SEP}${nf.format(c.videosFound)} ${plural(c.videosFound, W_FILES)}. `
    + 'Ролик — один креатив во всех форматах, дата ролика — когда файл появился на Drive.';
}

/* ───────── wire ───────── */
$('periodTabs').addEventListener('click', (e) => {
  const m = e.target.closest('button')?.dataset.mode;
  if (m) { state.mode = m; state.logLimit = 10; render(); }
});
$('prevPeriod').addEventListener('click', () => { state.anchor = shift(state.mode, startOf(state.mode, state.anchor), -1); state.logLimit = 10; render(); });
$('nextPeriod').addEventListener('click', () => {
  const next = shift(state.mode, startOf(state.mode, state.anchor), 1);
  state.anchor = +startOf(state.mode, new Date()) === +next ? startOfDay(new Date()) : next;
  state.logLimit = 10; render();
});

(async function main() {
  readHash();
  try {
    state.data = await load();
  } catch (e) {
    $('foot').textContent = `Не удалось загрузить данные: ${e.message}`;
    $('app').removeAttribute('aria-busy');
    return;
  }
  renderChrome();
  render();
  $('app').removeAttribute('aria-busy');
})();
