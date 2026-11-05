"""Read-only screenshot decoding and exact viewport-size verification."""
import json
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageStat

root=Path(__file__).resolve().parents[1]
rounds=sorted((root/'iterations').glob('[0-9][0-9]/capture.json'))
checks=[];failures=[]
for report_file in rounds:
    data=json.loads(report_file.read_text())
    for record in data['records']:
        file=report_file.parent/record['filename']
        with Image.open(file) as image:
            image.load()
            expected=(record['viewport']['width'],record['viewport']['height'])
            ok=image.size==expected
            check={'file':str(file.relative_to(root)),'size':list(image.size),'expected':list(expected),'pass':ok,'exifEntries':len(image.getexif())}
            if report_file==rounds[-1]:
                w,h=image.size;stats=ImageStat.Stat(image.convert('RGB').crop((int(w*.2),int(h*.25),int(w*.8),int(h*.75))))
                check['centerMean']=sum(stats.mean)/3
                check['centerVariance']=sum(stats.var)/3
                check['pass']=check['pass'] and check['centerMean']>3 and check['centerVariance']>1
            if not check['pass']:failures.append(check['file'])
            checks.append(check)
result={'generatedAt':datetime.now(timezone.utc).isoformat(),'readOnly':True,'rounds':len(rounds),'images':len(checks),'checks':checks,'failures':failures,'pass':not failures}
(root/'verification/images.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'pass':result['pass'],'rounds':len(rounds),'images':len(checks),'failures':failures}))
if failures:raise SystemExit(1)
