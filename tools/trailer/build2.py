import subprocess, os, math, random, glob, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw, ImageFont
W,H,FPS,T=1920,1080,30,0.6
FB='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'; FR='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
os.makedirs('seg',exist_ok=True); os.makedirs('cap',exist_ok=True)
def F(p,s): return ImageFont.truetype(p,s)
def run(*a): subprocess.run(['ffmpeg','-y','-loglevel','error',*a],check=True)

# ---------- animated cards (falling cubes) ----------
def card(name,dur,lines,seed=1):
    rnd=random.Random(seed); n=int(dur*FPS)
    cubes=[[rnd.uniform(0,W),rnd.uniform(-H,H),rnd.uniform(30,110),rnd.uniform(40,160),rnd.choice([(255,200,90),(90,200,255),(255,110,140),(140,230,130),(190,140,255)])] for _ in range(34)]
    yy=np.linspace(0,1,H)[:,None,None]; c1=np.array((16,20,52)); c2=np.array((92,40,140))
    bg=(c1*(1-yy)+c2*yy).repeat(W,1).astype(np.uint8)
    p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',f'seg/{name}.mp4'],stdin=subprocess.PIPE)
    for f in range(n):
        t=f/FPS; im=Image.fromarray(bg); ov=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(ov)
        for x,y0,s,sp,col in cubes:
            y=((y0+sp*t+H)%(H+300))-150; a=int(70+40*math.sin(t+x))
            d.rectangle([x,y,x+s,y+s],fill=col+(a,)); d.rectangle([x,y,x+s,y+s*0.18],fill=(255,255,255,a//2))
        im=Image.alpha_composite(im.convert('RGBA'),ov); d=ImageDraw.Draw(im)
        total=sum(sz+34 for _,sz,_,_ in lines); y=H/2-total/2
        for i,(txt,sz,col,delay) in enumerate(lines):
            u=min(max((t-delay)/0.7,0),1); e=1-(1-u)**3
            fs=int(sz*(0.82+0.18*e)); fo=F(FB,fs); w=d.textlength(txt,font=fo)
            lay=Image.new('RGBA',(W,H),(0,0,0,0)); ld=ImageDraw.Draw(lay)
            ld.text(((W-w)/2,y+(1-e)*40),txt,font=fo,fill=col+(int(255*e),))
            im=Image.alpha_composite(im,lay); d=ImageDraw.Draw(im); y+=sz+34
        p.stdin.write(np.asarray(im.convert('RGB')).tobytes())
    p.stdin.close(); p.wait()

# ---------- lower-third captions ----------
def caption(i,title,sub):
    w=1250; h=170; im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle([0,0,w,h],radius=26,fill=(10,12,30,205)); d.rounded_rectangle([0,0,16,h],radius=8,fill=(255,200,90,255))
    d.text((48,18),title,font=F(FB,60),fill=(255,255,255,255)); d.text((50,102),sub,font=F(FR,34),fill=(200,214,240,255))
    im.save(f'cap/c{i}.png')

def web_clip(name,src,ss,dur,cap,interp=True):
    vf="mpdecimate=hi=64*40:lo=64*20:frac=0.2,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1," if interp else ""
    run('-ss',str(ss),'-t',str(dur),'-i',src,'-i',f'cap/c{cap}.png','-filter_complex',
        f"[0:v]{vf}scale={W}:{H}:flags=lanczos,fps={FPS},format=yuva420p[b];[1:v]format=rgba[c];"
        f"[b][c]overlay=x='-w+(w+70)*(1-pow(1-min(t/0.6,1),3))-max(t-{dur-0.5},0)*(w+70)*2':y={H-230}:format=auto,format=yuv420p",
        '-t',str(dur),'-c:v','libx264','-crf','19',f'seg/{name}.mp4')

def ds_clip(name,folder,dur,cap,label):
    bg=np.linspace(0,1,H)[:,None,None]; c1=np.array((20,24,52)); c2=np.array((70,34,100))
    im=Image.fromarray(((c1*(1-bg)+c2*bg).repeat(W,1)).astype(np.uint8)); d=ImageDraw.Draw(im)
    d.rounded_rectangle([300,24,1620,832],radius=34,fill=(30,34,50),outline=(255,200,90),width=6)
    d.text((960-d.textlength(label,font=F(FB,40))/2,872),label,font=F(FB,40),fill=(255,200,90)) if False else None
    im.save(f'cap/bg_{name}.png')
    run('-framerate','15','-i',f'{folder}/{os.path.basename(folder)}_%03d.png','-i',f'cap/bg_{name}.png','-i',f'cap/c{cap}.png','-filter_complex',
        f"[0:v]minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1280:768:flags=neighbor[v];[1:v][v]overlay=x=320:y=56[a];[a][2:v]overlay=x='-w+(w+70)*(1-pow(1-min(t/0.6,1),3))-max(t-{dur-0.5},0)*(w+70)*2':y={H-230},format=yuv420p",
        '-t',str(dur),'-r',str(FPS),'-c:v','libx264','-crf','19',f'seg/{name}.mp4')

caps=[('A world made of blocks','Explore, build and hang out with friends in real time'),
('Race through obstacle courses','Obbies, arenas, lava runs, mazes and more'),
('Day, sunset and night','Hills, islands, deserts, caves and cities'),
('Build your own games','Studio with Lua scripting, templates and live co-editing'),
('Your friends, always at hand','Friends, chat, clans, meetups and daily missions'),
('Discover community games','Filters, favorites and fresh templates every update'),
('Real 3D worlds on the 3DS','The same worlds as the web, running on your console'),
('Sunset skies, flowers, hills','Pets, trails and avatars that match the web'),
('Adventures after dark','Shop, missions and seasons on both platforms')]
for i,(a,b) in enumerate(caps): caption(i,a,b)

jobs=[]
V='clips/'
ex=ThreadPoolExecutor(max_workers=3)
card_f=[ex.submit(card,'intro',4.5,[('BLOCKSY',200,(255,255,255),0.2),('Play. Build. Create. Together.',58,(255,215,120),1.1)],1),
        ex.submit(card,'ds_card',3.5,[('Now on Nintendo 3DS',110,(255,215,120),0.1),('Same account. Same friends. Same worlds.',52,(255,255,255),0.8)],2),
        ex.submit(card,'outro',6.5,[('BLOCKSY',200,(255,255,255),0.2),('Free  ·  Web + Nintendo 3DS',60,(255,215,120),1.0),('github.com/IkerPlays/BlocksyApp',52,(255,255,255),1.6),('Download the latest build today',40,(200,214,240),2.2)],3)]
futs=[ex.submit(web_clip,'w_hills',V+'hills.mp4',7,6,0),ex.submit(web_clip,'w_obby',V+'obby.mp4',6,6,1),ex.submit(web_clip,'w_islands',V+'islands.mp4',7,6,2),
      ex.submit(web_clip,'w_script',V+'script.mp4',5.5,6,3),ex.submit(web_clip,'w_home',V+'home.mp4',1.5,6,4,False),ex.submit(web_clip,'w_disc',V+'discover.mp4',1.5,6,5,False),
      ex.submit(ds_clip,'d_hills','ds/hills',5,6,''),ex.submit(ds_clip,'d_isl','ds/islands',5,7,''),ex.submit(ds_clip,'d_obby','ds/obby',5,8,'')]
for f in card_f+futs: f.result()

order=[('intro',4.5),('w_hills',6),('w_obby',6),('w_islands',6),('w_script',6),('w_home',6),('w_disc',6),('ds_card',3.5),('d_hills',5),('d_isl',5),('d_obby',5),('outro',6.5)]
inp=[];fc='';off=0;prev='[0:v]'
for n,_ in order: inp+=['-i',f'seg/{n}.mp4']
for i in range(1,len(order)):
    off+=order[i-1][1]-T; out=f'[v{i}]'
    fc+=f"{prev}[{i}:v]xfade=transition=fade:duration={T}:offset={off}{out};"; prev=out
total=off+order[-1][1]
run(*inp,'-i','/home/user/BlocksyApp/web/public/playlist/justchilling.mp3','-filter_complex',fc+f"[{len(order)}:a]afade=t=in:d=1.5,afade=t=out:st={total-3}:d=3,atrim=0:{total}[a]",
    '-map',prev,'-map','[a]','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',str(total),'blocksy_trailer_en.mp4')
print('ok',total)
