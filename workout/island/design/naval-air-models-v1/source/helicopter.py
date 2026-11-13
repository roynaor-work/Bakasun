"""Original compact toy helicopter. Coordinates are glTF-native (+Y up, +Z nose).

All finish variations are vertex colors on the shared material.  The main rotor
and tail rotor geometry is authored around its own local rotation pivot.
"""
from math import cos, sin, pi
from meshlib import Mesh, Model

OLIVE = '#7c8b4d'
LIGHT = '#a8b476'
SHADE = '#59663b'
FRAME = '#435139'
GLASS = '#92d7e8'
GLASS_LIGHT = '#b7ebf3'
DARK = '#37443b'
CREAM = '#e5dfb6'


def _rotor_blade(mesh, angle, color):
    """A thin tapered blade with a pointed tip at exactly radius 3.8."""
    outline = [(.24, -.10), (3.35, -.16), (3.80, 0),
               (3.35, .16), (.24, .10)]
    def point(p, y):
        x, z = p
        return (x*cos(angle) + z*sin(angle), y,
                -x*sin(angle) + z*cos(angle))
    low = [point(p, -.035) for p in outline]
    high = [point(p, .035) for p in outline]
    for j in range(1, len(outline)-1):
        mesh.triangle(high[0], high[j+1], high[j], color)
        mesh.triangle(low[0], low[j], low[j+1], DARK)
    for j in range(len(outline)):
        k = (j+1) % len(outline)
        mesh.quad(low[j], high[j], high[k], low[k], color)
    # A modest cream warning band, built into the blade geometry.
    # Raised by 0.001 to avoid coplanar z-fighting.
    band = [(3.08, -.145), (3.26, -.155), (3.26, .155), (3.08, .145)]
    mesh.quad(point(band[3], .036), point(band[2], .036),
              point(band[1], .036), point(band[0], .036), CREAM)


def _window(mesh, points, color=GLASS):
    mesh.quad(*points, color)
    for i in range(4):
        mesh.cylinder(points[i], points[(i+1) % 4], .023, FRAME, sides=4)


def build():
    model = Model('helicopter', body_color=OLIVE)
    body = Mesh()
    # The widest cross-section is at the body origin; aft -Z tapers into a boom.
    body.loft([
        (-1.10, .22, .24, -.02),
        (-.75, .56, .47, -.01),
        (0.00, .69, .57, 0.00),
        (.75, .65, .53, -.025),
        (1.40, .49, .40, -.11),
        (1.92, .25, .23, -.19),
        (2.20, .00, .00, -.19),
    ], 12, OLIVE)
    # Engine fairing is visible behind the canopy and supports the rotor mast.
    body.loft([
        (-.90, .19, .14, .43),
        (-.58, .34, .24, .55),
        (.02, .35, .25, .58),
        (.43, .22, .16, .56),
    ], 10, LIGHT)
    # Dark short exhaust and olive lip, pointing aft.
    body.cylinder((-.25, .65, -.70), (-.25, .66, -.98), .095, FRAME, sides=8)
    body.cylinder((.25, .65, -.70), (.25, .66, -.98), .095, FRAME, sides=8)
    body.cylinder((0, .76, -.11), (0, 1.14, -.11), .09, DARK, sides=10)
    model.add('body', body)

    glazing = Mesh()
    # Broad paired forward panes on the faceted nose. Winding faces out +Z.
    # Keep the entire pane above the convex hull, including the quad diagonal.
    _window(glazing, [(-.03, .50, 1.07), (-.45, .41, 1.06),
                     (-.27, .005, 1.87), (-.03, .07, 1.97)], GLASS_LIGHT)
    _window(glazing, [(.45, .41, 1.06), (.03, .50, 1.07),
                     (.03, .07, 1.97), (.27, .005, 1.87)], GLASS)
    # Port/starboard side glazing and a small rear cabin window.
    for side in (-1, 1):
        x = side
        points = [(x*.65, .29, .18), (x*.59, .29, .79),
                  (x*.58, -.04, 1.26), (x*.72, -.10, .18)]
        if side == -1:
            points.reverse()
        _window(glazing, points)
        points = [(x*.585, .23, -.49), (x*.66, .26, -.05),
                  (x*.69, -.11, -.05), (x*.60, -.13, -.49)]
        if side == -1:
            points.reverse()
        _window(glazing, points, GLASS_LIGHT)
        # Recessed olive door handle below rear side pane.
        glazing.box((x*.683, -.23, .05), (.035, .045, .18), CREAM)
    model.add('cockpit', glazing)

    tail = Mesh()
    tail.loft([
        (-2.20, .065, .11, .18),
        (-1.90, .105, .14, .13),
        (-1.42, .15, .17, .04),
        (-.83, .25, .26, -.015),
    ], 8, SHADE)
    # Upright tail fin and a small horizontal stabilizer.
    tail.prism_x([(.10, -2.20), (.71, -2.15), (.67, -1.91),
                  (.20, -1.69), (-.03, -1.78)], -.045, .045, LIGHT)
    tail.box((0, .15, -1.77), (1.06, .07, .30), OLIVE)
    tail.box((-.48, .193, -1.77), (.12, .012, .30), CREAM)
    tail.box((.48, .193, -1.77), (.12, .012, .30), CREAM)
    model.add('tail', tail)

    skids = Mesh()
    for x in (-.69, .69):
        # A single bent runner with a lifted rounded nose and four struts.
        runner = [(x, -.79, -1.01), (x, -.87, -.82),
                  (x, -.87, 1.23), (x, -.82, 1.43), (x, -.68, 1.57)]
        for a, b in zip(runner, runner[1:]):
            skids.cylinder(a, b, .055, FRAME, sides=6)
        for z in (-.44, .74):
            skids.cylinder((x*.65, -.37, z), (x, -.84, z), .043, LIGHT, sides=6)
    skids.cylinder((-.69, -.81, -.44), (.69, -.81, -.44), .045, SHADE, sides=6)
    skids.cylinder((-.69, -.81, .74), (.69, -.81, .74), .045, SHADE, sides=6)
    model.add('skids', skids)

    main_rotor = Mesh()
    for i in range(4):
        _rotor_blade(main_rotor, i*pi/2, DARK)
    main_rotor.cylinder((0, -.09, 0), (0, .10, 0), .205, LIGHT, sides=12)
    main_rotor.ellipsoid((0, .12, 0), (.15, .08, .15), CREAM, segments=8, rings=3)
    model.add('rotor', main_rotor, translation=(0, 1.19, -.11))

    # Tail rotor's local +X is the spin axis. Tips stay inside the 4.4 airframe.
    tail_rotor = Mesh()
    for sign in (-1, 1):
        tail_rotor.box((0, sign*.16, 0), (.055, .32, .072), DARK)
        tail_rotor.box((0, 0, sign*.16), (.055, .072, .32), DARK)
        tail_rotor.box((.030, sign*.275, 0), (.007, .09, .075), CREAM)
        tail_rotor.box((.030, 0, sign*.275), (.007, .075, .09), CREAM)
    tail_rotor.cylinder((-.07, 0, 0), (.09, 0, 0), .085, CREAM, sides=8)
    model.add('tailRotor', tail_rotor, translation=(.15, .38, -1.83))
    return model
