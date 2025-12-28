# Lovely Admin (Local-only)

This folder contains the collaborator-facing **local admin tool**.

Goals:
- Preview should match the visitor website (loads `site/` pages directly).
- Admin tool can safely edit the website content by writing allowlisted files under `site/`.
- “One-button publish”: local preflight checks → commit+push → CI deploy gate.

Non-negotiable rules are documented in `ADMIN_SAFETY_GUIDE.md`.

## Run (dev mode)

From repo root:

```bash
cd admin
npm install
npm start
```

## How it works (calendar MVP)

- Preview loads `site/calendar.html` in an iframe.
- In admin context, clicking a day selects a `YYYY-MM-DD` date (the widget exposes `data-date`).
- Save writes `site/assets/data/calendar-data.json` with strict validation + atomic write + backup (outside repo).
- It also bumps the calendar cache version (`?v=...`) so visitors see updates after deploy.

## Publish button

“一鍵發布” will:

- Run local preflight checks (collaborator-friendly errors)
- If OK: `git add site/` → commit → push `main`
- CI (GitHub Actions) is the second gate and deploys Pages only if checks pass

If push fails due to auth, the tool will show a “please login/configure git” hint.


