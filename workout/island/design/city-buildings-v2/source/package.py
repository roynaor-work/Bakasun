#!/usr/bin/env python3
"""Create an offline ZIP and audit the entire directory against the 8 MB limit."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parent.parent
ARCHIVE=ROOT/"city-buildings-v2-offline.zip"
AUDIT=ROOT/"verification/package-validation.json"


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    files=sorted(p for p in ROOT.rglob("*") if p.is_file() and p not in (ARCHIVE,AUDIT))
    assert not any(p.suffix.lower() in (".wasm",".ktx2") for p in files)
    assert not any("node_modules" in p.parts or "__pycache__" in p.parts for p in files)
    with zipfile.ZipFile(ARCHIVE,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for path in files:
            info=zipfile.ZipInfo("city-buildings-v2/"+str(path.relative_to(ROOT)),date_time=(2026,11,17,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            archive.writestr(info,path.read_bytes(),compresslevel=9)
    with zipfile.ZipFile(ARCHIVE) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist())==len(files)
        for path in files:
            assert archive.read("city-buildings-v2/"+str(path.relative_to(ROOT)))==path.read_bytes()
    base_bytes=sum(p.stat().st_size for p in files)
    result={"limitBytes":8000000,"basePackageBytes":base_bytes,"archiveBytes":ARCHIVE.stat().st_size,
            "directoryBytesIncludingArchiveAndAudit":0,"fileCountIncludingArchiveAndAudit":len(files)+2,
            "glbCount":sum(p.suffix==".glb" for p in files),"archiveSHA256":sha(ARCHIVE),"zipIntegrityPassed":True,
            "zipEntriesByteIdenticalToSource":True,"selfContainedRuntime":True,
            "archiveExcludes":[ARCHIVE.name,"verification/package-validation.json"],
            "entries":[{"path":str(p.relative_to(ROOT)),"bytes":p.stat().st_size,"sha256":sha(p)} for p in files]}
    # The audit records its own size, but is excluded from the ZIP to avoid a hash cycle.
    for _ in range(10):
        raw=json.dumps(result,ensure_ascii=False,indent=2)+"\n"
        total=base_bytes+ARCHIVE.stat().st_size+len(raw.encode())
        if total==result["directoryBytesIncludingArchiveAndAudit"]:break
        result["directoryBytesIncludingArchiveAndAudit"]=total
    else:raise AssertionError("Audit size did not converge")
    assert total<=8000000,total
    assert result["glbCount"]==120
    AUDIT.write_text(raw)
    assert sum(p.stat().st_size for p in ROOT.rglob("*") if p.is_file())==total
    print(json.dumps({k:v for k,v in result.items() if k!="entries"}))


if __name__=="__main__":main()
