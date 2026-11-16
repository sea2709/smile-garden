from PIL import Image, ImageDraw
import os
W,H=200,320
bgs={'day':Image.open('../backgrounds/midday.png').convert('RGBA'),'night':Image.open('../backgrounds/night.png').convert('RGBA')}
plant=Image.open('../plants/tomato/stage-3.png').convert('RGBA')
plant=plant.resize((150,int(150*plant.height/plant.width)))
def tile(mode, key, i):
    bg=Image.new('RGBA',(W,H),(236,226,206,255)) if mode=='paper' else None
    base=bgs[key.split('-')[1]].crop((540,330,540+W,330+H)) if mode=='scene' else Image.new('RGBA',(W,H),(236,226,206,255) if 'day' in key else (40,48,72,255))
    base=base.copy(); base.alpha_composite(plant,((W-plant.width)//2, 300-plant.height))
    fx=Image.open(f'{key}/{i:02d}.png'); base.alpha_composite(fx); return base
keys=[f'{n}-{m}-{k}' for n in ['sun','water','fertilizer'] for m in ['day','night'] for k in ['loop','absorb']]
# contact sheet: each row a sequence, frames 0,3,6,9 (loops) / 0,4,8,11 (absorb)
cols=4; sheet=Image.new('RGBA',(150+cols*W, len(keys)*H),(248,240,226,255)); d=ImageDraw.Draw(sheet)
for r,k in enumerate(keys):
    d.text((8,r*H+H//2),k,fill=(80,60,40,255))
    idx=[0,3,6,9] if 'loop' in k else [0,4,8,11]
    for c,i in enumerate(idx): sheet.paste(tile('plain',k,i),(150+c*W,r*H))
sheet.convert('RGB').save('effects-contact-sheet.png')
# animated gif of loops
gifs=[]
for i in range(24):
    f=Image.new('RGBA',(6*W,H))
    for c,k in enumerate([x for x in keys if 'loop' in x]): f.paste(tile('plain',k,i%12),(c*W,0))
    gifs.append(f.convert('RGB'))
gifs[0].save('effects-loops-preview.gif',save_all=True,append_images=gifs[1:],duration=100,loop=0)
