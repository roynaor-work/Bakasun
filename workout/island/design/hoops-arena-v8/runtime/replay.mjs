/** Bounded, in-memory transform recorder. No media, downloads or serialized data. */
export function createReplayRecorder(objects,{seconds=8,rate=30}={}) {
  if(!objects.length||objects.some(o=>!o.position||!o.quaternion||!o.scale))throw new TypeError('Track transform objects');
  if(!(seconds>0&&seconds<=30&&rate>=1&&rate<=60))throw new RangeError('Replay: seconds 0..30, rate 1..60');
  objects=[...objects]; // Keep the tracked set stable if the caller mutates its array.
  const stride=objects.length*11,capacity=Math.ceil(seconds*rate)+1;
  const samples=new Float64Array(capacity*stride),times=new Float64Array(capacity);
  let head=0,size=0,last=-Infinity,snapshot=null,cursor=0;
  const saved=new Float64Array(stride);
  function read(out,offset=0) {
    objects.forEach((o,i)=>{const n=offset+i*11;out.set([o.position.x,o.position.y,o.position.z,o.quaternion.x,o.quaternion.y,o.quaternion.z,o.quaternion.w,o.scale.x,o.scale.y,o.scale.z,o.visible===false?0:1],n);});
  }
  function write(data,offset=0) {
    objects.forEach((o,i)=>{const n=offset+i*11;o.position.set(data[n],data[n+1],data[n+2]);o.quaternion.set(data[n+3],data[n+4],data[n+5],data[n+6]);o.scale.set(data[n+7],data[n+8],data[n+9]);o.visible=!!data[n+10];o.updateMatrixWorld?.(true);});
  }
  function record(time) {
    if(!Number.isFinite(time))throw new TypeError('Finite replay time required');
    if(time<last)throw new RangeError('Replay timestamps must increase');
    if(time-last<1/rate-.00001)return false;
    read(samples,head*stride);times[head]=time;head=(head+1)%capacity;size=Math.min(size+1,capacity);last=time;return true;
  }
  function start() {
    if(size<2)return false;
    const data=new Float64Array(size*stride),ts=new Float64Array(size);
    const begin=(head-size+capacity)%capacity;
    for(let i=0;i<size;i++){const src=(begin+i)%capacity;ts[i]=times[src];data.set(samples.subarray(src*stride,(src+1)*stride),i*stride);}
    snapshot={data,times:ts,size,duration:ts[size-1]-ts[0]};cursor=0;return true;
  }
  const interp=new Float64Array(stride);
  function render(seconds,draw) {
    if(!snapshot)throw new Error('Start a replay before rendering');
    if(!Number.isFinite(seconds))throw new RangeError('Finite replay cursor required');
    const s=snapshot;cursor=Math.max(0,Math.min(s.duration,seconds));const t=s.times[0]+cursor;
    let hi=1;while(hi<s.size-1&&s.times[hi]<t)hi++;
    const lo=hi-1,span=s.times[hi]-s.times[lo],a=span?(t-s.times[lo])/span:0;
    for(let i=0;i<objects.length;i++) {
      const o=i*11,n=lo*stride+o,m=hi*stride+o;
      for(let k=0;k<11;k++)interp[o+k]=s.data[n+k]+(s.data[m+k]-s.data[n+k])*a;
      // Short-arc normalized quaternion interpolation, continuous across +/-q.
      let dot=0;for(let k=3;k<7;k++)dot+=s.data[n+k]*s.data[m+k];
      let len=0;for(let k=3;k<7;k++){const v=s.data[n+k]+((dot<0?-s.data[m+k]:s.data[m+k])-s.data[n+k])*a;interp[o+k]=v;len+=v*v;}
      len=Math.sqrt(len)||1;for(let k=3;k<7;k++)interp[o+k]/=len;
      interp[o+10]=s.data[(a<.5?n:m)+10];
    }
    read(saved);write(interp);
    try{return draw();}finally{write(saved);}
  }
  function stop(){snapshot=null;cursor=0;}
  return {record,start,render,stop,get duration(){return snapshot?.duration??0;},get cursor(){return cursor;},get size(){return size;},get memoryBytes(){return samples.byteLength+times.byteLength+(snapshot?snapshot.data.byteLength+snapshot.times.byteLength:0);}};
}
