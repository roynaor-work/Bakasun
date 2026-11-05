"""Render the measured resource history, never a simulated performance curve."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from datetime import datetime

root=Path(__file__).resolve().parents[1]
data=json.loads((root/'verification/soak.json').read_text())
if data.get('status')!='complete':raise RuntimeError('The soak has not completed')
start=datetime.fromisoformat(data['startedAt'].replace('Z','+00:00'))
samples=[data['baseline']]+data['samples']+[data['final']]
x=[(datetime.fromisoformat(s['at'].replace('Z','+00:00'))-start).total_seconds()/60 for s in samples]
heap=[s['heap']['usedSize']/1e6 for s in samples]
geo=[s['metrics']['geometries'] for s in samples]
tex=[s['metrics']['textures'] for s in samples]
plt.rcParams.update({'font.size':10,'axes.facecolor':'#182831','figure.facecolor':'#101820','text.color':'#e5ebdf','axes.labelcolor':'#cfdddc','xtick.color':'#aebfc5','ytick.color':'#aebfc5','axes.edgecolor':'#53676d','grid.color':'#40545d'})
fig,axes=plt.subplots(2,1,figsize=(11,6.7),sharex=True,layout='constrained')
axes[0].plot(x,heap,color='#d6f34a',lw=1.2,label='JS heap')
axes[0].axhline(data['baseline']['heap']['usedSize']/1e6,color='#a4b8bc',lw=.8,ls='--',label='Warm baseline')
axes[0].set_ylabel('JS heap (decimal MB)');axes[0].grid(alpha=.35);axes[0].legend(facecolor='#182831',labelcolor='#e5ebdf',edgecolor='#40545d')
axes[1].plot(x,geo,color='#85c6ef',lw=1.1,label='Geometry objects')
axes[1].set_ylabel('Live geometry objects');axes[1].grid(alpha=.35)
right=axes[1].twinx();right.plot(x,tex,color='#efb16e',lw=1.15,label='Texture objects');right.set_ylabel('Live texture objects',color='#efb16e');right.tick_params(axis='y',colors='#efb16e');right.set_ylim(min(tex)-2,max(tex)+2)
axes[1].set_xlabel('Elapsed minutes');axes[1].set_xlim(0,data['durationSeconds']/60)
axes[0].set_title(f"Local WebGL resource stability — {data['durationSeconds']/60:.1f} minutes",loc='left',pad=15)
fig.suptitle('SwiftShader test server • resource counts are not VRAM MB or physical-phone FPS',fontsize=10,color='#aebfc5')
fig.savefig(root/'verification/stability.png',dpi=160)
print('verification/stability.png')
