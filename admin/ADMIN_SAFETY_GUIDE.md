# Lovely Admin — Safety Architecture (MUST FOLLOW)

This `admin/` tool is **local-only** and is allowed to modify the website under `site/`, but the #1 requirement is:

> **The admin tool must not be able to accidentally break the website.**

This document defines the non-negotiable guardrails. Future AI/maintainers **must** follow them.

---

## Scope & Separation

- **Website** lives in `site/` and is deployed as-is to GitHub Pages.
- **Admin tool** lives in `admin/` and is never deployed.
- The website must never depend on admin-only code or assets to run.

---

## Write Guardrails (Hard Requirements)

### 1) Strict path allowlist (default: data-only)

The admin tool must only write to explicitly allowlisted paths under the selected `site/` folder.

- Default allowlist:
  - `assets/data/calendar-data.json`
  - Calendar pages for cache-busting version bump:
    - `calendar.html`
    - `calendar-widget-readonly.html`
    - `calendar-widget.html`
    - `calendar-manager-local.html` (legacy; optional but kept consistent)

Everything else is **read-only** unless a maintainer explicitly expands the allowlist.

### 2) Site path locking + validation

- On first run, user selects a `site/` folder.
- The tool stores the chosen path.
- **Before any write**, the tool must verify marker files exist (minimum):
  - `calendar.html`
  - `assets/data/calendar-data.json`
- If validation fails, **refuse to write** and show a clear error.

### 3) Atomic writes

All writes must be atomic:

- Write to `*.tmp` in the same directory
- fsync if available (best-effort)
- Rename to final filename

No partial writes.

### 4) Automatic backups (outside repo)

- Before overwriting any allowlisted file, create a timestamped backup.
- Backups must be stored **outside the git repository** (e.g., in Electron `userData`).
- Do not commit `.bak` files into the repo.

### 5) Strict schema validation

Before saving:

- Validate JSON is parseable
- Validate required fields exist
- Validate enums (e.g., calendar status must be one of `available|unavailable|closed`)
- Reject invalid inputs with actionable messages

Include `schema_version` when introducing new schemas.

### 6) Dry-run / preview of changes

Before publish (commit/push), show:

- Which files will change (at least: data file + version-bumped html files)
- A concise summary of what changed (e.g., edited dates)

---

## Publish Guardrails

### 1) Local preflight gate (first gate)

The tool must run local checks before pushing:

- Equivalent to essential parts of `check.sh`
- Plus any relevant schema validation

If preflight fails, **do not commit/push**.
Show clear errors that a non-technical collaborator can copy/paste.

### 2) CI gate (second gate)

GitHub Actions is the second gate:

- Push triggers CI checks
- Only if CI passes does GitHub Pages deploy

The tool should display a concise “CI deploy failed” summary when needed, without requiring the collaborator to use GitHub UI.

---

## Deletion Policy (General)

- Prefer **reversible** operations.
- For images (future): “delete” should move files to OS trash if possible.
- For this calendar-only phase: no destructive deletion beyond removing an event entry from JSON.


