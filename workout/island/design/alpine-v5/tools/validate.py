#!/usr/bin/env python3
"""Read delivered images and GLBs independently; reject bad mappings and limits."""
import hashlib
import json
import math
from pathlib import Path
import struct
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ENV_SET = {"sunset", "fog", "night-floodlit"}
failures = []


def check(condition, message):
    if not condition: failures.append(message)


def resolve(path):
    p = (ROOT/path).resolve()
    check(p.is_relative_to(ROOT), f"unsafe path: {path}")
    if not p.is_relative_to(ROOT): raise ValueError(path)
    return p


def read_glb(asset):
    data = resolve(asset["path"]).read_bytes()
    magic, version, length = struct.unpack_from("<III",data)
    check((magic,version,length)==(0x46546C67,2,len(data)),f"{asset['id']}: GLB header")
    js_len, js_type = struct.unpack_from("<II",data,12)
    check(js_type==0x4E4F534A,f"{asset['id']}: JSON chunk type")
    doc=json.loads(data[20:20+js_len]); at=20+js_len
    bin_len, bin_type=struct.unpack_from("<II",data,at); binary=data[at+8:]
    check(bin_type==0x004E4942 and bin_len==len(binary),f"{asset['id']}: BIN chunk")
    check(not doc.get("extensionsRequired"),f"{asset['id']}: unexpected decoder requirement")
    check(all("uri" not in b for b in doc["buffers"]),f"{asset['id']}: external buffer")
    check(not doc.get("images"),f"{asset['id']}: unexpected texture dependency")
    check(doc["nodes"][0]["extras"]["environmentIds"]==asset["environmentIds"],f"{asset['id']}: embedded environment IDs")
    points=[];triangles=0
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            for semantic in ("POSITION","NORMAL"):
                a=doc["accessors"][primitive["attributes"][semantic]];v=doc["bufferViews"][a["bufferView"]]
                check(a["type"]=="VEC3" and a["componentType"]==5126,f"{asset['id']}: float3 attributes")
                start=v.get("byteOffset",0)+a.get("byteOffset",0);end=start+a["count"]*12
                check(end<=len(binary),f"{asset['id']}: accessor in bounds")
                arr=np.frombuffer(binary[start:end],dtype="<f4").reshape(-1,3)
                check(np.all(np.isfinite(arr)),f"{asset['id']}: finite {semantic}")
                if semantic=="POSITION":
                    points.extend(arr.tolist());triangles+=len(arr)//3
                    check(len(arr)%3==0,f"{asset['id']}: triangle count")
                    tri=arr.reshape(-1,3,3)
                    area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)
                    check(float(area.min())>1e-9,f"{asset['id']}: degenerate triangle")
                    check(np.allclose(arr.min(0),a["min"],atol=1e-6) and np.allclose(arr.max(0),a["max"],atol=1e-6),f"{asset['id']}: accessor bounds")
                else: check(np.allclose(np.linalg.norm(arr,axis=1),1,atol=1e-5),f"{asset['id']}: normalized normals")
    points=np.asarray(points)
    check(triangles==asset["triangles"],f"{asset['id']}: manifest triangles")
    check(np.allclose(points.min(0),asset["bounds"]["min"],atol=1e-4) and np.allclose(points.max(0),asset["bounds"]["max"],atol=1e-4),f"{asset['id']}: manifest bounds")
    nodes={n["name"]:n.get("translation",[0,0,0]) for n in doc["nodes"]}
    check(all(nodes.get(k)==v for k,v in asset["anchors"].items()),f"{asset['id']}: placement anchors")
    return dict(id=asset["id"],triangles=triangles,drawCalls=asset["drawCalls"],bounds=asset["bounds"],anchors=len(asset["anchors"]))


def read_image(asset):
    with Image.open(resolve(asset["path"])) as im:
        im.load();check(im.size==(asset["width"],asset["height"]),f"{asset['id']}: dimensions")
        rgba=np.asarray(im.convert("RGBA"))
        check(bool((rgba[:,:,3]<255).any())==asset.get("alpha",False),f"{asset['id']}: alpha declaration")
        result=dict(id=asset["id"],size=list(im.size),mode=im.mode)
        if asset["kind"]=="surface":
            check(np.array_equal(rgba[0],rgba[-1]) and np.array_equal(rgba[:,0],rgba[:,-1]),f"{asset['id']}: exact seamless edges")
            result["edgeMaxError"]=int(max(np.abs(rgba[0].astype(int)-rgba[-1]).max(),np.abs(rgba[:,0].astype(int)-rgba[:,-1]).max()))
        if "metadata" in asset:
            meta=json.loads(resolve(asset["metadata"]).read_text())
            check(meta["environmentIds"]==asset["environmentIds"],f"{asset['id']}: metadata environment IDs")
            check((resolve(asset["metadata"]).parent/meta["image"]).resolve()==resolve(asset["path"]),f"{asset['id']}: sidecar image")
            coverage=[]
            for f in meta["frames"]:
                x,y,w,h=f["rect"];cell=rgba[y:y+h,x:x+w,3];p=meta["paddingPixels"]
                check(cell.shape==(h,w),f"{asset['id']}: frame rect bounds")
                edges=np.concatenate([cell[:p].ravel(),cell[-p:].ravel(),cell[:,:p].ravel(),cell[:,-p:].ravel()])
                check(not edges.any(),f"{asset['id']}: transparent gutters in frame {f}")
                expected=[(x+.5)/im.width,1-(y+h-.5)/im.height,(x+w-.5)/im.width,1-(y+.5)/im.height]
                check(np.allclose(f["uv"],expected),f"{asset['id']}: half-texel UV convention")
                coverage.append(int((cell>0).sum()))
            result["frameCoveragePixels"]=coverage
            if asset["kind"]=="animated-atlas":
                check(coverage[0]==coverage[-1]==0 and all(v>0 for v in coverage[1:-1]),f"{asset['id']}: empty endpoints and live middle frames")
                check(math.isclose(meta["durationSeconds"],meta["frameCount"]/meta["fps"]),f"{asset['id']}: animation duration")
                check(not meta["depthWrite"] and not meta["mipmaps"] and meta["alphaMode"]=="straight",f"{asset['id']}: alpha sampling policy")
            else: check(all(v>0 for v in coverage),f"{asset['id']}: no blank decals/variants")
        return result


def main():
    manifest=json.loads((ROOT/"manifest.json").read_text())
    check(set(manifest["environmentIds"])==ENV_SET,"exactly the three requested environments")
    asset_map={a["id"]:a for a in manifest["assets"]}
    check(len(asset_map)==len(manifest["assets"]),"unique asset IDs")
    known=set()
    for f in manifest["files"]:
        p=resolve(f["path"]);check(p.is_file(),f"missing file {f['path']}")
        if not p.is_file():continue
        data=p.read_bytes();known.add(f["path"])
        check(len(data)==f["bytes"],f"size {f['path']}")
        check(hashlib.sha256(data).hexdigest()==f["sha256"],f"hash {f['path']}")
    image_results=[];model_results=[]
    for a in manifest["assets"]:
        check(bool(a.get("environmentIds")) and set(a["environmentIds"])<=ENV_SET,f"{a['id']}: valid explicit environment membership")
        check(a["path"] in known,f"{a['id']}: file inventory")
        if a["kind"]=="model":model_results.append(read_glb(a))
        else:image_results.append(read_image(a))
    for directory in ["backgrounds","textures","atlases","decals","effects","models","environments"]:
        for p in (ROOT/directory).iterdir():
            check(p.relative_to(ROOT).as_posix() in known,f"unregistered runtime file {p.relative_to(ROOT)}")
    for e in manifest["environments"]:
        v=json.loads(resolve(e["path"]).read_text());check(v["id"]==e["id"],"environment config ID")
        expected={a["id"] for a in manifest["assets"] if e["id"] in a["environmentIds"]}
        check(set(v["assets"])==expected,f"{e['id']}: all and only compatible assets")
        check(v["assets"]==e["assetIds"],f"{e['id']}: manifest preload list")
        check(v["fog"]["nearMeters"]<v["fog"]["farMeters"],f"{e['id']}: fog distances")
        for orientation in ["landscape","portrait"]:
            check(v["backgrounds"][orientation] in expected,f"{e['id']}: {orientation} background")
    all_files=[p for p in ROOT.rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    over=[p.relative_to(ROOT).as_posix() for p in all_files if p.stat().st_size>1_500_000]
    check(not over,f"files exceed 1,500,000 bytes: {over}")
    report=dict(schemaVersion=1,passed=not failures,checkedDate="2026-11-04",environmentCount=3,
                assetCount=len(asset_map),runtimeFileCount=len(manifest["files"]),
                runtimeFileBytes=manifest["runtimeFileBytes"],maxAllowedFileBytes=1_500_000,
                largestRuntimeFile=manifest["largestRuntimeFile"],allPackageFilesWithinLimit=not over,
                checks=["SHA-256 and byte counts", "complete environment membership and preload lists", "independent GLB binary/accessor/normal/bounds/anchor checks", "decoded WebP/PNG dimensions and alpha", "exact tile edge equality", "per-cell transparent gutters", "half-texel UV coordinates", "animation blank endpoints and durations", "no unlisted runtime files", "all package files under decimal 1.5 MB"],
                models=model_results,images=image_results,failures=failures,
                limitations=["Does not assert FPS or physical-device GPU memory.","Host gameplay integration is a separate task."])
    (ROOT/"verification").mkdir(exist_ok=True)
    (ROOT/"verification/asset-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(dict(passed=not failures,assets=len(asset_map),runtimeBytes=manifest["runtimeFileBytes"],failures=failures),indent=2))
    raise SystemExit(bool(failures))


if __name__ == "__main__":main()
