#!/usr/bin/env node
// Sync: Notion tasks + Drive videos → data/data.json
//
//   NOTION_TOKEN      Notion internal integration token (database shared with it).
//                     Without it the last snapshot in snapshots/notion-tasks.json is used.
//   DRIVE_PROXY_URL   Apps Script web app URL (apps-script/Code.gs).
//                     Without it the last Drive listing in snapshots/drive-roots.json is used.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNotionTasks } from './notion.mjs';
import { fetchDriveRoots } from './drive.mjs';
import { buildData, driveIdFromUrl } from './build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(ROOT, ...p);
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const writeJson = async (p, v, pretty = false) => {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(v, null, pretty ? 2 : 0) + '\n');
};

const config = await readJson(path('config.json'));
const { NOTION_TOKEN, DRIVE_PROXY_URL } = process.env;

// 1. Tasks
let tasks, notionSource, notionExportedAt;
if (NOTION_TOKEN) {
  console.log('notion: API');
  tasks = await fetchNotionTasks({ token: NOTION_TOKEN, databaseId: config.notion.databaseId, properties: config.notion.properties });
  notionSource = 'api';
  notionExportedAt = new Date().toISOString();
  await writeJson(path('snapshots/notion-tasks.json'), { exportedAt: notionExportedAt, source: 'notion-api', database: config.notion.databaseId, tasks });
} else {
  const snap = await readJson(path('snapshots/notion-tasks.json'));
  console.log(`notion: snapshot from ${snap.exportedAt} (set NOTION_TOKEN for live data)`);
  tasks = snap.tasks;
  notionSource = 'snapshot';
  notionExportedAt = snap.exportedAt;
}
console.log(`  tasks: ${tasks.length}`);

// 2. Drive
const ids = [...new Set(tasks.map((t) => driveIdFromUrl(t.deliverables)).filter(Boolean))];
let drive = null, driveSource = 'none';
if (DRIVE_PROXY_URL) {
  console.log(`drive: Apps Script, ${ids.length} folders`);
  drive = await fetchDriveRoots({ proxyUrl: DRIVE_PROXY_URL, ids });
  drive.fetchedAt = new Date().toISOString();
  driveSource = 'live';
  await writeJson(path('snapshots/drive-roots.json'), drive);
} else if (existsSync(path('snapshots/drive-roots.json'))) {
  drive = await readJson(path('snapshots/drive-roots.json'));
  driveSource = 'snapshot';
  const missing = ids.filter((id) => !drive.roots[id]).length;
  console.log(`drive: snapshot from ${drive.fetchedAt}, ${missing} new folders not read (set DRIVE_PROXY_URL)`);
} else {
  console.log('drive: no DRIVE_PROXY_URL and no snapshot — videos will be empty');
}

// 3. Build
const data = buildData({ tasks, drive, config, meta: { notionSource, driveSource, notionExportedAt, generatedAt: new Date().toISOString() } });
if (drive?.fetchedAt) data.sources.driveFetchedAt = drive.fetchedAt;
await writeJson(path('data/data.json'), data);
console.log('checks', data.checks);

// Guard: a run that finds no videos while Drive was read is a broken run, not an empty month.
if (driveSource !== 'none' && data.checks.driveRootsRead > 0 && data.checks.videosFound === 0) {
  console.error('No videos found in any readable folder — refusing to publish an empty dashboard.');
  process.exit(1);
}
