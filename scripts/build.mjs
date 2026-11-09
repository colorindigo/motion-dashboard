// Pure transform: Notion tasks + Drive listing → data/data.json for the dashboard.
// No network here, so it can be tested on snapshots.

const DAY = 864e5;

export function driveIdFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|file\/d\/|open\?id=|drive\/(?:u\/\d+\/)?shared-drives\/)([\w-]{10,})/);
  return m ? m[1] : null;
}

export function classifyDirection(task, config) {
  const name = task.name || '';
  const apps = task.apps || [];
  const sources = task.sources || [];
  if (task.direction) {
    const hit = config.directions.find((d) => d.label.toLowerCase() === task.direction.toLowerCase() || d.id === task.direction.toLowerCase());
    if (hit) return { id: hit.id, reason: 'поле в Notion' };
  }
  for (const d of config.directions) {
    const re = d.namePattern ? new RegExp(d.namePattern, 'iu') : null;
    if (d.id === 'internal') {
      if (re && re.test(name) && (!d.whenNoApp || apps.length === 0)) return { id: d.id, reason: 'название задачи' };
      continue;
    }
    if (d.apps && apps.some((a) => d.apps.includes(a))) return { id: d.id, reason: 'приложение ' + apps.join(', ') };
    if (re && re.test(name)) return { id: d.id, reason: 'название задачи' };
    if (d.fallbackWhenSource && sources.length) return { id: d.id, reason: 'источник ' + sources.join(', ') };
    if (d.fallbackWhenApp && apps.length) return { id: d.id, reason: 'приложение ' + apps.join(', ') };
  }
  return { id: config.defaultDirection, reason: 'нет приложения и источника' };
}

const RES_FILE = /\d{3,4}\s*[xх×]\s*\d{3,4}/gu;
const RES_RATIO = /(^|[^\p{L}\d])\d{1,2}\s*[xх×:]\s*\d{1,2}(?=$|[^\p{L}\d])/gu;
const RES_WORDS = /(^|[^\p{L}])(vertical|horizontal|square|vert|hor|sq|stories|story|reels|feed|portrait|landscape|верт\p{L}*|гориз\p{L}*|квадрат\p{L}*)(?=$|[^\p{L}])/giu;

function stripFormat(s) {
  return String(s)
    .toLowerCase()
    .replace(RES_FILE, ' ')
    .replace(RES_RATIO, '$1 ')
    .replace(RES_WORDS, '$1 ')
    .replace(/[\s_\-.()[\]]+/g, ' ')
    .trim();
}

// One creative = one video regardless of how many formats it was exported in.
export function creativeKey(path, name) {
  const base = String(name).replace(/\.[a-z0-9]{2,4}$/i, '');
  const dirs = String(path || '')
    .split('/')
    .map(stripFormat)
    .filter(Boolean);
  return [...dirs, stripFormat(base) || base.toLowerCase()].join('/');
}

export function resolutionOf(file) {
  const m = String(file.name).match(/(\d{3,4})\s*[xх×]\s*(\d{3,4})/u);
  if (m) return `${m[1]}x${m[2]}`;
  if (file.width && file.height) return `${file.width}x${file.height}`;
  const r = `${file.path || ''}/${file.name}`.match(/(^|[^\p{L}\d])(\d{1,2})\s*[xх×:]\s*(\d{1,2})(?=$|[^\p{L}\d])/u);
  return r ? `${r[2]}x${r[3]}` : null;
}

function personFromFile(file, config) {
  const email = (file.ownerEmail || file.modifierEmail || '').toLowerCase();
  return config.people[email] || null;
}

/**
 * @param {object} args
 * @param {Array} args.tasks  normalized Notion tasks
 * @param {object|null} args.drive  { roots: { [id]: { ok, name, mimeType, error, files: [...] } } }
 * @param {object} args.config
 * @param {object} args.meta  { notionSource, driveSource, generatedAt }
 */
export function buildData({ tasks, drive, config, meta }) {
  const skipFolder = new RegExp(config.drive.skipFolders, 'iu');
  const videoExt = new RegExp(`\\.(${config.drive.videoExtensions.join('|')})$`, 'i');
  const roots = drive?.roots || {};

  const outTasks = tasks.map((t) => {
    const dir = classifyDirection(t, config);
    const folderId = driveIdFromUrl(t.deliverables);
    return {
      id: t.id,
      name: t.name || '',
      url: t.url || `https://www.notion.so/${t.id.replace(/-/g, '')}`,
      status: t.status || null,
      assignees: t.assignees || [],
      customers: t.customers || [],
      apps: t.apps || [],
      types: t.types || [],
      sources: t.sources || [],
      priority: t.priority || null,
      deadline: t.deadline || null,
      createdAt: t.createdAt,
      editedAt: t.editedAt,
      direction: dir.id,
      directionReason: dir.reason,
      deliverables: t.deliverables || null,
      drive: folderId
        ? { id: folderId, ok: roots[folderId] ? roots[folderId].ok !== false : null, error: roots[folderId]?.error || null, shared: 0 }
        : null,
    };
  });

  // How many tasks point at the same folder.
  const byFolder = new Map();
  for (const t of outTasks) if (t.drive) byFolder.set(t.drive.id, [...(byFolder.get(t.drive.id) || []), t]);
  for (const [, list] of byFolder) for (const t of list) t.drive.shared = list.length;

  // Every file can be reached from several roots (nested deliverables folders).
  // The most specific root wins: the one with the shortest relative path.
  const candidates = new Map(); // fileId → {file, rootId, depth}
  for (const [rootId, root] of Object.entries(roots)) {
    if (!root || root.ok === false) continue;
    for (const f of root.files || []) {
      if (!videoExt.test(f.name) && !String(f.mimeType || '').startsWith('video/')) continue;
      const parts = String(f.path || '').split('/').filter(Boolean);
      if (parts.some((p) => skipFolder.test(p))) continue;
      const depth = parts.length;
      const prev = candidates.get(f.id);
      if (!prev || depth < prev.depth) candidates.set(f.id, { file: f, rootId, depth });
    }
  }

  // A link to a whole project folder (straight under the Share root), or to a folder that holds other
  // tasks' folders, is too broad: it would credit the task with everything the project ever produced.
  // For such links only files that appeared while the task was open count.
  const broad = new Set();
  for (const [rootId, root] of Object.entries(roots)) {
    if (!root?.ok) continue;
    if (root.project || (root.parents || []).includes(config.drive.rootId) || (root.contains || []).length) broad.add(rootId);
  }

  const videos = [];
  const outOfWindow = { before: 0, after: 0 };
  const earliestSlack = (config.drive.earliestBeforeTaskDays ?? 14) * DAY;
  const afterSlack = (config.drive.broadWindowAfterDays ?? 3) * DAY;
  const now = Date.now();
  for (const { file, rootId } of candidates.values()) {
    const owners = byFolder.get(rootId) || [];
    if (!owners.length) continue;
    const created = Date.parse(file.createdTime);
    // Several tasks share a folder: take the latest task created before the file.
    const sorted = [...owners].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    let task = sorted.filter((t) => Date.parse(t.createdAt) - earliestSlack <= created).pop();
    if (!task) { outOfWindow.before++; continue; } // file predates every task that links this folder
    if (broad.has(rootId)) {
      const open = config.statuses.current.includes(task.status);
      const end = open ? now : Date.parse(task.editedAt) + afterSlack;
      if (created > end) { outOfWindow.after++; continue; }
    }
    const people = task.assignees.length ? task.assignees : [personFromFile(file, config)].filter(Boolean);
    videos.push({
      id: file.id,
      t: task.id,
      n: file.name,
      k: creativeKey(file.path, file.name),
      at: file.createdTime,
      p: file.path || '',
      r: resolutionOf(file),
      s: file.size ? Number(file.size) : null,
      d: file.durationMs ? Math.round(file.durationMs / 1000) : null,
      by: people,
      own: file.ownerEmail || null,
    });
  }
  videos.sort((a, b) => (a.at < b.at ? 1 : -1));

  // Per-task Drive summary.
  const vByTask = new Map();
  for (const v of videos) vByTask.set(v.t, [...(vByTask.get(v.t) || []), v]);
  for (const t of outTasks) {
    const list = vByTask.get(t.id) || [];
    if (t.drive) {
      t.drive.files = list.length;
      t.drive.videos = new Set(list.map((v) => v.k)).size;
      t.drive.firstAt = list.length ? list[list.length - 1].at : null;
      t.drive.lastAt = list.length ? list[0].at : null;
      t.drive.broad = broad.has(t.drive.id);
    }
  }

  const people = [...new Set(outTasks.flatMap((t) => t.assignees).concat(videos.flatMap((v) => v.by)))].sort();
  const checks = {
    tasks: outTasks.length,
    withDriveLink: outTasks.filter((t) => t.drive).length,
    driveFolders: byFolder.size,
    driveRootsRead: Object.values(roots).filter((r) => r && r.ok !== false).length,
    driveRootsFailed: Object.values(roots).filter((r) => r && r.ok === false).length,
    videosFound: videos.length,
    tasksWithVideos: vByTask.size,
    sharedFolders: [...byFolder.values()].filter((l) => l.length > 1).length,
    broadFolders: broad.size,
    filesBeforeTask: outOfWindow.before,
    filesAfterTaskInBroadFolders: outOfWindow.after,
  };

  return {
    generatedAt: meta.generatedAt || new Date().toISOString(),
    sources: { notion: meta.notionSource, drive: meta.driveSource, notionExportedAt: meta.notionExportedAt || null },
    config: {
      title: config.title,
      notionUrl: config.notion.url,
      driveRootUrl: config.drive.rootUrl,
      statuses: config.statuses,
      directions: config.directions.map((d) => ({ id: d.id, label: d.label })),
      github: config.github,
    },
    people,
    checks,
    tasks: outTasks,
    videos,
  };
}
