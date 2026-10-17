"""Bake every sprite into src/index.template.html as data URIs → index.html (one self-contained file)."""
import base64, json, os, sys
ART = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(ART)
def uri(path): return 'data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode()
A = {f[:-4]: uri(os.path.join(ART, 'assets', f)) for f in sorted(os.listdir(os.path.join(ART, 'assets'))) if f.endswith('.png')}
A['hallway'] = uri(os.path.join(ART, 'hallway_noclock_native.png'))
tpl = open(os.path.join(ROOT, 'src', 'index.template.html')).read()
tpl = tpl.replace('__MUSIC_STYLES__', open(os.path.join(ROOT, 'src', 'music.css')).read())
tpl = tpl.replace('__MUSIC_SCRIPT__', open(os.path.join(ROOT, 'src', 'music.js')).read())
# onboarding, locker editor, daily quiz and note flows live in their own file, appended after the hallway
tpl += '\n' + open(os.path.join(ROOT, 'src', 'flows.template.html')).read()
page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '</head>\n<body>\n' + tpl.replace('__ASSETS__', json.dumps(A)) + '\n</body>\n</html>\n')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
open(out, 'w').write(page)
print('wrote', out, len(page), 'bytes')
