#!/bin/bash
set -euo pipefail

# Auto bump cache-busting query (?v=...) for the public calendar pages.
#
# Policy:
# - Only bump when *calendar-related* files changed.
# - Keep existing architecture (static HTML/CSS/JS + iframe widgets).
#
# Pages that carry the version:
# - calendar.html
# - calendar-widget-readonly.html
#
# What triggers a bump:
# - Any change to these files (staged/unstaged/untracked):
#   - assets/css/styles.css
#   - assets/css/calendar-widget.css
#   - assets/js/calendar-embed.js
#   - assets/js/calendar-widget-readonly.js
#   - assets/data/calendar-data.json
#   - calendar.html
#   - calendar-widget-readonly.html

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [ ! -d ".git" ]; then
  echo "ℹ️  bump-calendar-cache: no .git directory; skipping."
  exit 0
fi

collect_changed_files() {
  # Include: staged, unstaged, and untracked.
  {
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | sed '/^\s*$/d' | sort -u
}

should_bump=0
while IFS= read -r f; do
  case "$f" in
    assets/css/styles.css|assets/css/calendar-widget.css|assets/js/calendar-embed.js|assets/js/calendar-widget-readonly.js|assets/data/calendar-data.json|calendar.html|calendar-widget-readonly.html)
      should_bump=1
      break
      ;;
  esac
done < <(collect_changed_files)

if [ "$should_bump" -ne 1 ]; then
  echo "ℹ️  bump-calendar-cache: no calendar-related changes; skipping."
  exit 0
fi

today="$(date -u +%Y%m%d)"

# Try to read the current version from calendar.html (?v=YYYYMMDD-N). If same day, increment N.
current_v="$(python3 - <<'PY'
import re
from pathlib import Path
p = Path("calendar.html")
if not p.exists():
    print("")
    raise SystemExit(0)
text = p.read_text(encoding="utf-8", errors="ignore")
m = re.search(r"\?v=([0-9]{8}-[0-9]+)", text)
print(m.group(1) if m else "")
PY
)"

next_suffix="1"
if [[ "$current_v" =~ ^([0-9]{8})-([0-9]+)$ ]]; then
  cur_day="${BASH_REMATCH[1]}"
  cur_n="${BASH_REMATCH[2]}"
  if [ "$cur_day" = "$today" ]; then
    next_suffix="$((cur_n + 1))"
  fi
fi

new_v="${today}-${next_suffix}"

python3 - <<PY
import re
from pathlib import Path

new_v = "${new_v}"
targets = [Path("calendar.html"), Path("calendar-widget-readonly.html")]

pat = re.compile(r"\?v=([0-9]{8}-[0-9]+)")
for p in targets:
    if not p.exists():
        continue
    text = p.read_text(encoding="utf-8", errors="ignore")
    new_text, n = pat.subn("?v=" + new_v, text)
    if n:
        p.write_text(new_text, encoding="utf-8")
PY

echo "✅ bump-calendar-cache: updated ?v= to ${new_v} (calendar.html + calendar-widget-readonly.html)"


