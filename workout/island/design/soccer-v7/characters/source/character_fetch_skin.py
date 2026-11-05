#!/usr/bin/env python3
"""Fetch licensed original MakeHuman authoring skin data into a temporary cache.

Only the two required PNGs are extracted from the official Ubuntu data package.
Nothing is installed, and no high-resolution source is copied into the product.
The runtime GLBs always embed the final 1024 atlas, without network requests.
"""
from pathlib import Path
import hashlib
import json
import os
import sys
import tarfile
import urllib.request

URL='https://archive.ubuntu.com/ubuntu/pool/universe/m/makehuman/makehuman-data_1.1.1-1_all.deb'
EXPECTED_ARCHIVE_SHA='881a79c3a6640e2ecc579093f6895d161fd902856504b123ef750e843f4304a7'
EXPECTED_PNG_SHA={'young_lightskinned_male_diffuse.png':'6222821cf0425b4459f00c3db4cffc1fa965922fc314f328076bdec7a2791510','young_darkskinned_male_diffuse.png':'a541ebd3e900f61bcd84cdccb36293759bc88d76f636f7011a11daf42cae5959'}
NAMES=set(EXPECTED_PNG_SHA)


def main():
    cache=Path(sys.argv[1] if len(sys.argv)>1 else os.environ.get('SOCCER_AUTHORING_SKIN_CACHE','/tmp/soccer-v7-authoring-skin'))
    cache.mkdir(parents=True,exist_ok=True)
    archive=cache/'makehuman-data_1.1.1-1_all.deb'
    if not archive.exists() or archive.stat().st_size!=262831670:
        with urllib.request.urlopen(URL,timeout=60) as response,archive.open('wb') as output:
            count=0;next_report=32*1024*1024
            while True:
                data=response.read(1024*1024)
                if not data:break
                output.write(data);count+=len(data)
                if count>=next_report:
                    print('Authoring data downloaded',round(count/1024/1024),'MiB',flush=True);next_report+=32*1024*1024
    if archive.stat().st_size!=262831670:raise RuntimeError('Unexpected archive byte count')
    with archive.open('rb') as data:archive_sha=hashlib.file_digest(data,'sha256').hexdigest()
    if archive_sha!=EXPECTED_ARCHIVE_SHA:raise RuntimeError('Authoring archive checksum mismatch')
    found=[]
    with archive.open('rb') as handle:
        if handle.read(8)!=b'!<arch>\n':raise RuntimeError('Invalid data package')
        while True:
            header=handle.read(60)
            if len(header)!=60:raise RuntimeError('No asset archive in package')
            name=header[:16].decode().strip().rstrip('/')
            size=int(header[48:58].decode().strip());offset=handle.tell()
            if name.startswith('data.tar'):
                with tarfile.open(fileobj=handle,mode='r|*') as assets:
                    for entry in assets:
                        if Path(entry.name).name not in NAMES or not entry.isfile():continue
                        source=assets.extractfile(entry)
                        data=source.read();target=cache/Path(entry.name).name
                        if hashlib.sha256(data).hexdigest()!=EXPECTED_PNG_SHA[target.name]:raise RuntimeError('Skin source checksum mismatch')
                        target.write_bytes(data)
                        found.append({'file':target.name,'archivePath':entry.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
                        print('Extracted',target.name,len(data),'bytes',flush=True)
                        if len(found)==len(NAMES):break
                break
            handle.seek(offset+size+size%2)
    if len(found)!=len(NAMES):raise RuntimeError('Missing original skin maps')
    record={'archiveUrl':URL,'archiveSha256':archive_sha,'license':'CC0-1.0 (MakeHuman system-assets 2020 clarification)','files':found}
    (cache/'sources.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record,indent=2),flush=True)


if __name__=='__main__':main()
