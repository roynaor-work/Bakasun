"""Cross-check platform requirements against observed asset loads, not directory names."""
from collections import defaultdict
from common import *

def main():
    inventory=json.loads((OUT/'evidence/assets.json').read_text())['files'];by={x['path']:x for x in inventory}
    games=json.loads((OUT/'iterations/04/game-performance.json').read_text())['runs']
    runtime=json.loads((OUT/'iterations/10/runtime-assets.json').read_text())
    loaded=defaultdict(set)
    for run in games:
        for row in run['resources']:
            path=row['path'].split('?')[0].removeprefix('/Bakasun/')
            if path in by:loaded[path].add(run['game'])
    images=[{**by[path],'games':sorted(ids),'classification':'background image; not assumed to be a material texture' if '/backgrounds/' in path else 'observed image request; binding must be checked separately'} for path,ids in sorted(loaded.items()) if 'image' in by[path]]
    models=[{**by[path],'games':sorted(ids)} for path,ids in sorted(loaded.items()) if 'glb' in by[path]]
    motions={}
    for game in ['soccer','hoops','alpine']:
        file='workout/island/design/motion2/'+game+'.json';d=json.loads((ROOT/file).read_text())
        motions[game]={'file':file,'bones':[x['name'] for x in d['skeleton']['bones']],'parents':[x['parent'] for x in d['skeleton']['bones']]}
    canonical=motions['alpine']['bones'];mapped=json.loads((ROOT/'workout/island/design/motion2/alpine.json').read_text())['skeleton']['designBoneMap']
    selected=[]
    for path in ['workout/island/assets/soccer-v5/teal-quiff.glb','workout/island/assets/soccer-v5/goalkeeper.glb','workout/island/design/skier3/skier.glb']+[f'workout/island/design/hoops/lod-v4/hoops-v4-{p}-lod.glb' for p in ['pg','sg','sf','pf','c']]:
        x=by[path];g=x['glb'];names=g['boneNames']
        selected.append({'path':path,'bytes':x['bytes'],'skinCounts':g['skinJoints'],'canonicalNameSet':bool(names) and all(set(n)==set(canonical) or set(n)==set(mapped.values()) for n in names),'imageCount':g['imageCount'],'dracoComplete':g['primitives']>0 and g['dracoPrimitives']==g['primitives']})
    over=[{'path':x['path'],'image':i,'width':t.get('width'),'height':t.get('height'),'bytes':t.get('bytes'),'external':t.get('external',False),'externalPath':t.get('externalPath')} for x in inventory if 'glb' in x for i,t in enumerate(x['glb'].get('textures',[])) if max(t.get('width',0),t.get('height',0))>1024]
    unresolved=[{'path':x['path'],'image':i,'reason':t.get('unresolvedReason','missing file or unreadable image')} for x in inventory if 'glb' in x for i,t in enumerate(x['glb'].get('textures',[])) if not t.get('width')]
    r={'at':stamp(),'method':'Existing inventory and actual six game resource traces; requests do not prove an asset remains drawn. Runtime canvas packing uses original code and synthetic appearance, without WebGL timing.','threeRevision':runtime.get('result',{}).get('revision'),'motionContracts':motions,'motionContractsIdentical':all(m['bones']==canonical and m['parents']==motions['alpine']['parents'] for m in motions.values()),'selectedCharacters':selected,'observedExternalImages':images,'observedModels':models,'allInventoryImagesOver1024':over,'unresolvedGLBImages':unresolved,'hoopsPacking':runtime.get('result',{}).get('roles',[]),'limits':['No physical phone GPU measured.','Backgrounds at 1280 pixels are listed separately from material textures.','Zero embedded images can mean vertex colours; imageCount is not atlas count.','The active v5 basketball crowd uses one merged card mesh plus index-based density LOD; the soccer crowd uses five InstancedMesh batches.','The legacy characters/rig.json has 20 joints; it is not the canonical 18-bone motion2 contract.']}
    write_json(OUT/'evidence/platform-constraints.json',r)
    lines=['# טקסטורות ותמונות שנצפו במשחקים','','MB עשרוניים. קבצים אלה נתבקשו בששת מבחני המשחקים; בקשה אינה הוכחה שהנכס נשאר מצויר. תמונות רקע מסומנות בנפרד ואינן מסווגות אוטומטית כטקסטורות חומר. כל קובצי המאגר ומשקליהם זמינים ב־evidence/assets.json.','','| קובץ | משחקים | bytes | MB | מידות | סיווג |','|---|---|---:|---:|---|---|']
    for x in images:
        im=x['image'];classification='רקע; לא טקסטורת חומר מוכחת' if '/backgrounds/' in x['path'] else 'תמונה שנדרשה בזמן משחק'
        lines.append(f'| `{x["path"]}` | {", ".join(x["games"])} | {x["bytes"]} | {x["bytes"]/1e6:.6f} | {im.get("width")}×{im.get("height")} | {classification} |')
    lines+=['','## חריגות מידה בנכסי legacy ו־fallback','','כל תמונות GLB נסרקו, כולל עשר מפות חיצוניות של athlete.glb שנמצאו ונקראו מקומית. להלן החריגים. הם לא הוכחו כמצוירים כברירת מחדל בששת מבחני המשחקים. Athlete הוא fallback בקוד הכדורגל; נכס shop-corner המקורי הוא קובץ ספרייה, והעיר מפנה לגרסת 512 נפרדת. bytes לתמונה משובצת כלולים כבר במשקל GLB ואינם קובץ נוסף.','','| GLB | תמונה | bytes תמונה | מידות |','|---|---|---:|---|']
    for x in over:lines.append(f'| `{x["path"]}` | '+('`'+x['externalPath']+'`' if x['externalPath'] else f'משובצת #{x["image"]}')+f' | {x["bytes"]} | {x["width"]}×{x["height"]} |')
    lines+=['','## האטלסים שנוצרים בקוד הכדורסל הפעיל','','נבדקו חמשת גופי lod-v4 דרך createAvatarV1 ו־compactAvatar המקוריים, עם כרטיס וצבעים סינתטיים וללא אנימציות. לכל דמות נוצרות שתי מפות: גוף אטום 1024×512 ואלפא 1024×1024 לשיער/גבות/ריסים. זו חריגה מדרישת אטלס אחד לדמות, אף שכל מפה בנפרד עומדת במגבלת 1024. שש התמונות המקוריות ב־GLB אינן שש מפות runtime.','','| תפקיד | משולשים אחרי packing | מפות דמות | מידות | RGBA8 בסיס מחושב MB |','|---|---:|---:|---|---:|']
    for x in r['hoopsPacking']:
        tex=x['textures'];memory=sum(t.get('width',0)*t.get('height',0)*4 for t in tex)
        lines.append(f'| {x["role"]} | {x["packing"]["triangles"]} | {x["textureCount"]} | '+', '.join(f'{t.get("width")}×{t.get("height")}' for t in tex)+f' | {memory/1e6:.3f} |')
    lines+=['','RGBA8 הוא חישוב width×height×4, ללא mipmaps או דחיסת GPU, ואינו מדידת זיכרון מוקצה. אטלס האלפא משותף בין מופעים מאותו מקור; אין להכפיל את הטבלה במספר השחקנים ולהציג זאת כזיכרון בפועל. אין קובצי atlas חדשים בחבילת הביקורת.','', 'ראיות: iterations/10/runtime-assets.json, evidence/platform-constraints.json.']
    (OUT/'TEXTURES.md').write_text('\n'.join(lines)+'\n')
    print('platform constraints:',len(models),'observed GLBs;',len(images),'external images; canonical contracts identical:',r['motionContractsIdentical'])

if __name__=='__main__':main()
