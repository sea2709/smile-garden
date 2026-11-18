# Builds the compact tending strip art from the painted needs card (same paper, same stitching).
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np, json, os
ART='/workspace/smile-garden-art/export/assets/ui'
OUT=ART+'/tend'; os.makedirs(OUT,exist_ok=True)
S=64          # slice, 2x px (32 CSS px)
TW,TH=70,68   # edge tiles = 4 stitch periods
def card(n): return Image.open(f'{ART}/tag/needs-card{n}.png').convert('RGBA')
def nine(c):
    out=Image.new('RGBA',(2*S+TW,2*S+TH),(0,0,0,0))
    R=720-S; T=64; B=560-S
    pieces=[((0,T,S,T+S),(0,0)),((R,T,720,T+S),(S+TW,0)),((0,B,S,560),(0,S+TH)),((R,B,720,560),(S+TW,S+TH)),
            ((120,T,120+TW,T+S),(S,0)),((120,B,120+TW,560),(S,S+TH)),((0,200,S,200+TH),(0,S)),((R,200,720,200+TH),(S+TW,S)),
            ((300,250,300+TW,250+TH),(S,S))]
    for box,at in pieces: out.paste(c.crop(box),at)
    return out
def bake(c,w,h):
    """Bake a fixed-size strip (2x) with border-image 'round' rules, centre from a real paper patch."""
    out=Image.new('RGBA',(w,h),(0,0,0,0)); R=720-S; T=64; B=560-S
    mw,mh=w-2*S,h-2*S
    out.paste(c.crop((84,200,84+mw,200+mh)),(S,S))
    nx=max(1,round(mw/TW)); tw=mw/nx
    for i in range(nx):
        x0=S+round(i*tw); x1=S+round((i+1)*tw)
        out.paste(c.crop((120,T,120+TW,T+S)).resize((x1-x0,S),Image.LANCZOS),(x0,0))
        out.paste(c.crop((120,B,120+TW,560)).resize((x1-x0,S),Image.LANCZOS),(x0,h-S))
    ny=max(1,round(mh/TH)); th=mh/ny
    for i in range(ny):
        y0=S+round(i*th); y1=S+round((i+1)*th)
        out.paste(c.crop((0,200,S,200+TH)).resize((S,y1-y0),Image.LANCZOS),(0,y0))
        out.paste(c.crop((R,200,720,200+TH)).resize((S,y1-y0),Image.LANCZOS),(w-S,y0))
    for box,at in [((0,T,S,T+S),(0,0)),((R,T,720,T+S),(w-S,0)),((0,B,S,560),(0,h-S)),((R,B,720,560),(w-S,h-S))]:
        out.paste(c.crop(box),at)
    return out
def wash_disc(d, rgb, a_in, a_out, seed):
    """soft watercolor disc: radial falloff + paper grain + darker pooled rim"""
    rng=np.random.default_rng(seed); y,x=np.mgrid[0:d,0:d]; r=np.hypot(x-d/2+.5,y-d/2+.5)/(d/2)
    noise=np.array(Image.fromarray((rng.random((d//4,d//4))*255).astype('uint8')).resize((d,d),Image.BICUBIC))/255.
    edge=0.92+0.05*(noise-.5)
    a=np.clip((edge-r)/0.06,0,1)*(a_in+(a_out-a_in)*np.clip(r/edge,0,1)**2)
    a+= np.clip(1-abs(r-edge*0.95)/0.05,0,1)*0.18*a_out   # pooled rim
    a*= 0.9+0.2*noise
    img=np.zeros((d,d,4),'uint8'); img[...,:3]=rgb; img[...,3]=np.clip(a*255,0,255)
    return Image.fromarray(img).filter(ImageFilter.GaussianBlur(0.6))
def glow(d,rgb,peak,seed):
    rng=np.random.default_rng(seed); y,x=np.mgrid[0:d,0:d]; r=np.hypot(x-d/2+.5,y-d/2+.5)/(d/2)
    noise=np.array(Image.fromarray((rng.random((8,8))*255).astype('uint8')).resize((d,d),Image.BICUBIC))/255.
    a=np.clip(1-r,0,1)**1.15*peak*(0.85+0.3*noise)
    img=np.zeros((d,d,4),'uint8'); img[...,:3]=rgb; img[...,3]=np.clip(a*255,0,255); return Image.fromarray(img)
def dashed_divider(c,h):
    col=c.crop((8,200,30,200+TH))   # the card's own left stitching
    out=Image.new('RGBA',(22,h),(0,0,0,0)); y=0
    while y<h: out.paste(col,(0,y)); y+=TH
    # keep only the stitch: mask by darkness vs paper
    A=np.array(out).astype(float); L=A[...,:3].mean(2); paper=np.median(L)
    m=np.clip((paper-L-6)/18,0,1); A[...,3]=m*255
    fade=np.ones(h); f=min(24,h//4); fade[:f]=np.linspace(0,1,f); fade[-f:]=np.linspace(1,0,f); A[...,3]*=fade[:,None]
    return Image.fromarray(A.astype('uint8')).crop((6,0,16,h))

W,H=560,224   # baked strip 2x = 280x112 CSS
for n,sfx in [('',''),('-night','-night')]:
    c=card(n)
    nine(c).save(f'{OUT}/tend-strip-9s{sfx}.png')
    bake(c,W,H).save(f'{OUT}/tend-strip{sfx}.png')
    dashed_divider(c,120).save(f'{OUT}/tend-divider{sfx}.png')
# active glow per care action, shown while the camera sees that action (no red anywhere)
GLOWS={'water':((112,170,212),(206,228,244)),'fertilizer':((204,156,84),(244,226,172)),
       'stake':((136,172,92),(214,234,184)),'harvest':((238,186,84),(252,234,168))}
for i,(k,(day,night)) in enumerate(GLOWS.items()):
    glow(120,day,0.92,10+i).save(f'{OUT}/tend-glow-{k}.png')
    glow(120,night,0.95,20+i).save(f'{OUT}/tend-glow-{k}-night.png')
print(sorted(os.listdir(OUT)))
