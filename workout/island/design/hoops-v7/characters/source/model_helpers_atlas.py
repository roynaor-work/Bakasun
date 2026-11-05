"""Pack existing human maps into one 1024 UV atlas; author logo-free cloth/shoes.
Read-only sources are GLBs already in this repository. No generative likenesses.
"""
from pathlib import Path
import json,struct,io,sys,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[4]
LAYOUT={
'skin':[0,0,640,640],'face':[640,0,384,768],
'hair':[0,640,256,128],'shoes':[256,640,128,128],
'eyes':[384,640,128,128],'brows':[512,640,64,64],
'lashes':[576,640,64,64],'solid':[512,704,128,64],'sternum':[512,704,32,64],
'jersey':[0,768,512,256], 'shorts':[512,768,512,256]}
FACE_UV=[.639,.180,.996,.854]
PROFILES=[('pg','guard','07'),('sg','wing','12'),('sf','forward','24'),('pf','big','35'),('c','big','44'),('referee','forward','00')]

def source_images(source):
 b=(REPO/'workout/island/assets/models'/f'hoops-{source}.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);o=20+n+8
 images={}
 for im in j['images']:
  v=j['bufferViews'][im['bufferView']];data=b[o+v.get('byteOffset',0):o+v.get('byteOffset',0)+v['byteLength']]
  images[im['name']]=Image.open(io.BytesIO(data)).convert('RGBA')
 return images

def region_paste(atlas,im,region):
 x,y,w,h=LAYOUT[region];atlas.paste(im.resize((w,h),Image.Resampling.LANCZOS),(x,y))

def fabric(w,h,kind):
 y,x=np.mgrid[:h,:w];rng=np.random.default_rng(3701)
 weave=3.5*np.sin(x*2*np.pi/3.5)*np.cos(y*2*np.pi/3.5)+3*np.sin((x+y)*2.4)
 # Broad folds respond in lighting; sparse double-knit holes remain textile scale.
 folds=5*np.sin(x*.19+np.sin(y*.025)*1.4)+3*np.sin(x*.063+y*.035)
 noise=rng.normal(0,.9,(h,w));v=np.clip(242+weave+folds+noise,0,255).astype('uint8')
 a=np.dstack((v,v,v,np.full_like(v,255)))
 return Image.fromarray(a,'RGBA')


def tight_coils():
 # Authored irregular coil loops; the native afro cards are not sampled.
 rng=np.random.default_rng(6509);im=Image.new('L',(256,128),204);d=ImageDraw.Draw(im)
 for yy in range(-8,138,7):
  for xx in range(-8,266,7):
   x=xx+float(rng.uniform(-2.5,2.5));y=yy+float(rng.uniform(-2.5,2.5));r=float(rng.uniform(2.1,4.2));start=int(rng.integers(0,360))
   d.arc((x-r,y-r,x+r,y+r),start,start+int(rng.integers(215,315)),fill=int(rng.integers(143,174)),width=1)
   d.arc((x-r*.7,y-r*.7,x+r*.7,y+r*.7),start+40,start+225,fill=int(rng.integers(226,247)),width=1)
 return im.filter(ImageFilter.GaussianBlur(.25))

def make(profile,source,number):
 ims=source_images(source);atlas=Image.new('RGBA',(1024,1024),(248,248,248,255))
 skin=next(v for k,v in ims.items()if 'male_diffuse' in k)
 skin=skin.copy();ImageDraw.Draw(skin).rectangle((988,735,1023,1023),fill=(93,61,45,255))
 region_paste(atlas,skin,'skin')
 u0,v0,u1,v1=FACE_UV
 region_paste(atlas,skin.crop((round(u0*skin.width),round(v0*skin.height),round(u1*skin.width),round(v1*skin.height))),'face')
 for region,test in [('hair',lambda k:'short' in k or 'afro' in k),('brows',lambda k:'eyebrow' in k),('lashes',lambda k:'eyelash' in k),('eyes',lambda k:'eye' in k and 'eyebrow' not in k and 'eyelash' not in k)]:
  image=next((v for k,v in ims.items()if test(k)),None)
  if image:region_paste(atlas,image,region)
 # Shoe uppers are newly authored: plain leather, stitches and perforated mesh,
 # with no source side-stripes or labels. Source UV shape retained.
 x,y,w,h=LAYOUT['shoes'];shoe=Image.new('RGBA',(w,h),(213,218,219,255));d=ImageDraw.Draw(shoe)
 for yy in range(2,h,4):
  for xx in range(2,w,4):d.ellipse((xx,yy,xx+1,yy+1),fill=(157,167,170,255))
 for yy in [5,9,h-10,h-6]:d.line((0,yy,w,yy),fill=(239,241,240),width=1)
 if profile=='referee':
  a=np.array(shoe);a[:,:,:3]=(a[:,:,:3]*.12).astype('uint8');shoe=Image.fromarray(a,'RGBA')
 atlas.paste(shoe,(x,y));
 if profile in ['pf','c']:
  coil=np.array(tight_coils());region_paste(atlas,Image.fromarray(np.dstack((coil,coil,coil,np.full_like(coil,255))),'RGBA'),'hair')

 # Solid colour strip: neutral sampling for piping and numbers.
 x,y,w,h=LAYOUT['solid'];ImageDraw.Draw(atlas).rectangle((x,y,x+w-1,y+h-1),fill=(250,248,237,255))
 # Reconstructed sternum samples the surviving native anterior clavicle.
 skin_color={'guard':(80,50,37),'wing':(227,174,142),'forward':(211,177,150),'big':(92,55,36)}[source]
 x,y,w,h=LAYOUT['sternum'];ImageDraw.Draw(atlas).rectangle((x,y,x+w-1,y+h-1),fill=(*skin_color,255))
 for region in ['jersey','shorts']:
  x,y,w,h=LAYOUT[region];im=fabric(w,h,region);d=ImageDraw.Draw(im)
  # Each half is a front/back panel. Side tapes & hemstitched double rows.
  for panel in [0,w//2]:
   for off in [5,10,w//2-11,w//2-6]:d.line((panel+off,0,panel+off,h),fill=(204,209,208),width=2)
  for yy in [7,11,h-10,h-6]:d.line((0,yy,w,yy),fill=(214,217,213),width=1)
  if profile=='referee' and region=='jersey':
   for xx in range(0,w,24):d.rectangle((xx,0,xx+11,h),fill=(34,39,43))
  elif region=='jersey':
   font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf',69)
   # Source UV front/back panels each occupy one half; digits are fictional ids.
   for panel in [0,w//2]:
    d.text((panel+w//4,110),number,font=font,anchor='mm',fill=(18,29,38),stroke_width=2,stroke_fill=(255,250,231))
  elif profile!='referee':
   font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf',34)
   d.text((74,160),number,font=font,anchor='mm',fill=(255,255,250),stroke_width=1,stroke_fill=(173,178,180))
  atlas.paste(im,(x,y))
 atlas.save(ROOT/'textures'/f'{profile}-atlas.png',optimize=True)
 # Tangent-space woven cloth normal. Atlas UV axes share front/back orientation.
 normal=np.zeros((1024,1024,3),dtype='uint8');normal[:]=[128,128,255]
 for region in ['jersey','shorts']:
  ox,oy,w,h=LAYOUT[region];yy,xx=np.mgrid[:h,:w]
  height=.14*np.sin(xx*2*np.pi/3.5)*np.cos(yy*2*np.pi/3.5)+.1*np.sin((xx+yy)*2.4)+.36*np.sin(xx*.19+np.sin(yy*.025)*1.4)
  gy,gx=np.gradient(height);nx=-gx*.36;ny=-gy*.36;nz=np.ones_like(nx);l=np.sqrt(nx*nx+ny*ny+1)
  arr=np.stack(((nx/l*.5+.5)*255,(ny/l*.5+.5)*255,(nz/l*.5+.5)*255),axis=-1).astype('uint8');normal[oy:oy+h,ox:ox+w]=arr
 # Hair uses the otherwise-unused native hair tile for PF/C, preserving
 # the neutral solid tile sampled by shoes, compression and sewn binding.
 ox,oy,w,h=LAYOUT['hair'];height=np.array(tight_coils(),dtype=float)/255
 gy,gx=np.gradient(height);nx=-gx*1.8;ny=-gy*1.8;l=np.sqrt(nx*nx+ny*ny+1)
 normal[oy:oy+h,ox:ox+w]=np.stack(((nx/l*.5+.5)*255,(ny/l*.5+.5)*255,255/l),axis=-1).astype('uint8')
 Image.fromarray(normal,'RGB').save(ROOT/'textures'/'cloth-normal.png',optimize=True)

if __name__=='__main__':
 for p,s,n in PROFILES:make(p,s,n)
 (ROOT/'textures'/'atlas-layout.json').write_text(json.dumps({'size':[1024,1024],'pixelOrigin':'top-left','regions':LAYOUT},indent=2)+'\n')
