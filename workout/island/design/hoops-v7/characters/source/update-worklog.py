#!/usr/bin/env python3
"""Index immutable capture manifests without inventing durations or approvals."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--accept', default='', help='Comma-separated visually reviewed iteration IDs.')
args = parser.parse_args()
accepted = set(filter(None, args.accept.split(',')))
root = Path(__file__).resolve().parent.parent
target = root / 'verification/worklog.json'
work = json.loads(target.read_text())
rows = []
for p in sorted((root / 'iterations').glob('[0-9][0-9]/capture.json')):
    capture = json.loads(p.read_text())
    number = p.parent.name
    critique = p.parent / 'CRITIQUE.md'
    if number in accepted and (not critique.exists() or not capture['pass']):
        raise SystemExit(f'Acceptance requires a critique and successful capture: {number}')
    row = {'iteration': number, 'startedAtUtc': capture['startedAtUtc'],
           'finishedAtUtc': capture['finishedAtUtc'],
           'screenshots': len(capture['screenshots']),
           'technicalCapturePass': capture['pass'],
           'critique': str(critique.relative_to(root)),
           'visualAcceptance': number in accepted}
    if number == '08':
        row['limitedVisualAcceptance'] = 'Hold/roster criteria reached8 before final garment and movement checks.'
    for kind in ['motion', 'transition']:
        evidence = []
        for q in sorted((p.parent / kind).glob('*/capture.json')):
            data = json.loads(q.read_text())
            evidence.append({'capture': str(q.relative_to(root)),
                             'screenshots': len(data.get('screenshots', data.get('frames', []))),
                             'sheets': len(list(q.parent.glob('sheet-*.webp'))),
                             'pass': data['pass']})
        if evidence:
            row[kind + 'Evidence'] = evidence
    rows.append(row)
unknown = accepted - {row['iteration'] for row in rows}
if unknown:
    raise SystemExit(f'No capture exists for accepted iterations: {unknown}')
work['iterations'] = rows
work['qualityAcceptanceNote'] = ('08 hold/roster reached8;09 rejected refereeFALL garment;'
                                '10 rejected EURO head framing and interrupted its benchmark. '
                                'Only explicitly reviewed final iterations are marked accepted.')
work['evidenceCounts'] = {
    'coreScreenshots': sum(r['screenshots'] for r in rows),
    'motionFrames': sum(e['screenshots'] for r in rows for e in r.get('motionEvidence', [])),
    'transitionFrames': sum(e['screenshots'] for r in rows for e in r.get('transitionEvidence', [])),
    'contactSheets': sum(e['sheets'] for r in rows for kind in ['motionEvidence', 'transitionEvidence'] for e in r.get(kind, []))}
target.write_text(json.dumps(work, indent=2) + '\n')
print(json.dumps({'iterations': len(rows), 'accepted': sorted(accepted), **work['evidenceCounts']}))
