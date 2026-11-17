import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

export const AUDIO_LIMITS={minimumSNRdB:32,maxSampleError:0.035,maxLoopJump:0.003,maxLoopSlopeJump:0.006};
function run(command,args,input) {
  const result=spawnSync(command,args,{input,maxBuffer:64*1024*1024});
  if(result.error||result.status!==0)throw Error(`${command}: ${result.error?.message||result.stderr?.toString().slice(-1000)}`);
  return result.stdout;
}
export function probe(file) {
  const result=JSON.parse(run('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate,channels:format=duration,bit_rate','-of','json',file]));
  if(result.streams?.length!==1)throw Error('Expected one audio stream');
  return {...result.streams[0],durationSeconds:Number(result.format.duration),bitrate:Number(result.format.bit_rate)};
}
export function pcm(file,channels) {
  const buffer=run('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-ar','48000','-ac',String(channels),'-f','f32le','-c:a','pcm_f32le','pipe:1']);
  return new Float32Array(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
}
export function seam(samples,channels) {
  let jump=0,slopeJump=0,edgePeak=0;
  const frames=samples.length/channels;
  for(let c=0;c<channels;c++) {
    const first=samples[c],last=samples[(frames-1)*channels+c];
    jump=Math.max(jump,Math.abs(first-last));
    slopeJump=Math.max(slopeJump,Math.abs((samples[channels+c]-first)-(last-samples[(frames-2)*channels+c])));
    for(let i=0;i<Math.min(240,frames);i++)edgePeak=Math.max(edgePeak,Math.abs(samples[i*channels+c]),Math.abs(samples[(frames-1-i)*channels+c]));
  }
  return {jump,slopeJump,edgePeak,pass:jump<=AUDIO_LIMITS.maxLoopJump&&slopeJump<=AUDIO_LIMITS.maxLoopSlopeJump};
}
export function audioDifference(a,b) {
  if(a.length!==b.length)return {sameSamples:false,sourceSamples:a.length,outputSamples:b.length,snrDB:null,maxSampleError:null};
  let power=0,error=0,maxSampleError=0;
  for(let i=0;i<a.length;i++){const d=a[i]-b[i];power+=a[i]*a[i];error+=d*d;maxSampleError=Math.max(maxSampleError,Math.abs(d));}
  return {sameSamples:true,sourceSamples:a.length,outputSamples:b.length,snrDB:error?10*Math.log10(Math.max(power,1e-30)/error):999,maxSampleError};
}
export async function compressAudio(source,tempFile,{loop=false}={}) {
  const info=probe(source),channels=info.channels;
  if(channels>2)throw Error('Multichannel audio requires manual review');
  const reference=pcm(source,channels),sourceSeam=seam(reference,channels);
  // Existing Opus is already the delivery format. Avoid generational loss.
  if(info.codec_name==='opus'&&(!loop||sourceSeam.pass))return {bytes:await readFile(source),selected:false,safe:true,codec:'opus-preserved',quality:{sameSamples:true,snrDB:999,maxSampleError:0,frames:reference.length/channels,channels,sampleRate:48000,sourceSeam,outputSeam:sourceSeam,loop},bitrate:info.bitrate,reason:'Already Opus; original bitstream retained'};
  const args=['-v','error','-y','-i',source,'-map_metadata','-1','-ar','48000','-ac',String(channels),'-c:a','libopus','-b:a',channels===1?'64k':'96k','-vbr','on','-compression_level','10','-application','audio','-fflags','+bitexact','-flags:a','+bitexact'];
  // Preserve exact duration. A 5ms cosine taper makes problematic loop endpoints
  // meet at zero; the same SNR/error gate applies to this DSP change as to Opus.
  const taper=loop&&!sourceSeam.pass;
  if(taper) {
    const duration=reference.length/channels/48000;
    args.push('-af',`afade=t=in:d=0.005:curve=hsin,afade=t=out:st=${Math.max(0,duration-0.005)}:d=0.005:curve=hsin`);
  }
  args.push('-f','ogg',tempFile);run('ffmpeg',args);
  const decoded=pcm(tempFile,channels),quality={...audioDifference(reference,decoded),sourceSeam,outputSeam:seam(decoded,channels),loop,taperMilliseconds:taper?5:0,channels,sampleRate:48000};
  const safe=quality.sameSamples&&quality.snrDB>=AUDIO_LIMITS.minimumSNRdB&&quality.maxSampleError<=AUDIO_LIMITS.maxSampleError&&(!loop||quality.outputSeam.pass);
  const candidate=await readFile(tempFile),original=await readFile(source),selected=safe&&(candidate.length<original.length||taper);
  const selectedQuality=selected?quality:{sameSamples:true,sourceSamples:reference.length,outputSamples:reference.length,snrDB:999,maxSampleError:0,sourceSeam,outputSeam:sourceSeam,loop,taperMilliseconds:0,channels,sampleRate:48000};
  return {bytes:selected?candidate:original,selected,safe,codec:selected?'opus':info.codec_name,candidateBytes:candidate.length,targetBitrate:channels===1?64000:96000,quality:selectedQuality,candidateQuality:quality,reason:safe?'Opus passed sample count, SNR, peak error and loop gates':'Candidate failed audio quality gate; original retained'};
}
