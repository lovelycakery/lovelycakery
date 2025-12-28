# Lovely Cakery — Website (`site/`)

This folder is the **deployable static website** (HTML/CSS/JS). GitHub Pages publishes **this folder only**.

## Pages

- `index.html`：首頁
- `calendar.html`：日曆頁（嵌入 `calendar-widget-readonly.html`）
- `seasonal.html`：季節限定
- `all-items.html`：全部品項
- `order.html`：訂購方式
- `contact.html`：地圖

## Key data files

- `assets/data/calendar-data.json`：日曆事件資料（訪客端只讀）

## Local preview

- Open `site/index.html` in your browser.
- Calendar page: open `site/calendar.html`.

## Calendar architecture (quick)

- Visitor page (`calendar.html`) embeds the read-only widget (`calendar-widget-readonly.html`) via iframe.
- The widget reads `assets/data/calendar-data.json` and renders the calendar.
- Cache-busting is done via `?v=YYYYMMDD-N` on calendar-related pages/assets.

## How to edit the calendar

Recommended: use the **local admin tool** in `admin/` (it writes `assets/data/calendar-data.json` directly and bumps `?v=` safely).

Legacy pages:
- `calendar-widget.html` / `calendar-manager-local.html` exist for historical reasons but are **not** the recommended workflow anymore.

## Deploy

This repo uses **GitHub Actions** for Pages:

- Push to `main`
- CI runs `check.sh`
- Only if checks pass, Pages deploys `site/`

### Pages setup (one-time)

In GitHub repo settings:

- `Settings → Pages → Source`: choose **GitHub Actions**

## Images: optimize before publish

At repo root (not inside `site/`):

- Optimize:
  - `python3 scripts/optimize_images.py --only-changed`
- Verify (also run by `check.sh`):
  - `python3 scripts/verify_images.py`

## More details

- Full architecture + pitfalls: `AI_MAINTENANCE_GUIDE.md`


