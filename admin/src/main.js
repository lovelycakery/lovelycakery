const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const { execFile } = require('child_process');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');

const express = require('express');
const sharp = require('sharp');

/**
 * Safety: only allow writes within this allowlist relative to site root.
 * This is the central guardrail that prevents the admin tool from touching arbitrary files.
 */
const WRITE_ALLOWLIST = new Set([
  'assets/data/calendar-data.json',
  'assets/data/seasonal-data.json',
  'assets/data/products-data.json',
  'calendar.html',
  'calendar-widget-readonly.html',
  'calendar-widget.html',
  'calendar-manager-local.html',
  // Image directories (relative paths will be validated)
  'assets/images/seasonal',
  'assets/images/products',
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

  // 5) Image data consistency (seasonal & products)
  for (const type of ['seasonal', 'products']) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const validation = await validateImageDataConsistency(siteDir, type);
      if (!validation.ok && validation.issues && validation.issues.length > 0) {
        for (const issue of validation.issues) {
          // eslint-disable-next-line no-await-in-loop
          errors.push(`${type === 'seasonal' ? '季節限定' : '全部品項'}: ${issue.message}`);
        }
      }
    } catch (e) {
      // If validation function fails, it's not critical - just log
      errors.push(`${type === 'seasonal' ? '季節限定' : '全部品項'} 資料驗證失敗：${e && e.message ? e.message : String(e)}`);
    }
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

  // Safety: do not allow arbitrary folder selection from the UI.
  // The collaborator should keep admin/ and site/ together (siblings), so auto-detection can succeed.
  throw new Error(
    'Cannot find a valid site/ folder.\n\n' +
      'Please place the admin tool next to the site folder:\n' +
      '  <folder>/admin  (this tool)\n' +
      '  <folder>/site   (the website)\n'
  );
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

// Intentionally no UI/IPC to pick arbitrary site dirs.
// Safety rule: the admin tool auto-detects/locks the site folder to prevent editing the wrong project.

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
    // Check for unstaged changes first (better UX: fail fast with clear message)
    const unstaged = await execGit(['diff', '--name-only', relSite], repoRoot).catch(() => ({ stdout: '' }));
    const unstagedFiles = (unstaged.stdout || '').trim().split('\n').filter(Boolean);
    
    // Also check for untracked files in site/
    const untracked = await execGit(['ls-files', '--others', '--exclude-standard', relSite], repoRoot).catch(() => ({ stdout: '' }));
    const untrackedFiles = (untracked.stdout || '').trim().split('\n').filter(Boolean);
    
    if (unstagedFiles.length === 0 && untrackedFiles.length === 0) {
      return {
        ok: false,
        phase: 'git',
        message: '沒有變更需要發布。\n\n請先在管理工具中編輯並「儲存」日曆資料，或直接在 site/ 資料夾中修改檔案後再試。',
      };
    }
    
    await execGit(['add', relSite], repoRoot);
    const diff = await execGit(['diff', '--cached', '--name-only'], repoRoot);
    const changed = (diff.stdout || '').trim().split('\n').filter(Boolean);
    if (changed.length === 0) {
      return {
        ok: false,
        phase: 'git',
        message: '沒有變更需要提交（git add 後沒有 staged changes）。\n\n這可能是因為變更已被其他程序提交，或檔案已被忽略。',
      };
    }

    const msg = (payload && payload.message && String(payload.message).trim())
      ? String(payload.message).trim()
      : 'Update calendar data';

    await execGit(['commit', '-m', msg], repoRoot);
    await execGit(['push', 'origin', 'main'], repoRoot);
    return { ok: true, phase: 'done' };
  } catch (e) {
    const stderr = e && e.stderr ? String(e.stderr) : '';
    const stdout = e && e.stdout ? String(e.stdout) : '';
    const code = e && e.code ? String(e.code) : '';
    const errMsg = e && e.message ? String(e.message) : '';
    
    // Combine all error info for better debugging
    let message = stderr || errMsg || 'Publish failed';
    if (stdout && !message.includes(stdout)) {
      message = `${message}\n\nOutput: ${stdout}`;
    }
    if (code) {
      message = `${message}\n\nExit code: ${code}`;
    }
    
    // Friendly hint for auth issues
    const authHint = /auth|authentication|permission|denied|publickey|host key verification failed/i.test(message)
      ? 'Git push requires login/credentials. Please set up git authentication (SSH key or HTTPS credential) and try again.'
      : '';
    return { ok: false, phase: 'git', message, authHint };
  }
});

// Dialog API (在主進程執行，不會影響渲染進程焦點)
ipcMain.handle('dialog:confirm', async (event, payload) => {
  const { message, detail } = payload || {};
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['取消', '確定'],
    defaultId: 1,
    cancelId: 0,
    message: message || '確認',
    detail: detail || '',
  });
  return { ok: result.response === 1 };
});

ipcMain.handle('dialog:alert', async (event, payload) => {
  const { message, detail } = payload || {};
  const win = BrowserWindow.fromWebContents(event.sender);
  await dialog.showMessageBox(win, {
    type: 'info',
    buttons: ['確定'],
    defaultId: 0,
    message: message || '提示',
    detail: detail || '',
  });
  return { ok: true };
});

// ============================================================================
// Image Management (Seasonal & Products)
// ============================================================================

function sanitizeFilename(name) {
  // Remove or replace invalid filesystem characters
  return String(name || '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function getImageFilename(name) {
  const sanitized = sanitizeFilename(name);
  return sanitized ? `${sanitized}.jpg` : 'untitled.jpg';
}

async function compressImage(inputPath, outputPath) {
  try {
    const metadata = await sharp(inputPath).metadata();
    let pipeline = sharp(inputPath);
    
    // Resize if too large (max 2000px on longest side)
    if (metadata.width > 2000 || metadata.height > 2000) {
      pipeline = pipeline.resize(2000, 2000, { fit: 'inside', withoutEnlargement: true });
    }
    
    // Convert to JPG and compress
    await pipeline
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outputPath);
    
    // Check if compressed size is acceptable (< 500KB)
    const stats = await fsp.stat(outputPath);
    if (stats.size > 500 * 1024) {
      // Recompress with lower quality
      await sharp(inputPath)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75, mozjpeg: true })
        .toFile(outputPath);
    }
    
    return outputPath;
  } catch (err) {
    if (err.code === 'ENOENT' || (err.message && err.message.includes('Input file is missing'))) {
      throw new Error(`Input file is missing: ${path.basename(inputPath)}`);
    }
    throw new Error(`圖片處理失敗：${err.message || String(err)}`);
  }
}

async function readImageData(siteDir, type) {
  const filename = type === 'seasonal' ? 'seasonal-data.json' : 'products-data.json';
  const abs = joinUnderSite(siteDir, `assets/data/${filename}`);
  try {
    const data = await readJsonFile(abs);
    if (!data || typeof data !== 'object') throw new Error('Invalid data structure');
    if (!Array.isArray(data.items)) data.items = [];
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function writeImageData(siteDir, type, data) {
  const filename = type === 'seasonal' ? 'seasonal-data.json' : 'products-data.json';
  const relData = `assets/data/${filename}`;
  if (!WRITE_ALLOWLIST.has(relData)) throw new Error('Write target not allowlisted.');
  
  const abs = joinUnderSite(siteDir, relData);
  const backupDir = path.join(app.getPath('userData'), 'backups');
  
  await atomicWriteWithBackup({
    absTargetPath: abs,
    contentsUtf8: JSON.stringify(data, null, 2) + '\n',
    backupDir,
  });
  
  return { ok: true };
}

function validateImageData(data) {
  if (!data || typeof data !== 'object') throw new Error('Data must be an object');
  if (!Array.isArray(data.items)) throw new Error('Data must contain items array');
  
  const allowedTags = new Set(['無', '奶蛋素', '無咖啡因', '含酒精']);
  
  for (const item of data.items) {
    if (!item || typeof item !== 'object') throw new Error('Each item must be an object');
    if (typeof item.name !== 'string') throw new Error('Item name must be a string');
    if (item.name_en !== undefined && typeof item.name_en !== 'string') {
      throw new Error('Item name_en must be a string');
    }
    if (typeof item.image !== 'string') throw new Error('Item image path must be a string');
    // 支持新的 prices 結構和舊的 price 結構
    if (item.price !== undefined && typeof item.price !== 'string') throw new Error('Item price must be a string');
    if (item.prices !== undefined) {
      if (typeof item.prices !== 'object' || Array.isArray(item.prices)) {
        throw new Error('Item prices must be an object');
      }
      if (item.prices.size6 !== undefined && typeof item.prices.size6 !== 'string') {
        throw new Error('Item prices.size6 must be a string');
      }
      if (item.prices.size8 !== undefined && typeof item.prices.size8 !== 'string') {
        throw new Error('Item prices.size8 must be a string');
      }
      if (item.prices.slice !== undefined && typeof item.prices.slice !== 'string') {
        throw new Error('Item prices.slice must be a string');
      }
    }
    if (item.description !== undefined && typeof item.description !== 'string') throw new Error('Item description must be a string');
    if (item.description_en !== undefined && typeof item.description_en !== 'string') {
      throw new Error('Item description_en must be a string');
    }
    if (!Array.isArray(item.tags)) throw new Error('Item tags must be an array');
    for (const tag of item.tags) {
      if (!allowedTags.has(tag)) throw new Error(`Invalid tag: ${tag}`);
    }
  }
}

async function validateImageDataConsistency(siteDir, type) {
  const issues = [];
  const imageDir = type === 'seasonal' ? 'assets/images/seasonal' : 'assets/images/products';
  const absImageDir = joinUnderSite(siteDir, imageDir);
  
  // Read JSON data
  const jsonRes = await readImageData(siteDir, type);
  if (!jsonRes.ok) {
    issues.push({ type: 'json_read_error', message: `無法讀取 JSON：${jsonRes.error}` });
    return { ok: false, issues };
  }
  
  const data = jsonRes.data;
  const itemsByImage = new Map();
  for (const item of data.items) {
    itemsByImage.set(item.image, item);
  }
  
  // Check: JSON records that don't have corresponding files
  for (const item of data.items) {
    const absImagePath = joinUnderSite(siteDir, item.image);
    const exists = await fsp.stat(absImagePath).then(() => true).catch(() => false);
    if (!exists) {
      issues.push({
        type: 'missing_file',
        message: `JSON 中記錄但檔案不存在：${item.image}（名稱：${item.name}）`,
        item,
      });
    }
    
    // Check: filename matches name
    const expectedFilename = getImageFilename(item.name);
    const actualFilename = path.basename(item.image);
    if (actualFilename !== expectedFilename) {
      issues.push({
        type: 'filename_mismatch',
        message: `檔名不一致：${actualFilename} 應為 ${expectedFilename}（名稱：${item.name}）`,
        item,
        expected: expectedFilename,
        actual: actualFilename,
      });
    }
  }
  
  // Check: Files that aren't in JSON
  try {
    const files = await fsp.readdir(absImageDir);
    for (const file of files) {
      if (!file.endsWith('.jpg')) continue;
      const relPath = `${imageDir}/${file}`;
      if (!itemsByImage.has(relPath)) {
        issues.push({
          type: 'unrecorded_file',
          message: `資料夾中有未記錄的檔案：${file}`,
          file: relPath,
        });
      }
    }
  } catch (e) {
    // Directory might not exist, that's ok
  }
  
  return { ok: issues.length === 0, issues };
}

// IPC handlers for image management
ipcMain.handle('images:read', async (_evt, payload) => {
  const siteDir = await ensureSiteDir();
  const type = payload && payload.type;
  if (type !== 'seasonal' && type !== 'products') throw new Error('Invalid type');
  return await readImageData(siteDir, type);
});

ipcMain.handle('images:validate', async (_evt, payload) => {
  const siteDir = await ensureSiteDir();
  const type = payload && payload.type;
  if (type !== 'seasonal' && type !== 'products') throw new Error('Invalid type');
  return await validateImageDataConsistency(siteDir, type);
});

ipcMain.handle('images:selectFiles', async () => {
  const res = await dialog.showOpenDialog({
    title: '選擇圖片檔案',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
      { name: '所有檔案', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return { ok: false, files: [] };
  }
  return { ok: true, files: res.filePaths };
});

ipcMain.handle('images:upload', async (_evt, payload) => {
  const siteDir = await ensureSiteDir();
  await ensureSiteLooksValid(siteDir);
  
  const type = payload && payload.type;
  const filePath = payload && payload.filePath;
  const name = payload && payload.name;
  
  if (type !== 'seasonal' && type !== 'products') throw new Error('Invalid type');
  if (!filePath || typeof filePath !== 'string') throw new Error('Missing filePath');
  if (!name || typeof name !== 'string' || !name.trim()) throw new Error('Missing name');
  
  // 檢查輸入檔案是否存在
  try {
    const inputStats = await fsp.stat(filePath);
    if (!inputStats.isFile()) {
      throw new Error(`Input is not a file: ${path.basename(filePath)}`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Input file is missing: ${path.basename(filePath)} (path: ${filePath})`);
    }
    throw new Error(`Cannot access input file: ${path.basename(filePath)} (${err.message})`);
  }
  
  const imageDir = type === 'seasonal' ? 'assets/images/seasonal' : 'assets/images/products';
  const absImageDir = joinUnderSite(siteDir, imageDir);
  await fsp.mkdir(absImageDir, { recursive: true });
  
  // Use name directly as filename
  const sanitizedName = sanitizeFilename(name.trim());
  const filename = getImageFilename(sanitizedName);
  const absImagePath = path.join(absImageDir, filename);
  
  // Check if file already exists
  const exists = await fsp.stat(absImagePath).then(() => true).catch(() => false);
  if (exists) {
    // 檢查檔名存在於哪個分頁
    const foundIn = [];
    
    // 檢查季節限定
    try {
      const seasonalData = await readImageData(siteDir, 'seasonal');
      if (seasonalData.ok && seasonalData.data && Array.isArray(seasonalData.data.items)) {
        const found = seasonalData.data.items.some(item => {
          const itemFilename = path.basename(item.image);
          return itemFilename === filename;
        });
        if (found) {
          foundIn.push('季節限定');
        }
      }
    } catch (e) {
      // 忽略讀取錯誤
    }
    
    // 檢查全部品項
    try {
      const productsData = await readImageData(siteDir, 'products');
      if (productsData.ok && productsData.data && Array.isArray(productsData.data.items)) {
        const found = productsData.data.items.some(item => {
          const itemFilename = path.basename(item.image);
          return itemFilename === filename;
        });
        if (found) {
          foundIn.push('全部品項');
        }
      }
    } catch (e) {
      // 忽略讀取錯誤
    }
    
    // 構建錯誤訊息
    let errorMsg = `檔名已存在：${filename}`;
    if (foundIn.length > 0) {
      errorMsg += `（已存在於：${foundIn.join('、')}）`;
    }
    
    throw new Error(errorMsg);
  }
  
  // Compress and save
  try {
    await compressImage(filePath, absImagePath);
  } catch (err) {
    throw new Error(`圖片壓縮失敗：${err.message || String(err)}`);
  }
  
  const relPath = `${imageDir}/${filename}`;
  return { ok: true, imagePath: relPath, name: sanitizedName };
});

ipcMain.handle('images:update', async (_evt, payload) => {
  const siteDir = await ensureSiteDir();
  await ensureSiteLooksValid(siteDir);
  
  const type = payload && payload.type;
  const items = payload && payload.items;
  if (type !== 'seasonal' && type !== 'products') throw new Error('Invalid type');
  if (!Array.isArray(items)) throw new Error('Items must be an array');
  
  const data = { schema_version: 1, items };
  validateImageData(data);
  
  // Rename files if needed
  const imageDir = type === 'seasonal' ? 'assets/images/seasonal' : 'assets/images/products';
  for (const item of items) {
    const expectedFilename = getImageFilename(item.name);
    const currentRelPath = item.image;
    const currentFilename = path.basename(currentRelPath);
    
    if (currentFilename !== expectedFilename) {
      // Need to rename
      const absOldPath = joinUnderSite(siteDir, currentRelPath);
      const absNewPath = joinUnderSite(siteDir, `${imageDir}/${expectedFilename}`);
      
      // Check if new file already exists (shouldn't happen, but safety check)
      const newExists = await fsp.stat(absNewPath).then(() => true).catch(() => false);
      if (newExists && absOldPath !== absNewPath) {
        // 檢查檔名存在於哪個分頁
        const foundIn = [];
        
        // 檢查季節限定
        try {
          const seasonalData = await readImageData(siteDir, 'seasonal');
          if (seasonalData.ok && seasonalData.data && Array.isArray(seasonalData.data.items)) {
            const found = seasonalData.data.items.some(item => {
              const itemFilename = path.basename(item.image);
              return itemFilename === expectedFilename;
            });
            if (found) {
              foundIn.push('季節限定');
            }
          }
        } catch (e) {
          // 忽略讀取錯誤
        }
        
        // 檢查全部品項
        try {
          const productsData = await readImageData(siteDir, 'products');
          if (productsData.ok && productsData.data && Array.isArray(productsData.data.items)) {
            const found = productsData.data.items.some(item => {
              const itemFilename = path.basename(item.image);
              return itemFilename === expectedFilename;
            });
            if (found) {
              foundIn.push('全部品項');
            }
          }
        } catch (e) {
          // 忽略讀取錯誤
        }
        
        // 構建錯誤訊息
        let errorMsg = `目標檔名已存在：${expectedFilename}`;
        if (foundIn.length > 0) {
          errorMsg += `（已存在於：${foundIn.join('、')}）`;
        }
        
        throw new Error(errorMsg);
      }
      
      if (absOldPath !== absNewPath) {
        await fsp.rename(absOldPath, absNewPath);
      }
      
      item.image = `${imageDir}/${expectedFilename}`;
    }
  }
  
  await writeImageData(siteDir, type, data);
  return { ok: true };
});

ipcMain.handle('images:delete', async (_evt, payload) => {
  const siteDir = await ensureSiteDir();
  await ensureSiteLooksValid(siteDir);
  
  const type = payload && payload.type;
  const imagePath = payload && payload.imagePath;
  if (type !== 'seasonal' && type !== 'products') throw new Error('Invalid type');
  if (!imagePath || typeof imagePath !== 'string') throw new Error('Missing imagePath');
  
  // Delete file
  const absImagePath = joinUnderSite(siteDir, imagePath);
  await fsp.unlink(absImagePath).catch(() => {
    // File might already be deleted, that's ok
  });
  
  return { ok: true };
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


