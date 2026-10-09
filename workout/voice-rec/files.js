// WAV ו-ZIP ללא ספרייה חיצונית וללא שרת.
export function wavBlob(buffer) {
  const size = buffer.length * 2, bytes = new ArrayBuffer(44 + size), view = new DataView(bytes);
  const str = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + size, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, size, true);
  for (let i = 0; i < buffer.length; i++) {
    let sample = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) sample += buffer.getChannelData(c)[i];
    sample = Math.max(-1, Math.min(1, sample / buffer.numberOfChannels));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export async function zipBlob(files) {
  const chunks = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const { name, blob } of files) {
    if (!/^[a-zA-Z0-9_-]+\.wav$/.test(name)) throw new Error('שם קובץ לא תקין');
    const filename = new TextEncoder().encode(name), bytes = new Uint8Array(await blob.arrayBuffer()), crc = crc32(bytes);
    const local = new Uint8Array(30 + filename.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(12, 33, true);
    l.setUint32(14, crc, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true);
    l.setUint16(26, filename.length, true); local.set(filename, 30);
    const central = new Uint8Array(46 + filename.length), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true);
    c.setUint16(28, filename.length, true); c.setUint32(42, offset, true); central.set(filename, 46);
    chunks.push(local, bytes); directory.push(central); offset += local.length + bytes.length; directorySize += central.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
