#!/usr/bin/env python3
"""Original low-poly city cast, CC0-1.0. No imported meshes or textures.

Outputs compact indexed geometry in the motion2 canonical18 identity bind.
Ring lofts describe garment silhouettes, anatomy and individually styled hair.
Run from any directory: python3 source/citizens.py [output-directory].
The repository's Kenney and city-library assets were surveyed before modelling;
their silhouettes, 50+ bone rigs or texture budgets do not fit this contract.
"""
import json
import math
from pathlib import Path
import sys

NAMES = ['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']
JI = {n:i for i,n in enumerate(NAMES)}

def linear_hex(value):
    value=value.lstrip('#')
    out=[]
    for k in (0,2,4):
        x=int(value[k:k+2],16)/255
        out.append(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4)
    return out+[1.0]

class Surface:
    def __init__(self):
        self.p=[]; self.t=[]; self.slots=[]; self.j=[]; self.w=[]
    def v(self,p,slot,skin):
        self.p.append([round(float(x),7) for x in p]); self.slots.append(slot)
        skin={JI.get(k,k):v for k,v in skin.items() if v>1e-8}
        total=sum(skin.values()); pairs=list(skin.items())[:4]
        self.j.append([k for k,v in pairs]+[0]*(4-len(pairs)))
        self.w.append([v/total for k,v in pairs]+[0]*(4-len(pairs)))
        return len(self.p)-1
    def tri(self,a,b,c):
        u=[self.p[b][i]-self.p[a][i] for i in range(3)]
        v=[self.p[c][i]-self.p[a][i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        if sum(x*x for x in n)>1e-15:self.t.extend((a,b,c))
    def loft(self,rings,slot,skin,segments=8,caps=True,phase=0):
        # Each ring is (y, rx, rz, cx, cz). Winding is outward, +Y up.
        rings=sorted(rings,key=lambda r:r[0]); ids=[]
        for ri,(y,rx,rz,cx,cz) in enumerate(rings):
            row=[]
            for s in range(segments):
                a=phase+s/segments*math.tau
                weights=skin(y,ri) if callable(skin) else skin
                row.append(self.v((cx+rx*math.cos(a),y,cz+rz*math.sin(a)),slot,weights))
            ids.append(row)
        for a,b in zip(ids,ids[1:]):
            for s in range(segments):
                k=(s+1)%segments
                self.tri(a[s],b[s],b[k]);self.tri(a[s],b[k],a[k])
        if caps:
            for ri,up in ((0,False),(len(rings)-1,True)):
                if caps=='top' and not up:continue
                y,rx,rz,cx,cz=rings[ri]
                weights=skin(y,ri) if callable(skin) else skin
                c=self.v((cx,y,cz),slot,weights)
                for s in range(segments):
                    k=(s+1)%segments
                    self.tri(c,ids[ri][k] if up else ids[ri][s],ids[ri][s] if up else ids[ri][k])
    def oval(self,center,radius,slot,skin,segments=8,rings=4):
        x,y,z=center;rx,ry,rz=radius
        # Slightly truncated poles avoid coincident vertices and triangles.
        rr=[]
        for k in range(rings):
            a=-math.pi/2+.16+k/(rings-1)*(math.pi-.32)
            rr.append((y+ry*math.sin(a),rx*math.cos(a),rz*math.cos(a),x,z))
        self.loft(rr,slot,skin,segments)
    def patch(self,points,slot,skin):
        ids=[self.v(p,slot,skin) for p in points]
        for i in range(1,len(ids)-1):self.tri(ids[0],ids[i],ids[i+1])
    def box(self,center,half,slot,skin):
        x,y,z=center;rx,ry,rz=half
        p=[(x+sx*rx,y+sy*ry,z+sz*rz) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for face in ((0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)):
            self.patch([p[i] for i in face],slot,skin)
    def finish(self):
        ns=[[0.,0.,0.] for p in self.p]
        for q in range(0,len(self.t),3):
            a,b,c=self.t[q:q+3];u=[self.p[b][i]-self.p[a][i] for i in range(3)];v=[self.p[c][i]-self.p[a][i] for i in range(3)]
            n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
            for k in (a,b,c):
                for i in range(3):ns[k][i]+=n[i]
        normals=[]
        for n in ns:
            l=math.sqrt(sum(x*x for x in n));normals.append([round(x/l,7) for x in n] if l>1e-10 else [0,1,0])
        return {'positions':self.p,'normals':normals,'indices':self.t,'joints':self.j,'weights':self.w,'colorSlots':self.slots}

CAST=[
    ('boy','ילד','child','child',.76,'crop','#b96e45','#293147'),
    ('girl','ילדה','child','child',.74,'ponytail','#dba679','#402b29'),
    ('adult-man','תושב','resident','adult',1.0,'sidepart','#9a614b','#252728'),
    ('adult-woman','תושבת','resident','adult',.96,'bob','#cf8c62','#50352d'),
    ('elder-man','תושב ותיק','resident','elder',.96,'bald','#dfad83','#c5c2b7'),
    ('elder-woman','תושבת ותיקה','resident','elder',.92,'bun','#945b48','#c9c4b9'),
    ('gardener','גנן','city-worker','adult',.99,'hat','#ac7150','#3b302b'),
    ('cleaner','עובדת ניקיון','city-worker','adult',.95,'curly','#764936','#2b292b'),
    ('maintenance','עובד תחזוקה','city-worker','adult',1.02,'hardhat','#c98b61','#45362c'),
    ('courier','שליחה עירונית','city-worker','adult',.97,'cap','#ab6a4e','#322923'),
    ('firefighter','כבאי','firefighter','adult',1.03,'helmet','#d79c6d','#44312b'),
    ('police','שוטרת','police','adult',.98,'policecap','#99624d','#2a2829'),
]

SETS={
    'boy':[('#49a6a0','#354e69','#e5bb64'),('#db815b','#384c62','#ead5a6'),('#7385c0','#596845','#e7c879')],
    'girl':[('#d49a43','#44676c','#e0cdb0'),('#8c81b4','#3d6371','#f1c56e'),('#dc806c','#566b46','#d5bf84')],
    'adult-man':[('#b57559','#334c61','#dab98b'),('#668e80','#49476c','#d3b56b'),('#597ba5','#655447','#d9c6a0')],
    'adult-woman':[('#729899','#594b67','#d9b15c'),('#b76d61','#435a66','#e4c78b'),('#777aa2','#5d6f5b','#dab66d')],
    'elder-man':[('#8e9b7a','#515c69','#dfbd79'),('#9a786b','#4c5860','#c6c1a6'),('#6c8d9c','#675b57','#e1bc76')],
    'elder-woman':[('#ad7c8f','#525c70','#dec1a0'),('#6e9690','#625975','#e6bc6d'),('#b18e64','#3e6571','#d7c4ac')],
    'gardener':[('#63885b','#555b48','#c7aa6e'),('#7e9b65','#475965','#d5b875'),('#709088','#6a6046','#dac68b')],
    'cleaner':[('#ce8b54','#405c6b','#e9c865'),('#5a9ca2','#4a566b','#e7c36b'),('#a58b55','#445b69','#dfcf9e')],
    'maintenance':[('#bd884c','#43576c','#e0b65c'),('#6f9a9a','#414b64','#e2b95d'),('#939b72','#515965','#e3ba61')],
    'courier':[('#5b97a5','#475875','#d1ae68'),('#b27b64','#4e6277','#d8b768'),('#84966d','#4a596a','#dfbf7b')],
    'firefighter':[('#bd6b49','#4a514c','#e3c56e'),('#a4814e','#414d53','#e8c464'),('#75877b','#424e5d','#e1bb56')],
    'police':[('#536b88','#34495e','#a6b6b8'),('#526d73','#3b4d57','#b6bdb0'),('#64647c','#3b4e63','#c7bba0')],
}

def make_character(spec,index):
    ident,label,role,age,scale,hair,skin_hex,hair_hex=spec
    s=Surface();child=age=='child';female=ident in ('girl','adult-woman','elder-woman','cleaner','courier','police')
    bulk=1.03 if ident in ('adult-man','maintenance','firefighter') else .96 if female else 1
    if child:bulk=.9
    # A fitted pelvis, waist and chest keep shoulders independent of arm swing.
    s.loft([(.80,.132*bulk,.088,0,0),(.88,.149*bulk,.099,0,0),(.96,.135*bulk,.09,0,0)],2,{'Hips':1},8)
    def trunk_skin(y,ri):
        if y<1.06:return {'Spine':1}
        a=min(1,max(0,(y-1.06)/.18));return {'Spine':1-a,'Chest':a}
    s.loft([(.90,.138*bulk,.095,0,0),(1.03,.132*bulk,.09,0,0),(1.16,.162*bulk,.104,0,0),(1.28,.175*bulk,.099,0,0),(1.31,.116*bulk,.082,0,0)],1,trunk_skin,8)
    s.loft([(1.31,.061,.059,0,0),(1.42,.049,.05,0,.004)],0,{'Neck':1},8)
    # Garment opening: rounded neck contrast, no badge, brand or emblem.
    s.loft([(1.305,.065,.062,0,0),(1.325,.057,.055,0,0)],5,{'Chest':1},8)
    head_y=1.58 if child else 1.575
    rx=.133 if child else .113 if female else .119
    ry=.157 if child else .149
    rz=.113 if child else .105
    if age=='elder':rx*=.98;ry*=1.015
    # Chin/jaw/cheek/temple forehead profile; front faces +Z.
    profile=[(-.89,.48,.55),(-.65,.82,.84),(-.2,1.,1.),(.28,1.,1.),(.68,.82,.85),(.93,.42,.49)]
    s.loft([(head_y+ry*y,rx*x,rz*z,0,.017) for y,x,z in profile],0,{'Head':1},10)
    # Small ears, nose, dark eyes, eyebrows and a short warm mouth.
    for sign in (-1,1):
        s.oval((sign*rx*.98,head_y-.005,.016),(.021,.036,.018),0,{'Head':1},4,3)
        eye_x=sign*rx*.40; eye_y=head_y+.018
        # Eye contour and pupil occupy a narrow curved front patch.
        z=.133 if child else .124
        s.patch([(eye_x-.018,eye_y-.010,z),(eye_x+.018,eye_y-.010,z),(eye_x+.018,eye_y+.010,z),(eye_x-.018,eye_y+.010,z)],7,{'Head':1})
        s.patch([(eye_x-.007,eye_y-.009,z+.001),(eye_x+.007,eye_y-.009,z+.001),(eye_x+.007,eye_y+.009,z+.001),(eye_x-.007,eye_y+.009,z+.001)],6,{'Head':1})
        s.patch([(eye_x-.019,eye_y+.025,z-.004),(eye_x+.018,eye_y+.026,z-.004),(eye_x+.017,eye_y+.031,z-.005),(eye_x-.018,eye_y+.030,z-.005)],3,{'Head':1})
    s.oval((0,head_y-.018,.123 if child else .115),(.018,.023,.025),0,{'Head':1},4,3)
    mouth_y=head_y-.064
    mouth_z=.128 if child else .119
    s.patch([(-.020,mouth_y-.006,mouth_z),(.020,mouth_y-.006,mouth_z),(.029,mouth_y,mouth_z-.002),(-.029,mouth_y,mouth_z-.002)],7,{'Head':1})
    # Scalp shells with style-dependent lower edge and a shaped, asymmetrical fringe.
    if hair!='bald':
        bottom=head_y+(.01 if hair in ('bob','curly','ponytail') else .058)
        top=head_y+ry+.012
        s.loft([(bottom,rx*1.025,rz*1.025,0,.008),(head_y+.106,rx*.91,rz*.94,0,.008),(top,rx*.30,rz*.32,0,.008)],3,{'Head':1},10)
        # Fringe sits forward of forehead while keeping both eyes clear.
        fringe_y=head_y+(.073 if child else .067)
        s.patch([(-rx*.76,fringe_y-.008,.104),(-.018,fringe_y+.012,.123),(.075,fringe_y-.003,.111),(.092,fringe_y+.048,.100),(-rx*.78,fringe_y+.045,.100)],3,{'Head':1})
    else:
        for sign in (-1,1):s.oval((sign*rx*.91,head_y+.056,-.005),(.022,.064,.077),3,{'Head':1},6,3)
    if hair=='bob':
        for sign in (-1,1):s.oval((sign*.104,head_y-.055,-.013),(.033,.092,.088),3,{'Head':1},6,3)
    if hair=='ponytail':
        s.oval((0,head_y+.023,-.113),(.047,.062,.052),3,{'Head':1},6,3)
        s.oval((0,head_y-.065,-.141),(.036,.075,.037),3,{'Head':1},6,3)
    if hair=='bun':s.oval((0,head_y+.104,-.105),(.048,.049,.044),3,{'Head':1},8,3)
    if hair=='curly':
        for k in range(4):
            a=k/4*math.tau;s.oval((.085*math.cos(a),head_y+.123,.072*math.sin(a)),(.04,.035,.039),3,{'Head':1},4,3)
    if age=='elder':
        # Discreet eyewear, four-sided rims without transparent material.
        z=.130
        for sign in (-1,1):
            x=sign*.046;w=.033;h=.020;y=head_y+.017;d=.003
            for p in [[(x-w,y-h,z),(x+w,y-h,z),(x+w,y-h+d,z),(x-w,y-h+d,z)],[(x-w,y+h-d,z),(x+w,y+h-d,z),(x+w,y+h,z),(x-w,y+h,z)],[(x-w,y-h,z),(x-w+d,y-h,z),(x-w+d,y+h,z),(x-w,y+h,z)],[(x+w-d,y-h,z),(x+w,y-h,z),(x+w,y+h,z),(x+w-d,y+h,z)]]:s.patch(p,6,{'Head':1})
        s.patch([(-.014,head_y+.020,z),(.014,head_y+.020,z),(.014,head_y+.023,z),(-.014,head_y+.023,z)],6,{'Head':1})
    # Upper/lower limbs have rings beside their true canonical joint pivots.
    for sign,side in ((1,'Left'),(-1,'Right')):
        arm=side+'Arm';fore=side+'ForeArm';hand=side+'Hand'; thigh=side+'UpLeg';shin=side+'Leg';foot=side+'Foot'
        ax=sign*.18
        # Shoulder pivot is .16. Skin offsets, not bone edits, establish fit.
        long_sleeves=ident in ('elder-man','elder-woman','firefighter','maintenance','police')
        upper_slot=1;lower_slot=1 if long_sleeves else 0
        s.loft([(1.03,.047,.047,ax,0),(1.08,.055,.053,ax,0),(1.23,.063*bulk,.062,ax,0),(1.30,.051,.053,ax,0)],upper_slot,lambda y,i:{arm:1} if y>1.07 else {arm:.5,fore:.5},6,caps='top')
        s.loft([(.79,.035,.035,ax,0),(.84,.038,.039,ax,0),(.99,.045,.044,ax,0),(1.03,.047,.047,ax,0)],lower_slot,lambda y,i:({arm:.5,fore:.5} if y>1.02 else {fore:1}) if y>.83 else {fore:.6,hand:.4},6,caps=False)
        s.oval((ax,.738,.009),(.039,.070,.030),0,{hand:1},6,3)
        # Rounded closed fingers and small thumb establish readable hands.
        s.oval((ax-sign*.035,.758,.022),(.017,.032,.022),0,{hand:1},4,2)
        tx=sign*.1
        s.loft([(.45,.060,.060,tx,0),(.51,.069,.070,tx,0),(.72,.083*bulk,.081,tx,0),(.86,.083*bulk,.086,tx,0)],2,lambda y,i:{thigh:1} if y>.49 else {thigh:.5,shin:.5},6,caps=False)
        s.loft([(.08,.043,.044,tx,0),(.15,.045,.048,tx,0),(.33,.056,.061,tx,0),(.45,.060,.060,tx,0)],2,lambda y,i:({thigh:.5,shin:.5} if y>.43 else {shin:1}) if y>.13 else {shin:.7,foot:.3},6,caps=False)
        # Shoes sit exactly on y=0, rigidly weighted to Foot for floor IK.
        s.loft([(0,.054,.097,tx,.035),(.025,.062,.112,tx,.041),(.070,.059,.105,tx,.032),(.111,.043,.054,tx,.003)],4,{foot:1},6)
        # A narrow contrasting sole lip follows the shoe footprint.
        s.loft([(.002,.055,.098,tx,.035),(.014,.060,.108,tx,.039)],5,{foot:1},6)
    # Individual garment construction and profession silhouettes.
    if ident in ('boy','girl'):
        s.box((.069,1.125,.104),(.031,.038,.004),5,{'Spine':.5,'Chest':.5})
    if ident in ('adult-man','elder-man'):
        s.box((0,1.075,.097),(.008,.18,.004),5,{'Spine':.65,'Chest':.35})
    if ident=='adult-woman':
        s.loft([(.91,.146,.099,0,0),(.936,.145,.1,0,0)],5,{'Hips':1},8)
    if ident=='elder-woman':
        s.box((0,1.08,.097),(.009,.18,.004),5,{'Spine':.7,'Chest':.3})
    if hair in ('hat','hardhat','helmet','cap','policecap'):
        h=head_y+.11
        brim=(.153,.142) if hair in ('hat','helmet') else (.132,.122)
        s.loft([(h,brim[0],brim[1],0,.008),(h+.023,brim[0],brim[1],0,.008)],5,{'Head':1},10)
        s.loft([(h+.019,.125,.116,0,.008),(h+.085,.113,.104,0,.008),(h+.125,.042,.048,0,.008)],1 if hair in ('cap','policecap') else 5,{'Head':1},10)
        if hair in ('cap','policecap'):
            s.box((0,h+.014,.119),(.100,.012,.055),1,{'Head':1})
    if role=='city-worker':
        # Workwear: shoulder tape, open vest edges, simple patch pockets.
        for x in (() if ident=='courier' else (-.080,.080)):s.box((x,1.13,.100),(.008,.145,.005),5,{'Spine':.5,'Chest':.5})
        if ident in ('maintenance','cleaner'):
            for x in (-.075,.075):s.box((x,1.016,.100),(.043,.034,.006),1,{'Spine':1})
    if ident=='courier':
        # Unmarked messenger satchel at the back and fitted cross-body strap.
        s.box((.04,1.052,-.129),(.117,.108,.035),5,{'Spine':1})
        s.patch([(.096,.947,.108),(.122,.956,.103),(-.096,1.29,.107),(-.121,1.277,.104)],5,{'Spine':.55,'Chest':.45})
    if ident=='firefighter':
        # Plain protective suit, collar and broad cuff tape. No emblem or text.
        s.loft([(1.33,.064,.063,0,0),(1.38,.066,.064,0,0)],1,{'Neck':1},6)
        s.loft([(.98,.139,.097,0,0),(1.005,.140,.098,0,0)],5,{'Spine':1},6)
        for sign,side in ((1,'Left'),(-1,'Right')):
            s.patch([(sign*.18-.034,.855,.043),(sign*.18+.034,.855,.043),(sign*.18+.034,.882,.043),(sign*.18-.034,.882,.043)],5,{side+'ForeArm':1})
            s.patch([(sign*.1-.044,.23,.061),(sign*.1+.044,.23,.061),(sign*.1+.044,.256,.061),(sign*.1-.044,.256,.061)],5,{side+'Leg':1})
    if ident=='police':
        s.loft([(.912,.145,.100,0,0),(.937,.146,.101,0,0)],4,{'Hips':1},8)
        for sign in (-1,1):s.box((sign*.068,1.16,.104),(.034,.030,.006),1,{'Chest':1})
    raw=s.finish()
    # Enforce the geometric delivery budget before any export.
    tris=len(raw['indices'])//3
    if not 800<=tris<=1200:raise ValueError((ident,tris,'triangle budget'))
    palettes=[]
    for k,(top,bottom,trim) in enumerate(SETS[ident]):
        palette=[skin_hex,top,bottom,hair_hex,'#344149',trim,'#242b32','#e0c3ad']
        palettes.append({'id':['a','b','c'][k],'labelHe':['מקור','חלופה חמה','חלופה קרירה'][k],'colors':[linear_hex(v) for v in palette]})
    raw.update({'id':ident,'name':ident,'labelHe':label,'role':role,'age':age,'scale':scale,'palettes':palettes,'colors':[palettes[0]['colors'][slot] for slot in raw['colorSlots']], 'metadata':{'license':'CC0-1.0','provenance':'Original ring-loft surfaces, authored for city-citizens-v1; no imported geometry or textures.','triangles':tris,'vertices':len(raw['positions']),'hairStyle':hair,'soleY':0,'footJointY':.08,'canonical18':True,'paletteColorSpace':'linear-sRGB','symbols':False,'brands':False}})
    return raw

def main():
    target=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/city-citizens');target.mkdir(parents=True,exist_ok=True)
    for i,spec in enumerate(CAST):
        raw=make_character(spec,i)
        (target/('people-'+raw['id']+'.json')).write_text(json.dumps(raw,separators=(',',':'))+'\n')
        print(raw['id'],raw['metadata']['triangles'],raw['metadata']['vertices'])

if __name__=='__main__':main()
