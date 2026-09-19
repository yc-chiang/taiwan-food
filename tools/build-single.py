#!/usr/bin/env python3
"""
把整個網頁打包成單一 HTML —— 所有模組、圖片與音樂都內嵌，
下載後用 Chrome 點兩下就能開，不需要伺服器。

    python3 tools/build-single.py [輸出路徑]

需要 npx（會自動取用 esbuild）。assets/foods/ 底下已存在的舞台圖會一併內嵌，
所以之後補完圖再跑一次，單檔版就會跟著更新。
"""
import base64, mimetypes, pathlib, re, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist' / 'taiwan-food-single.html'

html = (ROOT / 'index.html').read_text()
m = re.search(r'<script type="module">(.*?)</script>', html, re.S)
if not m:
    sys.exit('index.html 裡找不到 <script type="module">')

with tempfile.TemporaryDirectory() as tmp:
    entry = ROOT / '__build_entry.js'
    entry.write_text(m.group(1))
    try:
        bundle = pathlib.Path(tmp) / 'b.js'
        subprocess.run(['npx', '--yes', 'esbuild@0.24', str(entry), '--bundle',
                        '--format=iife', f'--outfile={bundle}'], check=True, cwd=ROOT)
        js = bundle.read_text()
    finally:
        entry.unlink(missing_ok=True)

shell = html[:m.start()] + '<!--BUNDLE-->' + html[m.end():]

def data_uri(rel):
    p = ROOT / rel
    mime = mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()

# HTML 裡直接引用的圖片
for rel in ['assets/esophagus.jpg', 'assets/stomach.jpg']:
    shell = shell.replace(f'src="{rel}"', f'src="{data_uri(rel)}"')

# 背景音樂：JS 裡是 new Audio('./assets/bgm.mp3')
before = js
for q in ('"./assets/bgm.mp3"', "'./assets/bgm.mp3'"):
    js = js.replace(f'new Audio({q})', 'new Audio(__BGM__)')
if js == before:
    sys.exit('找不到背景音樂的引用，請確認 index.html 沒有改掉寫法')
js = f'const __BGM__ = "{data_uri("assets/bgm.mp3")}";\n' + js

# 已經畫好的食物舞台圖，逐一內嵌；還沒畫的會自動退回粒子渲染。
# 單檔版沒有外部檔案可讀，所以改成直接查這張表 —— 查不到就回 null，
# 不去發那個注定失敗的請求（否則每次比對都會在主控台留一筆 404）。
stages = sorted((ROOT / 'assets' / 'foods').glob('*.jpg'))
pairs = ',\n'.join(f'  "assets/foods/{p.name}": "{data_uri("assets/foods/" + p.name)}"' for p in stages)
js = 'const __STAGES__ = {' + ('\n' + pairs + '\n' if pairs else '') + '};\n' + js
js = js.replace('if (!food.stage) return Promise.resolve(null);',
                'if (!food.stage) return Promise.resolve(null);\n'
                '  return Promise.resolve(__STAGES__[food.stage] ?? null);')

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(shell.replace('<!--BUNDLE-->', '<script>\n' + js + '\n</script>'))
size = OUT.stat().st_size / 1024 / 1024
print(f'完成：{OUT}  ({size:.2f} MB，內嵌 {len(stages)} 張舞台圖)')
