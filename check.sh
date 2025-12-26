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
    # Normalize by stripping query/hash so checks keep working with cache-busting (?v=...).
    out = []
    for m in src_re.finditer(text):
        src = m.group(1)
        src = src.split('?', 1)[0].split('#', 1)[0]
        out.append(src)
    return out

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

# 2.5) Enforce calendar cache-busting (?v=...) when calendar-related assets change
if [ -d ".git" ]; then
  # Detect calendar-related changes (staged/unstaged/untracked)
  changed_files="$(
    {
      git diff --name-only
      git diff --cached --name-only
      git ls-files --others --exclude-standard
    } | sed '/^\s*$/d' | sort -u
  )"

  needs_bump=0
  while IFS= read -r f; do
    case "$f" in
      assets/css/styles.css|assets/css/calendar-widget.css|assets/js/calendar-embed.js|assets/js/calendar-widget-readonly.js|calendar.html|calendar-widget-readonly.html)
        needs_bump=1
        break
        ;;
    esac
  done <<< "$changed_files"

  # Always validate version consistency if versions exist.
  python3 - <<'PY'
import re, sys
from pathlib import Path

targets = [Path("calendar.html"), Path("calendar-widget-readonly.html")]
pat = re.compile(r"\?v=([0-9]{8}-[0-9]+)")

versions = []
details = {}
for p in targets:
    if not p.exists():
        continue
    text = p.read_text(encoding="utf-8", errors="ignore")
    vs = pat.findall(text)
    details[p.name] = vs
    versions.extend(vs)

uniq = sorted(set(versions))
if not uniq:
    # Project can work without v=, but we strongly prefer it for deployed sites.
    # Keep as warning-level by default.
    print("WARN: no ?v=... found in calendar pages")
    raise SystemExit(0)

if len(uniq) != 1:
    print("CACHE VERSION MISMATCH:")
    for name, vs in details.items():
        print(f"  {name}: {vs}")
    sys.exit(1)

print(f"OK: calendar cache version is consistent: {uniq[0]}")
PY

  if [ "$needs_bump" -eq 1 ]; then
    # If calendar-related assets changed, the cache version must change compared to HEAD.
    python3 - <<'PY'
import re, subprocess, sys
from pathlib import Path

targets = ["calendar.html", "calendar-widget-readonly.html"]
pat = re.compile(r"\?v=([0-9]{8}-[0-9]+)")

def extract_from_text(text: str) -> str | None:
    m = pat.search(text or "")
    return m.group(1) if m else None

def read_head(path: str) -> str | None:
    try:
        out = subprocess.check_output(["git", "show", f"HEAD:{path}"], stderr=subprocess.DEVNULL)
        return out.decode("utf-8", errors="ignore")
    except Exception:
        return None

def read_worktree(path: str) -> str | None:
    p = Path(path)
    if not p.exists():
        return None
    return p.read_text(encoding="utf-8", errors="ignore")

work_versions = {}
head_versions = {}
for t in targets:
    work_versions[t] = extract_from_text(read_worktree(t) or "")
    head_versions[t] = extract_from_text(read_head(t) or "")

work_set = {v for v in work_versions.values() if v}
head_set = {v for v in head_versions.values() if v}

# If HEAD had no versions (first time introducing v=), require that worktree has one.
if not head_set:
    if not work_set:
        print("ERROR: calendar pages have no ?v=... and calendar-related assets changed.")
        sys.exit(1)
    print("OK: introduced calendar cache version (?v=...)")
    raise SystemExit(0)

# Normal case: require the version to differ from HEAD.
if work_set == head_set:
    print("ERROR: calendar-related assets changed but cache version (?v=...) did not change.")
    print("HEAD versions:", head_versions)
    print("WORK versions:", work_versions)
    sys.exit(1)

print("OK: calendar cache version changed:", {"head": sorted(head_set), "work": sorted(work_set)})
PY
    pass "Calendar cache-busting version bumped for calendar-related changes"
  else
    pass "Calendar cache-busting check skipped (no calendar-related changes)"
  fi
else
  warn "No .git directory found; skipping calendar cache-busting checks."
fi

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


