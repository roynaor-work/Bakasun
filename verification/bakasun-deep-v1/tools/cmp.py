import json,sys,os,re
from PIL import Image, ImageChops
a,b,da,db=sys.argv[1:5]
A=json.load(open(a));B=json.load(open(b));bad=0
for k in A:
    if k not in B: print('MISSING',k);bad+=1;continue
    f=re.sub(r'[^A-Za-z0-9_]+','_',k)+'.png'
    d=ImageChops.difference(Image.open(f'{da}/{f}').convert('RGB'),Image.open(f'{db}/{f}').convert('RGB')).convert('L').point(lambda v:255 if v>48 else 0)
    n=sum(1 for v in d.tobytes() if v)
    t=A[k]['h']!=B[k]['h']
    if (t and not re.search(r'live|clock',k)) or n>40 or B[k]['errs']:
        bad+=1;print(k,'TEXT' if t else '',n,'px',B[k]['errs'][:1],d.getbbox())
print('compared',len(A),'flagged',bad)
