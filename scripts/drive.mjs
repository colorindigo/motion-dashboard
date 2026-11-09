// Drive: walks the deliverables folders through the Apps Script proxy (apps-script/Code.gs).
// The proxy only runs read requests with the deploying user's access; the walk itself lives here,
// so it can be changed without redeploying the script.
//
//   node scripts/drive.mjs --probe <folderId>   prints the raw answers for one folder (needs DRIVE_PROXY_URL)

const META = 'id,name,mimeType,createdTime,modifiedTime,size,owners(emailAddress),lastModifyingUser(emailAddress),videoMediaMetadata(width,height,durationMillis)';
const LIST = `nextPageToken,files(${META})`;
const ROOT_META = `${META},parents`;
const FOLDER = 'application/vnd.google-apps.folder';
const MAX_DEPTH = 8;
const PER_POST = 100;
const PARALLEL_POSTS = 2;

const metaPath = (id) => `files/${id}?supportsAllDrives=true&fields=${encodeURIComponent(ROOT_META)}`;
const listPath = (id, pageToken) =>
  `files?q=${encodeURIComponent(`('${id}' in parents) and trashed = false`)}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` +
  `&fields=${encodeURIComponent(LIST)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;

async function post(proxyUrl, body) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(proxyUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
      const text = await res.text();
      if (!res.ok) throw new Error(`proxy HTTP ${res.status}: ${text.slice(0, 160)}`);
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(`proxy returned non-JSON (is access set to "Anyone"?): ${text.slice(0, 160)}`); }
      if (json.error) throw new Error(`proxy: ${json.error}`);
      if (body.requests && !Array.isArray(json.responses)) throw new Error(`proxy answered without results (older Code.gs version, or a hiccup): ${text.slice(0, 120)}`);
      return json;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError;
}

// Runs many Drive requests: chunks of PER_POST per proxy call, a few calls at a time.
async function run(proxyUrl, paths) {
  const out = new Array(paths.length);
  const chunks = [];
  for (let i = 0; i < paths.length; i += PER_POST) chunks.push(i);
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const start = chunks[next++];
      const slice = paths.slice(start, start + PER_POST);
      const { responses } = await post(proxyUrl, { requests: slice.map((path) => ({ path })) });
      responses.forEach((r, j) => (out[start + j] = r));
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_POSTS, chunks.length) }, worker));
  return out;
}

const parse = (r) => {
  try { return JSON.parse(r.body); } catch { return null; }
};
const errorOf = (r) => {
  const j = parse(r);
  return `HTTP ${r.code}${j?.error?.message ? `: ${j.error.message}` : ''}`;
};

function normalize(f, path) {
  const v = f.videoMediaMetadata || {};
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    path,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
    size: f.size || null,
    ownerEmail: f.owners?.[0]?.emailAddress || null,
    modifierEmail: f.lastModifyingUser?.emailAddress || null,
    width: v.width || null,
    height: v.height || null,
    durationMs: v.durationMillis ? Number(v.durationMillis) : null,
  };
}

// Lists the children of many folders, following pagination. Returns Map(folderId → children[] | {error}).
async function listChildren(proxyUrl, folderIds) {
  const result = new Map(folderIds.map((id) => [id, []]));
  let pending = folderIds.map((id) => ({ id, token: null }));
  while (pending.length) {
    const answers = await run(proxyUrl, pending.map((p) => listPath(p.id, p.token)));
    const again = [];
    answers.forEach((r, i) => {
      const { id } = pending[i];
      if (r.code !== 200) { result.set(id, { error: errorOf(r) }); return; }
      const page = parse(r) || {};
      const list = result.get(id);
      if (Array.isArray(list)) list.push(...(page.files || []));
      if (page.nextPageToken) again.push({ id, token: page.nextPageToken });
    });
    pending = again;
  }
  return result;
}

export async function fetchDriveRoots({ proxyUrl, ids, projectRootId = null, log = (m) => process.stdout.write(m + '\n') }) {
  const roots = {};
  const rootSet = new Set(ids);
  // Folders straight under the shared root are whole projects, not task folders.
  const projects = new Set();
  if (projectRootId) {
    const top = (await listChildren(proxyUrl, [projectRootId])).get(projectRootId);
    if (Array.isArray(top)) top.filter((f) => f.mimeType === FOLDER).forEach((f) => projects.add(f.id));
    log(`  drive: ${projects.size} project folders under the shared root`);
  }
  const metas = await run(proxyUrl, ids.map(metaPath));
  const tags = new Map(); // folderId → [{root, path}]
  ids.forEach((id, i) => {
    const r = metas[i];
    if (r.code !== 200) { roots[id] = { ok: false, error: errorOf(r), files: [] }; return; }
    const m = parse(r);
    roots[id] = { ok: true, name: m.name, mimeType: m.mimeType, parents: m.parents || [], project: projects.has(id), contains: [], files: [] };
    if (m.mimeType === FOLDER) tags.set(id, [...(tags.get(id) || []), { root: id, path: '' }]);
    else roots[id].files.push(normalize(m, ''));
  });
  log(`  drive: ${Object.values(roots).filter((r) => r.ok).length}/${ids.length} roots readable`);

  let frontier = [...tags.keys()];
  const seen = new Set(frontier);
  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const children = await listChildren(proxyUrl, frontier);
    const nextTags = new Map();
    let nFiles = 0, nFolders = 0, nErrors = 0;
    for (const [folderId, list] of children) {
      if (!Array.isArray(list)) { nErrors++; continue; }
      const here = tags.get(folderId) || [];
      for (const f of list) {
        if (f.mimeType === FOLDER) {
          nFolders++;
          if (rootSet.has(f.id)) for (const x of here) if (x.root !== f.id && !roots[x.root].contains.includes(f.id)) roots[x.root].contains.push(f.id);
          const t = here.map((x) => ({ root: x.root, path: x.path ? `${x.path}/${f.name}` : f.name }));
          nextTags.set(f.id, [...(nextTags.get(f.id) || []), ...t]);
        } else {
          nFiles++;
          for (const x of here) roots[x.root].files.push(normalize(f, x.path));
        }
      }
    }
    log(`  drive: level ${depth + 1} — ${frontier.length} folders → ${nFiles} files, ${nFolders} subfolders${nErrors ? `, ${nErrors} errors` : ''}`);
    for (const [id, t] of nextTags) tags.set(id, t);
    frontier = [...nextTags.keys()].filter((id) => !seen.has(id));
    frontier.forEach((id) => seen.add(id));
  }
  return { roots, fetchedAt: new Date().toISOString() };
}

// Debug: raw answers for one folder.
if (process.argv[2] === '--probe') {
  const url = process.env.DRIVE_PROXY_URL;
  const id = process.argv[3];
  const [meta, list] = await run(url, [metaPath(id), listPath(id)]);
  console.log('meta', meta.code, meta.body.slice(0, 400));
  console.log('list', list.code, list.body.slice(0, 1200));
  const da = await post(url, { driveapp: id }).catch((e) => ({ error: e.message }));
  console.log('driveapp', JSON.stringify(da).slice(0, 600));
}
