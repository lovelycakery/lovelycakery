#!/bin/bash
set -euo pipefail

# Lovely Cakery - Pre-deploy checks
# Usage: ./check.sh

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔎 Running pre-deploy checks...${NC}\n"

fail() {
  echo -e "${RED}❌ CHECK FAILED:${NC} $1" >&2
  exit 1
}

warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

pass() {
  echo -e "${GREEN}✅ $1${NC}"
}

# 1) Ensure no missing local assets referenced by HTML
python3 - <<'PY'
import re, pathlib, sys
root = pathlib.Path('.')
html_files = list(root.glob('*.html'))
missing = []
pattern = re.compile(r'(?:src|href)=["\'](assets/[^"\'#?]+)')
for f in html_files:
    text = f.read_text(encoding='utf-8', errors='ignore')
    for m in pattern.finditer(text):
        p = root / m.group(1)
        if not p.exists():
            missing.append((str(f), m.group(1)))
if missing:
    print("MISSING ASSETS:")
    for f, a in missing:
        print(f"  {f}: {a}")
    sys.exit(1)
print("OK: all referenced local assets exist")
PY
pass "HTML asset references are valid"

# 2) Enforce script load order (i18n.js before script.js on pages that use script.js)
python3 - <<'PY'
import pathlib, re, sys
root = pathlib.Path('.')
html_files = list(root.glob('*.html'))
src_re = re.compile(r'<script[^>]+src=["\']([^"\']+)["\']', re.I)

def get_srcs(text):
    return [m.group(1) for m in src_re.finditer(text)]

errors = []
for f in html_files:
    text = f.read_text(encoding='utf-8', errors='ignore')
    srcs = get_srcs(text)
    if 'assets/js/script.js' in srcs:
        try:
            if srcs.index('assets/js/i18n.js') > srcs.index('assets/js/script.js'):
                errors.append(f"{f}: assets/js/i18n.js must be before assets/js/script.js")
        except ValueError:
            errors.append(f"{f}: missing assets/js/i18n.js (required before assets/js/script.js)")

    if f.name == 'calendar.html':
        # calendar embed controller should be present
        if 'assets/js/calendar-embed.js' not in srcs:
            errors.append("calendar.html: missing assets/js/calendar-embed.js")

if errors:
    print("SCRIPT ORDER ERRORS:")
    for e in errors:
        print("  " + e)
    sys.exit(1)
print("OK: script load order looks good")
PY
pass "Script load order is correct"

# 3) Architecture guardrails: avoid reintroducing polling loops in assets/js
if grep -R --line-number --fixed-string "setInterval(" assets/js >/dev/null 2>&1; then
  echo "Found setInterval usage:"
  grep -R --line-number --fixed-string "setInterval(" assets/js || true
  fail "setInterval() found in assets/js. Prefer event-driven logic to reduce bugs."
fi
pass "No setInterval() in assets/js"

# 4) Ensure legacy config name is not referenced (scan project files, exclude this script)
# Note: we intentionally do NOT scan check.sh itself to avoid false positives.
if grep -R --line-number --fixed-string "github-config.js" \
  --exclude="check.sh" \
  --exclude="deploy.sh" \
  --exclude-dir=".git" \
  --include="*.html" --include="*.md" --include="*.js" --include="*.css" \
  . >/dev/null 2>&1; then
  echo "Found legacy github-config.js references:"
  grep -R --line-number --fixed-string "github-config.js" \
    --exclude="check.sh" \
    --exclude="deploy.sh" \
    --exclude-dir=".git" \
    --include="*.html" --include="*.md" --include="*.js" --include="*.css" \
    . || true
  fail "Legacy github-config.js reference found. Use github-config.local.js instead."
fi
pass "No legacy github-config.js references"

# 5) Prevent accidental committing of local secret config
if [ -d ".git" ]; then
  if git ls-files --error-unmatch assets/js/github-config.local.js >/dev/null 2>&1; then
    fail "assets/js/github-config.local.js is TRACKED by git. It must stay local-only."
  fi
  if git ls-files --error-unmatch assets/js/admin-password-config.local.js >/dev/null 2>&1; then
    fail "assets/js/admin-password-config.local.js is TRACKED by git. It must stay local-only."
  fi
else
  warn "No .git directory found; skipping git tracking checks."
fi
pass "Local-only secret config is not tracked"

echo -e "\n${GREEN}✅ All checks passed.${NC}"


