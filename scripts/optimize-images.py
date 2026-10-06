"""Build web-sized WebP derivatives of the product images (idempotent).

  public/products/<id>/<n>.jpg      -> <n>.webp (1024 px, q80) + <n>.s.webp (512 px)
  public/products/<id>/cutout.png   -> cutout.webp (1024 px, q82, alpha) + cutout.s.webp (512 px)

Originals are left untouched. Run: .venv/Scripts/python scripts/optimize-images.py [--force]

--pbr instead converts the CC0 PBR library (tools/textures-src/<name>/{color,normal,roughness}.jpg,
from scripts/fetch-textures.mjs) to public/textures/pbr/<name>/<map>.webp (1024, q82; normal maps q90)
plus <map>.s.webp (512). Used by src/engine/pbr.ts.
"""
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "products"
FORCE = "--force" in sys.argv
# Products whose cut-out failed QA (cutout is null) never use it: skip those files.
_cat = json.loads((ROOT.parent.parent / "src" / "data" / "products.json").read_text(encoding="utf8"))
NO_CUTOUT = {p["id"] for p in _cat["products"] if p["cutout"] is None}
# 122 Mall brand catalogues (scripts/fetch-brands.mjs) likewise.
for _f in (ROOT.parent.parent / "src" / "data" / "brands").glob("*.json"):
    if not _f.name.endswith(".remote.json"):
        NO_CUTOUT |= {p["id"] for p in json.loads(_f.read_text(encoding="utf8"))["products"] if p["cutout"] is None}


def save(src: Path, dst: Path, size: int, quality: int, alpha: bool) -> None:
    if dst.exists() and not FORCE and dst.stat().st_mtime >= src.stat().st_mtime:
        return
    im = Image.open(src)
    im = im.convert("RGBA" if alpha else "RGB")
    scale = min(1.0, size / max(im.size))
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=quality, method=6)


def total(paths) -> int:
    return sum(p.stat().st_size for p in paths)


def pbr() -> None:
    src_root = ROOT.parent.parent / "tools" / "textures-src"
    dst_root = ROOT.parent / "textures" / "pbr"
    if not src_root.is_dir():
        sys.exit(f"{src_root} is missing: run `node scripts/fetch-textures.mjs` first")
    names = sorted(d for d in src_root.iterdir() if d.is_dir())
    for d in names:
        out = dst_root / d.name
        out.mkdir(parents=True, exist_ok=True)
        for m in ("color", "normal", "roughness"):
            src = d / f"{m}.jpg"
            if not src.exists():
                print(f"  {d.name}: no {m} map")
                continue
            q = 90 if m == "normal" else 82
            save(src, out / f"{m}.webp", 1024, q, False)
            save(src, out / f"{m}.s.webp", 512, q, False)
    webps = sorted(dst_root.glob("*/*.webp"))
    print(f"pbr: {len(names)} names, {len(webps)} webp files, {total(webps) / 1e6:.2f} MB")
    print(f"  large: {total([w for w in webps if not w.name.endswith('.s.webp')]) / 1e6:.2f} MB")
    print(f"  small: {total([w for w in webps if w.name.endswith('.s.webp')]) / 1e6:.2f} MB")
    for d in names:
        files = sorted((dst_root / d.name).glob("*.webp"))
        print(f"  {d.name}: " + ", ".join(f"{f.name} {f.stat().st_size // 1024} KB" for f in files))


if "--pbr" in sys.argv:
    pbr()
    sys.exit(0)

sources = sorted(list(ROOT.glob("*/*.jpg")) + list(ROOT.glob("*/cutout.png")))
for src in sources:
    cut = src.name == "cutout.png"
    if cut and src.parent.name in NO_CUTOUT:
        continue
    q = 82 if cut else 80
    base = src.with_suffix("")
    save(src, base.with_suffix(".webp"), 1024, q, cut)
    save(src, base.with_name(base.name + ".s.webp"), 512, q, cut)

webps = sorted(w for w in ROOT.glob("*/*.webp") if not (w.name.startswith("cutout") and w.parent.name in NO_CUTOUT))
print(f"sources: {len(sources)} files, {total(sources) / 1e6:.1f} MB")
print(f"webp:    {len(webps)} files, {total(webps) / 1e6:.1f} MB")
print(f"  large: {total([w for w in webps if not w.name.endswith('.s.webp')]) / 1e6:.1f} MB")
print(f"  small: {total([w for w in webps if w.name.endswith('.s.webp')]) / 1e6:.1f} MB")
