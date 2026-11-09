/**
 * Motion Dashboard · Drive proxy
 *
 * A thin, read-only proxy to the Drive API with the access of the Google account that deployed it.
 * All crawling logic lives in scripts/drive.mjs; this script only runs the allowed requests in parallel.
 *
 * Allowed requests (anything else is refused):
 *   files/<id>?...                                    metadata of one file or folder
 *   files?q=('<id>' in parents) and trashed = false   children of folders, by id
 *
 * POST {"requests": [{"path": "files/<id>?fields=..."}, ...]}  →  {"responses": [{"code": 200, "body": "..."}]}
 * POST {"driveapp": "<folderId>"}                                →  children via DriveApp (fallback)
 * GET  ?diag=1                                                    →  granted scopes and one test call
 * GET                                                             →  {"ok": true, "user": "..."}
 */

var API = 'https://www.googleapis.com/drive/v3/';
var PARENTS_Q = /^\('[\w-]+' in parents( or '[\w-]+' in parents)*\)( and trashed = false)?$/;

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.diag) return json_(diag_());
  return json_({ ok: true, user: Session.getEffectiveUser().getEmail() });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.requests) return json_({ responses: proxy_(body.requests) });
    if (body.driveapp) return json_(driveAppChildren_(body.driveapp));
    return json_({ error: 'nothing to do' });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function params_(query) {
  var out = {};
  String(query || '').split('&').forEach(function (kv) {
    if (!kv) return;
    var i = kv.indexOf('=');
    var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
    out[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
  });
  return out;
}

function allowed_(path) {
  var m = String(path).match(/^files(\/[\w-]+)?\?(.*)$/);
  if (!m) return false;
  var q = params_(m[2]).q;
  if (m[1]) return !q;
  return !!q && PARENTS_Q.test(q);
}

function proxy_(requests) {
  var token = ScriptApp.getOAuthToken();
  var out = new Array(requests.length);
  var batch = [], index = [];
  requests.forEach(function (r, i) {
    if (!allowed_(r.path)) { out[i] = { code: 400, body: 'refused by proxy' }; return; }
    batch.push({ url: API + r.path, headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    index.push(i);
  });
  for (var s = 0; s < batch.length; s += 40) {
    var res = UrlFetchApp.fetchAll(batch.slice(s, s + 40));
    res.forEach(function (r, j) { out[index[s + j]] = { code: r.getResponseCode(), body: r.getContentText() }; });
  }
  return out;
}

/** Fallback for a folder the REST listing cannot see: list it with DriveApp. */
function driveAppChildren_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var files = [], folders = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var owner = null;
    try { owner = f.getOwner() && f.getOwner().getEmail(); } catch (err) { owner = null; }
    files.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType(), createdTime: f.getDateCreated().toISOString(),
      modifiedTime: f.getLastUpdated().toISOString(), size: String(f.getSize() || ''), owners: owner ? [{ emailAddress: owner }] : [] });
  }
  var sub = folder.getFolders();
  while (sub.hasNext()) {
    var d = sub.next();
    folders.push({ id: d.getId(), name: d.getName(), mimeType: 'application/vnd.google-apps.folder' });
  }
  return { name: folder.getName(), files: files.concat(folders) };
}

/** What the script is allowed to do: granted scopes and one real Drive call. */
function diag_() {
  var token = ScriptApp.getOAuthToken();
  var info = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + token, { muteHttpExceptions: true });
  var probe = UrlFetchApp.fetch(API + 'files?pageSize=1&fields=files(id,name)', { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  return {
    user: Session.getEffectiveUser().getEmail(),
    scopes: (JSON.parse(info.getContentText()).scope || '').split(' '),
    driveProbe: { code: probe.getResponseCode(), body: probe.getContentText().slice(0, 300) }
  };
}

/**
 * Never called. If the appsscript.json manifest was not saved, Apps Script picks scopes from the code,
 * and this reference makes it ask for Drive access.
 */
function driveScopeHint_() {
  return DriveApp.getRootFolder().getName();
}

/** Run once from the editor: lists the folder of Notion task «The REAL reason» (3 videos). */
function test() {
  var id = '1F3XNDEk2ZFJrMWNl_9t8xpsB97d755OY';
  var r = proxy_([{ path: 'files?q=' + encodeURIComponent("('" + id + "' in parents) and trashed = false") +
    '&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,parents)' }])[0];
  Logger.log('REST %s: %s', r.code, r.body.slice(0, 300));
  Logger.log('DriveApp: %s files', driveAppChildren_(id).files.length);
}
