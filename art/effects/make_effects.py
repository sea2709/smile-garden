# Procedural watercolor-style effects for Smile Garden. Re-run to regenerate.
import math, random, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 200, 320          # one bed wide; tall enough for light/water from above
S = 2                    # supersample
SOIL_Y = 282             # centre of the soil mound line
N = 12

PAL = {
 'day':   dict(sun=(255,214,120), sun2=(255,240,190), water=(110,170,215), water2=(200,230,250),
               damp=(92,60,34), fert=[(214,170,70),(150,180,80),(235,200,110)], spark=(255,236,160)),
 'night': dict(sun=(170,195,240), sun2=(225,235,255), water=(150,190,240), water2=(215,235,255),
               damp=(25,28,45), fert=[(180,170,120),(120,160,140),(200,200,170)], spark=(215,230,255)),
}

rng = np.random.default_rng(7)
def noise(scale, seed):
    r = np.random.default_rng(seed)
    small = r.random((H*S//scale+2, W*S//scale+2))
    im = Image.fromarray((small*255).astype('uint8')).resize((W*S, H*S), Image.BICUBIC)
    return np.asarray(im).astype(float)/255
PAPER = 0.55 + 0.45*(0.6*noise(24,1)+0.4*noise(6,2))   # watercolor pigment unevenness
GRAIN = 0.85 + 0.15*noise(2,3)

def wash(layer_rgba, blur=3, edge=0.35, darken=0.5):
    """Turn a hard-drawn RGBA layer into a soft watercolor wash with pooled edges."""
    a = np.asarray(layer_rgba.split()[3]).astype(float)/255
    soft = np.asarray(Image.fromarray((a*255).astype('uint8')).filter(ImageFilter.GaussianBlur(blur*S))).astype(float)/255
    edges = np.clip(soft - np.asarray(Image.fromarray((soft*255).astype('uint8')).filter(ImageFilter.GaussianBlur(blur*S*1.6))).astype(float)/255, 0, 1)
    alpha = np.clip(soft*PAPER*GRAIN + edges*edge*2.2, 0, 1)
    rgb = np.asarray(layer_rgba.convert('RGB').filter(ImageFilter.GaussianBlur(blur*S*1.5))).astype(float)
    # pooled edges slightly darker
    rgb = rgb*(1-edges[...,None]*darken)
    out = np.dstack([np.clip(rgb,0,255), alpha*255]).astype('uint8')
    return Image.fromarray(out, 'RGBA')

def new(): return Image.new('RGBA', (W*S, H*S), (0,0,0,0))
def finish(im): return im.resize((W, H), Image.LANCZOS)

def over(a, b): return Image.alpha_composite(a, b)

def sparkle(d, x, y, r, col, a):
    x*=S; y*=S; r*=S
    c = col+(int(255*a),)
    d.polygon([(x,y-r),(x+r*0.22,y-r*0.22),(x+r,y),(x+r*0.22,y+r*0.22),(x,y+r),(x-r*0.22,y+r*0.22),(x-r,y),(x-r*0.22,y-r*0.22)], fill=c)

def ell(d, cx, cy, rx, ry, col, a):
    d.ellipse([(cx-rx)*S,(cy-ry)*S,(cx+rx)*S,(cy+ry)*S], fill=col+(int(255*max(0,min(1,a))),))

# ---------------- SUN ----------------
def sun_frame(t, mode, absorb=None):
    p = PAL[mode]; base = new(); d = ImageDraw.Draw(base)
    k = 0.5+0.5*math.sin(2*math.pi*t)            # gentle pulse 0..1
    amp = 1.0
    if absorb is not None:                         # one-shot: swell then fade
        amp = math.sin(math.pi*min(1, absorb*1.15))**0.8
        k = amp
    # light shafts from upper-left
    for i,(x0,wd) in enumerate([(30,26),(70,34),(112,22),(146,30)]):
        ph = 0.5+0.5*math.sin(2*math.pi*(t+i*0.23))
        a = (0.16+0.12*ph)*amp*(1.3 if absorb is not None else 1)
        d.polygon([((x0-20)*S,0),((x0-20+wd)*S,0),((x0+wd*1.6+30)*S,SOIL_Y*S),((x0+20)*S,SOIL_Y*S)], fill=(p['sun'] if mode=='day' else p['sun2'])+(int(255*a*1.15),))
    lay = wash(base, blur=6, edge=0.05, darken=0)
    # warm glow pooled on the soil + halo
    g = new(); gd = ImageDraw.Draw(g)
    ell(gd, W/2, SOIL_Y-6, 88, 26, p['sun'], (0.35+0.25*k)*amp)
    ell(gd, W/2, SOIL_Y-70, 70, 90, p['sun2'], (0.10+0.10*k)*amp)
    lay = over(lay, wash(g, blur=8, edge=0.05, darken=0))
    # motes drifting slowly upward (leaf-lift feel), seamless
    m = new(); md = ImageDraw.Draw(m); r = random.Random(11)
    for j in range(16):
        x = r.uniform(18, W-18); ph = (r.random()+t) % 1
        if absorb is not None: ph = (r.random()*0.3 + absorb*0.9) % 1.2
        y = SOIL_Y-10 - ph*200
        a = math.sin(math.pi*min(1,ph))*0.9*amp
        ell(md, x+6*math.sin(2*math.pi*(ph+j*.1)), y, 1.8, 1.8, p['sun2'], a)
    for j in range(4):
        ph = (j/4 + t) % 1
        sparkle(md, 40+j*40, SOIL_Y-40-60*((j*37)%5)/5, 4+3*math.sin(math.pi*ph), p['spark'], math.sin(math.pi*ph)*amp)
    m = m.filter(ImageFilter.GaussianBlur(0.6*S))
    return finish(over(lay, m))

# ---------------- WATER ----------------
def water_frame(t, mode, absorb=None):
    p = PAL[mode]
    wet = 1.0 if absorb is None else min(1, absorb*1.6)       # damp patch grows in one-shot
    fall = 1.0 if absorb is None else max(0, 1-absorb*1.4)    # pour stops in one-shot
    # damp patch
    g = new(); gd = ImageDraw.Draw(g)
    ell(gd, W/2, SOIL_Y, 26+40*wet, 5+9*wet, p['damp'], 0.6*wet)
    ell(gd, W/2-10, SOIL_Y+2, 16+24*wet, 4+5*wet, p['damp'], 0.4*wet)
    lay = wash(g, blur=4, edge=0.5)
    # falling drops / soft stream
    dr = new(); dd = ImageDraw.Draw(dr); r = random.Random(5)
    for j in range(22):
        x = r.uniform(40, W-40); ph = (r.random()+t*2) % 1   # x2 speed, still loops at t=1
        y = -10 + ph*(SOIL_Y-6+10)
        a = 0.75*fall*min(1, ph*4)
        L = 9+r.random()*6
        dd.line([(x*S,(y-L)*S),(x*S,y*S)], fill=p['water']+(int(255*a*0.5),), width=int(2*S))
        ell(dd, x, y, 2.6, 3.6, p['water'], a)
        ell(dd, x-0.8, y-1.2, 0.9, 1.2, p['water2'], a)
    lay = over(lay, wash(dr, blur=1.2, edge=0.6))
    # ripples + shimmer on the soil
    s = new(); sd = ImageDraw.Draw(s)
    for j in range(5):
        ph = (j/5 + t) % 1
        if absorb is not None: ph = min(1,(absorb*1.3 + j*0.08)) 
        cx = W/2 + (j-2)*26; rx = 4+16*ph
        a = (1-ph)*0.8*(fall if absorb is not None else 1) + (0.0)
        sd.ellipse([(cx-rx)*S,(SOIL_Y-2-rx*0.25)*S,(cx+rx)*S,(SOIL_Y-2+rx*0.25)*S], outline=p['water2']+(int(255*a),), width=int(1.4*S))
    for j in range(4):
        ph = (j/4 + t*1) % 1
        a = math.sin(math.pi*ph)*0.9*wet
        sparkle(sd, W/2-45+j*30, SOIL_Y-4+(j%2)*5, 3+2*math.sin(math.pi*ph), p['water2'], a)
    s = s.filter(ImageFilter.GaussianBlur(0.5*S))
    return finish(over(lay, s))

# ---------------- FERTILIZER ----------------
def fert_frame(t, mode, absorb=None):
    p = PAL[mode]
    glow_a = 0.25 if absorb is None else 0.6*math.sin(math.pi*min(1,absorb*1.2))
    g = new(); gd = ImageDraw.Draw(g)
    ell(gd, W/2, SOIL_Y, 80, 16, p['fert'][0], glow_a)
    lay = wash(g, blur=7, edge=0.2)
    sp = new(); sd = ImageDraw.Draw(sp); r = random.Random(23)
    for j in range(34):
        x = r.uniform(30, W-30); col = r.choice(p['fert']); sz = r.uniform(1.6, 3.2)
        ph = (r.random()+t) % 1
        if absorb is not None: ph = min(1.25, r.random()*0.4 + absorb*1.0)
        y = SOIL_Y-150 + ph*150
        sink = max(0, ph-0.85)/0.4                 # last bit: sink into soil
        a = min(1, ph*5) * max(0, 1-sink*2.5) * 0.9
        x += 5*math.sin(2*math.pi*(ph*1.5 + j*0.17))
        ell(sd, x, min(y, SOIL_Y+4)+sink*4, sz, sz*0.85, col, a)
    lay = over(lay, wash(sp, blur=0.8, edge=0.5))
    k = new(); kd = ImageDraw.Draw(k)
    for j in range(3):
        ph = (j/3 + t) % 1
        if absorb is not None: ph = min(1, max(0, absorb*1.6 - 0.5 - j*0.1))
        sparkle(kd, W/2-36+j*36, SOIL_Y-8-(j%2)*6, 3+4*math.sin(math.pi*ph), p['spark'], math.sin(math.pi*ph))
    k = k.filter(ImageFilter.GaussianBlur(0.5*S))
    return finish(over(lay, k))

FX = {'sun': sun_frame, 'water': water_frame, 'fertilizer': fert_frame}
manifest = {'frame_size': [W, H], 'fps_suggested': 12, 'soil_line_y': SOIL_Y,
            'anchor': 'bottom-centre of frame sits on the centre of the bed soil; plant drawn between bed and effect or effect on top (effect never includes the plant)', 'effects': {}}
for name, fn in FX.items():
    for mode in ['day', 'night']:
        for kind in ['loop', 'absorb']:
            key = f'{name}-{mode}-{kind}'; d = os.path.join(OUT, key); os.makedirs(d, exist_ok=True)
            frames = []
            for i in range(N):
                fr = fn(i/N, mode) if kind == 'loop' else fn(0, mode, absorb=i/(N-1))
                fr.save(os.path.join(d, f'{i:02d}.png')); frames.append(fr)
            strip = Image.new('RGBA', (W*N, H)); [strip.paste(f, (i*W, 0)) for i, f in enumerate(frames)]
            strip.save(os.path.join(OUT, f'{key}-strip.png'))
            manifest['effects'][key] = {'frames': f'{key}/00..{N-1:02d}.png', 'strip': f'{key}-strip.png', 'count': N, 'loop': kind == 'loop'}
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=2)
print('ok')
