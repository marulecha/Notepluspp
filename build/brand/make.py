# Builds the NoteplusPP artwork from build/brand/mascot.svg and the Fredoka font:
#   build/icon.svg            app icon (render it to build/icon.png at 1024px)
#   public/favicon.svg        the same icon, for the browser tab
#   public/logo.svg           the pad stack and chameleon without text, for the About dialog
#   public/logo-wordmark.svg  the pad stack with "Noteplus{}{}" beside it, for the README
# Fredoka is under the SIL Open Font License. Download it from
# https://github.com/google/fonts/tree/main/ofl/fredoka, then run:
#   python3 build/brand/make.py <path to Fredoka[wdth,wght].ttf>
import re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

import os
repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
font_path = sys.argv[1]
font = instantiateVariableFont(TTFont(font_path), {'wght': 600, 'wdth': 100})
glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
UPM = font['head'].unitsPerEm


def text_path(text, size, x=0, baseline=0, tracking=0):
    """Returns (svg path d, list of per-character boxes) for text at the given size."""
    scale = size / UPM
    d, boxes, pen_x = [], [], x
    for ch in text:
        g = cmap[ord(ch)]
        t = (scale, 0, 0, -scale, pen_x, baseline)
        sp = SVGPathPen(glyphs)
        glyphs[g].draw(TransformPen(sp, t))
        d.append(sp.getCommands())
        bp = BoundsPen(glyphs)
        glyphs[g].draw(TransformPen(bp, t))
        boxes.append(bp.bounds)
        pen_x += hmtx[g][0] * scale + tracking
    return ' '.join(d), boxes, pen_x


src = open(f'{repo}/build/brand/mascot.svg').read()
lines = src.split('\n')
PAD_OUTLINE, PAD_STITCH, PAD_EARLINES = lines[3], lines[4], lines[5]
CHAMELEON = '\n'.join(lines[7:41])

INK = '#2b1640'      # wordmark letters
PURPLE = '#7b3fb5'   # braces
LAVENDER = ['#efe5f9', '#dcc8f0', '#c3a3e3']


def pad_fill(color):
    return PAD_OUTLINE.replace('fill="#fff"', f'fill="{color}"')


def glyph_at(ch, size, x, cy, color):
    """One glyph with its left edge at x and its vertical centre at cy."""
    _, boxes, _ = text_path(ch, size)
    x0, y0, x1, y1 = boxes[0]
    d, _, _ = text_path(ch, size, x=x - x0, baseline=cy - (y0 + y1) / 2)
    return f'<path d="{d}" fill="{color}"/>'


def code_page():
    """A small block of syntax-coloured code on the front pad, below the chameleon: { lines }."""
    rows = [(0, 46, '#c678dd'), (1, 62, '#e5a54b'), (1, 40, '#61afef'), (2, 48, '#98c379'), (1, 56, '#e06c75')]
    top, step, left, indent = 300, 21, 214, 16
    parts = [glyph_at('{', 34, left, top, PURPLE)]
    for i, (level, width, color) in enumerate(rows):
        x = left + 22 + level * indent
        parts.append(f'<rect x="{x}" y="{top + i * step - 5.5}" width="{width}" height="11" rx="5.5" fill="{color}"/>')
    parts.append(glyph_at('}', 34, left, top + len(rows) * step, PURPLE))
    return f'<g>{"".join(parts)}</g>'


SHADOW = ('<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">'
          '<feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#3b1660" flood-opacity="0.28"/></filter>')


def stack_art():
    """Two pads fanned behind the front pad, a code page on the front pad, the chameleon on top."""
    back2 = f'<g transform="translate(395,215) rotate(20) scale(0.8) translate(-275,-245)">{pad_fill(LAVENDER[2])}</g>'
    back1 = f'<g transform="translate(335,228) rotate(10) scale(0.9) translate(-275,-245)">{pad_fill(LAVENDER[1])}</g>'
    return (f'<g filter="url(#shadow)">{back2}{back1}{PAD_OUTLINE}</g>'
            f'{PAD_STITCH}{PAD_EARLINES}{code_page()}{CHAMELEON}')


def icon():
    tile = ('<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" stop-color="#faf6fd"/><stop offset="1" stop-color="#d9c2ee"/></linearGradient>')
    body = (f'<defs>{tile}{SHADOW}</defs>'
            '<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#tile)"/>'
            '<rect x="100" y="100" width="824" height="824" rx="185" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="3"/>'
            f'<g transform="translate(512,512) scale(1.22) translate(-290,-248)">{stack_art()}</g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{body}</svg>'


def wordmark(x, baseline, size):
    """'Noteplus' in ink, then '{}' '{}' in purple, each pair sitting on a soft pad shape."""
    word, _, end = text_path('Noteplus', size, x=x, baseline=baseline)
    parts = [f'<path d="{word}" fill="{INK}"/>']
    pen = end + size * 0.10
    for _ in range(2):
        d, boxes, nxt = text_path('{}', size, x=pen, baseline=baseline, tracking=size * 0.02)
        x0, y0 = boxes[0][0], min(b[1] for b in boxes)
        x1, y1 = boxes[1][2], max(b[3] for b in boxes)
        pad_w, pad_h, mid = (x1 - x0) * 0.62, (y1 - y0) * 1.04, (y0 + y1) / 2
        cx = (x0 + x1) / 2
        parts.append(f'<rect x="{cx - pad_w / 2:.1f}" y="{mid - pad_h / 2:.1f}" width="{pad_w:.1f}" height="{pad_h:.1f}" '
                     f'rx="{pad_w / 2:.1f}" fill="{LAVENDER[1]}"/>')
        parts.append(f'<path d="{d}" fill="{PURPLE}"/>')
        pen = nxt + size * 0.06
    return ''.join(parts), pen


def mark():
    """The pad stack and chameleon on their own, framed tightly."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 -20 500 530"><defs>{SHADOW}</defs>'
            f'{stack_art()}</svg>')


def lockup():
    """The mark on the left and the wordmark on the right, centred on the same line."""
    words, end = wordmark(530, 300, 150)
    art = f'<g transform="translate(40,40) scale(0.86)">{stack_art()}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="70 20 {end - 40:.0f} 470"><defs>{SHADOW}</defs>'
            f'{art}{words}</svg>')


for path, svg in [('build/icon.svg', icon()), ('public/favicon.svg', icon()),
                  ('public/logo.svg', mark()), ('public/logo-wordmark.svg', lockup())]:
    open(f'{repo}/{path}', 'w').write(svg + '\n')
print('ok')
