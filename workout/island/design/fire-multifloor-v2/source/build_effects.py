"""Original fire suppression sprites and equipment SVGs. Run with Python + Pillow.

No downloaded art or fonts. Each sprite sheet has exactly eight 256-square RGBA
frames. Motion progresses left-to-right; (24, 146) is the spray origin and
(204, 192) is the impact point. Art is game feedback, not safety instruction.
"""
from pathlib import Path
import json
import math
import random
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
FRAME = 256
AA = 3


class Canvas:
    def __init__(self):
        self.im = Image.new('RGBA', (FRAME * AA, FRAME * AA))
        self.d = ImageDraw.Draw(self.im)

    def ellipse(self, box, fill, outline=None, width=1):
        self.d.ellipse(tuple(round(v * AA) for v in box), fill, outline,
                       width=max(1, round(width * AA)))

    def line(self, points, fill, width=1):
        self.d.line([(round(x * AA), round(y * AA)) for x, y in points],
                    fill=fill, width=max(1, round(width * AA)), joint='curve')

    def polygon(self, points, fill):
        self.d.polygon([(round(x * AA), round(y * AA)) for x, y in points], fill=fill)

    def dot(self, x, y, r, fill):
        self.ellipse((x-r, y-r, x+r, y+r), fill)

    def image(self):
        return self.im.resize((FRAME, FRAME), Image.Resampling.LANCZOS)


def curve(a, b, c, segments=30):
    return [((1-t)**2*a[0]+2*(1-t)*t*b[0]+t*t*c[0],
             (1-t)**2*a[1]+2*(1-t)*t*b[1]+t*t*c[1])
            for t in (i / segments for i in range(segments+1))]


def powder(frame):
    c, r = Canvas(), random.Random(271+frame)
    progress = (frame+1)/8
    reach = min(1, progress*1.6)
    # A fine pale jet opens into a drifting, grainy extinguishing cloud.
    for i in range(40+frame*10):
        t = r.random()*reach
        x = 24+190*t
        y = 148-7*t+r.gauss(0, 4+18*t+8*progress)
        rad = (2+6*t)*r.uniform(.55,1.25)
        c.dot(x,y,rad,(222,211,181,50+int(100*r.random())))
        if i%3 == 0:
            c.dot(x-.5,y-rad*.2,max(.8,rad*.45),(255,249,226,185))
    if frame >= 3:
        for i in range(21):
            x = 188+r.gauss(0,19)+frame*1.4
            y = 149+r.gauss(0,18)-frame*2.2
            rad = r.uniform(8,17)*(1+frame*.025)
            c.dot(x,y,rad,(241,229,195,70+int(r.random()*45)))
            c.dot(x-rad*.16,y-rad*.25,rad*.65,(255,248,224,65))
    for i in range(12):
        x=80+r.random()*150*reach
        y=165+r.random()*35
        c.dot(x,y,r.uniform(.7,1.7),(253,241,208,185))
    return c.image().filter(ImageFilter.GaussianBlur(.6))


def foam(frame):
    c,r = Canvas(), random.Random(713+frame)
    progress = (frame+1)/8
    reach=min(1,progress*1.7)
    points=curve((24,146),(134,100),(204,184))
    n=max(2,int(reach*(len(points)-1)))
    # Three shaded cores and irregular bubbles distinguish foam from water.
    c.line(points[:n],(188,223,210,145),9)
    c.line([(x,y-1.8) for x,y in points[:n]],(247,253,232,230),6)
    for i in range(38):
        t=r.random()*reach
        idx=min(29,int(t*29))
        x,y=points[idx]
        x+=r.gauss(0,3); y+=r.gauss(0,4)
        rad=r.uniform(1.4,4)
        c.dot(x,y,rad,(190,222,202,210))
        c.dot(x-rad*.18,y-rad*.23,rad*.64,(254,255,239,246))
    if frame>=3:
        growth=(frame-2)/5
        c.ellipse((164-22*growth,185-7*growth,231,202+5*growth),(170,209,189,225))
        for i in range(45):
            x=188+r.gauss(0,18)*growth
            y=191+r.gauss(0,4.5)*growth
            rad=r.uniform(2,6.5)
            c.dot(x,y,rad,(226,242,217,242))
            c.dot(x-rad*.18,y-rad*.23,rad*.6,(255,255,243,250))
    return c.image()


def water(frame):
    c,r=Canvas(),random.Random(948+frame)
    reach=min(1,(frame+1)/5)
    points=curve((24,146),(150,61),(208,188),40)
    n=max(2,int(reach*40))
    c.line(points[:n],(30,114,202,120),8)
    c.line(points[:n],(87,192,244,220),4.7)
    c.line([(x,y-1) for x,y in points[:n]],(217,250,255,245),1.8)
    # Small offset filaments preserve a forceful hose-jet silhouette.
    c.line([(x,y+5+1.5*math.sin(i)) for i,(x,y) in enumerate(points[5:n])],
           (102,211,255,160),1.2)
    for i in range(12):
        t=r.random()*reach
        x,y=points[min(39,int(t*39))]
        y+=r.uniform(4,20)
        c.line([(x-1,y-3),(x+1,y+2)],(149,226,255,220),1.5)
    if frame>=3:
        spread=13+(frame-3)*3
        for i in range(12):
            ang=r.uniform(.1,math.pi-.1)
            speed=r.uniform(.35,1)
            x=208+math.cos(ang)*spread*speed
            y=188-math.sin(ang)*spread*speed
            c.line([(208+(x-208)*.25,188+(y-188)*.25),(x,y)],(112,213,255,200),1.8)
            c.dot(x,y,r.uniform(1.2,2.3),(210,248,255,240))
        c.ellipse((176,190,239,202),(34,128,207,65),(100,210,255,175),1.2)
        c.ellipse((188,193,227,199),None,(213,250,255,200),1)
    return c.image()


def blanket(frame):
    c=Canvas()
    t=frame/7
    # The folded cloth opens into a broad draped sheet, then settles over a
    # source. No flame icon underneath: the sprite can overlay a real fire.
    width=18+156*min(1,t*1.6)
    center=81+49*t
    top=99-27*math.sin(t*math.pi)
    bottom=top+35+76*t
    left=center-width/2;right=center+width/2
    sag=6+14*t
    points=[(left,top+8),(center-10,top),(right,top+5),
            (right+8*t,bottom-4),(center+12,bottom+sag),
            (left-5*t,bottom+2)]
    # A soft occlusion ellipse beneath the settled cloth adds legibility.
    c.ellipse((left-8,bottom-3,right+12,bottom+sag+9),(57,59,63,40))
    c.polygon(points,(242,233,207,250))
    c.polygon([(left,top+8),(center-10,top),(center+12,bottom+sag),
               (left-5*t,bottom+2)],(251,245,225,252))
    c.polygon([(center-10,top),(center+18,top+2),(center+42,bottom+9),
               (center+12,bottom+sag)],(210,208,190,190))
    c.line(points+[points[0]],(235,124,43,255),3)
    for k in range(1,5):
        x=left+(right-left)*k/5
        c.line([(x,top+5),(x+9*t,bottom+(sag if k>=2 else 1))],
               (175,176,166,105),1)
        c.line([(x+2,top+6),(x+11*t,bottom+(sag if k>=2 else 1)-2)],
               (255,255,241,150),1)
    # Pull tabs travel with the opening front corners.
    c.line([(left,top+8),(left-7,top-2)],(55,61,66,255),4)
    c.line([(right,top+5),(right+7,top-5)],(55,61,66,255),4)
    return c.image()


def write_sheets():
    target=ROOT/'effects';target.mkdir(parents=True,exist_ok=True)
    for name,paint in [('powder',powder),('foam',foam),('water',water),('blanket',blanket)]:
        sheet=Image.new('RGBA',(FRAME*8,FRAME))
        for f in range(8): sheet.paste(paint(f),(f*FRAME,0))
        path=target/f'{name}.png';sheet.save(path,optimize=True)
        metadata={
            'image':f'effects/{name}.png','frameCount':8,'frames':8,
            'width':FRAME*8,'height':FRAME,'frameWidth':FRAME,'frameHeight':FRAME,
            'columns':8,'rows':1,'fps':12,'durationSeconds':8/12,
            'loop':name!='blanket','alpha':'straight','origin':'top-left',
            'frameRects':[{'x':f*FRAME,'y':0,'w':FRAME,'h':FRAME} for f in range(8)],
            'anchor':{'x':24/FRAME,'y':146/FRAME} if name!='blanket' else {'x':.5,'y':.8},
            'blendMode':'normal','license':'CC0-1.0',
            'description':{
                'powder':'Pale granular powder stream with expanding suspended dust cloud.',
                'foam':'Creamy bubbly foam jet with accumulating surface coating.',
                'water':'Blue curved continuous jet with droplets and radial impact splash.',
                'blanket':'Ivory fire blanket opening and draping over a source.'
            }[name]
        }
        (target/f'{name}.json').write_text(json.dumps(metadata,indent=2)+'\n')


def svg(contents):
    # 128-unit artwork also remains legible at 32 pixels; no external font.
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
<defs><linearGradient id="red" x1="35" y1="35" x2="90" y2="110" gradientUnits="userSpaceOnUse"><stop stop-color="#ff675d"/><stop offset="1" stop-color="#b62232"/></linearGradient><linearGradient id="metal" x1="34" y1="28" x2="92" y2="100" gradientUnits="userSpaceOnUse"><stop stop-color="#e1ebec"/><stop offset="1" stop-color="#6b8992"/></linearGradient></defs>
'''+contents+'\n</svg>\n'


def write_icons():
    target=ROOT/'icons';target.mkdir(parents=True,exist_ok=True)
    for name,label,color in [('extinguisher-powder','Powder extinguisher','#5cb9e8'),('extinguisher-foam','Foam extinguisher','#f4efd8')]:
        shape=f'''<title>{label}</title>
<path d="M77 30C101 30 105 39 103 61L100 84" stroke="#263a43" stroke-width="7" stroke-linecap="round"/>
<path d="M100 79l-5 18 9 2 3-19" fill="#263a43"/>
<path d="M57 20h14v19H57z" fill="url(#metal)" stroke="#263a43" stroke-width="2.5"/>
<path d="M51 18h30l4 7H55z" fill="#263a43"/>
<path d="M57 27H42" stroke="#263a43" stroke-width="5" stroke-linecap="round"/>
<circle cx="47" cy="28" r="5" stroke="#f2c84c" stroke-width="2.8"/>
<rect x="38" y="36" width="52" height="77" rx="21" fill="url(#red)" stroke="#263a43" stroke-width="3"/>
<path d="M47 57v32" stroke="#ffac9c" stroke-width="5" stroke-linecap="round"/>
<path d="M40 68h48v25H40z" fill="{color}"/>
<path d="M56 78h17M56 84h13" stroke="#263a43" stroke-width="3" stroke-linecap="round"/>
<circle cx="75" cy="42" r="9" fill="#e8eeee" stroke="#263a43" stroke-width="2.5"/>
<path d="M70 44a5 5 0 0 1 9-5" stroke="#5caa89" stroke-width="2"/>
<path d="m75 42 2-4" stroke="#263a43" stroke-width="2"/>
<path d="M47 113h34" stroke="#263a43" stroke-width="5" stroke-linecap="round"/>'''
        (target/f'{name}.svg').write_text(svg(shape))
    (target/'wall-hose.svg').write_text(svg('''<title>Wall hose reel</title>
<rect x="16" y="15" width="96" height="100" rx="8" fill="#b62232" stroke="#263a43" stroke-width="3"/>
<rect x="23" y="23" width="82" height="84" rx="4" fill="#e04444"/>
<circle cx="64" cy="61" r="31" fill="#f4efd8" stroke="#263a43" stroke-width="3"/>
<circle cx="64" cy="61" r="23" stroke="#bdbaa3" stroke-width="5"/>
<circle cx="64" cy="61" r="15" stroke="#bdbaa3" stroke-width="5"/>
<circle cx="64" cy="61" r="7" fill="url(#red)" stroke="#263a43" stroke-width="2"/>
<path d="M90 72c11 25-19 30-39 27" stroke="#f4efd8" stroke-width="6" stroke-linecap="round"/>
<path d="m45 96-14-3-2 8 15 1" fill="url(#metal)" stroke="#263a43" stroke-width="2"/>
<path d="M104 46v13" stroke="#f4efd8" stroke-width="3" stroke-linecap="round"/>'''))
    (target/'hydrant.svg').write_text(svg('''<title>Fire hydrant</title>
<path d="M50 24v-9h28v9" fill="url(#metal)" stroke="#263a43" stroke-width="3"/>
<path d="M43 45a21 21 0 0 1 42 0v59H43z" fill="url(#red)" stroke="#263a43" stroke-width="3"/>
<path d="M39 45h50v10H39z" fill="#c52e38" stroke="#263a43" stroke-width="2.5"/>
<path d="M23 60h20v21H23zM85 60h20v21H85z" fill="url(#red)" stroke="#263a43" stroke-width="3"/>
<path d="M17 56h11v29H17zM100 56h11v29h-11z" fill="url(#metal)" stroke="#263a43" stroke-width="2.5"/>
<circle cx="64" cy="71" r="14" fill="#f04a48" stroke="#263a43" stroke-width="3"/>
<path d="m64 63 7 4v8l-7 4-7-4v-8z" fill="url(#metal)" stroke="#263a43" stroke-width="2"/>
<path d="M47 83c-16 16-27 5-25-1M81 83c15 16 26 5 25-1" stroke="#7c9399" stroke-width="2.5" stroke-dasharray="3 3"/>
<path d="M36 104h56v11H36z" fill="url(#red)" stroke="#263a43" stroke-width="3"/>
<path d="M51 34c4-5 9-7 14-7" stroke="#ffad97" stroke-width="4" stroke-linecap="round"/>'''))
    (target/'fire-blanket.svg').write_text(svg('''<title>Fire blanket</title>
<rect x="15" y="15" width="52" height="65" rx="6" fill="url(#red)" stroke="#263a43" stroke-width="3"/>
<path d="M25 72v20M56 72v20" stroke="#263a43" stroke-width="5" stroke-linecap="round"/>
<rect x="25" y="30" width="32" height="23" rx="2" fill="#f4efd8"/>
<path d="M32 37h18M32 44h14" stroke="#b62232" stroke-width="3" stroke-linecap="round"/>
<path d="m52 43 53 3 11 62-59 8-20-50z" fill="#f4efd8" stroke="#263a43" stroke-width="3" stroke-linejoin="round"/>
<path d="m52 43 13 24-8 49M65 67l51 41" stroke="#d7d4bd" stroke-width="4"/>
<path d="m54 49 45 3 9 51-46 7-18-43z" stroke="#e99047" stroke-width="3" stroke-linejoin="round"/>
<path d="m52 43-7-10m60 13 5-12" stroke="#263a43" stroke-width="5" stroke-linecap="round"/>'''))


if __name__=='__main__':
    write_sheets();write_icons()
    print('Built 4 eight-frame RGBA sheets, 4 metadata files, and 5 SVG icons.')
