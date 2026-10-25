"""
Genera gli asset del marchio Ponte (SVG) dalla geometria del marchio e dal font Archivo.
Uso:  pip install fonttools brotli && python3 brand/generate.py
Il marchio è una "p" minuscola la cui pancia è uno pneumatico con mozzo: ponte sollevatore + ruota.
"""
import math, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(ROOT, '..', 'node_modules', '@fontsource-variable', 'archivo', 'files', 'archivo-latin-wdth-normal.woff2')

ORANGE = '#FF6A13'   # Arancio Ponte
ASPHALT = '#1C1B19'  # Asfalto
WHITE = '#FFFFFF'

# --- geometria del marchio su griglia 100 -------------------------------------------------
CX, CY, R = 54.0, 45.0, 27.0      # pneumatico
HOLE, HUB = 14.0, 6.0             # foro cerchio e mozzo
SX1, SX2 = 20.0, 36.0             # stelo
BOTTOM = 86.0                     # discendente della p

def mark_path(ox=0.0, oy=0.0, s=1.0):
    dx = CX - SX2
    dy = math.sqrt(R * R - dx * dx)
    top = CY - R
    f = lambda v: f'{v:.2f}'
    X = lambda x: f(ox + x * s)
    Y = lambda y: f(oy + y * s)
    body = (f'M{X(SX1)} {Y(top)}H{X(SX2)}V{Y(CY - dy)}'
            f'A{f(R*s)} {f(R*s)} 0 1 1 {X(SX2)} {Y(CY + dy)}'
            f'V{Y(BOTTOM)}H{X(SX1)}Z')
    hole = (f'M{X(CX - HOLE)} {Y(CY)}a{f(HOLE*s)} {f(HOLE*s)} 0 1 0 {f(2*HOLE*s)} 0'
            f'a{f(HOLE*s)} {f(HOLE*s)} 0 1 0 {f(-2*HOLE*s)} 0Z')
    hub = (f'M{X(CX - HUB)} {Y(CY)}a{f(HUB*s)} {f(HUB*s)} 0 1 0 {f(2*HUB*s)} 0'
           f'a{f(HUB*s)} {f(HUB*s)} 0 1 0 {f(-2*HUB*s)} 0Z')
    return body + hole, hub

# limiti del marchio, per centrarlo otticamente
MX0, MX1 = SX1, CX + R
MY0, MY1 = CY - R, BOTTOM

def mark_group(color, size, cx, cy, hub_color=None):
    """Marchio di altezza `size`, centrato in (cx, cy) (centro ottico leggermente alto)."""
    s = size / (MY1 - MY0)
    w = (MX1 - MX0) * s
    ox = cx - w / 2 - MX0 * s
    oy = cy - size / 2 - MY0 * s - size * 0.02
    body, hub = mark_path(ox, oy, s)
    return f'<path fill="{color}" fill-rule="evenodd" d="{body}"/><path fill="{hub_color or color}" d="{hub}"/>'

def svg(w, h, inner, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{inner}</svg>\n')

# --- logotipo dal font -------------------------------------------------------------------
def wordmark():
    f = TTFont(FONT)
    inst = instantiateVariableFont(f, {'wght': 800, 'wdth': 112})
    gs = inst.getGlyphSet()
    cmap = inst.getBestCmap()
    x, track, out = 0.0, -30.0, []
    for ch in 'ponte':
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(pen)
        out.append((x, pen.getCommands()))
        x += gs[g].width + track
    return x - track, inst['OS/2'].sxHeight, out

def wordmark_group(color, x0, baseline, xheight_px):
    width, xh, glyphs = wordmark()
    s = xheight_px / xh
    paths = ''.join(f'<path d="{d}" transform="translate({gx:.1f} 0)"/>' for gx, d in glyphs)
    return f'<g fill="{color}" transform="translate({x0:.2f} {baseline:.2f}) scale({s:.5f} {-s:.5f})">{paths}</g>', width * s

def write(name, content):
    with open(os.path.join(ROOT, name), 'w') as fh:
        fh.write(content)

def main():
    # marchio solo
    write('ponte-mark.svg', svg(100, 100, mark_group(ASPHALT, 70, 50, 50), 'Ponte'))
    write('ponte-mark-white.svg', svg(100, 100, mark_group(WHITE, 70, 50, 50), 'Ponte'))
    # icona app: quadrato pieno (iOS e Android applicano da soli la maschera)
    write('ponte-icon.svg', svg(1024, 1024, f'<rect width="1024" height="1024" fill="{ORANGE}"/>' + mark_group(ASPHALT, 600, 512, 512), 'Ponte'))
    # icona adattiva Android / maskable PWA: marchio dentro la zona sicura (cerchio 66%)
    write('ponte-icon-foreground.svg', svg(1024, 1024, mark_group(ASPHALT, 470, 512, 512), 'Ponte'))
    write('ponte-icon-maskable.svg', svg(1024, 1024, f'<rect width="1024" height="1024" fill="{ORANGE}"/>' + mark_group(ASPHALT, 470, 512, 512), 'Ponte'))
    # favicon con angoli arrotondati
    write('ponte-favicon.svg', svg(64, 64, f'<rect width="64" height="64" rx="15" fill="{ORANGE}"/>' + mark_group(ASPHALT, 40, 32, 32), 'Ponte'))
    # splash: marchio su asfalto
    write('ponte-splash.svg', svg(2732, 2732, f'<rect width="2732" height="2732" fill="{ORANGE}"/>' + mark_group(ASPHALT, 520, 1366, 1366), 'Ponte'))
    write('ponte-splash-dark.svg', svg(2732, 2732, f'<rect width="2732" height="2732" fill="{ASPHALT}"/>' + mark_group(ORANGE, 520, 1366, 1366), 'Ponte'))

    # logotipo e marchio + logotipo
    for suffix, ink in (('', ASPHALT), ('-white', WHITE)):
        g, ww = wordmark_group(ink, 0, 100, 52)
        write(f'ponte-wordmark{suffix}.svg', svg(round(ww) + 2, 124, g, 'Ponte'))
        icon = f'<rect width="120" height="120" rx="28" fill="{ORANGE}"/>' + mark_group(ASPHALT, 72, 60, 60)
        g, ww = wordmark_group(ink, 146, 86, 52)
        write(f'ponte-logo{suffix}.svg', svg(round(146 + ww) + 4, 120, icon + g, 'Ponte'))

def write_ts():
    """Percorsi per i componenti React (src/ui/brandPaths.ts)."""
    body, hub = mark_path(-MX0 + 2, -MY0 + 2, 1.0)
    vb_mark = f'0 0 {MX1 - MX0 + 4:.0f} {MY1 - MY0 + 4:.0f}'
    width, xh, glyphs = wordmark()
    # logotipo su una baseline a y=0, coordinate font (y verso l'alto) convertite in SVG
    s = 0.1
    d = ' '.join(f'<g transform="translate({gx*s:.2f} 0)">{dd}</g>' for gx, dd in glyphs)
    paths = [(gx * s, dd) for gx, dd in glyphs]
    asc, desc = 56, 20  # in unità scalate: x-height 52.6, discendente della p ~19
    ts = ['// File generato da brand/generate.py: non modificare a mano.',
          f"export const MARK_VIEWBOX = '{vb_mark}';",
          f"export const MARK_BODY = '{body}';",
          f"export const MARK_HUB = '{hub}';",
          f"export const WORDMARK_VIEWBOX = '0 {-asc} {width*s:.1f} {asc+desc}';",
          'export const WORDMARK_GLYPHS: { x: number; d: string }[] = [']
    for gx, dd in paths:
        ts.append(f"  {{ x: {gx:.2f}, d: '{dd}' }},")
    ts.append('];')
    ts.append(f'export const WORDMARK_SCALE = {s};')
    with open(os.path.join(ROOT, '..', 'src', 'ui', 'brandPaths.ts'), 'w') as fh:
        fh.write('\n'.join(ts) + '\n')

if __name__ == '__main__':
    main()
    write_ts()
    print('asset generati in', ROOT)
