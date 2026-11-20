const sampleSpecs={
  'rim-hit-01': [.72,125,5000],
  'rim-hit-02': [.69,125,5000],
  'rim-hit-03': [.75,125,5000],
  'backboard-thud': [.76,90,3700],
  'net-swish': [.78,260,6600],
  'ball-parquet-soft': [.32,65,4100],
  'ball-parquet-medium': [.48,65,4500],
  'ball-parquet-hard': [.68,65,5000],
};

export function hoopsImpactSamples() {
  return Object.entries(sampleSpecs).map(([name,[gain,highpass,lowpass]])=>{
    const path=`../assets/hoops-polish-v1/audio/${name}`;
    return [`impact:${name}`,{
      url:new URL(path+'.ogg',import.meta.url),alt:new URL(path+'.mp3',import.meta.url),
      recommended_gain_linear:gain,max_voices:2,attack:.003,impact:true,
      filters:{highpass_hz:highpass,lowpass_hz:lowpass},
    }];
  });
}

export function hoopsImpactCue(kind,velocity=3) {
  const speed=Number.isFinite(velocity)?Math.max(0,velocity):3;
  const volume=Math.min(.91,.36+.105*speed);
  switch(kind) {
    case 'rim': {
      const sample=speed<2.15?'rim-hit-01':speed<4.8?'rim-hit-02':'rim-hit-03';
      return {sample,volume,cooldown:85,priority:2};
    }
    case 'floor': {
      const sample=speed<2.6?'ball-parquet-soft':speed<5.7?'ball-parquet-medium':'ball-parquet-hard';
      return {sample,volume:.82+.18*volume,cooldown:112,priority:0};
    }
    case 'board': return {sample:'backboard-thud',volume,cooldown:95,priority:1};
    case 'pad': return {sample:'backboard-thud',volume:volume*.62,rate:.72,lowpass:690,cooldown:110,priority:1};
    case 'block': return {sample:'backboard-thud',volume:.31,rate:1.29,lowpass:1250,cooldown:105,priority:1};
    case 'net': return {sample:'net-swish',volume:.68,cooldown:135,priority:2};
    default: return null;
  }
}
