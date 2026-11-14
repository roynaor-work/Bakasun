"""Contract validation for the deliverable, not for the live application."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
PREFIX="workout/island/design/city-weather-v1/"


def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    m=json.loads((ROOT/"manifest.json").read_text())
    expected={"rain-light":8,"rain-medium":8,"rain-heavy":8,"snow":8,"fog":4,"stars":4,
        "sky-sunset":1,"sky-night":1,"birds":8}
    expected.update({f"cloud-{n}":1 for n in range(1,4)})
    expected.update({f"butterflies-{c}":8 for c in ("coral","gold","teal")})
    expected.update({f"balloons-{c}":4 for c in ("coral","gold","teal")})
    expected.update({f"confetti-{c}":8 for c in ("coral","gold","teal")})
    expected.update({f"fireworks-{n}":12 for n in ("peony-gold","chrysanthemum-coral","ring-teal","willow-gold","heart-coral")})
    assert set(m["effects"])==set(expected),"Effect coverage changed"
    assert len(m["atlases"])==8
    loaded={}
    for name,atlas in m["atlases"].items():
        file=ROOT/atlas["file"]
        with Image.open(file) as im:
            assert im.format=="PNG" and im.mode=="RGBA" and im.size==(1024,1024),name
            data=np.array(im);assert data[:,:,3].min()==0,name
            assert not np.any(data[data[:,:,3]==0,:3]),f"Hidden RGB: {name}"
            loaded[name]=im.copy()
        assert file.stat().st_size==atlas["bytes"]<=600_000,name
        assert digest(file)==atlas["sha256"],name
        tp=json.loads((ROOT/atlas["metadata"]).read_text())
        assert len(tp["frames"])==atlas["frames"],name
        assert tp["meta"]["image"]==file.name
    frames=0
    occupied={n:[] for n in loaded}
    alpha_mass={}
    for name,count in expected.items():
        effect=m["effects"][name]
        assert len(effect["frames"])==count,(name,"wrong count")
        assert effect["pivot"]==[.5,.5]
        assert (effect["fps"]>0)==(count>1)
        unique=set()
        for f in effect["frames"]:
            frames+=1
            x,y,w,h=f["rect"]
            assert 2<=x and 2<=y and x+w<=1022 and y+h<=1022,f["id"]
            assert f["sourceSize"]==[w,h] and not f["rotated"] and not f["trimmed"]
            rect=(x-2,y-2,x+w+2,y+h+2)
            for other in occupied[effect["atlas"]]:
                assert rect[2]<=other[0] or rect[0]>=other[2] or rect[3]<=other[1] or rect[1]>=other[3],f"Overlapping cells: {f['id']}"
            occupied[effect["atlas"]].append(rect)
            cropped=loaded[effect["atlas"]].crop((x,y,x+w,y+h))
            with Image.open(ROOT/f["file"]) as single:
                assert single.mode=="RGBA" and single.size==(w,h)
                assert cropped.tobytes()==single.tobytes(),f"Crop mismatch: {f['id']}"
            unique.add(hashlib.sha256(cropped.tobytes()).hexdigest())
            a=np.array(cropped.getchannel("A"))
            assert a.max()>0,f"Empty frame: {f['id']}"
            if effect.get("opaqueContent"):
                assert a.min()==255,f"Sky is not opaque: {f['id']}"
            else:
                # A seamless haze tile may cover every texel with partial alpha.
                assert a.min()<255,f"Missing transparency: {f['id']}"
            alpha_mass[f["id"]]=int(a.sum())
            # Every cell uses an exact 2px edge extrusion, including its corners.
            padded=np.pad(np.array(cropped),((2,2),(2,2),(0,0)),mode="edge")
            assert np.array_equal(padded,np.array(loaded[effect["atlas"]].crop(rect))),f"Gutter mismatch: {f['id']}"
            if name.startswith("fireworks-"):
                box=cropped.getchannel("A").getbbox()
                assert box[0]>0 and box[1]>0 and box[2]<w and box[3]<h,f"Clipped firework: {f['id']}"
        if name.startswith("fireworks-"):
            assert len(unique)==12,(name,"duplicate frames")
            assert not effect["loop"] and effect["durationMs"]==1000
            assert alpha_mass[f"{name}/11"]<max(alpha_mass[f"{name}/{i:02d}"] for i in range(12))*.05
        elif count>1:assert len(unique)>=3,(name,"insufficient motion")
    assert frames==173
    masses=[sum(alpha_mass[f"rain-{name}/{n:02d}"] for n in range(8)) for name in ("light","medium","heavy")]
    assert masses[0]<masses[1]<masses[2],"Rain density does not increase"
    for f in m["effects"]["fog"]["frames"]:
        x,y,w,h=f["rect"]
        assert np.array(loaded["weather"].crop((x,y,x+w,y+h)).getchannel("A")).max()<=120
    for file in ("preview.html","preview.css","preview.js","preview-data.js","LICENSE.txt","REPORT.md","preview/city-reference.png"):
        assert (ROOT/file).is_file(),f"Missing {file}"
    # Do not let the copied browser data drift away from the public JSON contract.
    inline=(ROOT/"preview-data.js").read_text().removeprefix("window.CITY_WEATHER_MANIFEST=").rstrip(";\n")
    assert json.loads(inline)==m
    # The task authorizes new files in exactly one new directory.
    changes=subprocess.check_output(["git","diff","--name-status",m["referenceCommit"]],cwd=REPO,text=True).splitlines()
    assert all(line.startswith("A\t"+PREFIX) for line in changes),"Existing/out-of-scope tracked file changed"
    untracked=subprocess.check_output(["git","ls-files","--others","--exclude-standard"],cwd=REPO,text=True).splitlines()
    assert all(p.startswith(PREFIX) for p in untracked),"Out-of-scope untracked file"
    repeat=False
    if "--rebuild" in sys.argv:
        files=list((ROOT/"atlases").glob("*"))+list((ROOT/"sprites").rglob("*.png"))+[ROOT/"manifest.json",ROOT/"preview-data.js"]
        before={str(p.relative_to(ROOT)):digest(p) for p in files}
        subprocess.run([sys.executable,str(ROOT/"source/build.py")],check=True,capture_output=True)
        assert before=={str(p.relative_to(ROOT)):digest(p) for p in files},"Build not deterministic"
        repeat=True
    result={"passed":True,"effects":len(expected),"frames":frames,"fireworks":{"types":5,"framesPerType":12,"uniqueFrames":60},
        "atlases":{n:{"bytes":v["bytes"],"size":[1024,1024],"sha256Verified":True} for n,v in m["atlases"].items()},
        "totalAtlasBytes":sum(a["bytes"] for a in m["atlases"].values()),"largestAtlasBytes":max(a["bytes"] for a in m["atlases"].values()),
        "exactCropChecks":frames,"gutterChecks":frames,"rainAlphaMass":masses,
        "allFilesWithinNewFolder":True,"deterministicRebuild":repeat}
    folder=ROOT/"verification";folder.mkdir(exist_ok=True)
    (folder/"assets.json").write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result,indent=2))


if __name__=="__main__":main()
