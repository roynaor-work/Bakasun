// Classic worker: MediaPipe's WASM loader uses importScripts (unsupported in module workers).
self.exports = {};
importScripts('./vendor/vision_bundle.js');
const {FilesetResolver, PoseLandmarker} = self.exports;
let pose;
self.onmessage = async ({data}) => {
  if(data.type==='init') {
    try {
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
      pose=await PoseLandmarker.createFromOptions(files, {
        baseOptions:{modelAssetPath:new URL('./models/pose_landmarker_lite.task',self.location.href).href,delegate:'CPU'},
        runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,
        minPosePresenceConfidence:.6,minTrackingConfidence:.6,outputSegmentationMasks:false,
      });
      self.postMessage({type:'ready'});
    } catch(error) {self.postMessage({type:'error',message:String(error)});}
  }
  if(data.type==='frame') {
    const start=performance.now();
    try {
      // Synchronous inference lives off the UI thread; only landmarks leave this worker.
      const result=pose.detectForVideo(data.bitmap,data.timestamp);
      self.postMessage({type:'pose',points:result.landmarks[0]||null,
        world:result.worldLandmarks[0]||null,ms:performance.now()-start,timestamp:data.timestamp,session:data.session});
    } catch(error) {self.postMessage({type:'error',message:String(error)});}
    finally {data.bitmap.close();}
  }
};
