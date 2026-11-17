# Preview: insects flying gentle paths over the cleaned dawn backdrop.
import math
from PIL import Image
bg=Image.open('backgrounds/dawn.png').convert('RGBA')
def load(n,k): s=Image.open(f'frames/{n}-strip.png'); w=s.width//k; return [s.crop((i*w,0,(i+1)*w,s.height)) for i in range(k)]
mon,wht,bee=load('butterfly-monarch',8),load('butterfly-white',8),load('bee',4)
N=72; frames=[]
for t in range(N):
    im=bg.copy(); u=t/N*2*math.pi
    for fr,(cx,cy,ax,ay,ph,sc) in [(mon,(500,150,90,30,0,0.55)),(wht,(900,130,70,25,2,0.5))]:
        x=cx+ax*math.sin(u+ph); y=cy+ay*math.sin(2*u+ph)+4*math.sin(t*0.9)
        dx=ax*math.cos(u+ph); dy=2*ay*math.cos(2*u+ph); ang=math.degrees(math.atan2(dx,-dy))
        f=fr[t%8]; f=f.resize((int(f.width*sc),int(f.height*sc)),Image.LANCZOS).rotate(-ang*0.35,expand=True,resample=Image.BICUBIC)
        im.alpha_composite(f,(int(x-f.width/2),int(y-f.height/2)))
    x=1050+60*math.sin(u); y=165+10*math.sin(3*u)
    f=bee[t%4]; f=f.resize((int(f.width*.5),int(f.height*.5)),Image.LANCZOS)
    if math.cos(u)>0: f=f.transpose(Image.FLIP_LEFT_RIGHT)
    im.alpha_composite(f,(int(x-f.width/2),int(y-f.height/2)))
    frames.append(im.convert('RGB').resize((960,540),Image.LANCZOS))
frames[0].save('critters-preview.gif',save_all=True,append_images=frames[1:],duration=83,loop=0)
frames[10].save('critters-preview-still.png')
