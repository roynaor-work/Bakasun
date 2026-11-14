"""Original, fictional low-poly light aircraft; dimensions include the propeller.

Authoring coordinates: +Z nose, +Y up. No external assets or textures.
All colors are supplied to the one shared material as vertex colors.
"""

import math

from meshlib import Mesh, Model


BODY = '#71889c'
LIGHT = '#92a9ba'
DARK = '#415b70'
CREAM = '#e4e4d4'
GLASS = '#87d9ee'
GLASS_LIGHT = '#b9eff7'


def _blade(mesh, angle):
    """A rounded paddle silhouette, extruded in Z about the propeller shaft."""
    outline = [(-.07, .13), (-.12, .45), (-.12, .92),
               (-.04, 1.05), (.08, 1.02), (.12, .84), (.06, .13)]
    cs, sn = math.cos(angle), math.sin(angle)

    def point(xy, z):
        x, y = xy
        return (x * cs - y * sn, x * sn + y * cs, z)

    # Outline is clockwise in the XY plane. Outward-facing caps and side walls.
    for i in range(1, len(outline) - 1):
        mesh.triangle(point(outline[0], -.035),
                      point(outline[i], -.035),
                      point(outline[i + 1], -.035), DARK)
        mesh.triangle(point(outline[0], .035),
                      point(outline[i + 1], .035),
                      point(outline[i], .035), DARK)
    for i, p in enumerate(outline):
        q = outline[(i + 1) % len(outline)]
        color = CREAM if min(p[1], q[1]) > .8 else DARK
        mesh.quad(point(p, -.035), point(p, .035),
                  point(q, .035), point(q, -.035), color)


def build():
    model = Model('light-attack-plane', body_color=BODY)
    body = Mesh()

    # Broad central body with a tapered tail cone and short, rounded engine cowling.
    body.loft([
        (-2.8, .035, .035, .04),
        (-2.45, .16, .16, .04),
        (-1.65, .28, .29, .015),
        (-.65, .49, .45, 0),
        (.3, .58, .54, 0),
        (1.25, .53, .49, -.015),
        (2.05, .43, .39, -.025),
        (2.4, .37, .34, -.025),
        (2.57, .25, .25, -.025),
    ], 12, BODY)
    # A dark engine collar makes the propeller's attachment visible at game scale.
    body.loft([(2.34, .375, .345, -.025),
               (2.43, .36, .33, -.025)], 12, DARK)

    # Straight wings: constant chord and unswept leading/trailing edges.
    wing_profile = [(-.17, -.82), (-.17, .60), (-.08, .88),
                    (.04, .68), (.07, .20), (.04, -.82)]
    for sign in (-1, 1):
        for lo, hi, color in [(.44, 3.35, BODY),
                              (3.35, 3.52, DARK),
                              (3.52, 4.3, LIGHT)]:
            x0, x1 = sorted((sign * lo, sign * hi))
            body.prism_x(wing_profile, x0, x1, color)
        # Thin raised control surfaces are geometric rather than textured.
        x0, x1 = sorted((sign * 1.7, sign * 3.30))
        body.prism_x([(.044, -.79), (.044, -.48),
                      (.062, -.48), (.062, -.79)], x0, x1, DARK)
        # Subtle ivory wingtip inlay on the upper surface; no real insignia.
        x0, x1 = sorted((sign * 3.73, sign * 4.12))
        body.prism_x([(.068, -.27), (.068, .17),
                      (.081, .17), (.081, -.27)], x0, x1, CREAM)

    # Tail stabilizers and a high, softened trapezoidal vertical fin.
    tail_profile = [(.08, -2.66), (.08, -1.94),
                    (.16, -1.86), (.22, -2.02), (.18, -2.66)]
    body.prism_x(tail_profile, -1.62, 1.62, LIGHT)
    body.prism_x([(.12, -2.72), (.13, -1.74),
                  (.91, -2.02), (1.18, -2.31), (1.18, -2.58)],
                 -.09, .09, BODY)
    body.prism_x([(.69, -2.60), (.70, -2.12),
                  (.95, -2.21), (.99, -2.60)], -.094, .094, DARK)

    # Bubble cockpit. Its lower half sits inside the fuselage; the visible cyan
    # panels and pale roof give a glass impression with one opaque material.
    body.loft([
        (-.67, .10, .12, .40),
        (-.31, .37, .36, .51),
        (.39, .44, .46, .55),
        (1.03, .35, .37, .53),
        (1.42, .10, .12, .45),
    ], 10, GLASS)
    # Framing follows the canopy top and sides, keeping the toy silhouette legible.
    body.cylinder((0, .52, 1.42), (0, .91, 1.03), .032, LIGHT, sides=6)
    body.cylinder((0, .91, 1.03), (0, 1.01, .39), .032, LIGHT, sides=6)
    body.cylinder((0, 1.01, .39), (0, .87, -.31), .032, LIGHT, sides=6)
    for side in (-1, 1):
        body.cylinder((side * .41, .60, .39),
                      (side * .31, .90, .39), .033, LIGHT, sides=6)
        body.cylinder((side * .31, .90, .39),
                      (0, 1.01, .39), .033, LIGHT, sides=6)

    # Small blue-gray underwing fairings suggest a lightweight naval attack role.
    for side in (-1, 1):
        body.box((side * 1.36, -.26, .08), (.13, .25, .38), DARK)
        body.ellipsoid((side * 1.36, -.48, .12),
                       (.19, .18, .67), DARK, segments=10, rings=5)
        body.box((side * .552, .08, .69), (.035, .105, .35), LIGHT)

    model.add('airframe', body)

    # Local Z is the propeller rotation axis. All three paddles and the spinner
    # belong to this single node so integrations can animate it directly.
    propeller = Mesh()
    for i in range(3):
        _blade(propeller, i * 2 * math.pi / 3)
    propeller.loft([(-.10, .18, .18, 0),
                    (.055, .19, .19, 0),
                    (.16, .12, .12, 0),
                    (.20, 0, 0, 0)], 12, CREAM)
    model.add('propeller', propeller, translation=(0, -.025, 2.6))
    return model
