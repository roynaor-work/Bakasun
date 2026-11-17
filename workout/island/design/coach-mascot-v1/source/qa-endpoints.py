"""Check first/last key equality, including morph weights, directly in coach.glb."""
import struct, json, hashlib
from pathlib import Path
root = Path(__file__).resolve().parent.parent
raw = (root / 'coach.glb').read_bytes()
json_len = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + json_len])
binary = raw[28 + json_len:]
widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def access(index):
    a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]
    width = widths[a['type']]; fmt = {5126: 'f', 5123: 'H', 5121: 'B', 5125: 'I'}[a['componentType']]
    unit = struct.calcsize(fmt); off = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride', width * unit)
    return [struct.unpack_from('<' + fmt * width, binary, off + i * stride) for i in range(a['count'])]
results = []
for clip in doc['animations']:
    worst = 0.; worst_channel = ''; count = 0
    for channel in clip['channels']:
        sampler = clip['samplers'][channel['sampler']]
        values = access(sampler['output']); times = access(sampler['input']); path = channel['target']['path']
        width = len(values) // len(times)
        first = sum((list(value) for value in values[:width]), [])
        last = sum((list(value) for value in values[-width:]), [])
        delta = max(abs(x - y) for x, y in zip(first, last))
        if path == 'rotation': delta = min(delta, max(abs(x + y) for x, y in zip(first, last)))
        if delta > worst: worst = delta; worst_channel = path + ' ' + doc['nodes'][channel['target']['node']].get('name', '')
        count += 1
    results.append({'clip': clip['name'], 'channels': count, 'maxEndpointComponentDelta': worst, 'worstChannel': worst_channel})
output = {'modelSha256': hashlib.sha256(raw).hexdigest(), 'scope': 'Compares the first and last key values for each animation channel, including morph weights; quaternion sign equivalence respected. This checks pose closure, not endpoint velocity or visual mixer transitions.', 'maxEndpointComponentDelta': max(v['maxEndpointComponentDelta'] for v in results), 'clips': results}
(root / 'verification' / 'qa-endpoints.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'clips': len(results), 'maxEndpointComponentDelta': output['maxEndpointComponentDelta']}))
