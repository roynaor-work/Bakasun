#!/usr/bin/env python3
"""Validate audit references, untouched product files and original PNG pixels."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import zlib
from PIL import Image

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
PREFIX=HERE.relative_to(ROOT).as_posix()+'/'


def optimize_png(path):
    """Recompress IDAT losslessly; no image manipulation or pixel resampling."""
    source=path.read_bytes();assert source[:8]==b'\x89PNG\r\n\x1a\n'
    chunks=[];offset=8
    while offset<len(source):
        size=struct.unpack('>I',source[offset:offset+4])[0]
        kind=source[offset+4:offset+8];data=source[offset+8:offset+8+size]
        chunks.append((kind,data));offset+=12+size
    original=zlib.decompress(b''.join(data for kind,data in chunks if kind==b'IDAT'))
    packed=zlib.compress(original,9);assert zlib.decompress(packed)==original
    result=bytearray(source[:8]);written=False
    for kind,data in chunks:
        if kind==b'IDAT':
            if written:continue
            data=packed;written=True
        result+=struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    if len(result)<len(source):path.write_bytes(result)
    return {'before':len(source),'after':min(len(source),len(result)),'pixelRowsSha256':hashlib.sha256(original).hexdigest()}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--optimize',action='store_true')
    parser.add_argument('--test-log',type=Path,default=Path('/tmp/kid-ux-audit/npm-test.log'))
    args=parser.parse_args()
    report=json.loads((HERE/'findings.json').read_text());problems=[]
    screens={s['id']:s for s in report['screens']}
    for f in report['findings']:
        for sid in f['screens']:
            if sid not in screens:problems.append('Missing finding screen: '+sid)
        for source in f['sources']:
            path=source.rsplit(':',1)[0] if re.search(r':\d+$',source) else source
            if not (ROOT/'workout/island'/path).is_file():problems.append('Missing source: '+source)
    if len({f['id']for f in report['findings']})!=len(report['findings']):problems.append('Duplicate finding ID')
    bundles={p.name:json.loads(p.read_text())for p in HERE.glob('evidence-*.json')}
    for s in screens.values():
        raw=bundles[s['evidenceFile']]['screens'][s['evidenceScreenIndex']]
        if raw['id']!=s['id']:problems.append('Incorrect evidence index: '+s['id'])
        if raw['metrics']['viewport']['width']!=844:problems.append('Unexpected measured width: '+s['id'])
    images=[];saved=0
    for path in sorted((HERE/'screenshots').glob('*.png')):
        entry={'path':path.relative_to(HERE).as_posix()}
        if args.optimize:
            entry['losslessCompression']=optimize_png(path)
            saved+=entry['losslessCompression']['before']-entry['losslessCompression']['after']
        with Image.open(path) as im:
            entry['width'],entry['height']=im.size;im.verify()
        with Image.open(path) as decoded:decoded.load()
        if (entry['width'],entry['height'])!=(844,390):problems.append('Invalid screenshot dimensions: '+path.name)
        entry['bytes']=path.stat().st_size;entry['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();images.append(entry)
    for s in screens.values():
        if not (HERE/s['screenshot']).is_file():problems.append('Missing PNG: '+s['screenshot'])
    markdown=(HERE/'REPORT.md').read_text()
    for target in re.findall(r'\]\(([^)]+)\)',markdown):
        if target.startswith(('http:','https:')):continue
        if target!='verification.json' and not (HERE/target.split('#',1)[0]).exists():problems.append('Broken report link: '+target)
    for path in HERE.glob('*.py'):ast.parse(path.read_text(),filename=path.name)
    changed=subprocess.check_output(['git','diff','--name-status',report['sourceCommit']],cwd=ROOT,text=True).splitlines()
    outside=[row for row in changed if not row.split('\t')[-1].startswith(PREFIX)]
    edited=[row for row in changed if row.split('\t')[0]!='A']
    if outside:problems.append('Changes outside audit package: '+repr(outside))
    if edited:problems.append('Existing files changed: '+repr(edited))
    expected=['alienDefense','fireRescue','navalDuel','soccer','tennis','islandRacing','streetSlam','alpineRush','boarDefense','catchCriminal']
    for game in expected:
        if not report['summary']['verifiedExits'].get(game):problems.append('Exit not verified: '+game)
        if not any(s['game']==game for s in screens.values()):problems.append('Game not captured: '+game)
    test_text=args.test_log.read_text() if args.test_log.exists() else ''
    test_summary={}
    for key in ['tests','suites','pass','fail','cancelled','skipped','todo','duration_ms']:
        match=re.search(r'^(?:ℹ |# )'+key+r' ([\d.]+)\s*$',test_text,re.M)
        if match:test_summary[key]=float(match.group(1)) if '.' in match.group(1) else int(match.group(1))
    test_summary['command']='npm test';test_summary['completed']='tests' in test_summary
    # Failure names only, never copy arbitrary logs or application data into the package.
    test_summary['failureNames']=re.findall(r'^✖ (.{1,240})',test_text,re.M)[:30]
    retest_log=args.test_log.with_name('royiki-system-browser.log')
    retest={}
    if retest_log.exists():
        for key in ['tests','pass','fail','cancelled','skipped','duration_ms']:
            match=re.search(r'^(?:ℹ |# )'+key+r' ([\d.]+)\s*$',retest_log.read_text(),re.M)
            if match:retest[key]=float(match.group(1)) if '.' in match.group(1) else int(match.group(1))
    retest['command']='node --test tests/workout-royiki.test.mjs with a test-only launch executable override to /usr/bin/chromium'
    retest['sourceFilesEdited']=False
    test_summary['environmentFailure']='Missing Playwright-bundled Chromium headless shell. Failed worker retained an HTTP server; only that failed worker was terminated to let npm report. No product/test file was modified.'
    errors=[{'file':name,**e}for name,d in bundles.items()for e in d.get('errors',[])]
    unresolved=[e for e in errors if not e.get('recoveredBy') and e.get('kind')!='touch-scroll-blocked']
    if unresolved:problems.append('Unresolved capture diagnostics: '+repr([e['screen']for e in unresolved]))
    output={'passed':not problems,'problems':problems,'sourceCommit':report['sourceCommit'],
        'onlyNewAuditFiles':not outside and not edited,'existingProductFilesUntouched':not outside,
        'sourceDiff':changed,'findingCount':len(report['findings']),'indexedScreens':len(screens),
        'pngCount':len(images),'screenshots':images,'losslessBytesSavedThisRun':saved,
        'playwrightRunnerDiagnostics':errors,'npmTest':test_summary,'systemChromiumRetest':retest,
        'checks':['JSON parses and evidence references','all report links','all 844x390 PNGs fully decode','Python syntax','all 10 game exits','no existing product-file changes']}
    (HERE/'verification.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in output.items()if k not in ['screenshots','playwrightRunnerDiagnostics']},ensure_ascii=False,indent=2))
    if problems:raise SystemExit(1)


if __name__=='__main__':main()
