// Separate from pose inference: asynchronous JPEG compression and Base64 never
// occupy the detector worker or paint an overlay onto the camera image.
let work = Promise.resolve();
self.onmessage = ({ data }) => {
  work = work.then(async () => {
    const { id, bitmap, quality } = data;
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      const buffer = new Uint8Array(await blob.arrayBuffer()), chunks = [];
      for (let i = 0; i < buffer.length; i += 32768) chunks.push(String.fromCharCode(...buffer.subarray(i, i + 32768)));
      self.postMessage({ id, jpegBase64: btoa(chunks.join('')) });
    } catch { self.postMessage({ id, error: 'jpeg-encoding' }); }
    finally { bitmap.close(); }
  });
};
