import sys, re
from PIL import Image, ImageDraw, ImageFont
import numpy as np
S = 2  # factor de escala
W = {0: (400, 240), 1: (320, 240)}
FONT = None
for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
    try: FONT = p; ImageFont.truetype(p, 10); break
    except Exception: FONT = None
def col(u):
    u = int(u); return (u & 255, (u >> 8) & 255, (u >> 16) & 255, (u >> 24) & 255)
def blend(img, ov): img.alpha_composite(ov)
scenes = {}
cur = None; imgs = None
lines = open('preview/ops.txt').read().split('\n')
def new_scene(name):
    global imgs
    imgs = {0: Image.new('RGBA', (W[0][0]*S, W[0][1]*S), (0,0,0,255)), 1: Image.new('RGBA', (W[1][0]*S, W[1][1]*S), (0,0,0,255))}
    scenes[name] = imgs
def draw_on(t, fn):
    ov = Image.new('RGBA', imgs[t].size, (0,0,0,0)); d = ImageDraw.Draw(ov, 'RGBA'); fn(d, ov); imgs[t].alpha_composite(ov)
for ln in lines:
    if not ln: continue
    k, _, rest = ln.partition(' ')
    if k == 'SCENE': new_scene(rest); continue
    if k == 'CLEAR':
        t, c = rest.split(); imgs[int(t)].paste(col(c), [0, 0, *imgs[int(t)].size]); continue
    if k == 'RECT':
        t, x, y, w, h, a, b, c, dd = rest.split(); t = int(t); x, y, w, h = [float(v) for v in (x, y, w, h)]
        ca, cb, cc, cd = [np.array(col(v), float) for v in (a, b, c, dd)]
        X0, Y0, X1, Y1 = int(x*S), int(y*S), int((x+w)*S), int((y+h)*S)
        X0, Y0 = max(X0, 0), max(Y0, 0); X1 = min(X1, imgs[t].size[0]); Y1 = min(Y1, imgs[t].size[1])
        if X1 <= X0 or Y1 <= Y0: continue
        u = np.linspace(0, 1, X1-X0)[None, :, None]; v = np.linspace(0, 1, Y1-Y0)[:, None, None]
        top = ca*(1-u)+cb*u; bot = cc*(1-u)+cd*u; px = (top*(1-v)+bot*v).astype(np.uint8)
        ov = Image.new('RGBA', imgs[t].size, (0,0,0,0)); ov.paste(Image.fromarray(px, 'RGBA'), (X0, Y0)); imgs[t].alpha_composite(ov); continue
    if k == 'TRI':
        t, x0, y0, x1, y1, x2, y2, c = rest.split(); t = int(t); pts = [float(v)*S for v in (x0, y0, x1, y1, x2, y2)]
        draw_on(t, lambda d, ov: d.polygon(pts, fill=col(c))); continue
    if k == 'LINE':
        t, x0, y0, x1, y1, th, c = rest.split(); t = int(t); pts = [float(v)*S for v in (x0, y0, x1, y1)]
        draw_on(t, lambda d, ov: d.line(pts, fill=col(c), width=max(1, int(float(th)*S)))); continue
    if k == 'CIR':
        t, x, y, r, c = rest.split(); t = int(t); x, y, r = float(x)*S, float(y)*S, float(r)*S
        draw_on(t, lambda d, ov: d.ellipse([x-r, y-r, x+r, y+r], fill=col(c))); continue
    if k == 'TXT':
        t, x, y, sc, c, txt = rest.split(' ', 5); t = int(t); x, y, sc = float(x), float(y), float(sc)
        n = len(txt); w = max(1, int(n*11.2*sc*S)); h = max(4, int(24*sc*S))
        f = ImageFont.truetype(FONT, max(6, int(h*0.95)))
        im = Image.new('RGBA', (int(f.getlength(txt))+4, int(h*1.4)), (0,0,0,0)); ImageDraw.Draw(im).text((0, 0), txt, font=f, fill=col(c))
        im = im.crop(im.getbbox() or (0, 0, 1, 1)) if False else im
        im = im.resize((w+2, int(h*1.4)), Image.LANCZOS)
        ov = Image.new('RGBA', imgs[t].size, (0,0,0,0)); ov.paste(im, (int(x*S), int((y+2*sc)*S)), im); imgs[t].alpha_composite(ov); continue
out = sys.argv[1] if len(sys.argv) > 1 else 'preview/out'
import os; os.makedirs(out, exist_ok=True)
for name, im in scenes.items():
    a, b = im[0], im[1]
    sheet = Image.new('RGB', (a.size[0] + 40 + b.size[0], 240*S), (60, 60, 70))
    sheet.paste(a.convert('RGB'), (0, 0)); sheet.paste(b.convert('RGB'), (a.size[0] + 40, 0))
    sheet.save(f'{out}/{name}.png')
print(len(scenes), 'escenas')
