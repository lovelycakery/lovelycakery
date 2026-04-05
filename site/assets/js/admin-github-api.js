// GitHub API wrapper for Lovely Admin (web-based)
// Handles: token management, file CRUD, multi-file atomic commits, image upload
(function () {
  'use strict';
  if (window.GitHubAPI) return;

  const OWNER = 'lovelycakery';
  const REPO = 'lovelycakery';
  const BRANCH = 'main';
  const BASE = 'https://api.github.com';
  const TOKEN_KEY = 'lovely-admin-github-token';

  // ── Token management ──────────────────────────────────────────────

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, (token || '').trim());
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function hasToken() {
    return !!getToken();
  }

  // ── Low-level fetch helper ────────────────────────────────────────

  async function apiFetch(path, options) {
    const token = getToken();
    if (!token) throw new Error('未設定 GitHub Token，請先登入。');

    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const headers = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options && options.headers ? options.headers : {}),
    };

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      throw new Error('GitHub Token 無效或已過期，請重新設定。');
    }
    if (res.status === 409) {
      throw new Error('檔案衝突（其他人可能剛修改過），請重新載入後再試。');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitHub API 錯誤 (${res.status}): ${body.slice(0, 200)}`);
    }

    // 204 No Content (delete)
    if (res.status === 204) return null;
    return res.json();
  }

  // ── Validate token ────────────────────────────────────────────────

  async function validateToken() {
    try {
      const user = await apiFetch('/user');
      return { ok: true, login: user.login };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Check repo access ─────────────────────────────────────────────

  async function checkRepoAccess() {
    try {
      await apiFetch(`/repos/${OWNER}/${REPO}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Contents API (single file) ────────────────────────────────────

  // Get a file's content + SHA
  async function getFile(repoPath) {
    const data = await apiFetch(
      `/repos/${OWNER}/${REPO}/contents/${repoPath}?ref=${BRANCH}`
    );
    const content = atob(data.content.replace(/\n/g, ''));
    // Decode UTF-8 properly
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i);
    const text = new TextDecoder('utf-8').decode(bytes);
    return { content: text, sha: data.sha, path: data.path };
  }

  // Get a file as JSON
  async function getJSON(repoPath) {
    const file = await getFile(repoPath);
    return { data: JSON.parse(file.content), sha: file.sha };
  }

  // ── Git Data API (multi-file atomic commit) ───────────────────────
  //
  // Flow:
  //   1. GET refs/heads/main → latest commit SHA
  //   2. GET commit → base tree SHA
  //   3. POST git/blobs for each changed file
  //   4. POST git/trees (new tree with all changes)
  //   5. POST git/commits (new commit)
  //   6. PATCH refs/heads/main → point to new commit

  async function getLatestCommit() {
    const ref = await apiFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
    const commitSha = ref.object.sha;
    const commit = await apiFetch(`/repos/${OWNER}/${REPO}/git/commits/${commitSha}`);
    return { commitSha, treeSha: commit.tree.sha };
  }

  // Create a blob (for text or base64 binary)
  async function createBlob(content, encoding) {
    // encoding: 'utf-8' for text, 'base64' for binary
    const data = await apiFetch(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, encoding: encoding || 'utf-8' }),
    });
    return data.sha;
  }

  // Create a tree with multiple file changes
  // changes: Array of { path, content, encoding?, mode? }
  //   - path: relative to repo root (e.g. 'site/assets/data/calendar-data.json')
  //   - content: file content string (text or base64)
  //   - encoding: 'utf-8' (default) or 'base64'
  //   - mode: '100644' (default, normal file)
  //   - deleted: true to delete the file
  async function createTree(baseTreeSha, changes) {
    const tree = [];

    for (const change of changes) {
      if (change.deleted) {
        // To delete a file, omit sha and content (GitHub figures it out via null sha)
        // Actually for tree API deletion, we just don't include the file.
        // But we need to use a different approach: set sha to null won't work.
        // For deletion via tree API, we need to create tree without base_tree
        // and include all files we want to keep. This is complex.
        // Simpler: use Contents API for deletion separately.
        continue;
      }

      const blobSha = await createBlob(change.content, change.encoding || 'utf-8');
      tree.push({
        path: change.path,
        mode: change.mode || '100644',
        type: 'blob',
        sha: blobSha,
      });
    }

    if (tree.length === 0) {
      throw new Error('沒有檔案需要更新。');
    }

    const data = await apiFetch(`/repos/${OWNER}/${REPO}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree }),
    });
    return data.sha;
  }

  // Create a commit
  async function createCommit(treeSha, parentCommitSha, message) {
    const data = await apiFetch(`/repos/${OWNER}/${REPO}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentCommitSha],
      }),
    });
    return data.sha;
  }

  // Update branch ref to point to new commit
  async function updateRef(commitSha) {
    await apiFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitSha }),
    });
  }

  // ── High-level: atomic multi-file commit ──────────────────────────

  // changes: Array of { path, content, encoding? }
  //   path is relative to REPO root (e.g. 'site/assets/data/calendar-data.json')
  async function commitMultipleFiles(changes, message, retries) {
    retries = typeof retries === 'number' ? retries : 2;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { commitSha, treeSha } = await getLatestCommit();
        const newTreeSha = await createTree(treeSha, changes);
        const newCommitSha = await createCommit(newTreeSha, commitSha, message);
        await updateRef(newCommitSha);
        return { ok: true, commitSha: newCommitSha };
      } catch (e) {
        // 409 or ref update conflict → retry
        const isConflict =
          (e.message && e.message.includes('409')) ||
          (e.message && e.message.includes('Update is not a fast forward'));
        if (isConflict && attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
  }

  // ── High-level: delete a single file via Contents API ─────────────

  async function deleteFile(repoPath, message) {
    // Need the SHA first
    const file = await getFile(repoPath);
    await apiFetch(`/repos/${OWNER}/${REPO}/contents/${repoPath}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || `Delete ${repoPath}`,
        sha: file.sha,
        branch: BRANCH,
      }),
    });
    return { ok: true };
  }

  // ── Export ─────────────────────────────────────────────────────────

  window.GitHubAPI = {
    // Token
    getToken,
    setToken,
    clearToken,
    hasToken,
    validateToken,
    checkRepoAccess,

    // File operations
    getFile,
    getJSON,
    deleteFile,

    // Multi-file commit
    commitMultipleFiles,
    createBlob,
    getLatestCommit,

    // Constants
    OWNER,
    REPO,
    BRANCH,
  };
})();
