"""Shared frames.json validation and a paired 60-second detection benchmark."""
import base64
import json
import subprocess
import time


def verify_frames(page, raw, session, require_images=False):
    data = json.loads(raw)
    assert data['version'] == 1 and data['session'] == session
    assert len(data['frames']) <= 60 and len(raw) <= 8_000_000
    assert len({f['name'] for f in data['frames']}) == len(data['frames'])
    if require_images:
        assert data['frames'], 'No key images captured'
    for frame in data['frames']:
        jpeg = base64.b64decode(frame['jpegBase64'], validate=True)
        assert jpeg[:2] == b'\xff\xd8' and jpeg[-2:] == b'\xff\xd9'
        assert frame['reason'] in ['bottom', 'rejected', 'interval']
        assert frame['tMs'] >= 0 and isinstance(frame['landmarks'], list)
        assert frame['rep'] >= 0
        assert frame['name'].endswith('-' + frame['reason'] + '.jpg')
    # Real browser JPEG decoder, rather than just a magic-byte assertion.
    dimensions = page.evaluate("""async frames => {
      const sizes = [];
      for (const frame of frames) {
        const bytes = Uint8Array.from(atob(frame.jpegBase64), c => c.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes], {type:'image/jpeg'}));
        sizes.push([image.width, image.height]); image.close();
      }
      return sizes;
    }""", data['frames'])
    assert dimensions == [[f['width'], f['height']] for f in data['frames']]
    return data


def run_keyframe_benchmark(browser, origin, root, parts, assembled):
    samples = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {pose} from './tests/cam-lab-fixtures.js'; console.log(JSON.stringify([180,145,90,75,140].map(angle=>pose({angle}))));"], cwd=root))
    results = []
    # Same synthetic pose workload and actual camera/recorder in both trials.
    # Only disable the collector in a test-served module for the baseline.
    for enabled in [False, True]:
        context = browser.new_context(ignore_https_errors=True, viewport={'width': 360, 'height': 844})
        context.add_init_script("""window.benchmarkSamples=%s; window.poseTimes=[];
          localStorage.setItem('camlab.upload',JSON.stringify({endpoint:location.origin+'/receive',secret:'test',consentId:'synthetic-benchmark'}));
          const NativeWorker=Worker;
          window.Worker=class extends NativeWorker {
            constructor(url,options){super(url,options);if(String(url).includes('pose-worker'))this.addEventListener('message',e=>{if(e.data.type==='pose')poseTimes.push(e.data.timestamp);});}
            postMessage(data,transfer){
              if(data.type==='frame'){
                window.benchmarkStarted ??= data.timestamp;
                const elapsed=data.timestamp-benchmarkStarted,cycle=Math.floor(elapsed/2500),phase=elapsed%%2500;
                const partial=cycle%%5===4;
                data.sample=benchmarkSamples[phase<750?0:phase<1100?1:phase<1350?2:phase<1700?3:0];
                if(partial&&phase>=1100&&phase<1700)data.sample=benchmarkSamples[4];
              } super.postMessage(data,transfer);
            }
          };""" % json.dumps(samples))
        context.route('**/cam-lab/pose-worker.js?*', lambda route: route.fulfill(content_type='application/javascript', body="""
          onmessage=({data})=>{
            if(data.type==='init')postMessage({type:'ready',model:'full',modelHistory:[]});
            if(data.type==='configure')postMessage({type:'configured',generation:data.generation,model:'full',modelHistory:[]});
            if(data.type==='frame'){
              // Fixed inference cost, independent of JPEG jobs in another worker.
              const start=performance.now();while(performance.now()-start<18){}
              const message={type:'pose',generation:data.generation,id:data.id,timestamp:data.timestamp,
                inferenceMs:18,model:'full',poses:[{landmarks:data.sample.p,world:data.sample.world}]};
              if(data.keepFrame){message.bitmap=data.bitmap;postMessage(message,[data.bitmap]);}
              else {data.bitmap.close();postMessage(message);}
            }
          };
        """))
        if not enabled:
            source = (root / 'workout/cam-lab/keyframes.mjs').read_text().replace('enabled = true', 'enabled = false')
            context.route('**/cam-lab/keyframes.mjs?*', lambda route: route.fulfill(content_type='application/javascript', body=source))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        offset = len(parts)
        page.goto(origin + '/workout/cam-lab/')
        page.locator('#voice').uncheck()
        page.locator('#camera').click()
        # Break waits into short slices so diagnostics remain observable.
        deadline = time.monotonic() + 90
        while not page.evaluate('window.benchmarkStarted!=null && performance.now()-benchmarkStarted>=60000'):
            assert time.monotonic() < deadline
            page.wait_for_timeout(250)
        page.locator('#finish').click()
        page.wait_for_function("() => document.querySelector('#upload-status').textContent==='נשלח לבדיקה'", timeout=45000)
        received = parts[offset:]
        session = received[0]['session']
        names = [p['part'] for p in received]
        assert names[:2] == ['diagnostics', 'skeleton']
        frame_parts = [p for p in received if p['part'] == 'frames']
        video_parts = [p for p in received if p['part'] == 'video']
        assert names == ['diagnostics', 'skeleton'] + ['frames'] * len(frame_parts) + ['video'] * len(video_parts)
        raw = assembled[(session, 'frames')]
        data = verify_frames(page, raw, session, require_images=enabled)
        diagnostics = json.loads(received[0]['data'])
        assert not diagnostics['keyframes']['errors'], diagnostics['keyframes']
        assert diagnostics['keyframes']['count'] == len(data['frames'])
        assert diagnostics['keyframes']['totalBytes'] == len(raw)
        times = page.evaluate('poseTimes')
        # Discard the shared startup/countdown period. Compare the same 55 seconds.
        steady = [t for t in times if t - times[0] >= 5000]
        fps = (len(steady) - 1) * 1000 / (steady[-1] - steady[0])
        if enabled:
            assert {'bottom', 'rejected', 'interval'} <= {f['reason'] for f in data['frames']}
            assert diagnostics['attempts'][0]['counted'] > 10
            assert diagnostics['attempts'][0]['rejected'] > 0
            skeleton = json.loads(received[1]['data'])
            assert all(any(abs(s['t'] - f['tMs']) < 2 for s in skeleton['frames']) for f in data['frames'])
        else:
            assert not data['frames']
        results.append({'enabled': enabled, 'fps': round(fps, 3), 'count': len(data['frames']),
                        'framesBytes': len(raw), 'jpegBytes': diagnostics['keyframes']['jpegBytes'],
                        'totalBytes': sum(len(assembled[(session, part)]) for part in ['diagnostics','skeleton','frames','video'])})
        assert not errors, errors
        context.close()
    drop = max(0, 100 * (1 - results[1]['fps'] / results[0]['fps']))
    report = {'secondsPerTrial': 60, 'inference': 'synthetic poses / fixed 18ms; real camera and JPEG encoder',
              'withoutImages': results[0], 'withImages': results[1], 'dropPercent': round(drop, 3)}
    print(json.dumps({'keyframeBenchmark': report}), flush=True)
    assert drop <= 10, report
    return report
