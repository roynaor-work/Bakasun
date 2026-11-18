# racing-v24.5 rec: the level of Roy's takes (assets/racing-rec) against the synthesis they replace, as RMS dBFS, so REC.idleGain / REC.passGain (racing-samples.mjs)
# put them where the synthesis was. Usage: python3 -I workout/island/tools/racing-rec-levels.py  (numpy + ffmpeg)
import os
REC_DIR=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','assets','racing-rec')+os.sep
import numpy as np, subprocess
sr=48000;t=np.arange(sr*2)/sr
def biq_lp(x,f0,Q):
    w0=2*np.pi*f0/sr;al=np.sin(w0)/(2*Q);c=np.cos(w0)
    b=np.array([(1-c)/2,1-c,(1-c)/2]);a=np.array([1+al,-2*c,1-al]);b/=a[0];a/=a[0]
    y=np.zeros_like(x);x1=x2=y1=y2=0.0
    for i,v in enumerate(x):
        o=b[0]*v+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2;x2=x1;x1=v;y2=y1;y1=o;y[i]=o
    return y
db=lambda v:20*np.log10(np.sqrt(np.mean(v**2))+1e-12)
# synthesized idle (racing-audio idleVoice): 24 harmonics on 78 Hz, Web Audio normalises the periodic wave to peak 1
w=sum(((1 if h%3==0 else .38 if h%3==1 else .3)/h**.75*(.85+.15*np.cos(h*1.7)))*np.sin(2*np.pi*78*h*t) for h in range(1,25))
w/=np.abs(w).max();idle=biq_lp(w,650,.7)*.013
print('synth idle rms dBFS',round(db(idle),1))
def load(p):
    raw=subprocess.run(['ffmpeg','-v','error','-i',p,'-f','f32le','-ac','1','-ar','48000','-'],capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32).astype(float)
r=load(REC_DIR+'engine-idle-loop.ogg')
print('rec idle rms dBFS x REC.idleGain .033, lp 3200',round(db(biq_lp(r,3200,.6)*.033),1))
# synthesized overtake (dopplerPass): saw f*1 + square f*2.006 *.55, lp 1400->500, peak .022 (first .45 s)
f=40+.8*150;tt=t[:int(sr*.45)]
saw=2*((f*tt)%1)-1;sq=np.sign(np.sin(2*np.pi*f*2.006*tt));p=biq_lp(saw+.55*sq,1000,.8)*np.interp(tt,[0,.12,.45],[0,.022,.012])
print('synth pass rms dBFS (first .45 s)',round(db(p),1))
for n in ['engine-away-1','engine-away-2']:
    a=load(REC_DIR+n+'.ogg')[:int(sr*.45)];env=np.interp(np.arange(len(a))/sr,[0,.08,.7],[0,.1,.045])
    print(n,'rec pass rms dBFS (first .45 s, x env, lp3200)',round(db(biq_lp(a,3200,.6)*env),1))
