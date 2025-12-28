const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const { execFile } = require('child_process');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');

const express = require('express');

/**
 * Safety: only allow writes within this allowlist relative to site root.
 * This is the central guardrail that prevents the admin tool from touching arbitrary files.
 */
const WRITE_ALLOWLIST = new Set([
  'assets/data/calendar-data.json',
  'calendar.html',
  'calendar-widget-readonly.html',
  'calendar-widget.html',
  'calendar-manager-local.html',
]);

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function normalizePath(p) {
  return path.resolve(String(p || ''));
}

function joinUnderSite(siteDir, rel) {
  const base = normalizePath(siteDir);
  const target = normalizePath(path.join(base, rel));
  if (!target.startsWith(base + path.sep)) {
    throw new Error('Refusing path traversal outside site directory.');
  }
  return target;
}

async function ensureSiteLooksValid(siteDir) {
  const required = [
    'calendar.html',
    'assets/data/calendar-data.json',
  ];
  for (const rel of required) {
    const p = joinUnderSite(siteDir, rel);
    // eslint-disable-next-line no-await-in-loop
    const ok = await fsp
      .stat(p)
      .then((st) => st && st.isFile())
      .catch(() => false);
    if (!ok) {
      throw new Error(`Invalid site folder: missing required file: ${rel}`);
    }
  }
}

async function readJsonFile(absPath) {
  const txt = await fsp.readFile(absPath, 'utf-8');
  return JSON.parse(txt);
}

function validateCalendarData(data) {
  if (!data || typeof data !== 'object') throw new Error('calendar-data.json must be an object.');
  const events = data.events;
  if (!Array.isArray(events)) throw new Error('calendar-data.json must contain an "events" array.');
  const allowedStatus = new Set(['available', 'unavailable', 'closed']);
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') throw new Error('Each event must be an object.');
    if (typeof ev.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) {
      throw new Error(`Invalid event.date: ${String(ev.date)}`);
    }
    if (typeof ev.status !== 'string' || !allowedStatus.has(ev.status)) {
      throw new Error(`Invalid event.status for ${ev.date}: ${String(ev.status)}`);
    }
    if (typeof ev.description !== 'string') {
      throw new Error(`Invalid event.description for ${ev.date}: must be a string (can be empty).`);
    }
  }
}

async function atomicWriteWithBackup({ absTargetPath, contentsUtf8, backupDir }) {
  // Backup original (outside repo)
  await fsp.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    path.basename(absTargetPath) + '.bak-' + nowStamp()
  );
  await fsp.copyFile(absTargetPath, backupPath);

  // Atomic write: tmp -> rename
  const tmpPath = absTargetPath + '.tmp-' + process.pid + '-' + Date.now();
  await fsp.writeFile(tmpPath, contentsUtf8, 'utf-8');
  await fsp.rename(tmpPath, absTargetPath);

  return { backupPath };
}

function execGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(stderr || err.message || 'git command failed');
        e.code = err.code;
        e.stdout = stdout;
        e.stderr = stderr;
        reject(e);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function getRepoRoot(siteDir) {
  const { stdout } = await execGit(['rev-parse', '--show-toplevel'], siteDir);
  return stdout.trim();
}

function computeNextCacheVersion(currentV) {
  const todayUtc = new Date();
  const y = todayUtc.getUTCFullYear();
  const m = String(todayUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(todayUtc.getUTCDate()).padStart(2, '0');
  const today = `${y}${m}${d}`;

  let nextSuffix = 1;
  const match = typeof currentV === 'string' ? currentV.match(/^(\d{8})-(\d+)$/) : null;
  if (match) {
    const curDay = match[1];
    const curN = Number(match[2] || '0');
    if (curDay === today && Number.isFinite(curN)) nextSuffix = curN + 1;
  }
  return `${today}-${nextSuffix}`;
}

async function bumpCalendarVersion(siteDir) {
  // Read current version from site/calendar.html
  const calHtml = await fsp.readFile(joinUnderSite(siteDir, 'calendar.html'), 'utf-8');
  const m = calHtml.match(/\?v=([0-9]{8}-[0-9]+)/);
  const cur = m ? m[1] : '';
  const nextV = computeNextCacheVersion(cur);
  const re = /\?v=([0-9]{8}-[0-9]+)/g;

  const targets = [
    'calendar.html',
    'calendar-widget-readonly.html',
    'calendar-widget.html',
    'calendar-manager-local.html',
  ];

  const updated = [];
  for (const rel of targets) {
    const abs = joinUnderSite(siteDir, rel);
    // eslint-disable-next-line no-await-in-loop
    const exists = await fsp.stat(abs).then(() => true).catch(() => false);
    if (!exists) continue;
    // eslint-disable-next-line no-await-in-loop
    const txt = await fsp.readFile(abs, 'utf-8');
    const nextTxt = txt.replace(re, `?v=${nextV}`);
    if (nextTxt !== txt) {
      // eslint-disable-next-line no-await-in-loop
      await fsp.writeFile(abs, nextTxt, 'utf-8');
      updated.push(rel);
    }
  }

  return { ok: true, version: nextV, updatedFiles: updated };
}

async function runPreflight(siteDir) {
  // A minimal, cross-platform equivalent of essential `check.sh` checks.
  // (CI is the second gate; this is for collaborator-friendly local errors.)
  const errors = [];

  // 1) Missing assets referenced by HTML
  const htmlFiles = (await fsp.readdir(siteDir))
    .filter((n) => n.endsWith('.html'))
    .map((n) => path.join(siteDir, n));
  const assetRe = /(?:src|href)=["'](assets\/[^"'#?]+)["']/g;
  for (const absHtml of htmlFiles) {
    // eslint-disable-next-line no-await-in-loop
    const txt = await fsp.readFile(absHtml, 'utf-8').catch(() => '');
    let m;
    while ((m = assetRe.exec(txt))) {
      const relAsset = m[1];
      const absAsset = joinUnderSite(siteDir, relAsset);
      // eslint-disable-next-line no-await-in-loop
      const ok = await fsp.stat(absAsset).then(() => true).catch(() => false);
      if (!ok) {
        errors.push(`Missing asset: ${path.basename(absHtml)} → ${relAsset}`);
      }
    }
  }

  // 2) Script presence/order (calendar widget pages)
  const readHtml = async (name) => {
    const abs = joinUnderSite(siteDir, name);
    return fsp.readFile(abs, 'utf-8');
  };
  const scriptSrcRe = /<script[^>]+src=["']([^"']+)["']/gi;
  const extractSrcs = (html) => {
    const out = [];
    let m;
    while ((m = scriptSrcRe.exec(html))) {
      const src = String(m[1] || '').split('?', 1)[0].split('#', 1)[0];
      out.push(src);
    }
    return out;
  };

  try {
    const readonlyHtml = await readHtml('calendar-widget-readonly.html');
    const srcs = extractSrcs(readonlyHtml);
    const required = ['assets/js/i18n.js', 'assets/js/calendar-shared.js', 'assets/js/calendar-widget-readonly.js'];
    for (const r of required) if (!srcs.includes(r)) errors.push(`calendar-widget-readonly.html missing ${r}`);
    if (srcs.includes('assets/js/calendar-shared.js') && srcs.includes('assets/js/calendar-widget-readonly.js')) {
      if (srcs.indexOf('assets/js/calendar-shared.js') > srcs.indexOf('assets/js/calendar-widget-readonly.js')) {
        errors.push('calendar-widget-readonly.html: calendar-shared.js must be before calendar-widget-readonly.js');
      }
    }
  } catch (e) {
    errors.push('calendar-widget-readonly.html is missing or unreadable.');
  }

  // 3) No polling loops in site/assets/js
  try {
    const jsDir = joinUnderSite(siteDir, 'assets/js');
    const jsFiles = await fsp.readdir(jsDir);
    for (const f of jsFiles) {
      if (!f.endsWith('.js')) continue;
      // eslint-disable-next-line no-await-in-loop
      const txt = await fsp.readFile(path.join(jsDir, f), 'utf-8').catch(() => '');
      if (txt.includes('setInterval(')) {
        errors.push(`Found setInterval( in assets/js/${f} (not allowed)`);
      }
    }
  } catch (e) {
    // ignore
  }

  // 4) Cache version consistency (calendar pages)
  try {
    const targets = ['calendar.html', 'calendar-widget-readonly.html', 'calendar-widget.html', 'calendar-manager-local.html'];
    const versions = new Set();
    for (const t of targets) {
      // eslint-disable-next-line no-await-in-loop
      const abs = joinUnderSite(siteDir, t);
      // eslint-disable-next-line no-await-in-loop
      const exists = await fsp.stat(abs).then(() => true).catch(() => false);
      if (!exists) continue;
      // eslint-disable-next-line no-await-in-loop
      const txt = await fsp.readFile(abs, 'utf-8');
      const m = txt.match(/\?v=([0-9]{8}-[0-9]+)/);
      if (m && m[1]) versions.add(m[1]);
    }
    if (versions.size > 1) {
      errors.push(`Calendar cache version mismatch: ${Array.from(versions).join(', ')}`);
    }
  } catch (e) {
    // ignore
  }

  return { ok: errors.length === 0, errors };
}

let __siteDir = '';
let __server = null;
let __serverPort = 0;

async function tryAutoDetectSiteDir() {
  const candidates = [
    path.resolve(process.cwd(), 'site'),
    path.resolve(process.cwd(), '..', 'site'),
    path.resolve(app.getAppPath(), '..', 'site'),
    path.resolve(app.getPath('exe'), '..', 'site'),
  ];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await fsp.stat(c).then((st) => st && st.isDirectory()).catch(() => false);
    if (!ok) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await ensureSiteLooksValid(c);
      return c;
    } catch (e) {
      // not valid
    }
  }
  return '';
}

async function pickSiteDirInteractive() {
  const res = await dialog.showOpenDialog({
    title: 'Select site folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return '';
  const picked = res.filePaths[0];
  await ensureSiteLooksValid(picked);
  return picked;
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

async function loadConfig() {
  try {
    const txt = await fsp.readFile(getConfigPath(), 'utf-8');
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

async function saveConfig(cfg) {
  await fsp.mkdir(app.getPath('userData'), { recursive: true });
  await fsp.writeFile(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

async function ensureSiteDir() {
  if (__siteDir) return __siteDir;

  const cfg = await loadConfig();
  if (cfg && typeof cfg.siteDir === 'string' && cfg.siteDir) {
    try {
      await ensureSiteLooksValid(cfg.siteDir);
      __siteDir = cfg.siteDir;
      return __siteDir;
    } catch (e) {
      // ignore and re-pick
    }
  }

  const detected = await tryAutoDetectSiteDir();
  if (detected) {
    __siteDir = detected;
    await saveConfig({ ...(cfg || {}), siteDir: __siteDir });
    return __siteDir;
  }

  const picked = await pickSiteDirInteractive();
  if (!picked) throw new Error('No site folder selected.');
  __siteDir = picked;
  await saveConfig({ ...(cfg || {}), siteDir: __siteDir });
  return __siteDir;
}

async function startServer() {
  if (__server) return { port: __serverPort };

  const siteDir = await ensureSiteDir();

  const web = express();

  // No caching in admin context (prevents stale previews)
  web.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  const rendererDir = path.join(__dirname, '..', 'ui');
  web.use('/admin', express.static(rendererDir));
  web.use('/site', express.static(siteDir));

  web.get('/', (req, res) => res.redirect('/admin/index.html'));

  __server = http.createServer(web);
  await new Promise((resolve) => {
    __server.listen(0, '127.0.0.1', () => resolve());
  });
  __serverPort = __server.address().port;
  return { port: __serverPort };
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadURL(`http://127.0.0.1:${port}/admin/index.html`);
  return win;
}

// IPC handlers (renderer -> main)
ipcMain.handle('site:getInfo', async () => {
  const siteDir = await ensureSiteDir();
  let repoRoot = '';
  try {
    repoRoot = await getRepoRoot(siteDir);
  } catch (e) {
    repoRoot = '';
  }
  return { siteDir, repoRoot };
});

ipcMain.handle('site:pickDir', async () => {
  const picked = await pickSiteDirInteractive();
  if (!picked) return { ok: false, canceled: true };
  __siteDir = picked;
  const cfg = await loadConfig();
  await saveConfig({ ...(cfg || {}), siteDir: __siteDir });
  return { ok: true, siteDir: __siteDir };
});

ipcMain.handle('calendar:read', async () => {
  const siteDir = await ensureSiteDir();
  const abs = joinUnderSite(siteDir, 'assets/data/calendar-data.json');
  const data = await readJsonFile(abs);
  validateCalendarData(data);
  return { ok: true, data };
});

ipcMain.handle('calendar:upsertEvent', async (_evt, payload) => {
  const siteDir = await ensureSiteDir();
  await ensureSiteLooksValid(siteDir);

  const date = payload && payload.date;
  const status = payload && payload.status;
  const description = payload && payload.description;
  if (typeof date !== 'string') throw new Error('Missing date');
  if (typeof status !== 'string') throw new Error('Missing status');
  if (typeof description !== 'string') throw new Error('Missing description');

  const relData = 'assets/data/calendar-data.json';
  if (!WRITE_ALLOWLIST.has(relData)) throw new Error('Write target not allowlisted.');

  const absData = joinUnderSite(siteDir, relData);
  const data = await readJsonFile(absData);
  validateCalendarData(data);

  // Replace or insert
  const events = Array.isArray(data.events) ? data.events.slice() : [];
  const idx = events.findIndex((e) => e && e.date === date);
  const nextEvent = { date, status, description };
  if (idx >= 0) events[idx] = nextEvent;
  else events.push(nextEvent);
  events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const nextData = { ...data, events };
  validateCalendarData(nextData);

  const backupDir = path.join(app.getPath('userData'), 'backups');
  const { backupPath } = await atomicWriteWithBackup({
    absTargetPath: absData,
    contentsUtf8: JSON.stringify(nextData, null, 2) + '\n',
    backupDir,
  });

  return { ok: true, backupPath };
});

ipcMain.handle('calendar:deleteEvent', async (_evt, payload) => {
  const siteDir = await ensureSiteDir();
  await ensureSiteLooksValid(siteDir);

  const date = payload && payload.date;
  if (typeof date !== 'string') throw new Error('Missing date');

  const relData = 'assets/data/calendar-data.json';
  if (!WRITE_ALLOWLIST.has(relData)) throw new Error('Write target not allowlisted.');

  const absData = joinUnderSite(siteDir, relData);
  const data = await readJsonFile(absData);
  validateCalendarData(data);

  const events = Array.isArray(data.events) ? data.events.slice() : [];
  const nextEvents = events.filter((e) => !(e && e.date === date));
  const nextData = { ...data, events: nextEvents };
  validateCalendarData(nextData);

  const backupDir = path.join(app.getPath('userData'), 'backups');
  const { backupPath } = await atomicWriteWithBackup({
    absTargetPath: absData,
    contentsUtf8: JSON.stringify(nextData, null, 2) + '\n',
    backupDir,
  });

  return { ok: true, backupPath };
});

ipcMain.handle('calendar:bumpVersion', async () => {
  const siteDir = await ensureSiteDir();
  // Enforce allowlist by checking targets are allowlisted
  for (const rel of ['calendar.html', 'calendar-widget-readonly.html', 'calendar-widget.html', 'calendar-manager-local.html']) {
    if (!WRITE_ALLOWLIST.has(rel)) throw new Error('Write target not allowlisted: ' + rel);
  }
  const result = await bumpCalendarVersion(siteDir);
  return result;
});

ipcMain.handle('publish:preflight', async () => {
  const siteDir = await ensureSiteDir();
  await ensureSiteLooksValid(siteDir);
  return runPreflight(siteDir);
});

ipcMain.handle('publish:run', async (_evt, payload) => {
  const siteDir = await ensureSiteDir();
  await ensureSiteLooksValid(siteDir);

  // Gate 1: local preflight
  const pre = await runPreflight(siteDir);
  if (!pre.ok) return { ok: false, phase: 'preflight', errors: pre.errors };

  let repoRoot = '';
  try {
    repoRoot = await getRepoRoot(siteDir);
  } catch (e) {
    return { ok: false, phase: 'git', message: 'This site folder is not inside a git repository.' };
  }

  // Stage only site/ (safety: do not commit admin/ by accident)
  const relSite = path.relative(repoRoot, siteDir) || 'site';
  try {
    await execGit(['add', relSite], repoRoot);
    const diff = await execGit(['diff', '--cached', '--name-only'], repoRoot);
    const changed = (diff.stdout || '').trim().split('\n').filter(Boolean);
    if (changed.length === 0) {
      return { ok: false, phase: 'git', message: 'No changes to publish.' };
    }

    const msg = (payload && payload.message && String(payload.message).trim())
      ? String(payload.message).trim()
      : 'Update calendar data';

    await execGit(['commit', '-m', msg], repoRoot);
    await execGit(['push', 'origin', 'main'], repoRoot);
    return { ok: true, phase: 'done' };
  } catch (e) {
    const stderr = e && e.stderr ? String(e.stderr) : '';
    const message = stderr || (e && e.message) || 'Publish failed';
    // Friendly hint for auth issues
    const authHint = /auth|authentication|permission|denied|publickey/i.test(message)
      ? 'Git push requires login/credentials. Please set up git authentication (SSH key or HTTPS credential) and try again.'
      : '';
    return { ok: false, phase: 'git', message, authHint };
  }
});

app.whenReady().then(async () => {
  try {
    const { port } = await startServer();
    createWindow(port);
  } catch (e) {
    dialog.showErrorBox('Lovely Admin failed to start', e && e.message ? e.message : String(e));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


