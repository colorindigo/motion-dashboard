/**
 * Motion Dashboard · Drive proxy
 *
 * Walks the deliverables folders listed in Notion and returns every file inside them,
 * with the access of the Google account that deployed this script.
 * Read-only: the manifest asks for drive.readonly only.
 *
 * POST {"ids": ["folderId", ...]}  →  {"roots": {folderId: {ok, name, files: [...]}}}
 * GET  ?ids=a,b                      →  the same, for a quick check in the browser
 * GET  (no params)                   →  {"ok": true, "user": "..."}
 */

var FOLDER = 'application/vnd.google-apps.folder';
var API = 'https://www.googleapis.com/drive/v3/files';
var FIELDS = 'nextPageToken,files(id,name,mimeType,parents,createdTime,modifiedTime,size,' +
  'owners(emailAddress),lastModifyingUser(emailAddress),videoMediaMetadata(width,height,durationMillis))';
var PARENTS_PER_QUERY = 30;
var MAX_DEPTH = 8;

function doGet(e) {
  var ids = String((e && e.parameter && e.parameter.ids) || '').split(',').filter(String);
  if (!ids.length) return json_({ ok: true, user: Session.getEffectiveUser().getEmail() });
  return json_(crawl_(ids));
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_(crawl_(body.ids || []));
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function headers_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

function crawl_(rootIds) {
  var roots = {};
  var frontier = {}; // folderId → [{root, path}]

  // Root metadata, in parallel.
  var metaReqs = rootIds.map(function (id) {
    return { url: API + '/' + encodeURIComponent(id) + '?supportsAllDrives=true&fields=' +
      encodeURIComponent('id,name,mimeType,createdTime,size,owners(emailAddress),lastModifyingUser(emailAddress),videoMediaMetadata(width,height,durationMillis)'),
      headers: headers_(), muteHttpExceptions: true };
  });
  var metaRes = fetchAllChunked_(metaReqs);
  rootIds.forEach(function (id, i) {
    var res = metaRes[i];
    if (res.getResponseCode() !== 200) {
      roots[id] = { ok: false, error: 'HTTP ' + res.getResponseCode(), files: [] };
      return;
    }
    var m = JSON.parse(res.getContentText());
    roots[id] = { ok: true, name: m.name, mimeType: m.mimeType, files: [] };
    if (m.mimeType === FOLDER) frontier[id] = [{ root: id, path: '' }];
    else roots[id].files.push(file_(m, ''));
  });

  // Breadth-first walk, many parents per query, all queries of a level in parallel.
  for (var depth = 0; depth < MAX_DEPTH && Object.keys(frontier).length; depth++) {
    var parents = Object.keys(frontier);
    var children = listChildren_(parents);
    var next = {};
    children.forEach(function (f) {
      var tags = [];
      (f.parents || []).forEach(function (p) { if (frontier[p]) tags = tags.concat(frontier[p]); });
      if (f.mimeType === FOLDER) {
        if (!next[f.id]) next[f.id] = [];
        tags.forEach(function (t) { next[f.id].push({ root: t.root, path: t.path ? t.path + '/' + f.name : f.name }); });
      } else {
        tags.forEach(function (t) { roots[t.root].files.push(file_(f, t.path)); });
      }
    });
    frontier = next;
  }
  return { roots: roots, fetchedAt: new Date().toISOString() };
}

function file_(f, path) {
  var v = f.videoMediaMetadata || {};
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    path: path,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
    size: f.size || null,
    ownerEmail: (f.owners && f.owners[0] && f.owners[0].emailAddress) || null,
    modifierEmail: (f.lastModifyingUser && f.lastModifyingUser.emailAddress) || null,
    width: v.width || null,
    height: v.height || null,
    durationMs: v.durationMillis ? Number(v.durationMillis) : null
  };
}

function listChildren_(parents) {
  var out = [];
  var queries = [];
  for (var i = 0; i < parents.length; i += PARENTS_PER_QUERY) {
    var q = '(' + parents.slice(i, i + PARENTS_PER_QUERY).map(function (p) { return "'" + p + "' in parents"; }).join(' or ') + ') and trashed = false';
    queries.push({ q: q, pageToken: null });
  }
  while (queries.length) {
    var reqs = queries.map(function (x) {
      return { url: API + '?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=' + encodeURIComponent(FIELDS) +
        '&q=' + encodeURIComponent(x.q) + (x.pageToken ? '&pageToken=' + encodeURIComponent(x.pageToken) : ''),
        headers: headers_(), muteHttpExceptions: true };
    });
    var res = fetchAllChunked_(reqs);
    var again = [];
    res.forEach(function (r, i) {
      if (r.getResponseCode() !== 200) throw new Error('Drive list ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
      var page = JSON.parse(r.getContentText());
      out = out.concat(page.files || []);
      if (page.nextPageToken) again.push({ q: queries[i].q, pageToken: page.nextPageToken });
    });
    queries = again;
  }
  return out;
}

function fetchAllChunked_(reqs) {
  var out = [];
  for (var i = 0; i < reqs.length; i += 40) out = out.concat(UrlFetchApp.fetchAll(reqs.slice(i, i + 40)));
  return out;
}

/** Run once from the editor to grant access and see a sample in the log. */
function test() {
  var id = '1F3XNDEk2ZFJrMWNl_9t8xpsB97d755OY'; // Notion task «The REAL reason», 3 videos
  var root = crawl_([id]).roots[id];
  Logger.log('ok=%s name=%s files=%s', root.ok, root.name, root.files.length);
}
