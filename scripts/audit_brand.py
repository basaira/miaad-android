"""Fail closed on damaged/incorrect source or APK branding; emit audit evidence."""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile
from PIL import Image
import argparse
import hashlib
import json
import struct
import subprocess
import zlib
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
APPROVED_SHA = '869d95f2c1d896a1dcf8293363ebcf93d0cfdf3e3aabe096129adb851d1e850f'
ANDROID = '{http://schemas.android.com/apk/res/android}'
def sha(data): return hashlib.sha256(data).hexdigest()
def image_info(data, name):
    if name.endswith('.png'):
        assert data[:8] == b'\x89PNG\r\n\x1a\n', f'Invalid PNG signature: {name}'
        cursor = 8
        while cursor < len(data):
            length = struct.unpack_from('>I', data, cursor)[0]
            chunk = data[cursor+4:cursor+8+length]
            crc = struct.unpack_from('>I', data, cursor+8+length)[0]
            assert zlib.crc32(chunk) & 0xffffffff == crc, f'PNG CRC: {name}'
            cursor += length+12
            if chunk[:4] == b'IEND': break
        assert cursor == len(data), f'PNG stream length: {name}'
    with Image.open(BytesIO(data)) as im: im.verify()
    with Image.open(BytesIO(data)) as im:
        im.load()
        return {'dimensions':list(im.size),'bytes':len(data),'sha256':sha(data),'pixels_sha256':sha(im.convert('RGBA').tobytes())}

def source_audit():
    index = json.loads((ROOT/'scripts/brand-assets.json').read_text())['assets']
    info = {}
    for name, expected in index.items():
        data = (ROOT/name).read_bytes()
        actual = image_info(data, name)
        assert actual['sha256'] == expected['sha256'], name
        assert actual['dimensions'] == expected['size'], name
        info[name] = actual
    assert info['app/src/main/assets/brand/miaad-logo-final.png']['sha256'] == APPROVED_SHA
    for folder in ['app/src/main/res','app/src/main/assets']:
        for file in (ROOT/folder).rglob('*'):
            if file.suffix.lower() in ['.png','.webp','.jpg','.jpeg']:
                image_info(file.read_bytes(), file.name)
            assert file.name not in ['placeholder.txt','BRAND-MIGRATION.tmp']
    manifest = ET.parse(ROOT/'app/src/main/AndroidManifest.xml').getroot()
    app = manifest.find('application')
    assert app.get(ANDROID+'icon') == '@mipmap/ic_launcher'
    assert app.get(ANDROID+'roundIcon') == '@mipmap/ic_launcher_round'
    assert app.get(ANDROID+'label') == '@string/app_name'
    strings = {e.get('name'):e.text for e in ET.parse(ROOT/'app/src/main/res/values/strings.xml').getroot()}
    assert strings == {'app_name':'مِيعاد','brand_latin':'MIAAD','brand_tagline':'لكل موعد قيمة'}
    html = (ROOT/'app/src/main/assets/index.html').read_text(encoding='utf-8')
    assert 'src="brand/miaad-logo.webp"' in html
    for asset in ['css-luxury.css','app-luxury.js']: assert asset in html
    for js in (ROOT/'app/src/main/assets').glob('*.js'):
        subprocess.run(['node','--check',str(js)],check=True)
    return info

def apk_audit(apk, output, source):
    from loguru import logger
    logger.disable('androguard')
    from androguard.core.apk import APK
    from androguard.core.axml import AXMLPrinter
    output.mkdir(parents=True,exist_ok=True)
    with ZipFile(apk) as z:
        assert z.testzip() is None, 'ZIP CRC failure'
        names = z.namelist()
        assert len(names) == len(set(names)), 'Duplicate ZIP entry'
        images = {}
        for name in names:
            if name.lower().endswith(('.png','.webp','.jpg','.jpeg')):
                images[name] = image_info(z.read(name),name)
            assert 'placeholder' not in name.lower(), name
        for name, expected in source.items():
            target = name.removeprefix('app/src/main/')
            if target.startswith('res/'):
                directory, filename = target.rsplit('/',1)
                candidates = [n for n in names if n.rsplit('/',1)[-1] == filename and n.rsplit('/',1)[0].removesuffix('-v4') == directory]
                assert len(candidates) == 1, (target,candidates)
                target = candidates[0]
            assert images[target]['dimensions'] == expected['dimensions'], target
            assert images[target]['pixels_sha256'] == expected['pixels_sha256'], f'Wrong artwork: {target}'
        for file in (ROOT/'app/src/main/assets').rglob('*'):
            if file.is_file():
                name = 'assets/'+file.relative_to(ROOT/'app/src/main/assets').as_posix()
                assert z.read(name) == file.read_bytes(), f'Stale APK asset: {name}'
        adaptive = {}
        for name in ['ic_launcher','ic_launcher_round']:
            entry = f'res/mipmap-anydpi-v26/{name}.xml'
            xml = AXMLPrinter(z.read(entry)).get_xml_obj()
            assert xml.tag == 'adaptive-icon'
            assert xml.find('background') is not None and xml.find('foreground') is not None
            adaptive[name] = str(ET.tostring(ET.fromstring(AXMLPrinter(z.read(entry)).get_xml()),encoding='unicode'))
        icon = next(n for n in names if 'mipmap-xxxhdpi' in n and n.endswith('/ic_launcher.png'))
        (output/'apk-launcher-192.png').write_bytes(z.read(icon))
        (output/'apk-approved-logo.png').write_bytes(z.read('assets/brand/miaad-logo-final.png'))

    package = APK(str(apk))
    assert package.is_valid_APK()
    assert package.get_package() == 'com.miaad.app'
    assert package.get_app_name() == 'مِيعاد'
    assert package.get_androidversion_code() == '5'
    manifest = package.get_android_manifest_xml()
    app = manifest.find('application')
    resources = package.get_android_resources()
    def resource_name(value):
        return resources.get_resource_xml_name(int(value.lstrip('@'),16))
    assert resource_name(app.get(ANDROID+'icon')).endswith(':mipmap/ic_launcher')
    assert resource_name(app.get(ANDROID+'roundIcon')).endswith(':mipmap/ic_launcher_round')
    theme = resource_name(app.get(ANDROID+'theme'))
    assert theme.endswith(':style/Theme.Miaad')
    # Compiled resource table must contain the actual splash and Firebase resources.
    strings_xml = resources.get_string_resources('com.miaad.app').decode('utf-8')
    strings = {e.get('name'):e.text for e in ET.fromstring(strings_xml)}
    firebase = json.loads((ROOT/'app/google-services.json').read_text())
    client = next(c for c in firebase['client'] if c['client_info']['android_client_info']['package_name']=='com.miaad.app')
    assert strings['google_app_id'] == client['client_info']['mobilesdk_app_id']
    assert strings['project_id'] == firebase['project_info']['project_id']
    assert strings['google_api_key'] == client['api_key'][0]['current_key']
    dex = b''.join(package.get_all_dex())
    for marker in [b'com/miaad/app/MainActivity',b'com/miaad/app/MiaadBridge',b'com/google/firebase/auth/FirebaseAuth',b'com/google/firebase/firestore/FirebaseFirestore']:
        assert marker in dex, marker
    from lxml import etree
    (output/'AndroidManifest-decoded.xml').write_bytes(etree.tostring(manifest,pretty_print=True,encoding='utf-8'))
    result = {'result':'PASS','apk_sha256':sha(apk.read_bytes()),'apk_bytes':apk.stat().st_size,
              'package':package.get_package(),'app_name':package.get_app_name(),'version':package.get_androidversion_name(),
              'version_code':package.get_androidversion_code(),'icon':resource_name(app.get(ANDROID+'icon')),
              'roundIcon':resource_name(app.get(ANDROID+'roundIcon')),'theme':theme,
              'approved_source_sha256':APPROVED_SHA,'images':images,'adaptive':adaptive,
              'firebase_config_matches':True,'all_web_assets_match_source':True,
              'png_crc_and_full_decode':'PASS','zip_crc':'PASS','signature_present':package.is_signed(),
              'limitations':['Static APK audit; runtime on-device behavior is verified separately, when available.']}
    assert result['signature_present'], 'Unsigned APK'
    (output/'apk-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['images','adaptive']},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--apk',type=Path)
    parser.add_argument('--output',type=Path,default=Path('audit'))
    args=parser.parse_args()
    source=source_audit()
    print(f'Source PASS: {len(source)} approved brand assets; all JavaScript parsed.')
    if args.apk: apk_audit(args.apk,args.output,source)
