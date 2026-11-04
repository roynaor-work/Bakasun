#!/usr/bin/env python3
"""Rebuild the original, dependency-free Island UI assets and their manifest."""
from pathlib import Path
import hashlib
import json
import math
import re

ROOT = Path(__file__).resolve().parents[1]
INK = '#173E40'
SEA = '#24786D'
MINT = '#B9DDC8'
SAND = '#F8EED9'
CORAL = '#EB947F'
GOLD = '#E9BA57'
WHITE = '#FFFCF4'
assets = []

GAMES = [
    dict(id='soccer', name='ליגת האי', category='ספורט', color='#C2DFA2', hint='הקבוצה שלכם. הדרך לאליפות.', instruction='מוסרים, בועטים ומתקדמים יחד עם הקבוצה.'),
    dict(id='tennis', name='טניס באי', category='ספורט', color='#EBC9AE', hint='כל חבטה פותחת הזדמנות.', instruction='מכוונים את החבטה ושומרים על הקצב.'),
    dict(id='streetSlam', name='ליגת האי בכדורסל', category='ספורט', color='#EBC285', hint='מהמסירה הראשונה עד לסל.', instruction='מניעים את הכדור ומוצאים את הזריקה הפנויה.'),
    dict(id='alpineRush', name='מרוץ סנובורד', category='ספורט חורף', color='#BEDBE3', hint='מסלול חדש. אוויר פסגות.', instruction='בוחרים קו גלישה ושומרים על השליטה בסיבובים.'),
    dict(id='islandRacing', name='מרוצי האי', category='מרוצים', color='#E5BBB0', hint='מהחוף עד לקו הסיום.', instruction='נכנסים לסיבוב ומוצאים את הדרך קדימה.'),
    dict(id='navalDuel', name='קרב ספינות', category='ים פתוח', color='#B2D5DB', hint='מרחב כחול. מהלך מדויק.', instruction='מנווטים בין האיים ומתזמנים את המהלך הבא.'),
    dict(id='fireRescue', name='כיבוי שריפה', category='חילוץ והצלה', color='#EFBE9E', hint='כל טיפה עושה הבדל.', instruction='מכוונים את המים ועוזרים להחזיר את השקט לעיר.'),
    dict(id='alienDefense', name='הגנה מפני חייזרים', category='חלל', color='#CEC7E6', hint='מגינים על האי מלמעלה.', instruction='מתמרנים בין החלליות ושומרים על האי.'),
    dict(id='boarDefense', name='אי החזירים — הגנת החווה', category='הגנת החוף', color='#D5D4A3', hint='החווה שלכם בידיים טובות.', instruction='מגינים על החווה מול החזירים הרובוטיים.'),
]

# One 64-unit optical grid, 3-unit rounded strokes and a shared palette.
GAME_PATHS = {
 'soccer': f'<circle cx="32" cy="32" r="23" fill="{WHITE}"/><path d="m26 23 12 0 5 11-11 8-11-8Z" fill="{SEA}"/><path d="m12 20 9 2 5-10m12 0 5 10 9-2M10 39l11-5m11 8v13m11-21 11 5m-39 9 9-2m16 0 9 2"/>',
 'tennis': f'<g transform="rotate(32 32 29)"><ellipse cx="31" cy="24" rx="16" ry="20" fill="{SAND}"/><path d="M23 9v30m8-34v39m8-35v30M16 17h30M15 26h32M19 35h24" stroke-width="1.5" opacity=".5"/><path d="M27 44v14h8V44" fill="{CORAL}"/></g><circle cx="48" cy="47" r="9" fill="{MINT}"/><path d="M43 40q8 5 4 15" stroke-width="2"/>',
 'streetSlam': f'<circle cx="32" cy="32" r="23" fill="{CORAL}"/><path d="M9 32h46M32 9v46M17 15q27 17 0 34m30-34q-27 17 0 34"/>',
 'alpineRush': f'<path d="m5 33 15-20 12 15L42 9l17 24" fill="{MINT}"/><path d="m14 21 6 4 5-5m12-2 5 5 5-5" stroke="{WHITE}"/><g transform="rotate(-20 32 44)"><rect x="7" y="35" width="50" height="19" rx="9.5" fill="{CORAL}"/><path d="M17 39h8v11h-8Zm22 0h8v11h-8Z" fill="{SAND}"/></g>',
 'islandRacing': f'<path d="M12 57V9m1 3c12-11 25 11 40 0v27c-14 11-27-11-40 0" fill="{WHITE}"/><path d="m14 13 9 0v9l-9-2Zm9 9 9 4v9l-9-4Zm9-6 10 3v9l-10-3Zm10 12 10-2v9l-10 2Z" fill="{SEA}" stroke="none"/><path d="M7 57h12"/>',
 'navalDuel': f'<path d="M8 37h48L46 50H19Z" fill="{SEA}"/><path d="M20 37V24h24v13M27 24V13h11v11" fill="{SAND}"/><path d="M32 13V6m-9 23h7m5 0h6"/><path d="M5 55q6-6 13 0t14 0 14 0 13 0" stroke="{SEA}"/>',
 'fireRescue': f'<path d="M32 5c3 15 19 19 19 34a19 19 0 0 1-38 0c0-9 5-17 13-23-2 11 1 12 4 15 6-10 5-18 2-26Z" fill="{CORAL}"/><path d="M32 36c4 6 10 10 8 16a9 9 0 0 1-17-2c0-5 5-9 9-14Z" fill="{GOLD}"/>',
 'alienDefense': f'<path d="M20 27a12 12 0 0 1 24 0" fill="{MINT}"/><ellipse cx="32" cy="32" rx="26" ry="9" fill="{SAND}"/><path d="m21 47-5 9m16-9v12m11-12 5 9" stroke="{SEA}"/><path d="M19 32h1m11 0h1m11 0h1" stroke="{CORAL}" stroke-width="4"/><path d="m8 11 3 3m42-5-3 4"/>',
 'boarDefense': f'<path d="m13 25-3-15 17 8h10l17-8-3 15 4 16-11 13H20L9 41Z" fill="{MINT}"/><path d="m16 17 3 9m29-9-3 9" stroke="{CORAL}"/><rect x="20" y="36" width="24" height="16" rx="7" fill="{SAND}"/><path d="M27 42v4m10-4v4M19 31h6m14 0h6"/><path d="m12 40 5 7m35-7-5 7" stroke="{WHITE}" stroke-width="4"/>',
}

MENU_PATHS = {
 'island': '<path d="M5 45q4-10 27-10t27 10q-1 12-27 12T5 45Z"/><path d="M31 42q8-15 3-28m0 3Q19 4 12 20q13-6 22-3Zm0 0Q49 4 55 22q-11-7-21-5Zm0 0Q21 19 19 32m15-15q13 3 13 15"/>',
 'home': '<path d="m7 29 25-21 25 21M14 25v31h36V25M27 56V39h11v17"/>',
 'games': '<rect x="6" y="17" width="52" height="34" rx="12"/><path d="M22 27v14m-7-7h14m14-6h.1m7 12h.1"/>',
 'play': '<path d="m23 12 30 20-30 20Z"/>',
 'pause': '<rect x="15" y="11" width="11" height="42" rx="3"/><rect x="38" y="11" width="11" height="42" rx="3"/>',
 'back': '<path d="m25 14 18 18-18 18M43 32H9"/>',
 'next': '<path d="M39 14 21 32l18 18M21 32h34"/>',
 'close': '<path d="m17 17 30 30m0-30L17 47"/>',
 'menu': '<path d="M12 17h40M12 32h40M12 47h40"/>',
 'settings': '<path d="m26 8-2 7-7 4-7-1-5 9 5 5v8l-2 5 8 9 7-3 7 2 5 5 10-4v-8l5-6 7-2V28l-7-3-4-6V11l-10-4-5 5Z"/><circle cx="32" cy="32" r="9"/>',
 'sound-on': '<path d="M8 25h12l15-12v38L20 39H8Zm35-3q12 10 0 20m6-29q24 19 0 38"/>',
 'sound-off': '<path d="M8 25h12l15-12v38L20 39H8Zm35 1 13 13m0-13L43 39"/>',
 'help': '<circle cx="32" cy="32" r="25"/><path d="M23 24a9 9 0 1 1 14 7q-5 2-5 8m0 7h.1"/>',
 'info': '<circle cx="32" cy="32" r="25"/><path d="M32 29v18m0-29h.1"/>',
 'shop': '<path d="m9 26 5-16h36l5 16M12 33v21h40V33M8 26q0 12 8 9 8 5 16-3 8 8 16 3 9 3 8-9H8Zm18 28V41h12v13"/>',
 'trophy': '<path d="M19 9h26v17q0 15-13 15T19 26Zm0 5H8v10q0 12 14 11m23-21h11v10q0 12-14 11M32 41v10m-11 5h22"/>',
 'levels': '<path d="M7 56V42h16v14m0 0V28h17v28m0 0V12h17v44M5 56h54"/>',
 'lock': '<rect x="13" y="27" width="38" height="29" rx="6"/><path d="M21 27V18a11 11 0 0 1 22 0v9M32 39v6"/>',
 'unlock': '<rect x="13" y="27" width="38" height="29" rx="6"/><path d="M21 27V18a11 11 0 0 1 21-5M32 39v6"/>',
 'star': '<path d="m32 6 8 17 19 3-14 14 3 19-16-9-16 9 3-19L5 26l19-3Z"/>',
 'coin': '<circle cx="32" cy="32" r="25"/><circle cx="32" cy="32" r="18"/><path d="m32 20 4 8 9 1-7 7 2 9-8-5-8 5 2-9-7-7 9-1Z"/>',
 'gift': '<rect x="8" y="24" width="48" height="11" rx="2"/><path d="M12 35v21h40V35M32 24v32M32 23C5 25 12 3 24 11Zm0 0C59 25 52 3 40 11Z"/>',
 'profile': '<circle cx="32" cy="20" r="12"/><path d="M9 56v-5a23 17 0 0 1 46 0v5Z"/>',
 'team': '<circle cx="32" cy="19" r="10"/><path d="M16 55v-6a16 15 0 0 1 32 0v6ZM13 17a9 9 0 0 0-3 18m-5 16v-6q0-8 9-9m37-19a9 9 0 0 1 3 18m5 16v-6q0-8-9-9"/>',
 'retry': '<path d="M11 25a23 23 0 1 1 0 16M11 10v16h16"/>',
 'check': '<path d="m12 33 13 14 28-30"/>',
 'missions': '<rect x="12" y="12" width="40" height="45" rx="5"/><rect x="24" y="6" width="16" height="12" rx="3"/><path d="m20 29 3 3 5-6m6 4h10m-24 14 3 3 5-6m6 4h10"/>',
 'map': '<path d="m7 13 17-6 16 6 17-6v44l-17 6-16-6-17 6ZM24 7v44m16-38v44"/>',
 'fullscreen': '<path d="M10 25V10h15m14 0h15v15m0 14v15H39m-14 0H10V39"/>',
 'download': '<path d="M32 8v32m-12-12 12 12 12-12M10 43v12h44V43"/>',
 'copy': '<rect x="21" y="21" width="34" height="35" rx="5"/><path d="M43 15V8H8v35h7"/>',
 'heart': '<path d="M32 54 10 33C-8 11 19-4 32 16 45-4 72 11 54 33Z"/>',
 'timer': '<circle cx="32" cy="36" r="22"/><path d="M32 14V6m-9 0h18m8 12 5-5M32 23v14l8 5"/>',
 'shield': '<path d="m32 6 23 9v17Q51 51 32 59 13 51 9 32V15Zm-12 25 9 9 16-18"/>',
 'flag': '<path d="M14 58V8m0 4c11-11 23 11 37 0v25c-14 11-26-11-37 0"/>',
 'share': '<circle cx="47" cy="12" r="7"/><circle cx="16" cy="32" r="7"/><circle cx="47" cy="52" r="7"/><path d="m22 28 19-12M22 36l19 12"/>',
}
MENU_NAMES = dict(zip(MENU_PATHS, ['האי','בית','משחקים','מתחילים','השהיה','חזרה','המשך','סגירה','תפריט','הגדרות','צליל פעיל','צליל כבוי','עזרה','מידע','חנות','הישגים','שלבים','נעול','פתוח','כוכב','מטבע','מתנה','שחקן','קבוצה','שוב','אישור','משימות','מפה','מסך מלא','הורדה','העתקה','חיים','זמן','הגנה','דגל','שיתוף']))


def svg(body, width, height, stroke=False, stretch=False):
    style = f' fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"' if stroke else ''
    aspect = ' preserveAspectRatio="none"' if stretch else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"{aspect}{style}>{body}</svg>\n'


def emit(path, body, width, height, role, use, *, stroke=False, stretch=False, **extra):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    # Readable source stays in this generator; shipped vectors are compact.
    data = re.sub(r'>\s+<', '><', svg(body, width, height, stroke, stretch)).encode()
    target.write_bytes(data)
    assets.append(dict(id=path[:-4].replace('/', '.'), path=path, format='svg', role=role,
                       width=width, height=height, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                       recommendedUse=use, license='CC0-1.0', textEmbedded=False, **extra))


def circle(x, y, r, color):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>'


def ball(x, y, r, basketball=False):
    if basketball:
        return f'<g stroke="{INK}" stroke-width="3" fill="none">{circle(x,y,r,CORAL)}<path d="M{x-r} {y}h{2*r}M{x} {y-r}v{2*r}M{x-r*.65} {y-r*.75}q{r*1.5} {r*.75} 0 {r*1.5}m{r*1.3} {-r*1.5}q{-r*1.5} {r*.75} 0 {r*1.5}"/></g>'
    return f'<g stroke="{INK}" stroke-width="3" stroke-linejoin="round">{circle(x,y,r,WHITE)}<path d="m{x-r*.27} {y-r*.3} {r*.54} 0 {r*.2} {r*.5} {-r*.47} {r*.34} {-r*.47} {-r*.34}Z" fill="{SEA}"/><path d="m{x-r*.9} {y-r*.4} {r*.43} {r*.6}m{r*.94} 0 {r*.43} {-r*.6}M{x} {y+r*.54}v{r*.46}" fill="none"/></g>'


def intro(game):
    gid = game['id']
    accent = game['color']
    common = f'''<rect width="720" height="450" rx="28" fill="{SAND}"/>
    <path d="M0 0h720v292Q548 347 352 289T0 310Z" fill="{accent}"/>
    <circle cx="579" cy="88" r="46" fill="{WHITE}" opacity=".7"/>
    <circle cx="579" cy="88" r="62" fill="none" stroke="{WHITE}" opacity=".35"/>
    <path d="M0 355q120-40 245 0t245 0 230 0v95H0Z" fill="#A6CFC4"/>
    <path d="M32 404h58m478 12h80M70 368h26m546-8h39" stroke="{WHITE}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="356" cy="350" rx="271" ry="43" fill="{INK}" opacity=".1"/>
    <path d="M86 313q22-61 269-62t278 62v22q-33 54-278 53T86 335Z" fill="#D2B486"/>
    <ellipse cx="360" cy="313" rx="274" ry="64" fill="{SAND}"/>
    <path d="m90 88 4 11 11 4-11 4-4 11-4-11-11-4 11-4Zm552 132 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="{SEA}"/>
    <path d="M144 75h39m-20-8h35" stroke="{WHITE}" stroke-width="4" stroke-linecap="round" opacity=".7"/>'''
    scenes = {
      'soccer': f'''<path d="m112 265 240-115 237 116-238 111Z" fill="{SEA}" stroke="{INK}" stroke-width="3"/>
      <path d="m138 265 214-100 209 101-210 96Zm109-51 210 101M291 193l59 29-59 29-59-28m177-30-59 29 59 29 59-28" stroke="{MINT}" stroke-width="3" fill="none"/>
      <ellipse cx="351" cy="264" rx="43" ry="22" fill="none" stroke="{WHITE}" stroke-width="3"/>
      <path d="M156 252v-69l83-40v69m-83-29 21 9 83-40-21-9m21 9v68l-83 41v-69m-21 60 21 9" stroke="{WHITE}" stroke-width="5" fill="none" stroke-linejoin="round"/>
      <path d="m183 205 71-35m-71 49 71-35m-71 49 71-35m-54-15v59m18-67v59m18-67v59" stroke="{WHITE}" opacity=".5" fill="none"/>
      <ellipse cx="512" cy="327" rx="74" ry="16" fill="{INK}" opacity=".16"/>{ball(512,261,66)}''',
      'tennis': f'''<path d="m110 269 234-112 245 115-238 112Z" fill="#C88E6D" stroke="{INK}" stroke-width="3"/>
      <path d="m136 269 209-99 217 102-211 99Zm33-15 217 102m-3-168 1 153m-38-170 1 196m-73-170 217 103" stroke="{SAND}" stroke-width="2" fill="none"/>
      <path d="M232 292v-51l228-5v51" stroke="{INK}" stroke-width="4" fill="none"/>
      <path d="m235 244 223-5v42l-223 14Z" fill="{WHITE}" opacity=".4"/>
      <path d="m235 254 223-5m-223 15 223-5m-223 15 223-5m-193-23v43m30-44v43m30-45v43m30-44v41m30-42v40m30-41v40" stroke="{INK}" stroke-width="1" opacity=".45"/>
      <g transform="translate(459 143) rotate(31 30 75)" stroke="{INK}" stroke-width="5"><ellipse cx="30" cy="32" rx="41" ry="55" fill="{SAND}"/><path d="M10-15v94m20-101v109m20-102v94M-6 4h72M-11 26h82M-9 48h78M0 70h60" stroke-width="2" opacity=".5"/><path d="M24 87v81h12V87" fill="{CORAL}"/></g>
      <circle cx="550" cy="301" r="28" fill="{MINT}" stroke="{INK}" stroke-width="3"/><path d="M533 280q33 9 26 45" fill="none" stroke="{WHITE}" stroke-width="4"/>''',
      'streetSlam': f'''<path d="m112 279 229-109 248 115-235 111Z" fill="#C39865" stroke="{INK}" stroke-width="3"/>
      <path d="m159 258 246 115m-208-135 246 115m-208-133 246 115m-208-133 246 115m-208-133 246 115" stroke="{SAND}" opacity=".25" stroke-width="3"/>
      <path d="m135 279 207-96 224 102-212 98Zm98-47 226 100" stroke="{WHITE}" stroke-width="3" fill="none"/>
      <ellipse cx="349" cy="283" rx="40" ry="20" fill="none" stroke="{WHITE}" stroke-width="3"/>
      <path d="M461 291V120m-42 174h83" stroke="{INK}" stroke-width="11" stroke-linecap="round"/>
      <rect x="402" y="91" width="120" height="82" rx="9" fill="{WHITE}" stroke="{INK}" stroke-width="4"/><path d="M437 160v-30h50v30" fill="none" stroke="{SEA}" stroke-width="4"/>
      <path d="m433 177 12 47h37l12-47m-58 8 55 13m-52-1 49 13m-43-25 3 37m14-39v41m18-39-2 38" fill="none" stroke="{WHITE}" stroke-width="3"/>
      <ellipse cx="463" cy="174" rx="37" ry="8" fill="none" stroke="{CORAL}" stroke-width="7"/>{ball(238,276,63,True)}''',
      'alpineRush': f'''<path d="m99 302 154-203 108 130 93-162 174 235Z" fill="#799FA3" stroke="{INK}" stroke-width="3"/>
      <path d="m192 179 61-80 67 81-43-13-22 27-28-24Zm204-11 58-101 88 117-48-17-35 26-20-35Z" fill="{WHITE}"/>
      <path d="m454 196-79 82 121 13-118 70h-181l133-70-57-15 71-83" fill="{WHITE}"/>
      <path d="m367 203-46 53m92 56-65 30" fill="none" stroke="#A6CAD0" stroke-width="3" stroke-linecap="round"/>
      <path d="m145 258 20-38 19 38h-12v29h-14v-29m397 39 19-39 20 39h-13v27h-14v-27" fill="{SEA}"/>
      <g transform="rotate(-22 401 298)" stroke="{INK}" stroke-width="4"><rect x="285" y="275" width="249" height="57" rx="28" fill="{CORAL}"/><path d="M307 286h200" stroke="{WHITE}" stroke-width="3"/><rect x="342" y="280" width="31" height="43" rx="7" fill="{SAND}"/><rect x="444" y="280" width="31" height="43" rx="7" fill="{SAND}"/><path d="M357 287v29m102-29v29"/></g>''',
      'islandRacing': f'''<path d="m127 320 102-151q26-35 83-35h130q78 0 80 49 3 33-45 56l-80 39 164 46" fill="none" stroke="{INK}" stroke-width="65"/>
      <path d="m127 320 102-151q26-35 83-35h130q78 0 80 49 3 33-45 56l-80 39 164 46" fill="none" stroke="{SAND}" stroke-width="3" stroke-dasharray="14 16"/>
      <g transform="translate(139 91)" stroke="{INK}" stroke-width="4"><path d="M0 164V0m0 8c28-23 55 25 87 0v69c-32 25-59-23-87 0" fill="{WHITE}"/><path d="M3 10h22v22L3 28Zm22 22 23 10v24l-23-9Zm23-22 22 8v23l-22-8Zm22 31 16-4v24l-16 4Z" fill="{SEA}" stroke="none"/></g>
      <ellipse cx="446" cy="345" rx="89" ry="18" fill="{INK}" opacity=".18"/>
      <path d="M374 316v-50a74 74 0 0 1 147 0v50Z" fill="{CORAL}" stroke="{INK}" stroke-width="4"/>
      <path d="M442 228h75l18 45-15 18h-78Z" fill="{INK}"/><path d="M453 241h58l8 22h-66Z" fill="{MINT}"/><path d="M375 315h146m-134-10h32" fill="none" stroke="{WHITE}" stroke-width="5"/>
      <circle cx="428" cy="272" r="7" fill="{GOLD}"/>''',
      'navalDuel': f'''<ellipse cx="359" cy="308" rx="249" ry="57" fill="#76B4BB"/>
      <path d="m147 250 161 50 236-48-46 73-187 33-126-42Z" fill="{INK}"/>
      <path d="m147 250 190-61 207 63-236 48Z" fill="{SEA}" stroke="{INK}" stroke-width="3"/>
      <path d="m278 244 4-93 110-26 54 74v48l-108 25Z" fill="{SAND}" stroke="{INK}" stroke-width="3"/>
      <path d="m291 163 90-22 36 49-80 22-47-18Z" fill="{MINT}"/><path d="m296 170 26-6 1 31-27-10m41-24 29-7 21 31-50 13" fill="{INK}"/>
      <path d="M359 132V76m-28 0h55m-27 16 36-19" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>
      <path d="m210 272 96 31 163-33" fill="none" stroke="{CORAL}" stroke-width="5"/>
      <path d="M169 335q18-16 36 0t36 0m153 13q18-16 36 0t36 0m46-61h52m-404-1h49" fill="none" stroke="{WHITE}" stroke-width="4" stroke-linecap="round"/>''',
      'fireRescue': f'''<g stroke="{INK}" stroke-width="3"><rect x="153" y="169" width="103" height="141" rx="8" fill="{MINT}"/><path d="m141 171 63-47 64 47Z" fill="{SEA}"/><rect x="286" y="144" width="102" height="168" rx="8" fill="{SAND}"/><path d="m276 146 61-44 61 44Z" fill="{CORAL}"/></g>
      <path d="M179 199h17v22h-17Zm38 0h17v22h-17Zm-38 47h17v22h-17Zm38 0h17v22h-17Zm96-66h18v25h-18Zm35 0h18v25h-18Zm-35 48h18v25h-18Z" fill="{INK}" opacity=".6"/>
      <path d="M469 124c6 46 62 63 62 116a67 67 0 0 1-134 0c0-28 17-57 42-77-8 34 3 39 12 49 17-31 19-57 18-88Z" fill="{CORAL}" stroke="{INK}" stroke-width="3"/>
      <path d="M464 222c17 26 36 40 29 60a31 31 0 0 1-57-6c0-18 17-33 28-54Z" fill="{GOLD}"/>
      <path d="M167 319q-17-60 52-53t97 62 93 5" fill="none" stroke="{SEA}" stroke-width="15" stroke-linecap="round"/>
      <path d="m391 329 36-12 9 19-34 15Z" fill="{SAND}" stroke="{INK}" stroke-width="3"/>
      <path d="m442 318 82-23m-78 32 89-8m-88 18 81 7" stroke="#75B7CA" stroke-width="5" stroke-linecap="round"/>''',
      'alienDefense': f'''<ellipse cx="358" cy="265" rx="186" ry="38" fill="{INK}" opacity=".1"/>
      <path d="M271 211a88 88 0 0 1 176 0" fill="{MINT}" stroke="{INK}" stroke-width="4"/>
      <ellipse cx="359" cy="224" rx="177" ry="49" fill="{INK}"/>
      <ellipse cx="359" cy="208" rx="177" ry="42" fill="{SAND}" stroke="{INK}" stroke-width="4"/>
      <ellipse cx="359" cy="192" rx="88" ry="15" fill="{MINT}"/>
      <path d="m309 266-36 60m86-52v67m50-75 36 60" stroke="{SEA}" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 11"/>
      {''.join(circle(x,215,8,CORAL) for x in (225,273,321,369,417,465,497))}
      <circle cx="153" cy="151" r="31" fill="{CORAL}"/><ellipse cx="153" cy="151" rx="49" ry="10" transform="rotate(-25 153 151)" fill="none" stroke="{SAND}" stroke-width="5"/>
      <path d="m478 301 37-14 37 14v28q-5 32-37 48-32-16-37-48Z" fill="{SEA}" stroke="{INK}" stroke-width="3"/><path d="m496 328 14 14 26-29" fill="none" stroke="{WHITE}" stroke-width="5" stroke-linecap="round"/>''',
      'boarDefense': f'''<path d="M134 273v53m43-53v65m43-65v73m265-73v73m43-73v65m43-65v53M117 290h125m227 0h120" stroke="{SEA}" stroke-width="10" stroke-linecap="round"/>
      <path d="m248 176-11-70 88 43h65l88-43-13 70 21 84-59 69H292l-60-69Z" fill="{MINT}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="m257 126 13 55m186-55-15 55" stroke="{CORAL}" stroke-width="11" stroke-linecap="round"/>
      <path d="M281 213h36m85 0h36" stroke="{INK}" stroke-width="11" stroke-linecap="round"/>
      <rect x="297" y="246" width="125" height="73" rx="25" fill="{SAND}" stroke="{INK}" stroke-width="4"/><path d="M332 271v22m54-22v22" stroke="{INK}" stroke-width="9" stroke-linecap="round"/>
      <path d="m250 253 20 29m197-29-20 29" stroke="{WHITE}" stroke-width="12" stroke-linecap="round"/>
      <circle cx="359" cy="192" r="12" fill="{GOLD}" stroke="{INK}" stroke-width="3"/>
      <path d="m519 147 21-8 21 8v18q-3 18-21 27-18-9-21-27Z" fill="{SEA}"/><path d="m529 162 9 8 14-18" stroke="{WHITE}" stroke-width="3" fill="none"/>''',
    }
    return common + scenes[gid]


def star(cx, cy, radius):
    points = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = radius if i % 2 == 0 else radius * .48
        points.append(f'{cx + math.cos(a)*r:.2f},{cy + math.sin(a)*r:.2f}')
    return ' '.join(points)


def main():
    for game in GAMES:
        gid = game['id']
        emit(f'icons/games/{gid}.svg', GAME_PATHS[gid], 64, 64, 'game-icon', 'סמל משחק בתפריט, בכרטיס פתיחה ובכותרת תוצאה; 32–64px.', stroke=True, gameId=gid, labelHe=game['name'], minDisplayPx=32, mirrorInRTL=False)
        emit(f'intro/{gid}.svg', intro(game), 720, 450, 'intro-illustration', 'איור כרטיס פתיחה; object-fit: contain, יחס 8:5, מלל וכפתור בשכבת HTML מחוץ לאיור.', gameId=gid, labelHe=game['name'], safeArea=[24, 24, 672, 402], mirrorInRTL=False)

    for key, body in MENU_PATHS.items():
        emit(f'icons/menu/{key}.svg', body, 64, 64, 'menu-icon', 'אייקון 24–32px בתוך יעד מגע של 48px לפחות. תווית נגישה על הכפתור; SVG דקורטיבי.', stroke=True, labelHe=MENU_NAMES[key], minDisplayPx=24, mirrorInRTL=False,
             direction=('rtl' if key in ('back','next') else 'neutral'))

    styles = {
      'primary': [('default','#24786D','#FFFCF4'),('hover','#1E6C62','#FFFCF4'),('pressed','#19594F','#FFFCF4'),('disabled','#CCD5C9','#3E5B56')],
      'secondary': [('default','#FFFCF4',INK),('hover','#F0E5CE',INK),('pressed','#E3D6BB',INK),('disabled','#E3E4D9','#52605A')],
      'icon': [('default','#F8EED9',INK),('hover','#EDE0C2',INK),('pressed','#DDCDA8',INK),('disabled','#E3E4D9','#52605A')],
    }
    button_manifest = {}
    for kind, states in styles.items():
        w, h = (64,64) if kind == 'icon' else (288,64)
        button_manifest[kind] = {}
        for state, color, label_color in states:
            body = f'<rect x="1" y="5" width="{w-2}" height="58" rx="18" fill="{INK}" opacity=".16"/><rect x="1" y="1" width="{w-2}" height="58" rx="18" fill="{color}" stroke="{INK}" stroke-opacity=".2"/><path d="M20 5H{w-20}" stroke="{WHITE}" stroke-width="2" stroke-linecap="round" opacity=".22"/>'
            path = f'buttons/{kind}-{state}.svg'
            emit(path, body, w, h, 'button-surface', 'רקע לכפתור HTML; מלל ואייקון נפרדים. border-image: 22 fill / 22px; אין למתוח פינות בעזרת background-size.', buttonKind=kind, state=state, textColor=label_color, slices=[22,22,22,22], minTouchPx=48)
            button_manifest[kind][state] = dict(path=path, textColor=label_color)

    for active in (False, True):
        name = 'filled' if active else 'empty'
        body = f'<polygon points="{star(32,32,28)}" fill="{GOLD if active else "#E0E6DA"}" stroke="{INK if active else "#536C64"}" stroke-width="2.5" stroke-linejoin="round"/>'
        if active:
            body += f'<path d="m27 19 4-7 4 9" fill="none" stroke="{WHITE}" stroke-width="2.5" stroke-linecap="round"/>'
        emit(f'rewards/star-{name}.svg', body, 64,64,'rating-star','כוכב מלא או ריק. לצרף טקסט כגון 2 מתוך 3; מצב ריק מובחן גם במילוי ובקו מתאר.', minDisplayPx=24)

    for count in range(4):
        body = ''
        for i in range(3):
            active = i < count
            body += f'<polygon points="{star(34+i*76,40,29 if i!=1 else 35)}" fill="{GOLD if active else "#E0E6DA"}" stroke="{INK if active else "#536C64"}" stroke-width="2.5" stroke-linejoin="round"/>'
        emit(f'rewards/rating-{count}.svg', body,220,80,'rating-strip','דירוג סטטי 0–3 משמאל לימין. לתת alt מפורש בעברית; מספר הכוכבים נקבע בלוגיקת המשחק בלבד.', stars=count, maxStars=3, mirrorInRTL=False)

    trophy = f'''<ellipse cx="144" cy="229" rx="98" ry="16" fill="{INK}" opacity=".12"/>
    <circle cx="144" cy="109" r="93" fill="{MINT}" opacity=".45"/>
    <path d="M97 53H60v29q0 45 45 46m86-75h37v29q0 45-45 46" stroke="{INK}" stroke-width="6" fill="none"/>
    <path d="M94 34h100v61q0 60-50 60T94 95Z" fill="{GOLD}" stroke="{INK}" stroke-width="4"/>
    <path d="M105 45v45q0 39 19 43" stroke="{WHITE}" stroke-width="5" opacity=".65" fill="none" stroke-linecap="round"/>
    <polygon points="{star(145,83,24)}" fill="{WHITE}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M136 155v35h-27l-13 30h96l-13-30h-27v-35" fill="{SEA}" stroke="{INK}" stroke-width="4"/>
    <path d="m45 31 4 11 11 4-11 4-4 11-4-11-11-4 11-4Zm200 102 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="{CORAL}"/>'''
    emit('rewards/trophy.svg', trophy,288,256,'result-illustration','איור תוצאה והישג; 144–240px. אין לתרגם הופעת גביע אוטומטית לניצחון או פרס.')
    emit('surfaces/result-panel.svg', f'<rect x="1" y="1" width="638" height="398" rx="28" fill="{WHITE}" stroke="#C9D6C7" stroke-width="2"/><path d="M28 1h584" stroke="{GOLD}" stroke-width="3"/><path d="m24 37 4 10 10 4-10 4-4 10-4-10-10-4 10-4m592 284 4 10 10 4-10 4-4 10-4-10-10-4 10-4" fill="{MINT}"/>',640,400,'result-surface','מסגרת תוצאה; border-image 32 fill / 32px או רקע CSS. לשמור 32px מרווח פנימי; הטקסט ב-DOM.', slices=[32,32,32,32])
    emit('surfaces/island.svg', f'''<circle cx="220" cy="180" r="157" fill="{MINT}"/><circle cx="327" cy="81" r="35" fill="{GOLD}"/>
    <ellipse cx="220" cy="263" rx="165" ry="40" fill="{INK}" opacity=".1"/><ellipse cx="220" cy="250" rx="165" ry="40" fill="#7BB9AE"/>
    <path d="M84 228q21-52 131-49t138 49v18q-15 39-133 40T84 246Z" fill="#D2B486"/><ellipse cx="220" cy="228" rx="137" ry="44" fill="{SAND}"/>
    <path d="M145 219q31-45 101-29t50 42q-94 16-151-13Z" fill="{SEA}"/>
    <path d="M213 226q28-56 12-113" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>
    <path d="M225 120q-20-61-77-33 50 3 62 39-43-17-62 20 39-15 67-9-31 20-25 53 13-29 40-54 8 33 37 37-19-25-24-43 40-4 60 22-5-42-61-37 28-34 57-23-37-35-74 28Z" fill="{SEA}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="224" cy="129" r="8" fill="{GOLD}"/><circle cx="237" cy="133" r="8" fill="{CORAL}"/>
    <path d="M44 295h58m243-29h51m-68 38h24M64 159h26" stroke="{WHITE}" stroke-width="4" stroke-linecap="round"/>
    <path d="m95 77 4 11 11 4-11 4-4 11-4-11-11-4 11-4" fill="{CORAL}"/>''',440,350,'menu-illustration','איור ראשי למסך בחירת משחק; 220–440px, contain, ללא שיקוף.')

    tokens = dict(colors=dict(ink=INK,sea=SEA,mint=MINT,sand=SAND,coral=CORAL,gold=GOLD,paper=WHITE,muted='#516862',line='#CFD9CB'),
                  radius=dict(small=12,medium=18,large=28,pill=999),
                  spacing=[4,8,12,16,24,32,48,64],
                  typography=dict(fontFamily='Arial, "DejaVu Sans", sans-serif',bodyPx=16,smallPx=14),
                  icon=dict(viewBox=[0,0,64,64],strokeWidth=3,linecap='round',linejoin='round',menuDisplayPx=[24,32],gameDisplayPx=[32,48,64]),
                  motion=dict(panel=dict(durationMs=240,distancePx=12,easing='cubic-bezier(.2,.7,.2,1)'),card=dict(durationMs=220,staggerMs=35,maxStaggerMs=280),stars=dict(durationMs=280,staggerMs=70),reducedMotion='none',iterations=1))
    (ROOT/'tokens.json').write_text(json.dumps(tokens,ensure_ascii=False,indent=2)+'\n')
    for game in GAMES:
        gid = game['id']
        game.update(icon=f'icons/games/{gid}.svg',intro=f'intro/{gid}.svg',altHe=f'איור {game["name"]}',recommendedUse='תפריט משחקים, כרטיס פתיחה ותוצאת משחק',animation='ik-enter')
    manifest = dict(schemaVersion=1,version='2.0.0',name='Island UI Kit v2',locale='he-IL',direction='rtl',created='2026-11-04',license='CC0-1.0',
                    maxAssetBytes=100000,preview='index.html',stylesheet='ui-kit.css',tokens='tokens.json',
                    style='Original island illustrations; sea, sand, coral; round 3-unit strokes; no brands.',
                    sourceOfTruth='../../data/extensions.json + ../../data/featureFlags.json',
                    gameCoverage=dict(enabled=9,excluded=[dict(id='practiceContract',reason='exampleContent=false; extension contract example, no playable game UI')]),
                    accessibility=dict(minTouchPx=48,bodyPx=16,minLabelPx=14,textInDOM=True,decorativeAlt='',ratingLabelExample='2 מתוך 3 כוכבים',focusRing='3px #173E40 + 3px #FFFCF4',reducedMotion=True),
                    integration=dict(importsRuntime=False,networkRequired=False,fonts='system only',resultPolicy='Display values supplied by the game; never calculate rewards or stars here.',
                        rtl='Back points right and next left. These are RTL assets; do not mirror in RTL. Mirror only back/next when adapting to LTR. Never mirror art, game icons, or stars.',
                        embedding='Use img with explicit dimensions. Decorative images need alt=""; icon-only buttons need aria-label. SVG assets contain no text, script, fonts, raster, filters, or external links.',
                        buttons='Native button with border-image source from buttons/, slices 22 fill / 22px. Use :hover only at hover:hover; disabled takes precedence. Text stays in DOM.',
                        motion='Opt in with ik-enter, ik-card-enter, ik-stars-enter. One iteration only; CSS disables animation and transitions for prefers-reduced-motion:reduce.'),
                    games=GAMES,buttons=button_manifest,assets=assets,
                    totals=dict(assets=len(assets),bytes=sum(a['bytes'] for a in assets),largestBytes=max(a['bytes'] for a in assets)))
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    build_preview()
    print(f'Built {len(assets)} SVGs; largest {manifest["totals"]["largestBytes"]:,} bytes; total {manifest["totals"]["bytes"]:,} bytes.')


def build_preview():
    template = (ROOT/'tools/preview.template.html').read_text()
    cards = []
    for number, game in enumerate(GAMES,1):
        gid=game['id']
        cards.append(f'''<article class="game-card ik-card-enter" style="--ik-order:{number-1};--game-accent:{game['color']}">
          <a href="intro/{gid}.svg" class="game-art-link" aria-label="פתיחת איור {game['name']}"><img class="game-art" src="intro/{gid}.svg" width="720" height="450" alt="{game['altHe']}" loading="lazy"></a>
          <div class="game-copy"><span class="game-category">{game['category']}</span><h3>{game['name']}</h3><p>{game['hint']}</p>
          <button type="button" class="card-open" data-game="{gid}" data-name="{game['name']}" data-category="{game['category']}" data-instruction="{game['instruction']}" aria-haspopup="dialog"><img src="icons/games/{gid}.svg" alt="" width="32" height="32"><span>תצוגת פתיחה</span><img src="icons/menu/next.svg" alt="" width="24" height="24"></button></div></article>''')
    gallery = []
    for key,name in MENU_NAMES.items():
        gallery.append(f'<a class="icon-tile" href="icons/menu/{key}.svg" download><img src="icons/menu/{key}.svg" width="32" height="32" alt="" loading="lazy"><span>{name}</span><code dir="ltr">{key}</code></a>')
    game_icons = [f'<a class="game-icon-tile" href="icons/games/{g["id"]}.svg" download><img src="icons/games/{g["id"]}.svg" width="48" height="48" alt=""><span>{g["name"]}</span></a>' for g in GAMES]
    states = []
    for name, label in [('default','רגיל'),('hover','מעבר עכבר'),('pressed','לחיצה'),('disabled','לא זמין')]:
        disabled=' disabled' if name=='disabled' else ''
        states.append(f'<div class="button-state"><span class="state-label">{label}</span><button class="ik-button ik-primary sample-{name}" type="button"{disabled}><img src="icons/menu/play.svg" width="24" height="24" alt="">מתחילים</button><button class="ik-button ik-secondary sample-{name}" type="button"{disabled}><img src="icons/menu/levels.svg" width="24" height="24" alt="">בחירת שלב</button><button class="ik-button ik-icon-button sample-{name}" type="button" aria-label="הגדרות — {label}"{disabled}><img src="icons/menu/settings.svg" width="26" height="26" alt=""></button></div>')
    result=template.replace('<!-- GAMES -->','\n'.join(cards)).replace('<!-- MENU_ICONS -->','\n'.join(gallery)).replace('<!-- GAME_ICONS -->','\n'.join(game_icons)).replace('<!-- BUTTON_STATES -->','\n'.join(states))
    (ROOT/'index.html').write_text(result)


if __name__ == '__main__':
    main()
