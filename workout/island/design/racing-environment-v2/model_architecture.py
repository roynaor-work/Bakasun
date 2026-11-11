#!/usr/bin/env python3
"""Original metre-scale racing architecture recipes, dedicated under CC0-1.0.

The builder supplies outward-facing box/beam primitives with disjoint UV charts.
Both facades face +Z. No external models, fonts, logos, or real people are used.
"""


def _digit(part, digit, x, y, z, height=0.48):
    """Our own seven-segment numerals: no font file or font-derived outlines."""
    segments = {
        '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd',
        '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd', '0': 'abcdef',
    }
    w = height * 0.52
    thick = height * 0.095
    positions = {
        'a': ((x, y+height/2, z), (w, thick, 0.025)),
        'g': ((x, y, z), (w, thick, 0.025)),
        'd': ((x, y-height/2, z), (w, thick, 0.025)),
        'f': ((x-w/2, y+height/4, z), (thick, height/2, 0.025)),
        'b': ((x+w/2, y+height/4, z), (thick, height/2, 0.025)),
        'e': ((x-w/2, y-height/4, z), (thick, height/2, 0.025)),
        'c': ((x+w/2, y-height/4, z), (thick, height/2, 0.025)),
    }
    for s in segments[str(digit)]:
        center, size = positions[s]
        part.box(center, size)


def pit_building(m):
    """Five garage bays, observation floor, balcony and cantilevered roof."""
    concrete = m.part('PitConcrete', 'Concrete')
    walls = m.part('PitCreamWalls', 'Cream')
    steel = m.part('PitRailings', 'Steel')
    dark = m.part('GarageInteriors', 'DarkSteel')
    glass = m.part('ObservationGlazing', 'Glass')
    orange = m.part('PitOrangeTrim', 'Orange')
    white = m.part('PitBayNumerals', 'White')
    roof = m.part('PitRoof', 'Roof')
    black = m.part('WindowFrames', 'Black')

    # Broad pad gives an unambiguous centred base and a clean module join.
    concrete.box((0, 0.10, 0), (20.6, 0.20, 7.6))
    concrete.box((0, 3.10, 0), (20.1, 0.28, 6.5))
    concrete.box((0, 3.19, 3.13), (20.1, 0.18, 1.25))
    walls.box((0, 3.18, -2.95), (20, 6.00, 0.30))
    walls.box((-9.85, 3.18, 0), (0.30, 6.00, 6.2))
    walls.box((9.85, 3.18, 0), (0.30, 6.00, 6.2))
    # Heavy outer front beam and piers frame five actual recessed bays.
    walls.box((0, 2.85, 2.85), (20.0, 0.42, 0.42))
    for x in (-9.5, -5.7, -1.9, 1.9, 5.7, 9.5):
        walls.box((x, 1.52, 2.82), (0.36, 2.63, 0.50))
    for i, x in enumerate((-7.6, -3.8, 0, 3.8, 7.6), 1):
        dark.box((x, 1.43, 1.90), (3.40, 2.47, 0.12))
        concrete.box((x, 0.215, 2.42), (3.38, 0.03, 0.94))
        # Raised roller shutter: ribbed upper portion and open shadow below.
        roof.box((x, 2.19, 2.64), (3.32, 0.83, 0.09))
        for j in range(5):
            steel.box((x, 1.83+j*0.16, 2.705), (3.32, 0.025, 0.026))
        orange.box((x, 2.84, 3.095), (0.84, 0.62, 0.09))
        _digit(white, i, x, 2.84, 3.16, 0.40)
        # Individual upper suites retain a dark mullion rhythm.
        glass.box((x, 4.58, 2.595), (3.44, 1.85, 0.08))
        black.box((x, 4.58, 2.66), (0.055, 1.92, 0.05))
        for edge in (-1.76, 1.76):
            black.box((x+edge, 4.58, 2.66), (0.08, 1.98, 0.06))
    walls.box((0, 3.62, 2.57), (19.8, 0.39, 0.22))
    walls.box((0, 5.70, 2.57), (19.8, 0.40, 0.22))
    # Glass wraps the end walls, with clearly defined cream corner posts.
    for x in (-10.015, 10.015):
        glass.box((x, 4.61, -0.1), (0.045, 1.7, 4.5))
        for z in (-2.35, -0.85, 0.65, 2.15):
            black.box((x, 4.61, z), (0.085, 1.76, 0.055))
    orange.box((0, 3.05, 3.13), (20.05, 0.12, 0.09))
    roof.box((0, 6.08, 0), (20.6, 0.23, 7.6))
    roof.box((0, 6.24, -0.9), (18.8, 0.09, 3.4))
    orange.box((0, 6.07, 3.77), (20.6, 0.19, 0.06))
    # Continuous upper balcony, thin horizontal bars, and regular uprights.
    for y in (3.48, 4.15, 4.35):
        steel.box((0, y, 3.66), (20.0, 0.045, 0.045))
    for x in range(-10, 11, 2):
        steel.box((x, 3.77, 3.66), (0.045, 1.15, 0.045))
    for x in (-10.0, 10.0):
        steel.box((x, 4.35, 3.11), (0.045, 0.045, 1.1))
    # Rear service doors and rooftop vent bank add detail from every orbit.
    dark.box((0, 1.22, -3.115), (1.08, 2.04, 0.045))
    steel.box((0.37, 1.24, -3.15), (0.04, 0.25, 0.04))
    for x in (-5.2, 0, 5.2):
        roof.box((x, 6.39, -0.75), (2.1, 0.30, 1.0))
        for j in range(4):
            dark.box((x-0.69+j*0.46, 6.55, -0.75), (0.19, 0.025, 0.76))


def control_tower(m):
    """Glazed steward booth, steel legs, two flights and railed landings."""
    concrete = m.part('TowerFoundation', 'Concrete')
    cream = m.part('TowerBoothShell', 'Cream')
    steel = m.part('TowerStructure', 'Steel')
    dark = m.part('TowerStairs', 'DarkSteel')
    glass = m.part('TowerGlazing', 'Glass')
    roof = m.part('TowerRoof', 'Roof')
    orange = m.part('TowerTrim', 'Orange')
    black = m.part('TowerWindowFrames', 'Black')
    white = m.part('TowerDetails', 'White')

    # Symmetric footprint includes external stairway; geometric base is centred.
    concrete.box((0, 0.11, 0), (6.4, 0.22, 6.4))
    for x in (-1.55, 1.55):
        for z in (-1.55, 1.55):
            concrete.box((x, 0.30, z), (0.68, 0.38, 0.68))
            steel.box((x, 2.90, z), (0.20, 5.30, 0.20))
    # X bracing visible through the open lower structure.
    for z in (-1.55, 1.55):
        for a, b in [((-1.55,0.55,z),(1.55,4.95,z)),
                     ((1.55,0.55,z),(-1.55,4.95,z))]:
            steel.beam(a, b, 0.09)
    for x in (-1.55, 1.55):
        steel.beam((x,0.55,-1.55),(x,4.95,1.55),0.09)
    dark.box((0, 5.18, 0), (4.55, 0.24, 4.55))
    cream.box((0, 5.59, 0), (4.05, 0.65, 4.05))
    # Windows form four separate facades; opaque PBR glazing avoids sorting.
    for z in (-2.065, 2.065):
        glass.box((0, 6.72, z), (3.82, 1.57, 0.07))
        for x in (-1.94, -0.65, 0.65, 1.94):
            black.box((x, 6.72, z+(0.045 if z>0 else -0.045)), (0.07, 1.68, 0.06))
    for x in (-2.065, 2.065):
        glass.box((x, 6.72, 0), (0.07, 1.57, 3.82))
        for z in (-1.94, -0.65, 0.65, 1.94):
            black.box((x+(0.045 if x>0 else -0.045), 6.72, z), (0.06, 1.68, 0.07))
    cream.box((0, 7.62, 0), (4.10, 0.25, 4.10))
    roof.box((0, 7.88, 0), (4.70, 0.27, 4.70))
    orange.box((0, 7.77, 2.365), (4.70, 0.12, 0.04))
    orange.box((0, 5.93, 2.085), (4.08, 0.13, 0.06))
    # Front-facing access door below the glazing band.
    dark.box((1.36, 5.83, 2.115), (0.62, 0.91, 0.035))
    white.box((1.56, 5.84, 2.15), (0.035, 0.20, 0.035))

    # Two flights along the east side: open grating treads with square handrails.
    # First flight goes toward the rear, then the second returns to the booth.
    x = 2.64
    n = 12
    rise = 0.205
    run = 0.245
    for i in range(n):
        y = 0.30+(i+1)*rise
        z = 1.60-i*run
        dark.box((x, y-0.045, z), (0.95, 0.09, 0.245))
    dark.box((x, 2.76, -1.54), (1.02, 0.13, 1.00))
    for i in range(n):
        y = 2.76+(i+1)*rise
        z = -1.60+i*run
        dark.box((x, y-0.045, z), (0.95, 0.09, 0.245))
    dark.box((2.42, 5.22, 1.82), (1.40, 0.13, 0.83))
    # Inclined stringers frame each flight rather than a solid filled ramp.
    for xx in (2.20, 3.08):
        steel.beam((xx,0.30,1.73),(xx,2.71,-1.23),0.10)
        steel.beam((xx,2.76,-1.73),(xx,5.17,1.23),0.10)
        steel.beam((xx,1.25,1.73),(xx,3.66,-1.23),0.045)
        steel.beam((xx,3.71,-1.73),(xx,6.12,1.23),0.045)
        for i in (0, 4, 8, 11):
            y1 = 0.30+(i+1)*rise
            z1 = 1.60-i*run
            steel.box((xx, y1+0.48, z1), (0.042,0.96,0.042))
            y2 = 2.76+(i+1)*rise
            z2 = -1.60+i*run
            steel.box((xx,y2+0.48,z2),(0.042,0.96,0.042))
    # Rear turn landing guardrail and front booth landing guardrail.
    steel.box((2.65,3.72,-2.00),(0.99,0.045,0.045))
    for xx in (2.19,3.12):
        steel.box((xx,3.24,-2.00),(0.042,0.96,0.042))
    steel.box((3.10,5.77,1.84),(0.042,1.04,0.042))
    steel.box((2.58,6.28,2.23),(1.06,0.042,0.042))
    # Simple rooftop aerial and small indicator beacon, both original shapes.
    steel.cylinder((0,8.47,-0.75),0.035,0.92,segments=8,axis='y')
    steel.box((0,8.63,-0.75),(0.76,0.035,0.035))
    white.cylinder((0,8.96,-0.75),0.075,0.12,segments=8,axis='y')
