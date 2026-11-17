#!/usr/bin/env python3
"""Deterministic, dependency-free authoring of the original City Buildings v2 set.

One metre per cell, +Y up, +Z front, pivot at ground/footprint centre.
No downloaded meshes, fonts, images, compression extensions, or textures.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
PALETTES = {
    "sunrise": {"wall": "f3dfb3", "accent": "da795e", "roof": "587d80", "trim": "fff3d6", "leaf": "719c78"},
    "seabreeze": {"wall": "beded0", "accent": "547fa3", "roof": "b27568", "trim": "fff3d6", "leaf": "638c78"},
}
FIXED = {"stone": "d9cbb1", "sand": "e9dabd", "wood": "a97e58", "dark": "34565e", "glass": "80babd",
         "water": "69bdce", "line": "fff3d6", "gold": "e8b960", "soil": "a98d73", "concrete": "b6bab2"}
SPECS = [
    ("school", "בית ספר", "education", 3, 3, 120, "pencil", "clock tower, classroom wings, pitched roofs"),
    ("hospital", "בית חולים", "civic", 3, 3, 80, "heart", "stepped clinic wings, rooftop services, covered entrance"),
    ("fire-station", "תחנת כיבוי", "civic", 3, 2, 18, "flame", "two garage bays, hose tower, rooftop beacons"),
    ("police-station", "תחנת משטרה", "civic", 2, 2, 20, "radio", "radio mast, corner office, sheltered public entrance"),
    ("library", "ספריה", "culture", 3, 2, 45, "book", "sawtooth reading skylights and recessed bookcase windows"),
    ("museum", "מוזיאון", "culture", 3, 3, 60, "vase", "pediment, four columns and sculpture court"),
    ("grocery", "חנות מכולת", "shops", 2, 2, 18, "basket", "striped awning, produce crates and display window"),
    ("bakery", "מאפייה", "shops", 2, 2, 12, "loaf", "tall oven chimney, gable roof and bread counter"),
    ("patisserie", "קונדיטוריה", "shops", 2, 2, 16, "cupcake", "scalloped canopy, tiered pastry display and corner turret"),
    ("sports-park", "ספורטק", "leisure", 4, 3, 30, "ball", "two-tone court, basketball hoops and bleachers"),
    ("swimming-pool", "בריכה", "leisure", 3, 3, 36, "waves", "recessed lap pool, lanes, ladder and changing cabin"),
    ("playground", "גן שעשועים", "leisure", 3, 3, 24, "slide", "play tower with slide, A-frame swing and sandbox"),
    ("park", "פארק", "leisure", 3, 3, 40, "tree", "crossing paths, faceted trees, fountain and benches"),
    ("train-station", "תחנת רכבת", "transport", 4, 2, 60, "train", "railway tracks, long platform canopy and station clock"),
    ("bus-stop", "תחנת אוטובוס", "transport", 2, 1, 8, "bus", "open glass shelter, bench, timetable post and kerb"),
    ("lighthouse", "מגדלור", "coast", 2, 2, 4, "beam", "tapered striped tower, lantern, gallery and keeper cottage"),
    ("harbor", "נמל", "coast", 4, 3, 32, "anchor", "water basin, timber pier, cargo crane and mooring posts"),
    ("market", "שוק", "shops", 3, 3, 48, "canopy", "three striped market stalls, produce and central walkway"),
    ("cinema", "קולנוע", "culture", 3, 2, 72, "reel", "stepped art-deco facade, marquee and ticket kiosk"),
    ("theatre", "תיאטרון", "culture", 3, 3, 90, "curtains", "fly tower, double-height stage house and columned foyer"),
]


def sub(a, b): return [a[i] - b[i] for i in range(3)]
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def normal(v):
    length = math.sqrt(sum(x*x for x in v))
    return [x/length for x in v] if length > 1e-10 else None


def transform(v, center, rotation):
    x, y, z = v
    a, b, c = rotation
    y, z = y*math.cos(a)-z*math.sin(a), y*math.sin(a)+z*math.cos(a)
    x, z = x*math.cos(b)+z*math.sin(b), -x*math.sin(b)+z*math.cos(b)
    x, y = x*math.cos(c)-y*math.sin(c), x*math.sin(c)+y*math.cos(c)
    return [x+center[0], y+center[1], z+center[2]]


class Model:
    def __init__(self, spec, palette):
        self.spec, self.palette, self.parts = spec, palette, []
        self.w, self.d = spec[3] - .12, spec[4] - .12
        self.sign = [0, .75, self.d/2-.08]
        self.entry = [0, .15, self.d/2]

    def color(self, key): return self.palette.get(key, FIXED.get(key, key))

    def faces(self, name, color, vertices, faces, role="finish", center=(0, 0, 0), rotation=(0, 0, 0)):
        points = [transform(p, center, rotation) for p in vertices]
        self.parts.append({"name": name, "color": self.color(color), "role": role,
                           "faces": [[points[i] for i in f] for f in faces]})

    def box(self, name, c, x, y, z, w, h, d, role="finish", rotation=(0, 0, 0)):
        v = [[a*w/2, b*h/2, e*d/2] for a, b, e in
             [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.faces(name, c, v, [[3,2,1,0],[4,5,6,7],[0,1,5,4],[7,6,2,3],[0,4,7,3],[5,1,2,6]], role, (x,y,z), rotation)

    def prism(self, name, c, polygon, x, y, z, depth, role="finish", rotation=(0,0,0)):
        # Normalize the winding, including the concave pictogram outlines.
        if sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(polygon,polygon[1:]+polygon[:1])) < 0:
            polygon=list(reversed(polygon))
        n = len(polygon)
        v = [[a,b,-depth/2] for a,b in polygon] + [[a,b,depth/2] for a,b in polygon]
        faces = [list(range(n-1,-1,-1)), list(range(n,2*n))]
        faces += [[i,(i+1)%n,(i+1)%n+n,i+n] for i in range(n)]
        self.faces(name,c,v,faces,role,(x,y,z),rotation)

    def roof(self, x, y, z, w, h, d):
        self.prism("pitched-roof", "roof", [(-w/2,0),(w/2,0),(0,h)],x,y,z,d)
        self.box("eaves","trim",x,y-.025,z,w+.04,.06,d+.04)

    def cylinder(self, name, c, x, y, z, radius, height, n=8, top=None, role="finish", rotation=(0,0,0)):
        top = radius if top is None else top
        ring = lambda r,h: [[r*math.cos(i*math.tau/n),h,r*math.sin(i*math.tau/n)] for i in range(n)]
        vertices = ring(radius,-height/2)
        if top == 0:
            vertices += [[0,height/2,0]]
            faces = [list(range(n))] + [[i,n,(i+1)%n] for i in range(n)]
        else:
            vertices += ring(top,height/2)
            faces = [list(range(n)), list(range(2*n-1,n-1,-1))]
            faces += [[i,i+n,(i+1)%n+n,(i+1)%n] for i in range(n)]
        self.faces(name,c,vertices,faces,role,(x,y,z),rotation)

    def beam(self, name, c, a, b, width=.055, depth=None, role="finish"):
        axis = normal(sub(b,a))
        ref = [0,0,1] if abs(axis[2]) < .9 else [1,0,0]
        u = normal(cross(axis,ref)); v = cross(u,axis)
        depth = width if depth is None else depth
        vertices = [[p[i]+u[i]*sx*width/2+v[i]*sz*depth/2 for i in range(3)]
                    for p in [a,b] for sx,sz in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        self.faces(name,c,vertices,[[0,1,2,3],[7,6,5,4],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]],role)

    def slab(self, c="sand"):
        self.box("plot-plinth",c,0,.06,0,self.w,.12,self.d,"base")
        self.box("front-kerb","stone",0,.13,self.d/2-.05,self.w,.10,.10,"base")

    def shell(self, w=None, d=None, h=1.25, x=0, z=-.15, roof=True):
        w, d = w or self.w*.75, d or self.d*.68
        self.box("masonry","wall",x,.14+h/2,z,w,h,d,"structure")
        self.box("plinth-course","stone",x,.22,z,w+.05,.16,d+.05,"structure")
        if roof:
            self.roof(x,h+.15,z,w+.15,.36,d+.15)
        else:
            self.box("flat-roof","roof",x,h+.19,z,w+.12,.15,d+.12)
            self.box("roof-front-edge","trim",x,h+.28,z+d/2,w+.12,.08,.08)
        return w, d, h, x, z

    def facade(self, shell, columns=3, rows=1, door=True):
        w,d,h,x,z = shell
        for row in range(rows):
            for col in range(columns):
                px=x+(col-(columns-1)/2)*w/(columns+.4)
                if door and row == 0 and abs(px-x)<.20: continue
                yy=.34+(row+.5)*(h-.22)/rows
                self.box("window-recess","dark",px,yy,z+d/2+.012,w/(columns+.5)*.59,.32,.035)
                self.box("window-glass","glass",px,yy+.015,z+d/2+.035,w/(columns+.5)*.48,.25,.024)
        if door:
            self.box("entry-door","dark",x,.48,z+d/2+.022,.28,.64,.035)
            self.box("entry-glass","glass",x,.55,z+d/2+.047,.19,.39,.02)
            self.box("entry-step","stone",x,.17,z+d/2+.16,.53,.09,.25,"structure")
        # Readable side glazing from the default three-quarter camera.
        for side_z in [-.24,.24]:
            self.box("side-glass","glass",x+w/2+.014,.77,z+side_z*d,.028,.32,d*.23)

    def awning(self, x,y,z,w,d=.35):
        for i in range(5):
            self.box("striped-canopy","accent" if i%2==0 else "trim",x+(i-2)*w/5,y,z,w/5,.075,d,rotation=(.10,0,0))
        for px in [x-w*.46,x+w*.46]: self.box("canopy-post","wood",px,y/2+.08,z+d*.38,.045,y-.16,.045,"structure")

    def bench(self,x,z,w=.48):
        self.box("bench-seat","wood",x,.32,z,w,.07,.16)
        self.box("bench-back","wood",x,.47,z-.075,w,.22,.045)
        for xx in [x-w*.32,x+w*.32]: self.box("bench-leg","dark",xx,.22,z,.05,.20,.12)

    def tree(self,x,z,h=.95):
        self.box("tree-trunk","wood",x,.14+h*.34,z,.09,h*.68,.09,"structure")
        self.cylinder("faceted-crown","leaf",x,.14+h*.75,z,h*.35,h*.75,6,top=0)
        self.cylinder("lower-foliage","leaf",x,.14+h*.48,z,h*.39,h*.50,6,top=0)

    def icon(self, kind, x, y, z, scale=.30):
        """Original, generic geometry pictograms; no fonts or institutional emblems."""
        def b(c,xx,yy,w,h,angle=0): self.box("icon-"+kind,c,x+xx*scale,y+yy*scale,z+.035,w*scale,h*scale,.024,rotation=(0,0,angle))
        def p(c,points,xx=0,yy=0): self.prism("icon-"+kind,c,[(a*scale,b*scale) for a,b in points],x+xx*scale,y+yy*scale,z+.035,.024)
        def disc(c,xx,yy,r,n=8): self.cylinder("icon-"+kind,c,x+xx*scale,y+yy*scale,z+.035,r*scale,.024,n,rotation=(math.pi/2,0,0))
        c="trim"
        if kind=="pencil":
            b(c,-.15,0,.22,1.0,-.35);p("gold",[(-.18,-.6),(.04,-.6),(-.07,-.85)],.03,.11)
        elif kind=="heart":
            p(c,[(-.70,.10),(-.48,.50),(-.14,.52),(0,.26),(0,-.65)])
            p(c,[(0,-.65),(0,.26),(.14,.52),(.48,.50),(.70,.10)])
        elif kind=="flame":
            p(c,[(-.55,-.30),(-.35,.15),(.02,.85),(.18,.30),(.42,.46),(.58,-.32),(0,-.65)])
        elif kind=="radio":
            b(c,0,-.10,.75,.96);b(c,.25,.60,.10,.48);b("accent",0,.12,.45,.18);b("accent",0,-.26,.44,.08)
        elif kind=="book":
            p(c,[(-.72,-.42),(-.72,.52),(-.09,.34),(-.09,-.60)])
            p(c,[(.09,-.60),(.09,.34),(.72,.52),(.72,-.42)])
        elif kind=="vase":
            p(c,[(-.42,-.62),(-.57,-.25),(-.43,.15),(-.19,.30),(-.26,.62),(.26,.62),(.19,.30),(.43,.15),(.57,-.25),(.42,-.62)])
        elif kind=="basket":
            p(c,[(-.65,.10),(-.44,-.56),(.44,-.56),(.65,.10)]);b(c,0,.40,.95,.10)
            for xx in [-.28,.28]: b("accent",xx,-.25,.08,.42)
        elif kind=="loaf":
            p(c,[(-.70,-.35),(-.70,.05),(-.40,.45),(.40,.45),(.70,.05),(.70,-.35)])
            for xx in [-.25,.25]: b("accent",xx,.10,.08,.28,-.28)
        elif kind=="cupcake":
            p(c,[(-.35,-.62),(-.55,.08),(.55,.08),(.35,-.62)])
            p(c,[(-.6,.18),(-.33,.52),(0,.78),(.33,.52),(.6,.18)])
        elif kind=="ball":
            disc(c,0,0,.66,10);b("accent",0,0,.10,1.25);b("accent",0,0,1.25,.10)
        elif kind in ["waves","beam"]:
            if kind=="beam":
                b(c,-.32,-.12,.30,.94);p(c,[(-.10,.30),(.80,.64),(.80,-.10)])
            else:
                for yy in [-.30,.25]:
                    for xx,angle in [(-.45,.35),(0,-.35),(.45,.35)]: b(c,xx,yy,.52,.12,angle)
        elif kind=="slide":
            b(c,-.40,.05,.12,1.12);b(c,-.1,.57,.72,.12);b(c,.36,.02,.12,1.30,.65);b(c,.72,-.53,.35,.12)
        elif kind=="tree":
            b(c,0,-.40,.16,.60);p(c,[(-.70,-.20),(.70,-.20),(0,.85)])
        elif kind in ["train","bus"]:
            b(c,0,.03,1.15,.91);b("accent",0,.20,.82,.27)
            for xx in [-.35,.35]:disc("gold",xx,-.55,.14,6)
        elif kind=="anchor":
            b(c,0,.02,.12,1.30);b(c,0,-.50,.95,.12);b(c,-.51,-.36,.12,.42);b(c,.51,-.36,.12,.42);disc(c,0,.62,.20,6)
        elif kind=="canopy":
            p(c,[(-.78,.10),(.78,.10),(.45,.65),(-.45,.65)])
            for xx in [-.52,.52]:b(c,xx,-.30,.12,.80)
        elif kind=="reel":
            disc(c,0,0,.69,10)
            for xx,yy in [(-.26,.25),(.26,.25),(-.26,-.25),(.26,-.25)]:disc("accent",xx,yy,.17,6)
        elif kind=="curtains":
            b(c,0,.55,1.45,.17)
            for xx in [-.53,.53]:p(c,[(-.22,-.57),(.22,-.57),(.10,-.08),(.22,.48),(-.22,.48)],xx,0)

    def signboard(self, kind, x=None,y=None,z=None, size=.50):
        x,y,z = self.sign if x is None else (x,y,z)
        self.sign=[x,y,z]
        self.box("pictogram-board","accent",x,y,z,size*1.12,size,.06)
        self.icon(kind,x,y,z+.034,size*.48)


def author(spec,palette):
    m=Model(spec,palette); key=spec[0];w,d=m.w,m.d
    m.slab("leaf" if key in ["park","playground"] else "sand")
    if key=="school":
        for x in [-.81,.81]:
            s=m.shell(1.02,1.60,1.10,x,-.24);m.facade(s,2)
        s=m.shell(.65,1.36,1.76,0,-.15);m.facade(s,1)
        m.cylinder("clock-face","trim",0,1.65,.56,.20,.035,10,rotation=(math.pi/2,0,0))
        m.box("clock-hand","dark",.035,1.69,.59,.09,.028,.02)
        m.box("clock-hand","dark",0,1.72,.59,.025,.15,.02)
        m.sign=[0,1.11,.57]
        m.tree(1.18,.98,.53)
    elif key=="hospital":
        s=m.shell(1.36,1.80,1.95,-.36,-.20,False);m.facade(s,3,2)
        s=m.shell(.92,1.34,1.18,.77,-.10,False);m.facade(s,2)
        m.box("entrance-canopy","accent",-.36,.98,1.01,.92,.13,.51)
        for xx in [-.74,.02]:m.box("canopy-column","trim",xx,.55,1.17,.065,.82,.065,"structure")
        for zz in [-.65,.10]:m.box("roof-vent","stone",-.45,2.24,zz,.40,.25,.30)
        m.sign=[-.36,1.70,.74]
    elif key=="fire-station":
        s=m.shell(1.82,1.16,1.06,-.30,-.16,False)
        for xx in [-.75,.15]:
            m.box("garage-reveal","dark",xx,.60,.44,.70,.88,.04)
            for yy in [.34,.59,.84]:m.box("garage-slats","glass",xx,yy,.47,.59,.16,.025)
        s=m.shell(.52,.69,2.02,1.02,-.38,False)
        for yy in [.70,1.20,1.70]:m.box("tower-window","dark",1.02,yy,-.015,.23,.22,.025)
        m.cylinder("roof-beacon","gold",-.67,1.40,-.16,.09,.20,6)
        m.sign=[.36,1.46,.43]
    elif key=="police-station":
        s=m.shell(1.27,1.20,1.35,0,-.18,False);m.facade(s,3)
        m.box("upper-office","wall",-.26,1.72,-.35,.70,.66,.72,"structure")
        m.box("office-cap","roof",-.26,2.10,-.35,.82,.12,.84)
        m.beam("aerial","dark",(.42,1.57,-.49),(.42,2.29,-.49),.04,role="structure")
        m.box("aerial-crossbar","dark",.42,2.12,-.49,.30,.035,.035)
        m.box("entry-canopy","accent",0,.96,.58,.68,.10,.37)
        m.sign=[-.26,1.76,.03]
        m.bench(.59,.69,.43)
    elif key=="library":
        s=m.shell(2.24,1.10,1.05,0,-.16,False);m.facade(s,5)
        for xx in [-.72,0,.72]:
            m.roof(xx,1.28,-.16,.66,.38,.98)
            m.box("skylight","glass",xx+.14,1.49,-.16,.25,.035,.77,rotation=(0,0,-.85))
        m.bench(-.80,.65)
        m.sign=[0,.92,.43]
    elif key=="museum":
        s=m.shell(1.98,1.60,1.22,0,-.24,False);m.facade(s,3)
        for xx in [-.85,-.29,.29,.85]:
            m.cylinder("portico-column","trim",xx,.81,.82,.085,1.18,6,role="structure")
            m.box("column-capital","stone",xx,1.41,.82,.23,.10,.23)
        m.roof(0,1.48,.72,2.32,.52,.44)
        m.box("wide-front-step","stone",0,.20,1.08,2.25,.14,.45,"structure")
        m.cylinder("sculpture-pedestal","stone",1.19,.31,-.91,.16,.30,6)
        m.cylinder("abstract-sculpture","accent",1.19,.72,-.91,.22,.54,5,top=.09)
        m.sign=[0,1.61,.97]
    elif key in ["grocery","bakery","patisserie"]:
        s=m.shell(1.24,1.12,1.10,0,-.19, key!="patisserie");m.facade(s,2)
        m.box("shop-display","dark",-.28,.57,.395,.47,.48,.045)
        m.box("display-glass","glass",-.28,.59,.422,.40,.36,.02)
        m.awning(0,1.01,.55,1.39,.44)
        if key=="grocery":
            for xx in [-.50,.35]:
                m.box("produce-crate","wood",xx,.27,.76,.34,.24,.30)
                for dx in [-.09,.09]:m.cylinder("produce","gold" if xx<0 else "accent",xx+dx,.43,.76,.09,.13,5,top=.035)
        elif key=="bakery":
            m.box("oven-chimney","wall",.38,1.58,-.49,.27,1.35,.27,"structure")
            m.box("chimney-coping","stone",.38,2.28,-.49,.35,.11,.35)
            m.box("bread-shelf","wood",-.24,.35,.80,.68,.09,.24)
            for xx in [-.43,-.20,.03]:m.cylinder("loaves","gold",xx,.45,.80,.09,.20,6,rotation=(0,0,math.pi/2))
        else:
            m.cylinder("corner-turret","wall",.48,1.41,-.46,.28,.95,8,role="structure")
            m.cylinder("turret-roof","roof",.48,2.04,-.46,.35,.39,8,top=0)
            for yy,rr in [(.29,.24),(.44,.18),(.58,.11)]:m.cylinder("pastry-tier","trim",-.40,yy,.72,rr,.11,8)
        m.sign=[0,1.48,.43]
    elif key=="sports-park":
        m.box("court-edge","roof",-.32,.17,-.10,2.71,.08,2.34,"surface")
        m.box("court","accent",-.32,.22,-.10,2.53,.025,2.16,"surface")
        for xx in [-1.52,.88]:m.box("court-sideline","line",xx,.24,-.10,.035,.012,2.08,"surface")
        for zz in [-1.10,-.10,.90]:m.box("court-line","line",-.32,.245,zz,2.42,.012,.035,"surface")
        for zz in [-.98,.78]:
            m.box("hoop-pole","dark",-.32,.77,zz,.055,1.15,.055,"structure")
            m.box("backboard","trim",-.32,1.36,zz,.48,.32,.045)
            m.cylinder("hoop-rim","gold",-.32,1.21,zz+(.13 if zz<0 else -.13),.12,.025,8)
        for zz in [-.60,.60]:m.bench(1.42,zz,.55)
        m.box("sign-post","wood",1.44,.82,1.10,.06,1.36,.06,"structure")
        m.sign=[1.44,1.38,1.13]
    elif key=="swimming-pool":
        m.box("pool-coping","trim",-.29,.23,.03,1.70,.22,2.29,"structure")
        m.box("pool-inner","dark",-.29,.35,.03,1.49,.025,2.08,"surface")
        m.box("pool-water","water",-.29,.37,.03,1.35,.025,1.94,"surface")
        for xx in [-.60,.02]:m.box("lane-guide","line",xx,.39,.03,.025,.012,1.83,"surface")
        for zz in [-.66,-.43]:m.box("ladder-rung","gold",.43,.34,zz,.25,.035,.035)
        for zz in [-.75,-.35]:m.box("ladder-handrail","trim",.48,.50,zz,.035,.30,.035)
        s=m.shell(.59,1.24,.82,1.01,-.32);m.facade(s,1)
        m.bench(.97,.77,.50)
        m.sign=[1.01,1.12,.34]
    elif key=="playground":
        m.box("play-safety-surface","accent",-.30,.16,-.06,1.90,.05,2.35,"surface")
        for xx in [-.91,-.39]:
            for zz in [-.55,-.03]:m.box("play-tower-post","wood",xx,.78,zz,.065,1.25,.065,"structure")
        m.box("play-deck","trim",-.65,.99,-.29,.66,.09,.66,"structure")
        m.roof(-.65,1.55,-.29,.86,.39,.86)
        m.box("slide-chute","gold",-.65,.63,.50,.38,.06,1.27,rotation=(-.60,0,0))
        for xx in [-.89,-.41]:m.box("slide-rail","accent",xx,.68,.50,.045,.14,1.27,rotation=(-.60,0,0))
        for xx in [.55,1.12]:
            for zz in [-.68,-.02]:m.beam("swing-frame","wood",(xx,.16,zz),(xx,1.22,-.35),.06,role="structure")
        m.box("swing-top","accent",.84,1.22,-.35,.78,.07,.07)
        for xx in [.74,.94]:m.box("swing-rope","dark",xx,.83,-.35,.018,.71,.018)
        m.box("swing-seat","trim",.84,.47,-.35,.33,.055,.21)
        m.box("sandbox","wood",.91,.23,.78,.72,.19,.65,"structure")
        m.box("sandbox-sand","sand",.91,.34,.78,.59,.025,.52,"surface")
        m.box("pictogram-post","wood",-.03,.43,1.15,.055,.58,.055,"structure")
        m.sign=[-.03,.60,1.19]
    elif key=="park":
        m.box("walkway","sand",0,.15,0,.35,.045,2.75,"surface")
        m.box("cross-path","sand",0,.16,.20,2.75,.04,.32,"surface")
        for xx,zz,hh in [(-.89,-.73,1.38),(.84,-.83,1.07),(-1.03,.94,.80)]:m.tree(xx,zz,hh)
        m.cylinder("fountain-base","stone",.66,.25,.75,.40,.18,10,role="structure")
        m.cylinder("fountain-water","water",.66,.35,.75,.33,.035,10)
        m.cylinder("fountain-spout","trim",.66,.55,.75,.05,.40,6,role="structure")
        m.cylinder("fountain-spray","water",.66,.80,.75,.13,.17,6,top=.02)
        m.bench(-.77,.31);m.bench(.75,-.27)
        m.box("pictogram-post","wood",0,.39,1.19,.055,.50,.055,"structure")
        m.sign=[0,.57,1.23]
    elif key=="train-station":
        m.box("platform","stone",0,.24,-.15,3.65,.24,.95,"structure")
        for zz in [.58,.85]:m.box("rail","dark",0,.18,zz,3.70,.055,.045,"surface")
        for i in range(10):m.box("railway-sleeper","wood",-1.62+i*.36,.13,.715,.14,.06,.55,"surface")
        for xx in [-1.48,-.49,.49,1.48]:m.box("platform-column","trim",xx,.89,-.15,.07,1.20,.07,"structure")
        m.roof(0,1.53,-.15,3.71,.32,1.16)
        s=m.shell(.77,.54,1.03,-1.07,-.49,False);m.facade(s,1)
        m.bench(.63,-.32,.82)
        m.cylinder("station-clock","trim",.26,1.36,.17,.16,.04,8,rotation=(math.pi/2,0,0))
        m.box("clock-hands","dark",.26,1.41,.20,.025,.13,.015)
        m.sign=[-1.07,1.02,-.17]
    elif key=="bus-stop":
        m.box("shelter-floor","stone",-.16,.16,-.08,1.30,.10,.62,"structure")
        for xx in [-.76,.44]:m.box("shelter-post","roof",xx,.79,-.29,.055,1.24,.055,"structure")
        m.box("shelter-rear-glass","glass",-.16,.81,-.31,1.15,1.10,.035,"structure")
        m.box("shelter-side-glass","glass",.45,.81,-.07,.035,1.10,.46,"structure")
        m.box("shelter-roof","accent",-.16,1.47,-.06,1.42,.12,.79)
        m.bench(-.20,-.11,.78)
        m.box("stop-post","roof",.67,.91,.16,.055,1.59,.055,"structure")
        m.box("timetable","trim",.67,.82,.20,.27,.33,.035)
        for yy in [.74,.82,.90]:m.box("timetable-rules","dark",.67,yy,.225,.17,.017,.015)
        m.sign=[.67,1.57,.20]
    elif key=="lighthouse":
        for yy,hh,rr,tt,cc in [(.37,.47,.42,.38,"stone"),(.92,.63,.38,.33,"wall"),(1.50,.53,.33,.29,"accent"),(1.99,.45,.29,.26,"wall")]:
            m.cylinder("tapered-tower",cc,-.19,yy,-.20,rr,hh,10,top=tt,role="structure")
        m.cylinder("gallery","trim",-.19,2.25,-.20,.43,.10,10)
        m.cylinder("lantern-glass","glass",-.19,2.50,-.20,.25,.42,8,role="structure")
        for xx in [-.36,-.02]:m.box("lantern-frame","dark",xx,2.50,-.02,.035,.43,.035)
        m.cylinder("light","gold",-.19,2.50,-.20,.11,.28,6)
        m.cylinder("lantern-cap","roof",-.19,2.80,-.20,.36,.23,10,top=0)
        m.box("tower-door","dark",-.19,.45,.22,.19,.47,.025)
        s=m.shell(.54,.61,.58,.52,.32);m.facade(s,1)
        m.sign=[.52,.99,.67]
    elif key=="harbor":
        m.box("water-basin","water",.12,.145,.30,3.46,.035,2.07,"surface")
        m.box("quayside","stone",0,.27,-.91,3.71,.26,.83,"structure")
        for i in range(7):m.box("pier-planks","wood",-.24,.33,-.08+i*.20,.82,.15,.18,"structure")
        for xx in [-.57,.09]:
            for zz in [-.05,.99]:m.cylinder("pier-piling","dark",xx,.28,zz,.055,.47,6,role="structure")
        m.box("crane-base","roof",1.10,.47,-.87,.50,.18,.49,"structure")
        m.box("crane-mast","gold",1.10,1.19,-.87,.12,1.37,.12,"structure")
        m.box("crane-jib","gold",.67,1.87,-.87,1.22,.10,.11)
        m.beam("crane-brace","gold",(1.10,1.40,-.87),(.12,1.87,-.87),.055)
        m.box("crane-cable","dark",.17,1.36,-.87,.024,.94,.024)
        for xx,zz in [(-1.37,-.83),(-.84,-1.03)]:m.box("cargo-crate","accent",xx,.59,zz,.43,.48,.44,"structure")
        for xx in [-1.42,1.41]:m.cylinder("mooring-bollard","dark",xx,.48,-.49,.08,.18,6)
        m.box("harbor-sign-post","wood",-1.46,1.10,-1.08,.055,1.40,.055,"structure")
        m.sign=[-1.46,1.65,-1.04]
    elif key=="market":
        for xx,zz in [(-.88,-.52),(.88,-.52),(0,.73)]:
            m.box("stall-counter","wood",xx,.45,zz,.76,.58,.46,"structure")
            for dx in [-.33,.33]:m.box("stall-upright","wood",xx+dx,1.03,zz-.12,.045,1.23,.045,"structure")
            m.awning(xx,1.63,zz,.92,.68)
            for dx in [-.21,.13]:m.cylinder("market-produce","gold" if dx<0 else "accent",xx+dx,.80,zz,.12,.13,5,top=.06)
        m.sign=[0,1.33,.99]
    elif key=="cinema":
        s=m.shell(2.14,1.14,1.37,0,-.22,False);m.facade(s,3)
        m.box("stepped-facade","accent",0,1.72,.31,1.06,.67,.17,"structure")
        m.box("facade-fin","trim",0,2.02,.40,.12,.55,.065)
        for xx in [-.88,.88]:m.box("facade-pilaster","roof",xx,1.05,.38,.12,1.77,.12,"structure")
        m.box("marquee","accent",0,1.01,.67,1.96,.18,.62)
        for xx in [-.77,-.38,0,.38,.77]:m.box("marquee-light","gold",xx,.94,.975,.07,.07,.025)
        m.box("ticket-kiosk","roof",.91,.49,.78,.37,.64,.31,"structure")
        m.box("ticket-window","glass",.91,.62,.945,.25,.23,.025)
        m.sign=[0,1.66,.43]
    elif key=="theatre":
        s=m.shell(2.13,1.98,1.32,0,-.12,False);m.facade(s,3)
        m.box("stage-fly-tower","accent",0,1.81,-.66,1.48,1.15,1.03,"structure")
        m.box("fly-tower-cap","roof",0,2.42,-.66,1.60,.12,1.15)
        for xx in [-.88,-.44,.44,.88]:m.box("foyer-column","trim",xx,.80,1.05,.09,1.19,.09,"structure")
        m.box("foyer-roof","roof",0,1.46,1.00,2.38,.19,.62)
        for xx in [-.46,.46]:m.box("entry-curtains","accent",xx,.81,.90,.22,.97,.035)
        m.box("front-stair","stone",0,.21,1.26,2.13,.16,.28,"structure")
        m.sign=[0,1.96,-.12]
    m.signboard(spec[6])
    return m


def clip_faces(faces, axis, limit):
    """Clip closed convex authoring solids and close the exposed construction cut."""
    output, cuts = [], []
    for face in faces:
        points=[]
        for a,b in zip(face,face[1:]+face[:1]):
            inside_a,inside_b = a[axis] <= limit+1e-9,b[axis] <= limit+1e-9
            if inside_a:points.append(a)
            if inside_a != inside_b:
                t=(limit-a[axis])/(b[axis]-a[axis])
                point=[a[i]+t*(b[i]-a[i]) for i in range(3)]
                points.append(point);cuts.append(point)
        if len(points)>=3:output.append(points)
    unique={tuple(round(v,7) for v in point):point for point in cuts}
    points=list(unique.values())
    if len(points)>=3:
        center=[sum(p[i] for p in points)/len(points) for i in range(3)]
        # In +Y plane the positive winding is Z then X; in +X plane it is Y then Z.
        a,b=(2,0) if axis==1 else (1,2)
        points.sort(key=lambda p:math.atan2(p[b]-center[b],p[a]-center[a]))
        output.append(points)
    return output


def stage_parts(model,stage):
    if stage=="complete":return model.parts
    site=Model(model.spec,model.palette);site.slab("soil")
    w,d=model.w*.77,model.d*.74
    if stage=="foundation":
        site.box("excavated-pad","concrete",0,.17,-.10,w,.11,d,"base")
        for xx in [-w*.43,w*.43]:
            site.box("foundation-footing","stone",xx,.27,-.10,.14,.17,d,"base")
        for zz in [-d*.43,d*.43]:site.box("foundation-footing","stone",0,.27,zz-.10,w,.17,.14,"base")
        for xx in [-w*.27,w*.27]:
            for zz in [-d*.25,d*.25]:
                site.box("column-starter","concrete",xx,.39,zz-.10,.17,.27,.17,"base")
                site.box("rebar-starter","dark",xx,.60,zz-.10,.035,.20,.035,"base")
        for i in range(3):site.box("rebar-grid","dark",(i-1)*w*.25,.25,-.10,.025,.025,d*.70,"base")
        for i in range(2):site.box("rebar-grid","dark",0,.255,(i-.5)*d*.40-.10,w*.73,.025,.025,"base")
    else:
        top=max(p[1] for part in model.parts for face in part["faces"] for p in face)
        for part in model.parts:
            if part["role"] in ["base","structure","surface"]:
                if part["name"]=="masonry":
                    # The final distant-view wall mass becomes four genuinely open walls.
                    points=[p for face in part["faces"] for p in face]
                    lo=[min(p[i] for p in points) for i in range(3)]
                    hi=[max(p[i] for p in points) for i in range(3)]
                    hi[1]=min(hi[1],max(.60,top*.53))
                    if hi[1]<=lo[1]:continue
                    cx,cy,cz=[(lo[i]+hi[i])/2 for i in range(3)]
                    ww,hh,dd=[hi[i]-lo[i] for i in range(3)]
                    thickness=min(.10,ww*.18,dd*.18)
                    for zz in [lo[2]+thickness/2,hi[2]-thickness/2]:
                        site.box("unfinished-open-wall",part["color"],cx,cy,zz,ww,hh,thickness,"base")
                    for xx in [lo[0]+thickness/2,hi[0]-thickness/2]:
                        site.box("unfinished-open-wall",part["color"],xx,cy,cz,thickness,hh,dd-2*thickness,"base")
                    continue
                faces=part["faces"]
                if part["role"]=="structure":faces=clip_faces(faces,1,max(.60,top*.53))
                if part["role"]=="surface":faces=clip_faces(faces,0,0)
                if faces:site.parts.append({**part,"faces":faces})
        # Scaffold and site materials are actual construction geometry, absent in the finished asset.
        for xx in [-w*.42,w*.42]:
            site.box("scaffold-upright","wood",xx,.76,-d*.47,.045,1.22,.045,"base")
        for yy in [.50,1.04]:site.box("scaffold-ledger","wood",0,yy,-d*.47,w*.89,.045,.045,"base")
        site.beam("scaffold-brace","wood",(-w*.42,.19,-d*.47),(w*.42,1.37,-d*.47),.035,role="base")
        for i in range(3):site.box("material-stack","wall",w*.30,.24+i*.10,d*.30,w*.30,.08,d*.20,"base")
    # Every stage carries the same generic, text-free pictogram on its construction notice.
    sy=.91 if stage=="foundation" else 1.03
    sx=-model.w*.35;sz=model.d/2-.12
    site.box("site-notice-post","wood",sx,sy/2,sz,.045,sy,.045,"base")
    site.signboard(model.spec[6],sx,sy,sz+.03,size=.36)
    return site.parts


def linear_channel(value):
    value=int(value,16)/255
    return round(255*(value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4))


def triangulate(face, n):
    """Ear clipping preserves concave silhouettes instead of drawing a triangle fan."""
    drop=max(range(3),key=lambda i:abs(n[i]));axes=[i for i in range(3) if i!=drop]
    points=[(p[axes[0]],p[axes[1]]) for p in face]
    area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))
    sign=1 if area>0 else -1
    orient=lambda a,b,c:((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*sign
    inside=lambda p,a,b,c:all(v>=-1e-10 for v in (orient(a,b,p),orient(b,c,p),orient(c,a,p)))
    active=list(range(len(face)));result=[]
    while len(active)>3:
        for k,b in enumerate(active):
            a,c=active[k-1],active[(k+1)%len(active)]
            if orient(points[a],points[b],points[c])<=1e-10:continue
            if any(inside(points[p],points[a],points[b],points[c]) for p in active if p not in (a,b,c)):continue
            result.append((a,b,c));active.pop(k);break
        else:raise ValueError("Cannot triangulate polygon")
    return result+[tuple(active)]


def encode_glb(parts,spec,palette,stage):
    positions=[];normals=[];colors=[];indices=[];lookup={}
    for part in parts:
        color=tuple(linear_channel(part["color"][i:i+2]) for i in (0,2,4))+(255,)
        for face in part["faces"]:
            # Collapse repeated points created when a clipping plane passes through a vertex.
            clean=[]
            for p in face:
                if not clean or sum((p[k]-clean[-1][k])**2 for k in range(3))>1e-14:clean.append(p)
            if len(clean)>2 and sum((clean[0][k]-clean[-1][k])**2 for k in range(3))<1e-14:clean.pop()
            if len(clean)<3:continue
            n=normal(cross(sub(clean[1],clean[0]),sub(clean[2],clean[0])))
            if not n:continue
            ids=[]
            for p in clean:
                p=tuple(round(x,6) for x in p); nn=tuple(round(x,7) for x in n)
                key=(p,nn,color)
                if key not in lookup:
                    lookup[key]=len(positions)//3;positions.extend(p);normals.extend(nn);colors.extend(color)
                ids.append(lookup[key])
            for tri in triangulate(clean,n):
                emitted=[ids[i] for i in tri]
                a,b,c=(positions[j*3:j*3+3] for j in emitted)
                assert normal(cross(sub(b,a),sub(c,a))), (spec[0],stage,"degenerate triangle")
                indices.extend(emitted)
    count=len(indices)//3
    assert 200<=count<=800, (spec[0],stage,count)
    chunks=[];views=[]
    for arr,fmt,target in [(positions,"f",34962),(normals,"f",34962),(colors,"B",34962),(indices,"H",34963)]:
        raw=struct.pack("<"+str(len(arr))+fmt,*arr)
        offset=sum(len(c) for c in chunks)
        views.append({"buffer":0,"byteOffset":offset,"byteLength":len(raw),"target":target})
        chunks.append(raw+b"\0"*((-len(raw))%4))
    binary=b"".join(chunks)
    lo=[min(positions[i::3]) for i in range(3)];hi=[max(positions[i::3]) for i in range(3)]
    assert all(lo[i]>=-spec[3 if i==0 else 4]/2-1e-6 and hi[i]<=spec[3 if i==0 else 4]/2+1e-6 for i in (0,2)), (spec[0],lo,hi)
    anchor=[0,hi[1]+.15,0]
    doc={"asset":{"version":"2.0","generator":"Bakasun original City Buildings v2 / source/build.py","copyright":"CC0-1.0"},
         "scene":0,"scenes":[{"name":spec[0]+"-"+stage,"nodes":[0]}],
         "nodes":[{"name":spec[0],"mesh":0,"extras":{"stage":stage,"palette":palette,"openingAnchor":anchor}}],
         "meshes":[{"name":spec[0]+"-"+stage,"primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"COLOR_0":2},"indices":3,"material":0,"mode":4}]}],
         "materials":[{"name":"matte-vertex-palette","pbrMetallicRoughness":{"baseColorFactor":[1,1,1,1],"metallicFactor":0,"roughnessFactor":.88}}],
         "buffers":[{"byteLength":len(binary)}],"bufferViews":views,
         "accessors":[{"bufferView":0,"componentType":5126,"count":len(positions)//3,"type":"VEC3","min":lo,"max":hi},
                      {"bufferView":1,"componentType":5126,"count":len(normals)//3,"type":"VEC3"},
                      {"bufferView":2,"componentType":5121,"normalized":True,"count":len(colors)//4,"type":"VEC4"},
                      {"bufferView":3,"componentType":5123,"count":len(indices),"type":"SCALAR"}]}
    raw=json.dumps(doc,separators=(",",":"),ensure_ascii=True).encode();raw+=b" "*((-len(raw))%4)
    glb=struct.pack("<III",0x46546c67,2,12+8+len(raw)+8+len(binary))+struct.pack("<II",len(raw),0x4e4f534a)+raw+struct.pack("<II",len(binary),0x004e4942)+binary
    return glb,{"triangles":count,"vertices":len(positions)//3,"bytes":len(glb),"sha256":hashlib.sha256(glb).hexdigest(),
                "bounds":{"min":lo,"max":hi},"openingAnchor":anchor}


def main():
    (ROOT/"models").mkdir(exist_ok=True)
    manifest={"schemaVersion":2,"id":"city-buildings-v2","titleHe":"העיר שלי · אוסף מבנים 02","license":"CC0-1.0",
              "units":"metres","axes":{"up":"+Y","front":"+Z","pivot":"ground centre of reserved rectangular footprint"},
              "grid":{"cellSize":1,"coordinates":"occupiedCells are [column,row] from the footprint's negative X/Z corner"},
              "stages":["foundation","half-built","complete"],"palettes":[{"id":k,"nameHe":"זריחה" if k=="sunrise" else "בריזה","colors":v} for k,v in PALETTES.items()],
              "constraints":{"minTrianglesPerGLB":200,"maxTrianglesPerGLB":800,"maxPackageBytes":8000000,"textures":False,"extensions":[],"externalRuntimeRequests":False},
              "openingEffect":{"module":"effects.mjs","factory":"createOpeningEffect","anchorField":"asset.openingAnchor","particles":64,"durationSeconds":1.65,"respectsReducedMotion":True},
              "offline":{"archive":"city-buildings-v2-offline.zip","launcher":"serve.py","entry":"preview.html","networkRequired":False},"buildings":[]}
    for spec in SPECS:
        key,name,category,columns,rows,capacity,icon,identity=spec
        record={"id":key,"nameHe":name,"category":category,"silhouette":identity,"icon":icon,
                "footprint":{"columns":columns,"rows":rows,"width":columns,"depth":rows},
                "occupancy":{"occupiedCells":[[x,z] for z in range(rows) for x in range(columns)],"cellCount":columns*rows,
                             "capacityPeople":capacity,"capacityMeaning":"proposed design capacity; not wired to game rules"},
                "placement":{"surface":"shore" if key=="harbor" else "land","entrance":[0,.15,rows/2]},"variants":[]}
        for palette,colors in PALETTES.items():
            model=author(spec,colors);variant={"palette":palette,"signAnchor":model.sign,"assets":{}}
            for stage in manifest["stages"]:
                data,stats=encode_glb(stage_parts(model,stage),spec,palette,stage)
                filename=f"models/{key}-{palette}-{stage}.glb"
                (ROOT/filename).write_bytes(data)
                variant["assets"][stage]={"path":filename,**stats}
            record["variants"].append(variant)
        manifest["buildings"].append(record)
    (ROOT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    assets=[a for b in manifest["buildings"] for v in b["variants"] for a in v["assets"].values()]
    print(json.dumps({"buildings":len(SPECS),"glbs":len(assets),"glbBytes":sum(a["bytes"] for a in assets),
                      "minTriangles":min(a["triangles"] for a in assets),"maxTriangles":max(a["triangles"] for a in assets)}))


if __name__=="__main__":main()
