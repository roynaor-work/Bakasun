"""Render the static review sheets from the committed layout contracts. No runtime JS."""
import argparse
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Same local SVG geometry as hud-kit/internal.mjs at the pinned source commit.
ICON_PATHS = {
    'shot': 'M4 20 20 4M8 4h12v12M3 10l7 7',
    'pass': 'M3 12h17m-6-6 6 6-6 6',
    'boost': 'm14 2-9 12h6l-1 8 9-12h-6z',
    'block': 'M5 3h14v9c0 5-7 9-7 9s-7-4-7-9z',
    'steal': 'M4 19 19 4M4 4h6M4 4v6M14 20h6v-6',
    'trick': 'M12 3 3 12l9 9 9-9zM8 12h8',
    'pause': 'M8 4v16M16 4v16',
    'play': 'm7 3 14 9-14 9z',
    'stick': 'M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4',
}


def esc(value):
    return html.escape(str(value), quote=True)


def render(game):
    data = json.loads((ROOT / f'{game}.json').read_text())
    parts = [f'''<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>האי שלי · {esc(data['label'])} · פריסת שליטה</title>
<link rel="stylesheet" href="controls.css"></head><body data-game="{game}">
<header class="intro" id="top"><a class="back" href="index.html">כל המשחקים ←</a>
<p class="eyebrow">האי שלי / חבילת שליטה / 31.10.2026</p>
<h1>{esc(data['label'])}<span>כל פעולה במקום שלה.</span></h1>
<p>פריסה לאצבע אחת ולשתיים. כל מסגרת בהמשך היא מסך שלם, במידה ובכיוון של החלון הנוכחי.</p>
<p class="muted">תצוגת עיצוב סטטית. הכפתורים מציגים יעד מגע ומשוב לחיצה; פעולות המשחק הן מפרט לחיבור עתידי.</p>
<nav aria-label="מצבי שליטה">''']
    for key, state in data['states'].items():
        parts.append(f'<a href="#{key}">{esc(state["label"])}</a>')
    parts.append(f'<a href="#mapping">מיפוי לרכיבים</a><a href="{game}.json">JSON</a></nav></header><main>')
    for key, state in data['states'].items():
        parts.append(f'''<section class="preview-sheet" id="{key}" data-scene="{key}" aria-labelledby="title-{key}">
<div class="arena" aria-hidden="true"><div class="field-mark"></div><div class="ball"></div></div>
<header class="score-panel"><span class="eyebrow">{esc(data['label'])}</span>
<h2 id="title-{key}">{esc(state['label'])}</h2><span class="numeric" dir="ltr">844×390 / 390×844</span></header>
<p class="scene-note">{esc(state['note'])}</p>
<div class="center-note" aria-hidden="true"><span class="crosshair">+</span><span>כיוון המשחק נשאר פיזי</span></div>
<div class="controls" aria-label="מקשי {esc(state['label'])}">''')
        for placement in state['controls']:
            control = data['controls'][placement['id']]
            slot = placement['slot']
            wide = data['layouts']['844x390']['slots'][slot]
            tall = data['layouts']['390x844']['slots'][slot]
            styles = []
            for prefix, rect in [('wide', wide), ('tall', tall)]:
                for prop, source in [('ox', 'offset_x'), ('oy', 'offset_y'), ('w', 'width'), ('h', 'height')]:
                    styles.append(f'--{prefix}-{prop}:{rect[source]}px')
            disabled = placement['disabled']
            reason = 'המתנה' if key == 'recovery' else ('על השלג' if placement['id']=='boost' else 'באוויר') if game=='alpine' else 'נעול'
            suffix = f' · {reason}' if disabled else ''
            icon_name = slot if slot in ('pause', 'stick') else control['hud_kit']['options']['icon']
            glyph = f'<svg viewBox="0 0 24 24" focusable="false"><path d="{ICON_PATHS[icon_name]}"></path></svg>'
            primary = ' primary' if control['hud_kit'].get('options', {}).get('primary') else ''
            role = ' stick' if slot=='stick' else ' pause' if slot=='pause' else ''
            parts.append(f'''<button type="button" class="control{primary}{role}" data-control-id="{placement['id']}" data-slot="{slot}"
data-hud-module="{esc(control['hud_kit']['module'])}" data-hud-export="create"
aria-label="{esc(control['aria_label']+suffix)}" aria-describedby="guide-{key}"
style="{';'.join(styles)}" {'disabled' if disabled else ''}>
<span class="content"><span class="glyph" aria-hidden="true">{glyph}</span><span class="label">{esc(control['label'])}</span>
{f'<span class="reason">{reason}</span>' if disabled else ''}</span></button>''')
        parts.append(f'''</div><p class="sheet-caption">יעדי מגע קבועים · RTL · שוליים בטוחים + 12px</p></section>
<section class="guide" id="guide-{key}" aria-label="איך משחקים במצב {esc(state['label'])}">
<article><span class="number">01</span><h3>אצבע אחת</h3><p>{esc(state['one_finger'])}</p></article>
<article><span class="number">02</span><h3>שתי אצבעות</h3><p>{esc(state['two_fingers'])}</p></article>
<a href="#top">חזרה למצבים ↑</a></section>''')
    parts.append('''<section class="mapping" id="mapping"><p class="eyebrow">מסירה למימוש</p>
<h2>אותו רכיב. פעולה לפי מצב.</h2><p>כל יעד ממופה ל־create(host, options), ולאחריו update(state). שמות הפעולות הם כוונת עיצוב; המנוע מאשר את הביצוע.</p>
<p>tap משתמש ב־onActivate; החזקה משתמשת ב־onPress/onRelease ובולעת click נוסף. swipe ולחיצה כפולה דורשים מתאם Pointer Events לפי interaction.json.</p>
<div class="mapping-grid">''')
    for control_id, control in data['controls'].items():
        mapping = control['hud_kit']
        parts.append(f'<article><h3>{esc(control["label"])}</h3><p><code dir="ltr">{esc(control_id)}</code></p><a href="{esc(mapping["module"])}"><bdi>{esc(Path(mapping["module"]).name)} · create</bdi></a><dl>')
        for gesture, description in control['gestures'].items():
            label = {'tap':'לחיצה','hold':'החזקה','swipe':'החלקה','double_tap':'לחיצה כפולה','drag':'גרירה'}[gesture]
            parts.append(f'<dt>{label}</dt><dd>{esc(description)}</dd>')
        parts.append('</dl></article>')
    parts.append('''</div><p>טעינה: power-meter.mjs מקבל value בתחום 0–1. מהירות סקי: speed-meter.mjs מקבל kmh אמיתי. אירוע תוצאה מגיע מהמנוע ורק אז מפעיל את feel.</p>
<p>חלופות נגישות במפרט: בחירת ספין או crossover, מסך או פייק, ונעילת ריצה בהשהיה. כל פעולה זמינה גם בלחיצה אחת. התצוגה הסטטית אינה מממשת את המתאם או תפריט ההגדרות.</p>
<div class="feedback-samples" aria-label="דוגמאות משוב"><span>מוכן</span><span class="held">פעיל ═</span><span class="accepted">בוצע ✓</span><span class="unavailable">לא זמין ┄</span></div>
<p>אין הבהוב. בהפחתת תנועה נשארים טקסט ומסגרת. ביטול מגע, החלפת מצב או סיבוב מסך מאפסים תנועה, טעינה וספרינט ודורשים מגע חדש.</p>
<a class="back" href="index.html">כל המשחקים ←</a></section></main></body></html>''')
    return '\n'.join(parts) + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='Fail if committed HTML differs from JSON')
    args = parser.parse_args()
    for game in ('hoops', 'soccer', 'alpine'):
        path = ROOT / f'{game}.html'
        output = render(game)
        if args.check:
            if not path.exists() or path.read_text() != output:
                raise SystemExit(f'Stale HTML: {path.name}; run tools/render.py')
        else:
            path.write_text(output)
    print('PASS: 3 static sheets match JSON' if args.check else 'Rendered 3 static sheets')
