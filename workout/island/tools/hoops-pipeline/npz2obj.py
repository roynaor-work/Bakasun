import numpy as np, os, sys
root=sys.argv[1]; n=0
for dp,_,fs in os.walk(root):
    for f in fs:
        if not f.endswith('.npz'): continue
        obj=os.path.join(dp,f[:-4]+'.obj')
        if os.path.exists(obj): continue
        d=np.load(os.path.join(dp,f),allow_pickle=True)
        if 'coord' not in d.files: continue
        co,tx,fv,fu=d['coord'],d['texco'],d['fvert'],d['fuvs']
        with open(obj,'w') as o:
            for v in co: o.write('v %.6f %.6f %.6f\n'%tuple(v))
            for t in tx: o.write('vt %.6f %.6f\n'%tuple(t))
            for a,b in zip(fv,fu):
                idx=[(int(a[i])+1,int(b[i])+1) for i in range(4)]
                if idx[3][0]==idx[2][0]: idx=idx[:3]
                o.write('f '+' '.join('%d/%d'%p for p in idx)+'\n')
        n+=1
print('converted',n)
