#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
from io import BytesIO
import base64
import json
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app/src/main/assets/brand-source/miaad-logo-master.webp"
ASSETS = ROOT / "app/src/main/assets/brand"
RES = ROOT / "app/src/main/res"
APPROVED_BLOB_SHA = "cd799f7da786644d0c0bb86e60eda4309c878d4f"
MIN_MASTER_BYTES = 5_000
MIN_MASTER_PX = 384


def load_approved_master():
    if MASTER.exists() and MASTER.stat().st_size >= MIN_MASTER_BYTES:
        return MASTER.read_bytes(), "tracked master"

    url = f"https://api.github.com/repos/basaira/miaad-android/git/blobs/{APPROVED_BLOB_SHA}"
    req = urllib.request.Request(url, headers={"Accept":"application/vnd.github+json","User-Agent":"miaad-brand-builder"})
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = json.load(response)
    data = base64.b64decode(payload["content"])
    if len(data) < MIN_MASTER_BYTES:
        raise RuntimeError("Approved MIAAD blob retrieved but is unexpectedly small")
    MASTER.parent.mkdir(parents=True, exist_ok=True)
    MASTER.write_bytes(data)
    return data, "immutable GitHub blob"


data, source = load_approved_master()
master = Image.open(BytesIO(data)).convert("RGB")
if master.width < MIN_MASTER_PX or master.height < MIN_MASTER_PX:
    raise SystemExit(f"Master logo resolution is too small: {master.size}")

ASSETS.mkdir(parents=True, exist_ok=True)
master.save(ASSETS / "miaad-logo.webp", "WEBP", quality=92, method=6)
master.save(ASSETS / "miaad-logo-final.png", "PNG", optimize=True)

nodpi = RES / "drawable-nodpi"
nodpi.mkdir(parents=True, exist_ok=True)
master.save(nodpi / "miaad_logo.webp", "WEBP", quality=92, method=6)

fg = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
inner = master.resize((338, 338), Image.Resampling.LANCZOS).convert("RGBA")
fg.alpha_composite(inner, ((432 - 338) // 2, (432 - 338) // 2))
fg.save(nodpi / "ic_launcher_foreground.webp", "WEBP", quality=94, method=6)

sizes = {"mdpi":48,"hdpi":72,"xhdpi":96,"xxhdpi":144,"xxxhdpi":192}
for density, size in sizes.items():
    folder = RES / f"mipmap-{density}"
    if folder.exists(): shutil.rmtree(folder)
    folder.mkdir(parents=True)
    master.resize((size,size), Image.Resampling.LANCZOS).save(folder / "ic_launcher.png", "PNG", optimize=True)
    canvas = Image.new("RGBA", (size,size), (0,0,0,0))
    inner_size = max(1, round(size * 0.90))
    round_icon = master.resize((inner_size,inner_size), Image.Resampling.LANCZOS).convert("RGBA")
    canvas.alpha_composite(round_icon, ((size-inner_size)//2,(size-inner_size)//2))
    canvas.save(folder / "ic_launcher_round.png", "PNG", optimize=True)

adaptive = RES / "mipmap-anydpi-v26"
adaptive.mkdir(parents=True, exist_ok=True)
adaptive_xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/miaad_icon_bg" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
'''
(adaptive / "ic_launcher.xml").write_text(adaptive_xml, encoding="utf-8")
(adaptive / "ic_launcher_round.xml").write_text(adaptive_xml, encoding="utf-8")

for obsolete in [RES/"drawable-nodpi/miaad_logo.png", ROOT/"app/src/main/assets/brand/miaad-splash.webp", RES/"drawable-nodpi/miaad_splash.webp"]:
    if obsolete.exists(): obsolete.unlink()

print(f"MIAAD approved branding materialized from {source}: {len(data)} bytes, {master.width}x{master.height}")
