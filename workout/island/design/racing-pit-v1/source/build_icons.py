"""Original, text-free 96×96 UI vector artwork. SPDX-License-Identifier: CC0-1.0."""
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / 'icons'


def svg(body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">'
            '<g stroke="#152638" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">'
            + body + '</g></svg>\n')


def tire(color, wear):
    body = '<ellipse cx="48" cy="46" rx="27" ry="34" fill="#152638"/>'
    body += f'<ellipse cx="44" cy="46" rx="22" ry="33" fill="{color}"/>'
    body += '<ellipse cx="44" cy="46" rx="10" ry="18" fill="#e8f2ee"/>'
    grooves = [(24, 27, 32, 30), (20, 43, 29, 45), (23, 61, 32, 60),
               (56, 25, 63, 29), (59, 43, 67, 44), (56, 60, 64, 60)]
    for a, b, c, d in grooves[:6 - wear * 2]:
        body += f'<path d="M{a} {b}L{c} {d}" fill="none"/>'
    # Parallel shape language makes each state identifiable without color perception.
    if wear == 2:
        body += '<path d="M29 19l5 7-6 7M58 65l-5 6 4 6" fill="none"/>'
    if wear == 3:
        body += '<path d="M30 19l6 11-7 9 7 10-6 12 8 11" fill="none"/>'
    for i in range(4):
        body += f'<rect x="{17 + i * 16}" y="84" width="12" height="6" rx="2" stroke="none" fill="{color if i < 4 - wear else "#c5cfd5"}"/>'
    return body


def main():
    BASE.mkdir(exist_ok=True)
    for i, color in enumerate(['#73d5a3', '#d6d861', '#f4ac60', '#ef7770']):
        (BASE / f'tire_wear_{i}.svg').write_text(svg(tire(color, i)))
    icons = {
        'pit_entry': '<path d="M20 14v67h56V57H49V14" fill="#e8f2ee"/>'
                     '<path d="M33 23v43h29" stroke="#18b6bd" stroke-width="10" fill="none"/>'
                     '<path d="M57 53l15 13-15 13" fill="#18b6bd"/>',
        'wheel_change': '<circle cx="48" cy="48" r="20" fill="#152638"/>'
                        '<circle cx="48" cy="48" r="10" fill="#e8f2ee"/>'
                        '<path d="M18 37A32 32 0 0 1 72 23M78 59A32 32 0 0 1 24 73" fill="none" stroke="#18b6bd" stroke-width="8"/>'
                        '<path d="M60 19l17 0-1 17M36 77l-17 0 1-17" fill="#18b6bd"/>',
        'wear_gauge': '<path d="M14 73a36 36 0 1 1 68 0" fill="#e8f2ee" stroke-width="7"/>'
                      '<path d="M20 63a29 29 0 0 1 9-34" fill="none" stroke="#73d5a3" stroke-width="8"/>'
                      '<path d="M32 25a29 29 0 0 1 32 0" fill="none" stroke="#f4ac60" stroke-width="8"/>'
                      '<path d="M68 30a29 29 0 0 1 8 33" fill="none" stroke="#ef7770" stroke-width="8"/>'
                      '<path d="M44 60l22-23-14 29z" fill="#152638"/>'
                      '<circle cx="48" cy="63" r="6" fill="#18b6bd"/>'
                      '<path d="M29 83h38" fill="none"/>',
    }
    for name, body in icons.items():
        (BASE / (name + '.svg')).write_text(svg(body))
    print('7 original text-free SVG icons, 96×96')


if __name__ == '__main__':
    main()
