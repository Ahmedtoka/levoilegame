"""Create transparent PNG cutouts of each product's first image.

    .venv/Scripts/python scripts/remove-bg.py                 # all products, skip existing
    .venv/Scripts/python scripts/remove-bg.py --force         # regenerate everything
    .venv/Scripts/python scripts/remove-bg.py --only dresses-03 denim-01
    .venv/Scripts/python scripts/remove-bg.py --model u2net   # try another rembg model
    .venv/Scripts/python scripts/remove-bg.py --sheet out.png # also write a review contact sheet

Input:  public/products/<id>/1.jpg   (from scripts/fetch-assets.mjs)
Output: public/products/<id>/cutout.png  — RGBA, trimmed to content, longest side <= 1024
Report: scripts/cutout-report.json  — per-product quality metrics + flags

Requires: pip install "rembg[cpu]" pillow numpy   (Python 3.10–3.13; onnxruntime has no 3.14 wheels yet)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_JSON = ROOT / "src" / "data" / "products.json"
PRODUCTS_DIR = ROOT / "public" / "products"
REPORT = ROOT / "scripts" / "cutout-report.json"

MAX_SIDE = 1024
TRIM_PAD = 0.03  # padding kept around the trimmed subject, as a fraction of its size

# Quality thresholds (fraction of the *original* frame that stays opaque).
MIN_COVERAGE = 0.08   # less than this → subject probably lost
MAX_COVERAGE = 0.92   # more than this → background probably not removed
MAX_SOFT = 0.12       # share of visible pixels that are semi-transparent → mushy mask
MAX_EDGE_TOUCH = 0.5  # share of the frame border that is opaque → background bleeding to edges


def analyse(alpha: np.ndarray) -> dict:
    """Mask metrics on an alpha channel in [0, 255]."""
    opaque = alpha > 128
    visible = alpha > 16
    coverage = float(opaque.mean())
    soft = float(((alpha > 16) & (alpha < 240)).sum() / max(visible.sum(), 1))
    border = np.concatenate([opaque[0, :], opaque[-1, :], opaque[:, 0], opaque[:, -1]])
    edge_touch = float(border.mean())

    flags = []
    if coverage < MIN_COVERAGE:
        flags.append(f"low coverage ({coverage:.1%})")
    if coverage > MAX_COVERAGE:
        flags.append(f"background likely kept ({coverage:.1%} opaque)")
    if soft > MAX_SOFT:
        flags.append(f"soft/uncertain mask ({soft:.1%} semi-transparent)")
    if edge_touch > MAX_EDGE_TOUCH:
        flags.append(f"subject/background touches frame edges ({edge_touch:.1%})")
    return {"coverage": round(coverage, 4), "soft": round(soft, 4), "edgeTouch": round(edge_touch, 4), "flags": flags}


def trim(img: Image.Image) -> Image.Image:
    bbox = img.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    pad = int(max(r - l, b - t) * TRIM_PAD)
    return img.crop((max(l - pad, 0), max(t - pad, 0), min(r + pad, img.width), min(b + pad, img.height)))


def fit(img: Image.Image) -> Image.Image:
    scale = MAX_SIDE / max(img.size)
    if scale >= 1:
        return img
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)


def contact_sheet(rows: list[dict], dest: Path, cell: int = 220) -> None:
    cols = 9
    lines = (len(rows) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, lines * (cell + 18)), (158, 25, 126))  # brand magenta shows holes
    draw = ImageDraw.Draw(sheet)
    for i, row in enumerate(rows):
        path = PRODUCTS_DIR / row["id"] / "cutout.png"
        if not path.exists():
            continue
        im = Image.open(path).convert("RGBA")
        im.thumbnail((cell - 8, cell - 8))
        x, y = (i % cols) * cell, (i // cols) * (cell + 18)
        sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
        draw.text((x + 4, y + cell + 2), row["id"] + (" !" if row.get("flags") else ""), fill="white")
    sheet.save(dest)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="regenerate existing cutouts")
    ap.add_argument("--only", nargs="*", help="product ids to process")
    ap.add_argument("--model", default="isnet-general-use", help="rembg model (isnet-general-use, u2net, birefnet-general, …)")
    ap.add_argument("--no-trim", action="store_true", help="keep the original framing instead of trimming to the subject")
    ap.add_argument("--sheet", type=Path, help="write a contact sheet PNG for visual review")
    args = ap.parse_args()

    products = json.loads(PRODUCTS_JSON.read_text(encoding="utf-8"))["products"]
    if args.only:
        products = [p for p in products if p["id"] in set(args.only)]

    previous = {r["id"]: r for r in json.loads(REPORT.read_text())["products"]} if REPORT.exists() else {}
    session = new_session(args.model)
    rows, failures = [], []
    t0 = time.time()

    for i, p in enumerate(products, 1):
        pid = p["id"]
        src = PRODUCTS_DIR / pid / "1.jpg"
        dest = PRODUCTS_DIR / pid / "cutout.png"
        tag = f"[{i:>2}/{len(products)}] {pid}"

        if not src.exists():
            failures.append({"id": pid, "reason": "missing 1.jpg — run scripts/fetch-assets.mjs"})
            print(f"{tag}: MISSING source", file=sys.stderr)
            continue
        if dest.exists() and not args.force:
            rows.append(previous.get(pid) or {"id": pid, **analyse(np.asarray(Image.open(dest).getchannel("A")))})
            print(f"{tag}: skip (exists)")
            continue

        try:
            cut = remove(Image.open(src).convert("RGB"), session=session).convert("RGBA")
            metrics = analyse(np.asarray(cut.getchannel("A")))  # measured on the full frame, before trimming
            out = fit(cut if args.no_trim else trim(cut))
            out.save(dest, optimize=True)
            rows.append({"id": pid, "size": list(out.size), **metrics})
            note = "  ⚠ " + "; ".join(metrics["flags"]) if metrics["flags"] else ""
            print(f"{tag}: {out.width}x{out.height} coverage {metrics['coverage']:.0%}{note}")
        except Exception as exc:  # noqa: BLE001 — keep going, report at the end
            failures.append({"id": pid, "reason": str(exc)})
            print(f"{tag}: FAILED {exc}", file=sys.stderr)

    flagged = [r for r in rows if r.get("flags")]
    REPORT.write_text(json.dumps({"model": args.model, "products": rows, "failures": failures}, indent=2))
    if args.sheet:
        contact_sheet(rows, args.sheet)

    print(f"\nDone in {time.time() - t0:.0f}s — {len(rows)} cutouts, {len(flagged)} flagged, {len(failures)} failed")
    for r in flagged:
        print(f"  ⚠ {r['id']}: {'; '.join(r['flags'])}")
    for f in failures:
        print(f"  ✗ {f['id']}: {f['reason']}")
    print(f"Report: {REPORT.relative_to(ROOT)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
