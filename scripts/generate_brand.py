"""Deterministic Android density packaging of the approved artwork (no redraw)."""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'app/src/main/assets/brand/miaad-logo-final.png'
if len(sys.argv) > 1:
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(sys.argv[1], SOURCE)
with Image.open(SOURCE) as check:
    check.verify()
im = Image.open(SOURCE).convert('RGBA')
assert im.size == (1254, 1254), 'Use the approved full resolution source'
RES = ROOT / 'app/src/main/res'
generated = {}

def save(image, relative, **options):
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, **options)
    generated[relative] = {'size': list(image.size), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}

def scaled(size):
    return im.resize((size, size), Image.Resampling.LANCZOS)

for density, size in {'mdpi':48, 'hdpi':72, 'xhdpi':96, 'xxhdpi':144, 'xxxhdpi':192}.items():
    prefix = f'app/src/main/res/mipmap-{density}'
    save(scaled(size), f'{prefix}/ic_launcher.png', optimize=True)
    # Circle contains the complete approved artwork; a dark perimeter avoids
    # trimming the calligraphic mark with a launcher's circular legacy mask.
    factor = 4
    canvas = Image.new('RGBA', (size*factor, size*factor), '#081F18')
    artwork = scaled(round(size*factor*.90))
    offset = (canvas.width-artwork.width)//2
    canvas.alpha_composite(artwork, (offset, offset))
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, canvas.width-1, canvas.height-1), fill=255)
    canvas.putalpha(mask)
    save(canvas.resize((size,size), Image.Resampling.LANCZOS), f'{prefix}/ic_launcher_round.png', optimize=True)
    # Foreground's 108 dp canvas puts artwork at 72 dp. The actual calligraphy
    # lies within the 66 dp safe circle; outer emerald artwork is expendable.
    extent = round(size*108/48)
    foreground = Image.new('RGBA', (extent,extent))
    artwork = scaled(round(extent*2/3))
    offset = (extent-artwork.width)//2
    foreground.alpha_composite(artwork, (offset,offset))
    save(foreground, f'{prefix}/ic_launcher_foreground.png', optimize=True)

save(scaled(256), 'app/src/main/assets/brand/miaad-logo.webp', quality=94, method=6)
save(scaled(640), 'app/src/main/res/drawable-nodpi/miaad_logo.png', optimize=True)
# Android 12: 288 dp image, with the approved mark inside the 192 dp circle.
system_icon = Image.new('RGBA', (864,864))
system_icon.alpha_composite(scaled(576), (144,144))
save(system_icon, 'app/src/main/res/drawable-xxxhdpi/miaad_splash_icon.png', optimize=True)
generated['app/src/main/assets/brand/miaad-logo-final.png'] = {'size':list(im.size), 'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest()}
manifest = {'source':'User approved image, Sep 7 2026 18:14:51', 'assets':generated}
(ROOT/'scripts/brand-assets.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print(f'Generated and indexed {len(generated)} real brand assets.')
