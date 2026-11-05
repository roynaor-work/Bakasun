"""List every delivered file, including this CSV's own final byte size."""
from pathlib import Path
import csv
import io

ROOT = Path(__file__).resolve().parent.parent


def write_inventory():
    target = ROOT / 'FILE-SIZES.csv'
    paths = sorted({target, *(p for p in ROOT.rglob('*')
                             if p.is_file() and '__pycache__' not in p.parts)})
    own_size = target.stat().st_size if target.exists() else 0
    for _ in range(10):
        stream = io.StringIO(newline='')
        writer = csv.writer(stream)
        writer.writerow(['file', 'bytes', 'MB_decimal', 'triangles', 'runtime_raster_textures'])
        for path in paths:
            size = own_size if path == target else path.stat().st_size
            writer.writerow([str(path.relative_to(ROOT)), size, f'{size/1e6:.6f}', 0, 0])
        data = stream.getvalue().encode('utf-8-sig')
        if len(data) == own_size:
            target.write_bytes(data)
            return len(paths)
        own_size = len(data)
    raise RuntimeError('File size inventory did not converge')


if __name__ == '__main__':
    print(f'{write_inventory()} files inventoried')
