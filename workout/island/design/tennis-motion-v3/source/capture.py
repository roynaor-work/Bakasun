#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
"""Capture 144 native GLB poses through the production preview and exercise its controls.

Dependencies: Python 3, Pillow, Playwright and Chromium with WebGL2. Run
python3 source/capture.py from the package. Use --browser to change the executable.
"""
import argparse
import base64
from collections import defaultdict
from functools import partial
from hashlib import sha256
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
from threading import Thread
from urllib.parse import unquote, urlsplit

from PIL import Image, ImageChops, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
FRAME_SIZE = (320, 278)
VIEWPORT = {"width": 844, "height": 390}
FRAME_COUNT = 8


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def load_font(size, bold=False, mono=False):
    family = 'DejaVuSansMono' if mono else 'DejaVuSans'
    name = family + ('-Bold' if bold else '') + '.ttf'
    return ImageFont.truetype(name, size)


def choose_frames(clip):
    """Keep cue frames, distribute the remaining samples over the largest gaps."""
    last = clip['frameCount'] - 1
    if last + 1 < FRAME_COUNT:
        raise ValueError(f"Fewer than {FRAME_COUNT} native frames in {clip['id']}")
    # A seamless loop repeats its starting pose at the terminal key.
    end = last - 1 if clip.get('loop') and last >= FRAME_COUNT else last
    events = defaultdict(list)
    for event in clip['events']:
        frame = event['frame']
        if not isinstance(frame, int) or not 0 <= frame <= last:
            raise ValueError(f"Invalid event {event!r} in {clip['id']}")
        events[frame].append(event)

    chosen = set()

    def nearest(frame):
        return min((abs(frame - key) for key in chosen), default=last + 1)

    cue_frames = set(events)
    while cue_frames and len(chosen) < FRAME_COUNT:
        def cue_rank(frame):
            important = any(e['type'] in ('contact', 'release', 'bounce') for e in events[frame])
            return important, nearest(frame), -frame
        frame = max(cue_frames, key=cue_rank)
        chosen.add(frame)
        cue_frames.remove(frame)
    for frame in sorted({0, end} - chosen, key=nearest, reverse=True):
        if len(chosen) < FRAME_COUNT:
            chosen.add(frame)
    while len(chosen) < FRAME_COUNT:
        frame = max(range(end + 1), key=lambda k: (nearest(k), -k))
        chosen.add(frame)
    return sorted(chosen), events


def decode_png(data_url):
    prefix = 'data:image/png;base64,'
    if not data_url.startswith(prefix):
        raise ValueError('The preview must return a lossless PNG framebuffer')
    return Image.open(BytesIO(base64.b64decode(data_url[len(prefix):]))).convert('RGB')


def difference_mask(a, b, threshold=12):
    r, g, blue = ImageChops.difference(a, b).split()
    maximum = ImageChops.lighter(ImageChops.lighter(r, g), blue)
    return maximum.point(lambda value: 255 if value > threshold else 0)


def capture_samples(page, clip):
    page.evaluate('(id) => window.tennisPreview.select(id)', clip['id'])
    page.evaluate('() => window.tennisPreview.pause()')
    indices, events = choose_frames(clip)
    width, height = FRAME_SIZE
    cache = {}
    subjects = {}
    # The preview fits a stationary camera to the entirety of each clip. A court
    # rendered with both player groups hidden is shared by all samples in it.
    clean = page.evaluate('''([w,h]) => window.tennisPreview.capture(w,h,{backgroundOnly:true})''',
                          [width, height])
    background = decode_png(clean)

    def capture(index):
        if index not in cache:
            result = page.evaluate('''([index, width, height]) => {
              const app = window.tennisPreview;
              app.seekFrame(index);
              return {
                state: app.snapshot(),
                pose: app.capture(width, height),
                subject: app.capture(width, height, {subjectOnly: true})
              };
            }''', [index, width, height])
            state = result['state']
            if state['frame'] != index or state['clip'] != clip['id']:
                raise ValueError(f"Requested {clip['id']} F{index}, received {state}")
            image = decode_png(result['pose'])
            subject = decode_png(result['subject'])
            if any(frame.size != FRAME_SIZE for frame in (image, subject, background)):
                raise ValueError(f"Unexpected framebuffer dimensions for {clip['id']}")
            subjects[index] = subject
            mask = difference_mask(subject, background)
            bounds = mask.getbbox()
            if bounds is None or mask.histogram()[255] < 120:
                raise ValueError(f"Missing silhouette in {clip['id']} F{index}")
            margin = min(bounds[0], bounds[1], width - bounds[2], height - bounds[3])
            cache[index] = (image, {
                'frame': index, 'seconds': round(index / clip['fps'], 6),
                'events': [e['type'] for e in events.get(index, [])],
                'rgbSha256': sha256(image.tobytes()).hexdigest(),
                'subjectSha256': sha256(subject.tobytes()).hexdigest(),
                'visiblePixels': mask.histogram()[255],
                'foregroundBoxPx': list(bounds), 'edgeMarginPx': margin,
            })
        return cache[index]

    # Holds and matching first/last poses are legitimate animation. Retain
    # semantic cue frames first, then find the nearest distinct pose for a hold.
    used = set()
    selected = {}
    differences = {}

    def changed_pixels(a, b):
        pair = tuple(sorted((a, b)))
        if pair not in differences:
            differences[pair] = difference_mask(subjects[a], subjects[b], 16).histogram()[255]
        return differences[pair]
    for i in sorted(range(FRAME_COUNT), key=lambda n: (not bool(events.get(indices[n])), n)):
        desired = indices[i]
        low = 0 if i == 0 else (indices[i - 1] + desired) // 2 + 1
        high = clip['frameCount'] - 1 if i == 7 else (desired + indices[i + 1]) // 2
        nearby = sorted(range(low, high + 1), key=lambda n: (abs(n - desired), n))
        reserved = set(indices) | {s['frame'] for _, s in selected.values()}
        remaining = set(range(clip['frameCount'])) - reserved - set(nearby)
        # If a final hold occupies the whole interval, replace it with a pose
        # from the largest unrepresented gap of the performance.
        other = sorted(remaining, key=lambda n: (-min(abs(n - k) for k in reserved),
                                                  abs(n - desired), n))
        for index in nearby + other:
            image, sample = capture(index)
            digest = sample['subjectSha256']
            if digest in used:
                continue
            if any(changed_pixels(index, prev['frame']) < max(20, .015 * min(sample['visiblePixels'], prev['visiblePixels']))
                   for _, prev in selected.values()):
                continue
            selected[i] = (image, sample)
            used.add(digest)
            break
        else:
            raise ValueError(f"Fewer than eight distinct player poses in {clip['id']}")
    for _, item in selected.values():
        item['minChangedSubjectPixels'] = min(changed_pixels(item['frame'], prev['frame'])
                                              for _, prev in selected.values() if prev is not item)
    return sorted(selected.values(), key=lambda pair: pair[1]['frame']), events


def draw_sheet(clip, samples, events, path):
    card_w, card_h = FRAME_SIZE
    gutter, inset, caption, header = 7, 16, 35, 64
    width = 2 * inset + 4 * card_w + 3 * gutter
    height = header + 2 * (card_h + caption) + gutter + inset
    paper, ink, accent = '#f8f6ee', '#183d37', '#27634e'
    image = Image.new('RGB', (width, height), paper)
    draw = ImageDraw.Draw(image)
    title = clip.get('labelHe') or clip.get('label') or clip['id'].replace('_', ' ').title()
    face = load_font(26, bold=True)
    mono = load_font(14, mono=True)
    small = load_font(14)
    draw.text((width - inset, 16), title, anchor='rt', font=face, fill=ink)
    draw.text((inset, 13), clip['id'], font=load_font(16, bold=True, mono=True), fill=ink)
    last = clip['frameCount'] - 1
    draw.text((inset, 37), f"{clip['fps']:g} Hz   /   {last / clip['fps']:.2f} s",
              font=load_font(12, mono=True), fill='#527067')
    for n, (frame, sample) in enumerate(samples):
        x = inset + n % 4 * (card_w + gutter)
        y = header + n // 4 * (card_h + caption + gutter)
        image.paste(frame, (x, y))
        fy = y + card_h
        index = sample['frame']
        cues = events.get(index, [])
        draw.rectangle((x, fy, x + card_w - 1, fy + caption - 1),
                       fill='#e0ebde' if cues else '#ecefe5')
        draw.text((x + 9, fy + 9), f"F{index:03d}  {sample['seconds']:.2f}s",
                  font=mono, fill=ink)
        if cues:
            label = ' · '.join(e.get('label') or e['type'] for e in cues)
            size = 14
            while draw.textlength(label, font=small) > card_w - 130 and size > 9:
                size -= 1
                small = load_font(size)
            draw.text((x + card_w - 9, fy + 10), label, anchor='rt', font=small, fill=accent)
            small = load_font(14)
    image.save(path, 'WEBP', quality=91, method=6)
    with Image.open(path) as check:
        if check.size != (width, height) or check.format != 'WEBP':
            raise ValueError(f"Bad contact sheet {path}")


def check_controls(page, clips):
    app = 'window.tennisPreview'
    page.locator('#clips button[data-id]').first.wait_for()
    buttons = page.locator('#clips button[data-id]')
    if buttons.count() != len(clips):
        raise ValueError('Preview clip list and catalog differ')
    for clip in clips:
        page.locator('#clips button[data-id="' + clip['id'] + '"]').click()
        if page.evaluate(f'{app}.snapshot().clip') != clip['id']:
            raise ValueError(f"Clip selector failed for {clip['id']}")
    chosen = next((clip for clip in clips if clip['id'] == 'volley_low'), clips[0])
    page.locator('#clips button[data-id="' + chosen['id'] + '"]').click()
    page.evaluate(f'{app}.pause()')
    page.locator('#time').evaluate('''input => {
      input.value = String(Number(input.min) + .37 * (Number(input.max) - Number(input.min)));
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }''')
    scrubbed = page.evaluate(f'{app}.snapshot().frame')
    if abs(scrubbed - .37 * (chosen['frameCount'] - 1)) > 1:
        raise ValueError(f"Scrubber landed on unexpected frame {scrubbed}")
    page.locator('#play').click()
    page.wait_for_function('f => window.tennisPreview.snapshot().frame !== f', arg=scrubbed)
    page.locator('#play').click()
    if page.evaluate(f'{app}.snapshot().playing'):
        raise ValueError('Playback stayed active after pause')
    return {'clipButtonsChecked': buttons.count(), 'scrubFrame': scrubbed, 'playPause': True}


def check_view_and_events(page, clips):
    app = 'window.tennisPreview'
    checked_events = 0
    checked_sheets = 0
    for clip in clips:
        page.locator(f'#clips button[data-id="{clip["id"]}"]').click()
        buttons = page.locator('#events button')
        seen = set()
        if buttons.count() != len(clip['events']):
            raise ValueError(f"Incomplete event controls for {clip['id']}")
        for button, event in zip(buttons.all(), clip['events']):
            button.click()
            frame = page.evaluate(f'{app}.snapshot().frame')
            if frame != event['frame']:
                raise ValueError(f"Event button in {clip['id']} sought to F{frame}")
            seen.add(frame)
        if clip['events'] and not seen:
            raise ValueError(f"No event controls for {clip['id']}")
        checked_events += len(seen)
        sheet = page.locator('#sheet')
        expected = 'sheets/' + clip['id'] + '.webp'
        if not sheet.is_visible() or not sheet.get_attribute('href').endswith(expected):
            raise ValueError(f"Missing sheet link for {clip['id']}")
        decoded = sheet.evaluate("""async link => {
          const image = new Image();
          image.src = link.href;
          await image.decode();
          return image.naturalWidth > 0 && image.naturalHeight > 0;
        }""")
        if not decoded:
            raise ValueError(f"Browser could not decode {expected}")
        checked_sheets += 1
    page.locator('#clips button[data-id="volley_low"]').click()
    page.evaluate(f'{app}.pause()')
    page.locator('#view').select_option('side')
    if page.evaluate(f'{app}.snapshot().view') != 'side':
        raise ValueError('Side-view camera selection failed')
    page.locator('#view').select_option('three')
    page.locator('#speed').select_option('.5')
    if page.locator('#speed').input_value() != '.5':
        raise ValueError('Speed selection failed')
    page.locator('#speed').select_option('1')
    clip = next(c for c in clips if c['id'] == 'volley_low')
    contact = next(e['frame'] for e in clip['events'] if e['type'] == 'contact')
    page.evaluate(f'f => {app}.seekFrame(f)', contact)
    page.locator('#stage').press('ArrowRight')
    if page.evaluate(f'{app}.snapshot().frame') != contact + 1:
        raise ValueError('Frame stepping failed')
    page.locator('#stage').press('ArrowLeft')
    page.locator('#stage').blur()
    return {'eventFramesChecked': checked_events, 'sheetLinksChecked': checked_sheets,
            'cameraSelection': True, 'speedSelection': True, 'frameStep': True,
            'screenshot': {'path': 'preview-844x390.png', 'clip': clip['id'], 'frame': contact}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', default='/usr/bin/chromium')
    args = parser.parse_args()
    sheet_dir, verify = ROOT / 'sheets', ROOT / 'verification'
    sheet_dir.mkdir(exist_ok=True)
    verify.mkdir(exist_ok=True)
    source_hashes = {name: sha256((ROOT / name).read_bytes()).hexdigest()
                     for name in ('catalog.json', 'preview.mjs', 'court.mjs', 'preview.html', 'preview.css')}
    catalog = json.loads((ROOT / 'catalog.json').read_text())
    clips = [{**c, 'fps': c.get('fps', catalog['fps'])} for c in catalog['clips']]
    if len(clips) != 18 or len({c['id'] for c in clips}) != len(clips):
        raise ValueError('Expected 18 unique catalog clips')
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(REPO)))
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    url = f'{origin}/{ROOT.relative_to(REPO).as_posix()}/preview.html'
    errors, failed, external, forbidden, sheets = [], [], [], [], []
    assets = {}

    def inspect_response(response):
        path = unquote(urlsplit(response.url).path).lower()
        if response.status >= 400:
            failed.append({'path': path, 'status': response.status})
        if (path.endswith('.wasm') or 'draco' in path or 'meshopt' in path or 'ktx2' in path):
            forbidden.append(path)
        if path.endswith('.glb') and response.ok:
            assets[unquote(urlsplit(response.url).path)] = sha256(response.body()).hexdigest()

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=args.browser, headless=True, args=[
                '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
                '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            ])
            page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', inspect_response)
            page.on('request', lambda req: external.append(req.url)
                    if not req.url.startswith((origin + '/', 'data:', 'blob:')) else None)
            page.goto(url)
            page.wait_for_function('Boolean(window.tennisPreview?.ready)', timeout=90000)
            page.evaluate('window.tennisPreview.ready.then(() => true)')
            version = browser.version
            for clip in clips:
                images, events = capture_samples(page, clip)
                path = sheet_dir / (clip['id'] + '.webp')
                draw_sheet(clip, images, events, path)
                samples = [s for _, s in images]
                sheets.append({'id': clip['id'], 'sheet': 'sheets/' + path.name,
                               'bytes': path.stat().st_size, 'samples': samples})
                print(f"{clip['id']}: " + ', '.join(str(s['frame']) for s in samples), flush=True)
            controls = check_controls(page, clips)
            controls.update(check_view_and_events(page, clips))
            layout = page.evaluate('''() => ({
              viewport: [innerWidth, innerHeight],
              document: [document.documentElement.scrollWidth,document.documentElement.scrollHeight],
              stage: window.tennisPreview.stage.getBoundingClientRect().toJSON()
            })''')
            page.screenshot(path=str(verify / 'preview-844x390.png'))
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    samples = [s for sheet in sheets for s in sheet['samples']]
    if any(sha256((REPO / path.lstrip('/')).read_bytes()).hexdigest() != digest
           for path, digest in assets.items()):
        raise ValueError('A served GLB changed during capture. Re-run with the final assets.')
    for name, checksum in source_hashes.items():
        if sha256((ROOT / name).read_bytes()).hexdigest() != checksum:
            raise ValueError(f"{name} changed during capture. Re-run with the final preview.")
    for name, expected in [(catalog['asset'], catalog['sha256']),
                           (catalog['referenceAsset'], catalog['provenance']['referenceAssetSha256'])]:
        asset_path = '/' + (ROOT / name).resolve().relative_to(REPO).as_posix()
        if assets.get(asset_path) != expected:
            raise ValueError(f"Browser loaded a different {name} than the catalog specifies")
    minimum = min(s['edgeMarginPx'] for s in samples)
    fits = layout['document'] == layout['viewport'] and layout['stage']['height'] > 100
    report = {
        'pass': (not (errors or failed or external or forbidden) and fits and minimum > 0 and len(samples) == 18 * FRAME_COUNT),
        'browser': 'Chromium ' + version + ' / SwiftShader WebGL2', 'viewport': VIEWPORT,
        'assetSha256': assets, 'sourceSha256': source_hashes,
        'sheetCount': len(sheets), 'renderedFrames': len(samples),
        'framebufferPx': list(FRAME_SIZE), 'minForegroundMarginPx': minimum,
        'silhouetteMethod': 'At the same camera, per-frame max RGB difference >12 between the bare court and the court plus players and rackets. The sheets additionally include the ball and floor shadows.',
        'poseDifference': 'Every pair among the eight subject-only frames differs by >16 RGB levels in at least 20 pixels and 1.5% of the smaller player silhouette.',
        'controls': controls, 'layout': layout, 'errors': errors, 'failedResponses': failed,
        'externalRequests': external, 'forbiddenDecoderRequests': forbidden, 'clips': sheets,
    }
    (verify / 'browser.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ('pass', 'sheetCount', 'renderedFrames', 'minForegroundMarginPx')}))
    if not report['pass']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
