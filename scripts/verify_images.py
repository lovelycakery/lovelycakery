#!/usr/bin/env python3
"""
Verify that product/seasonal images are "properly compressed" before deploy.

Default rules (tunable via flags):
  - Only checks:
      assets/images/products/*.jpg
      assets/images/seasonal/*.jpg
      assets/images/cakes.jpg
  - Max file size: 1.2 MB per image
  - Max edge: 1600 px (max(width,height))

If any image fails, exits non-zero and prints actionable guidance.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


def iter_targets(root: Path) -> list[Path]:
    out: list[Path] = []
    out += sorted((root / "assets/images/products").glob("*.jpg"))
    out += sorted((root / "assets/images/seasonal").glob("*.jpg"))
    hero = root / "assets/images/cakes.jpg"
    if hero.exists():
        out.append(hero)
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-mb", type=float, default=1.2, help="Max allowed size per image in MB (default: 1.2)")
    ap.add_argument("--max-edge", type=int, default=1600, help="Max allowed edge in px (default: 1600)")
    args = ap.parse_args(argv)

    root = Path(__file__).resolve().parents[1]
    targets = iter_targets(root)
    if not targets:
        print("WARN: no product/seasonal images found to verify.")
        return 0

    max_bytes = int(args.max_mb * 1024 * 1024)
    failures: list[str] = []

    for p in targets:
        b = p.stat().st_size
        with Image.open(p) as im:
            w, h = im.size
        if b > max_bytes:
            failures.append(f"{p.as_posix()}: file too large ({b/1024/1024:.2f}MB > {args.max_mb:.2f}MB)")
        if max(w, h) > args.max_edge:
            failures.append(f"{p.as_posix()}: dimensions too large ({w}x{h}, max edge > {args.max_edge}px)")

    if failures:
        print("❌ Image verification failed:")
        for f in failures:
            print("- " + f)
        print("")
        print("Fix:")
        print("  python3 scripts/optimize_images.py")
        print("")
        print("If you intentionally want bigger images, adjust thresholds:")
        print("  python3 scripts/verify_images.py --max-mb 2.0 --max-edge 2000")
        return 1

    print(f"✅ Image verification passed ({len(targets)} images).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))


