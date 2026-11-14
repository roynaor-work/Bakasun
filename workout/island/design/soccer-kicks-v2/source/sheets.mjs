// SPDX-License-Identifier: CC0-1.0
// Assemble eight real WebGL captures; no synthetic pose or image generation.
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function assembleSheets({clips, output}) {
  await fs.mkdir(output,{recursive:true});
  const result=spawnSync(process.env.PYTHON_PATH??'python3',['-c',String.raw`
import json,sys
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
payload=json.load(sys.stdin)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold_path='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font=lambda size,bold=False: ImageFont.truetype(bold_path if bold else font_path,size)
for clip in payload['clips']:
    assert len(clip['frames'])==8
    tilew,tileh,caption=400,300,46
    sheet=Image.new('RGB',(4*tilew,2*(tileh+caption)+84),'#eff2e9')
    d=ImageDraw.Draw(sheet)
    d.rectangle((0,0,sheet.width,84),fill='#142925')
    d.text((24,15),clip['id'].replace('_',' ').upper(),font=font(23,True),fill='#f4ecd7')
    d.text((24,49),'SOCCER KICKS V2  /  18 BONES  /  30 HZ  /  NATIVE GLB',font=font(13),fill='#b7c7b8')
    for i,frame in enumerate(clip['frames']):
        x,y=(i%4)*tilew,84+(i//4)*(tileh+caption)
        im=Image.open(frame['capture']).convert('RGB').resize((tilew,tileh),Image.Resampling.LANCZOS)
        sheet.paste(im,(x,y))
        is_contact=frame['stage']=='contact'
        d.rectangle((x,y,x+tilew-1,y+tileh-1),outline='#f4ba60' if is_contact else '#556b5d',width=3 if is_contact else 1)
        d.text((x+12,y+tileh+7),f"{i+1:02d}  {frame['stage'].upper()}",font=font(13,True),fill='#765322' if is_contact else '#183d31')
        timestamp=f"{frame['time']:.3f}s  |  f{frame['frame']}"
        bbox=d.textbbox((0,0),timestamp,font=font(11))
        d.text((x+tilew-(bbox[2]-bbox[0])-12,y+tileh+9),timestamp,font=font(11),fill='#53675a')
    dest=Path(payload['output'])/(clip['id']+'.webp')
    sheet.save(dest,'WEBP',quality=94,method=6)
`],{input:JSON.stringify({clips,output}),encoding:'utf8',maxBuffer:4*1024*1024});
  if(result.status!==0)throw new Error(`Sheet composition failed: ${result.stderr}`);
  const manifest=[];
  for(const clip of clips){
    const filename=`${clip.id}.webp`,bytes=await fs.readFile(path.join(output,filename));
    manifest.push({id:clip.id,sheet:`sheets/${filename}`,width:1600,height:776,
      sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
      view:clip.view,sourceAsset:clip.sourceAsset,sourceAssetSha256:clip.sourceAssetSha256,declaredSourceAssetSha256:clip.declaredSourceAssetSha256,sourceAssetBytes:clip.sourceAssetBytes,frames:clip.frames.map(({capture,...frame})=>frame)});
  }
  return manifest;
}
