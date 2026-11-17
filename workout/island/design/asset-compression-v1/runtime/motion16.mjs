// Browser + Node decoder. Only explicitly marked keyframe vectors are quantized.
const MAGIC = [73,83,76,77,49,54,1,0];
export function decodeMotion16(input) {
  const bytes=new Uint8Array(input.buffer||input,input.byteOffset||0,input.byteLength);
  if (bytes.length<12 || MAGIC.some((b,i)=>bytes[i]!==b)) throw Error('Invalid motion16 header');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), length=view.getUint32(8,true), start=12+length;
  if (start>bytes.length || (bytes.length-start)%2) throw Error('Invalid motion16 length');
  const template=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(12,start)));
  function restore(value) {
    if (!value || typeof value!=='object') return value;
    if (!Array.isArray(value) && Object.keys(value).length===1 && Object.hasOwn(value,'$islandInt16')) {
      const [offset,count,scale]=value.$islandInt16;
      if (!Number.isInteger(offset)||!Number.isInteger(count)||offset<0||count<1||!(scale>0)||!Number.isFinite(scale)||start+(offset+count)*2>bytes.length) throw Error('Invalid motion16 vector');
      return Array.from({length:count},(_,i)=>view.getInt16(start+(offset+i)*2,true)*scale);
    }
    if (Array.isArray(value)) return value.map(restore);
    for (const key of Object.keys(value)) value[key]=restore(value[key]);
    return value;
  }
  return restore(template);
}
