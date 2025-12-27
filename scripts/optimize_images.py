#!/usr/bin/env python3
"""
Optimize images for the static site.

Default targets:
  - assets/images/products/*.jpg
  - assets/images/seasonal/*.jpg
  - assets/images/cakes.jpg (homepage hero)
  - assets/images/calendar/frames/*.(png)  (decorative frame images; preserves alpha)

What it does:
  - Downscale to a max edge (default 1600px) to match web usage
  - Re-encode as progressive optimized JPEG (default quality 82)
  - Overwrite only if the result is smaller (or if --force)
  - For PNG frames: quantize/optimize while preserving transparency (center alpha)

Usage examples:
  python3 scripts/optimize_images.py
  python3 scripts/optimize_images.py --max-edge 1400 --quality 80
  python3 scripts/optimize_images.py --include-hero
"""

from __future__ import annotations

import argparse
import subprocess
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


@dataclass
class Result:
    path: Path
    before_bytes: int
    after_bytes: int
    before_size: tuple[int, int]
    after_size: tuple[int, int]
    changed: bool


def iter_targets(root: Path, include_hero: bool) -> list[Path]:
    targets: list[Path] = []
    targets += sorted((root / "assets/images/products").glob("*.jpg"))
    targets += sorted((root / "assets/images/seasonal").glob("*.jpg"))
    targets += sorted((root / "assets/images/calendar/frames").glob("*.png"))
    if include_hero:
        hero = root / "assets/images/cakes.jpg"
        if hero.exists():
            targets.append(hero)
    return targets


def _git_changed_files(root: Path) -> list[str]:
    """
    Return a de-duplicated list of changed files:
    - unstaged
    - staged
    - untracked
    """
    def run(args: list[str]) -> list[str]:
        out = subprocess.check_output(args, cwd=str(root), stderr=subprocess.DEVNULL).decode("utf-8", errors="ignore")
        return [line.strip() for line in out.splitlines() if line.strip()]

    files: list[str] = []
    files += run(["git", "diff", "--name-only"])
    files += run(["git", "diff", "--cached", "--name-only"])
    files += run(["git", "ls-files", "--others", "--exclude-standard"])
    # de-dupe while keeping stable ordering
    seen: set[str] = set()
    out: list[str] = []
    for f in files:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out


def iter_changed_targets(root: Path, include_hero: bool) -> list[Path]:
    git_dir = root / ".git"
    if not git_dir.exists():
        raise RuntimeError("No .git directory found; --only-changed requires a git repository.")

    allowed_prefixes = ("assets/images/products/", "assets/images/seasonal/", "assets/images/calendar/frames/")
    allowed_exact = {"assets/images/cakes.jpg"} if include_hero else set()

    out: list[Path] = []
    for rel in _git_changed_files(root):
        if not (rel.lower().endswith(".jpg") or rel.lower().endswith(".png")):
            continue
        if rel in allowed_exact or rel.startswith(allowed_prefixes):
            p = root / rel
            if p.exists():
                out.append(p)
    return out


def downscale(im: Image.Image, max_edge: int) -> Image.Image:
    w, h = im.size
    m = max(w, h)
    if m <= max_edge:
        return im
    scale = max_edge / float(m)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return im.resize((new_w, new_h), resample=Image.Resampling.LANCZOS)


def optimize_one(path: Path, max_edge: int, quality: int, force: bool) -> Result:
    before_bytes = path.stat().st_size
    suffix = path.suffix.lower()
    if suffix == ".jpg" or suffix == ".jpeg":
        with Image.open(path) as im0:
            im = im0.convert("RGB")  # ensure consistent JPEG encoding
            before_size = im.size
            im = downscale(im, max_edge=max_edge)
            after_size = im.size

            # Write to temp file first for safety
            with tempfile.NamedTemporaryFile(prefix="lovely-opt-", suffix=".jpg", delete=False) as tmp:
                tmp_path = Path(tmp.name)
            try:
                im.save(
                    tmp_path,
                    format="JPEG",
                    quality=quality,
                    optimize=True,
                    progressive=True,
                    subsampling="4:2:0",
                )
                after_bytes = tmp_path.stat().st_size
                changed = force or (after_bytes < before_bytes)
                if changed:
                    shutil.move(str(tmp_path), str(path))
                    after_bytes_final = path.stat().st_size
                    return Result(
                        path=path,
                        before_bytes=before_bytes,
                        after_bytes=after_bytes_final,
                        before_size=before_size,
                        after_size=after_size,
                        changed=True,
                    )
                else:
                    tmp_path.unlink(missing_ok=True)
                    return Result(
                        path=path,
                        before_bytes=before_bytes,
                        after_bytes=before_bytes,
                        before_size=before_size,
                        after_size=before_size,
                        changed=False,
                    )
            finally:
                if tmp_path.exists():
                    tmp_path.unlink(missing_ok=True)

    if suffix == ".png":
        # PNG frames: preserve alpha, quantize to reduce size (great for flat illustrations)
        with Image.open(path) as im0:
            im_rgba = im0.convert("RGBA")
            before_size = im_rgba.size
            im_rgba = downscale(im_rgba, max_edge=max_edge)
            after_size = im_rgba.size
            # Quantize (keeps transparency via palette index)
            q = im_rgba.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)

        with tempfile.NamedTemporaryFile(prefix="lovely-opt-", suffix=".png", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            q.save(tmp_path, format="PNG", optimize=True)
            after_bytes = tmp_path.stat().st_size
            changed = force or (after_bytes < before_bytes)
            if changed:
                shutil.move(str(tmp_path), str(path))
                after_bytes_final = path.stat().st_size
                return Result(
                    path=path,
                    before_bytes=before_bytes,
                    after_bytes=after_bytes_final,
                    before_size=before_size,
                    after_size=after_size,
                    changed=True,
                )
            tmp_path.unlink(missing_ok=True)
            return Result(
                path=path,
                before_bytes=before_bytes,
                after_bytes=before_bytes,
                before_size=before_size,
                after_size=before_size,
                changed=False,
            )
        finally:
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)

    # Unknown type: do nothing
    with Image.open(path) as im0:
        before_size = im0.size
    return Result(
        path=path,
        before_bytes=before_bytes,
        after_bytes=before_bytes,
        before_size=before_size,
        after_size=before_size,
        changed=False,
    )


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-edge", type=int, default=1600, help="Resize max(width,height) to this value (default: 1600)")
    ap.add_argument("--quality", type=int, default=82, help="JPEG quality (default: 82)")
    ap.add_argument("--force", action="store_true", help="Overwrite even if file gets larger")
    ap.add_argument("--no-hero", action="store_true", help="Skip optimizing assets/images/cakes.jpg")
    ap.add_argument(
        "--only-changed",
        action="store_true",
        help="Only optimize images that are changed/untracked in git (products/seasonal + optional hero).",
    )
    args = ap.parse_args(argv)

    root = Path(__file__).resolve().parents[1]
    include_hero = not args.no_hero
    if args.only_changed:
        targets = iter_changed_targets(root, include_hero=include_hero)
    else:
        targets = iter_targets(root, include_hero=include_hero)
    if not targets:
        if args.only_changed:
            print("No changed target images found (git clean for products/seasonal/hero).")
        else:
            print("No target images found.")
        return 0

    results: list[Result] = []
    for p in targets:
        r = optimize_one(p, max_edge=args.max_edge, quality=args.quality, force=args.force)
        results.append(r)

    changed = [r for r in results if r.changed]
    total_before = sum(r.before_bytes for r in results)
    total_after = sum(r.after_bytes for r in results)

    print("Optimized images:")
    for r in results:
        bw = r.before_bytes / 1024 / 1024
        aw = r.after_bytes / 1024 / 1024
        flag = "CHANGED" if r.changed else "SKIP"
        print(f"- {flag} {r.path.as_posix()}  {r.before_size[0]}x{r.before_size[1]} -> {r.after_size[0]}x{r.after_size[1]}  {bw:.2f}MB -> {aw:.2f}MB")

    print("")
    print(f"Total: {total_before/1024/1024:.2f}MB -> {total_after/1024/1024:.2f}MB ({(total_after/total_before*100.0):.1f}%)")
    print(f"Changed: {len(changed)}/{len(results)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))


