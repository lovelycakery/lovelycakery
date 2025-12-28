# Lovely Admin (Local-only)

This folder contains the collaborator-facing **local admin tool**.

Goals:
- Preview should match the visitor website (loads `site/` pages directly).
- Admin tool can safely edit the website content by writing allowlisted files under `site/`.
- “One-button publish”: local preflight checks → commit+push → CI deploy gate.

Non-negotiable rules are documented in `ADMIN_SAFETY_GUIDE.md`.


