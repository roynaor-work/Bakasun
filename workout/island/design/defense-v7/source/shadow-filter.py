"""Convert the 1024² Cycles shadow render into a small 512² alpha texture."""
from pathlib import Path
from PIL import Image,ImageFilter
import hashlib,json,argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--input',default='/tmp/defense-v7-farm-shadow-raw.png');args=parser.parse_args()
source=Path(args.input);raw=source.read_bytes();im=Image.open(source).convert('RGBA')
alpha=im.getchannel('A').resize((512,512),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.6))
alpha=alpha.point(lambda v:0 if v<8 else min(255,round(v/8)*8))
final=Image.new('RGBA',(512,512),(0,0,0,0));final.putalpha(alpha);destination=ROOT/'textures/farm-shadow.png';final.save(destination,optimize=True)
meta=ROOT/'verification/shadow-bake.json';data=json.loads(meta.read_text()) if meta.exists() else {}
data.update({'renderSize':[1024,1024],'size':[512,512],'filter':'Lanczos, Gaussian .6px, 8-bit alpha quantized in steps of 8','rawSHA256':hashlib.sha256(raw).hexdigest(),'finalBytes':destination.stat().st_size,'finalSHA256':hashlib.sha256(destination.read_bytes()).hexdigest()})
meta.write_text(json.dumps(data,indent=2));print(data['finalBytes'])
