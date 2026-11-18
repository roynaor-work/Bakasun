"""CC0-1.0. Furnishings and finishes for the five rooms off the corridor."""
from itertools import product
import math

from geometry import Geometry, Model, cabinet, door_leaf, span, table, translated

WIDTH, DEPTH, WALL_HEIGHT = 6.64, 4.84, 3.04
DOOR_X, DOOR_HINGE_X, DOOR_ANGLE = 2.31, 2.86, math.radians(-67)
DOOR_Z = 2.35


def architecture(model, wall, feature, floor, window=True):
    g = Geometry()
    g.box((0, -.095, 0), (WIDTH, .146, DEPTH), "graphite", .035)
    span(g, -3.30, 3.30, -.097, -.046, 2.407, 2.427, feature)
    def tile(x, z, w, d, color):
        g.face([(x - w / 2, 0, z - d / 2), (x - w / 2, 0, z + d / 2),
                (x + w / 2, 0, z + d / 2), (x + w / 2, 0, z - d / 2)], color, (0, 1, 0))

    if floor == "wood":
        for row, column in product(range(7), range(10)):
            color = ("oak_light", "wheat", "oak_light", "oak")[(row * 5 + column * 3) % 4]
            tile(-2.97 + column * .66, -2.06 + row * .685, .653, .677, color)
    else:
        colors = {
            "commercial": ("road", "linen", "road"),
            "tile": ("chalk", "ice", "chalk", "silver"),
            "concrete": ("concrete", "concrete", "silver"),
        }[floor]
        for row, column in product(range(6), range(10)):
            color = colors[(row * 7 + column * 3) % len(colors)]
            tile(-2.97 + column * .66, -2 + row * .8, .651, .790, color)
    if window:
        center, width = -1.16, 2.65
        left, right = center - width / 2, center + width / 2
        span(g, -3.31, 3.31, 0, 1.15, -2.42, -2.265, wall)
        span(g, -3.31, 3.31, 2.69, WALL_HEIGHT, -2.42, -2.265, wall)
        span(g, -3.31, left, 1.15, 2.69, -2.42, -2.265, wall)
        span(g, right, 3.31, 1.15, 2.69, -2.42, -2.265, wall)
        g.box((center, 1.92, -2.396), (width, 1.54, .019), "sky")
        for i, (offset, height) in enumerate(((-.97, .32), (-.65, .47), (-.31, .21), (.22, .38), (.71, .24), (1.03, .43))):
            g.box((center + offset, 1.15 + height / 2, -2.371),
                  (.32, height, .028), "glass" if i % 2 else "sage")
        for x in (left, center, right):
            g.box((x, 1.92, -2.27), (.080, 1.64, .17), "ivory", .013)
        for y in (1.15, 2.04, 2.69):
            g.box((center, y, -2.27), (width + .05, .067, .17), "ivory", .011)
        g.box((center, 1.12, -2.20), (width + .20, .065, .37), "oak_light", .015)
    else:
        span(g, -3.31, 3.31, 0, WALL_HEIGHT, -2.42, -2.265, wall)
    g.box((0, .10, -2.244), (6.42, .20, .043), feature)
    g.box((0, 3.015, -2.27), (6.62, .08, .20), "chalk")
    g.box((0, 2.96, -2.20), (6.40, .035, .11), feature)

    # Cutaway leaves the real opening, frame, sill and swung leaf visible.
    for x in (1.74, 2.90):
        g.box((x, 1.19, DOOR_Z), (.075, 2.38, .18), "chalk")
    g.box((DOOR_X, 2.37, DOOR_Z), (1.26, .11, .18), "chalk", .016)
    g.box((DOOR_X, .012, DOOR_Z), (1.075, .024, .20), "steel")
    g.box((DOOR_X, 2.58, 2.464), (.94, .24, .08), feature, .03)
    g.box((DOOR_X - .13, 2.58, 2.51), (.41, .052, .023), "ivory")
    for x in (DOOR_X + .19, DOOR_X + .28):
        g.box((x, 2.58, 2.51), (.032, .055, .023), "ivory")
    model.part("room_architecture", g)

    for side in (-1, 1):
        side_wall = Geometry()
        side_wall.box((side * 3.263, 1.52, -.006), (.113, WALL_HEIGHT, 4.55), wall)
        side_wall.box((side * 3.195, .096, -.006), (.032, .19, 4.54), feature)
        side_wall.box((side * 3.263, 3.012, -.006), (.124, .07, 4.55), "chalk")
        side_wall.box((side * 3.263, 1.52, 2.31), (.12, WALL_HEIGHT, .13), "oak_light")
        model.part("cutaway_side_left" if side < 0 else "cutaway_side_right", side_wall)
    front = Geometry()
    span(front, -3.32, 1.72, 0, WALL_HEIGHT, 2.30, 2.42, wall)
    span(front, 2.91, 3.32, 0, WALL_HEIGHT, 2.30, 2.42, wall)
    span(front, 1.72, 2.91, 2.36, WALL_HEIGHT, 2.30, 2.42, wall)
    span(front, -3.31, 1.71, 0, .18, 2.423, 2.459, feature)
    model.part("cutaway_front_room", front)
    ceiling = Geometry()
    ceiling.box((0, 3.071, 0), (WIDTH, .09, DEPTH), "chalk")
    for x in (-1.32, 1.32):
        ceiling.box((x, 3.009, 0), (.68, .062, .29), "steel", .017)
        ceiling.box((x, 2.966, 0), (.60, .027, .23), "lamp")
    model.part("cutaway_ceiling_room", ceiling)
    model.burnable("door", "דלת החדר", (DOOR_HINGE_X, 0, DOOR_Z), (-.69, 1.1, .02),
                   door_leaf(color=feature, window=floor != "wood"), "wood", DOOR_ANGLE, door=True)


def room_finish(model, label, rescue, bounds, flood, smoke_xz=(0, 0),
                exit_at=(DOOR_X, 0, 2.42), exit_normal=(0, 0, 1)):
    smoke_nodes = {}
    for level, y, height in (("ceiling", 2.62, .76), ("mid", 1.46, 1.16), ("low", .43, .82)):
        smoke_nodes[level] = model.anchor(f"smoke_{level}", (smoke_xz[0], y, smoke_xz[1]),
                                          role="smoke_volume", stratum=level,
                                          extent=[min(6.24, bounds[1][0] - bounds[0][0]), height, 4.38])
    model.anchor("door_exit", exit_at, role="navigation_threshold", width=1.10, normal=exit_normal)
    model.anchor("rescue_spot", rescue, role="rescue_placement", clearRadius=.36)
    model.anchor("flood_surface", flood["origin"], role="water_surface", size=flood["size"])
    asset = model.save()
    return asset, {"id": model.name, "label": label, "model": asset["id"], "size": [WIDTH, WALL_HEIGHT, DEPTH],
                   "origin": [0, 0, 0], "bounds": bounds, "doorExit": "door_exit", "doorLocal": exit_at,
                   "rescue": "rescue_spot", "rescueLocal": rescue, "smokeNodes": smoke_nodes,
                   "flood": flood, "items": model.items}


def wood_books(g, x, y, z, count=5):
    for i in range(count):
        g.box((x + i * .082, y + (.075 + i % 3 * .026), z),
              (.065, .150 + i % 3 * .052, .21),
              ("berry", "sage", "ivory", "denim", "mustard_light")[i % 5], .006)


def planter():
    g = Geometry()
    g.cylinder((0, .17, 0), .227, .34, "clay", 10, .285)
    g.cylinder((0, .325, 0), .265, .018, "wood_dark", 10)
    for i, (x, y, z) in enumerate(((-.21, .77, .08), (.18, .95, -.12), (.26, .68, .15), (-.07, 1.15, -.16), (-.15, .89, .20))):
        g.rod((0, .32, 0), (x, y, z), .018, "olive", 5)
        leaf = Geometry()
        leaf.face([(0, 0, 0), (-.075, .105, .047), (0, .25, .012), (.095, .108, -.03)], "moss", (0, 0, 1))
        leaf.face([(0, .012, -.01), (.095, .104, -.03), (0, .25, .007), (-.075, .105, .037)], "leaf_light")
        g.faces.extend(translated(leaf, (x, y - .10, z), i * 1.22).faces)
    return g


def kids_room(m):
    architecture(m, "cream_pink", "teal", "wood")
    bed = Geometry()
    bed.box((0, .24, 0), (1.48, .28, 2.30), "teal", .043)
    for x, z in product((-.59, .59), (-.92, .92)):
        bed.box((x, .13, z), (.11, .26, .12), "moss")
    bed.box((0, .49, 0), (1.38, .27, 2.14), "ivory", .07)
    bed.box((0, .59, .35), (1.42, .15, 1.43), "salmon", .06)
    bed.box((0, .612, .85), (1.43, .114, .26), "faded_red", .045)
    for x in (-.44, .44):
        bed.box((x, .665, .35), (.13, .018, 1.28), "mustard_light")
    bed.box((0, .68, -.68), (.87, .20, .49), "ivory", .06)
    for x in (-.70, .70):
        bed.rod((x, .35, -1.08), (x, 1.22, -1.08), .043, "teal", 6)
        bed.rod((x, 1.20, -1.08), (0, 1.70, -1.08), .042, "teal", 6)
    m.burnable("bed", "מיטה ושמיכה", (-1.87, 0, -.97), (.21, .64, .42), bed, "fabric")
    cubby = cabinet(1.49, .54, .98, "mint", 3)
    for i, color in enumerate(("salmon", "mustard_light", "aqua")):
        cubby.box((-.48 + .48 * i, 1.12, .01), (.31, .27, .36), color, .024)
    wood_books(cubby, -.60, .98, .20, 4)
    m.burnable("toy_cubby", "שידת משחקים", (.58, 0, -1.87), (.46, .95, .3), cubby, "wood")

    rug = Geometry()
    rug.cylinder((0, .021, 0), 1.07, .042, "denim", 32)
    rug.cylinder((0, .045, 0), 1.00, .012, "aqua", 32)
    rug.cylinder((0, .053, 0), .79, .007, "mint", 32)
    for i in range(10):
        a = i * math.tau / 10
        rug.box((math.cos(a) * .88, .058, math.sin(a) * .88),
                (.11, .013, .29), "ivory", rotation=-a)
    m.burnable("play_rug", "שטיח משחק", (0, 0, .54), (.1, .05, .46), rug, "fabric")

    toys = Geometry()
    for x, y, z, color in ((-.29, .12, .18, "mustard_light"), (-.29, .35, .18, "salmon"),
                           (.03, .12, .30, "denim"), (.29, .115, .16, "teal")):
        toys.box((x, y, z), (.22, .22, .22), color, .018, rotation=x)
    toys.cylinder((.17, .20, -.15), .13, .40, "ivory", 10)
    toys.cylinder((.17, .48, -.15), .13, .18, "poppy", 10, .005)
    for x in (.04, .30):
        toys.box((x, .115, -.15), (.13, .23, .15), "poppy", .017)
    toys.box((.17, .24, -.014), (.12, .095, .016), "denim", .01)
    m.burnable("toy_rocket", "טיל צעצוע וקוביות", (.22, .06, .48), (.12, .16, .03), toys, "wood")

    desk = table(1.41, .70, .62)
    for x, z, color in ((-.30, -.07, "cream_pink"), (.14, .08, "mint"), (.41, -.14, "lavender")):
        desk.box((x, .633, z), (.24, .026, .19), color, rotation=x)
    desk.cylinder((.51, .725, -.20), .069, .21, "teal", 8)
    for x, color in ((.48, "poppy"), (.53, "mustard_light"), (.56, "denim")):
        desk.rod((x, .72, -.21), (x + .01, .91, -.2), .011, color, 4)
    m.burnable("craft_table", "שולחן יצירה", (-1.98, 0, 1.28), (-.25, .65, .09), desk, "paper")

    stool = Geometry()
    stool.cylinder((0, .37, 0), .29, .096, "mustard_light", 12)
    for x, z in ((-.16, -.11), (.16, -.11), (0, .18)):
        stool.rod((x * 1.3, .015, z * 1.3), (x, .35, z), .040, "wood", 6)
    m.burnable("stool", "שרפרף", (-1.18, 0, 1.36), (0, .40, .1), stool, "wood")

    posters = Geometry()
    for i, color in enumerate(("mustard_light", "denim", "berry")):
        x = (i - 1) * .5
        posters.box((x, 0, 0), (.39, .53, .05), "oak", .01)
        posters.box((x, 0, .028), (.32, .46, .014), "ivory")
        posters.box((x, .035, .039), (.18, .23, .014), color, .015)
        posters.box((x, -.138, .04), (.19, .034, .012), "mint")
    m.burnable("art_prints", "ציורים ממוסגרים", (1.44, 2.05, -2.22), (0, 0, .08), posters, "paper")


def office(m):
    architecture(m, "linen", "denim", "wood")
    desk = cabinet(2.03, .80, .78, "oak", 3)
    desk.box((0, .786, .058), (2.23, .058, .98), "oak_light", .014)
    desk.box((0, .825, .30), (.75, .021, .36), "moss", .008)
    m.burnable("desk", "שולחן עבודה", (.27, 0, -.36), (.46, .78, .30), desk, "wood")

    terminals = Geometry()
    for x, angle in ((-.39, .13), (.38, -.19)):
        display = Geometry()
        display.box((0, .13, 0), (.056, .24, .064), "graphite")
        display.box((0, .028, 0), (.31, .045, .21), "graphite", .01)
        display.box((0, .39, 0), (.70, .47, .085), "ink", .022)
        display.box((0, .39, .048), (.62, .38, .014), "denim", .01)
        for i, width in enumerate((.41, .28, .35, .18)):
            display.box((-.22 + width / 2, .51 - i * .06, .058),
                        (width, .025, .009), "aqua" if i % 2 else "sky")
        terminals.faces.extend(translated(display, (x, 0, -.18), angle).faces)
    terminals.box((0, .037, .23), (.63, .072, .23), "graphite", .021)
    for line in range(3):
        terminals.box((0, .076, .17 + line * .052), (.54, .014, .025), "steel")
    m.burnable("workstation", "מסכים ומקלדת", (.27, .82, -.36), (0, .38, .05), terminals, "electrical")

    seat = Geometry()
    seat.cylinder((0, .25, 0), .057, .42, "steel", 8)
    for i in range(5):
        a = i * math.tau / 5
        x, z = math.cos(a) * .35, math.sin(a) * .35
        seat.rod((0, .09, 0), (x, .075, z), .038, "graphite", 6)
        seat.cylinder((x, .052, z), .056, .092, "rubber", 8)
    seat.box((0, .515, 0), (.65, .16, .62), "denim", .055)
    seat.box((0, .90, .26), (.63, .64, .17), "denim", .054)
    for x in (-.33, .33):
        seat.rod((x, .48, .10), (x, .73, .10), .032, "steel", 6)
        seat.box((x, .75, .008), (.099, .057, .38), "ink")
    m.burnable("chair", "כיסא עבודה", (.33, 0, .80), (0, .70, -.21), seat, "fabric", -.16)
    sideboard = cabinet(1.72, .53, .82, "teal", 3)
    wood_books(sideboard, -.68, .83, .11)
    sideboard.box((.55, .89, .04), (.47, .12, .40), "ivory", .018)
    sideboard.box((.55, .92, .251), (.23, .025, .014), "ink")
    m.burnable("file_cabinet", "ארון תיוק ומדפסת", (-1.74, 0, -1.89), (-.25, .83, .2), sideboard, "paper")

    board = Geometry()
    board.box((0, 0, 0), (1.65, .86, .06), "wood_dark", .023)
    board.box((0, 0, .037), (1.54, .76, .022), "chalk", .012)
    for x, y, color in ((-.53, .16, "sage"), (-.23, -.02, "salmon"), (.08, .15, "mustard_light"),
                        (.36, -.05, "mint"), (.57, .13, "lavender")):
        board.box((x, y, .056), (.19, .23, .015), color)
        board.box((x, y + .14, .06), (.10, .026, .017), "graphite")
    m.burnable("planning_board", "לוח תכנון", (1.57, 2.05, -2.23), (-.3, -.07, .1), board, "paper")

    settee = Geometry()
    settee.box((0, .28, 0), (1.80, .28, .68), "denim", .055)
    settee.box((0, .62, -.27), (1.82, .58, .20), "denim", .055)
    for x in (-.86, .86):
        settee.box((x, .49, 0), (.21, .50, .72), "denim", .042)
    for x in (-.39, .39):
        settee.box((x, .43, .02), (.73, .13, .55), "aqua", .049)
    for x, z in product((-.72, .72), (-.23, .25)):
        settee.box((x, .095, z), (.12, .19, .10), "oak")
    m.burnable("waiting_bench", "ספת המתנה", (-2.73, 0, .72), (.34, .45, .22), settee, "fabric", math.pi / 2)
    m.burnable("plant", "עציץ", (2.63, 0, -1.74), (.06, .44, 0), planter(), "fabric")


def rectangle(g, x, y, z, width, height, color):
    w, h = width * .5, height * .5
    g.face([(x - w, y - h, z), (x + w, y - h, z),
            (x + w, y + h, z), (x - w, y + h, z)], color, (0, 0, 1))


def carton(width, height, depth, color="card"):
    g = Geometry()
    g.box((0, height / 2, 0), (width, height, depth), color)
    g.face([(-width * .105, height + .003, -depth / 2), (-width * .105, height + .003, depth / 2),
            (width * .105, height + .003, depth / 2), (width * .105, height + .003, -depth / 2)], "tape", (0, 1, 0))
    rectangle(g, 0, height - .096, depth / 2 + .003, width * .21, .19, "tape")
    rectangle(g, width * .26, height * .54, depth / 2 + .002, width * .23, height * .25, "ivory")
    return g


def shop_shelf(width=1.68):
    g = Geometry()
    for x, z in product((-width / 2 + .06, width / 2 - .06), (-.25, .22)):
        g.box((x, .98, z), (.075, 1.96, .08), "brick", .009)
    for level in (.23, .74, 1.25, 1.79):
        g.box((0, level, 0), (width, .073, .58), "oak_light")
        g.box((0, level - .006, .295), (width, .046, .027), "mustard_light")
    return g


def merchandise(width=1.62):
    g = Geometry()
    palette = ("denim", "salmon", "mustard_light", "mint", "cream_pink")
    for row in range(3):
        for i in range(7):
            x = (i - 3) * width / 7.5
            y = row * .51 + .272
            z = ((i + row) % 3 - 1) * .056
            color = palette[(i + row * 2) % len(palette)]
            if (i + row) % 3 == 0:
                g.cylinder((x, y + .11, z), .073, .22, color, 6, .062)
                g.cylinder((x, y + .24, z), .038, .052, "ivory", 6)
            else:
                g.box((x, y + .13, z), (.145, .26, .23), color)
                rectangle(g, x, y + .15, z + .118, .10, .053, "chalk")
    return g


def shop(m):
    architecture(m, "cream", "clay", "commercial")
    for ident, x in (("left", -2.08), ("right", -.16)):
        at = (x, 0, -1.83)
        m.burnable(f"display_{ident}", "מדף תצוגה", at, (0, 1.28, .29), shop_shelf(), "wood")
        m.burnable(f"goods_{ident}", "מוצרים ארוזים", at, (.21, .90, .16), merchandise(), "paper")

    counter = cabinet(1.69, .68, 1.00, "teal", 2)
    counter.box((0, .998, .02), (1.83, .076, .81), "oak_light", .024)
    counter.box((0, .33, .36), (1.58, .38, .046), "moss", .015)
    for x in range(10):
        counter.box((-.687 + .153 * x, .33, .388), (.066, .36, .028), "teal")
    m.burnable("checkout", "דלפק קופה", (1.14, 0, -.87), (.23, .8, .25), counter, "wood")
    register = Geometry()
    register.box((0, .079, 0), (.48, .158, .42), "graphite", .028)
    register.box((0, .196, -.07), (.055, .22, .06), "ink")
    register.box((0, .33, -.08), (.37, .24, .061), "ink", .013)
    register.box((0, .33, -.046), (.31, .18, .017), "aqua", .008)
    register.box((.11, .139, .18), (.18, .023, .032), "silver")
    m.burnable("register", "מסוף תשלום", (1.40, 1.033, -.91), (-.05, .13, .1), register, "electrical")

    island = Geometry()
    island.box((0, .28, 0), (1.44, .50, .78), "clay", .042)
    island.box((0, .56, 0), (1.54, .09, .86), "oak_light", .025)
    for i, color in enumerate(("mustard_light", "aqua", "faded_red", "mint")):
        island.box(((i - 1.5) * .32, .698, .12), (.24, .205, .31), color, .017)
        island.box(((i - 1.5) * .32, .803, .12), (.17, .015, .22), "chalk")
    m.burnable("island_display", "תצוגה מרכזית", (-1.12, 0, .72), (0, .72, .18), island, "paper", -.13)

    awning = Geometry()
    for i in range(9):
        x = (i - 4) * .53
        awning.box((x, .00, 0), (.526, .087, .70), "clay" if i % 2 else "ivory")
        awning.box((x, -.10, .35), (.526, .20, .068), "clay" if i % 2 else "ivory", .013)
    m.burnable("awning", "סוכך תצוגה", (-1.34, 2.74, -1.93), (0, -.03, .23), awning, "fabric")


def restaurant_kitchen(m):
    architecture(m, "ice", "denim", "tile", window=False)
    backsplash = Geometry()
    for row, col in product(range(4), range(15)):
        backsplash.box((-2.98 + .426 * col, 1.09 + row * .239, -2.242),
                        (.418, .229, .042), ("chalk", "ivory", "silver")[(row + col * 3) % 3])
    for x in (-.55, 1.35):
        backsplash.rod((x - .25, 1.85, -2.158), (x + .25, 1.85, -2.158), .028, "denim", 6)
    m.part("tile_backsplash", backsplash)

    range_top = cabinet(1.73, .83, .87, "steel", 2, metal=True)
    range_top.box((0, .897, 0), (1.78, .088, .90), "graphite", .014)
    for x, z in product((-.48, .48), (-.21, .20)):
        range_top.cylinder((x, .953, z), .161, .048, "ink", 10)
        for dx, dz in ((.10, 0), (0, .1), (-.10, 0), (0, -.1)):
            range_top.box((x + dx, .987, z + dz), (.07, .029, .07), "steel")
    for i in range(5):
        range_top.box((-.57 + .28 * i, .808, .446), (.108, .072, .072), "rubber", .013)
    m.burnable("range", "כיריים תעשייתיות", (-1.27, 0, -1.77), (.45, .96, .17), range_top, "metal")

    pot = Geometry()
    pot.cylinder((0, .187, 0), .24, .374, "steel", 14, .252)
    pot.cylinder((0, .383, 0), .253, .035, "silver", 14)
    pot.cylinder((0, .409, 0), .049, .059, "ink", 8)
    for x in (-.285, .285):
        pot.box((x, .280, 0), (.12, .06, .18), "ink", .012)
    m.burnable("stockpot", "סיר בישול", (-1.77, 1.00, -1.98), (.07, .36, .04), pot, "cooking_oil")

    hood = Geometry()
    hood.box((0, .13, 0), (2.55, .26, .93), "steel", .061)
    hood.box((0, .026, .27), (2.38, .049, .36), "silver")
    hood.box((0, .53, -.14), (1.18, .56, .52), "metal", .028)
    for i in range(12):
        hood.box((-.995 + .181 * i, .094, .475), (.14, .026, .022), "rubber")
    m.burnable("extractor", "קולט אדים", (-1.27, 2.23, -1.76), (.55, .11, .26), hood, "electrical")

    prep = table(1.91, .83, .91, "silver")
    prep.box((0, .32, 0), (1.68, .067, .70), "steel")
    prep.box((-.46, .93, .05), (.48, .040, .34), "clay", .011)
    for i, color in enumerate(("sage", "salmon", "leaf_light", "mustard_light")):
        prep.box((-.60 + .09 * i, .97, .07), (.066, .074, .094), color, .01)
    for x, z in ((.40, -.07), (.64, .15)):
        prep.cylinder((x, .936, z), .17, .047, "ivory", 12)
    m.burnable("prep_station", "עמדת הכנה", (-.72, 0, .49), (-.45, .99, .1), prep, "wood")

    fridge = cabinet(1.12, .79, 2.26, "steel", 2, metal=True)
    for x in (-.28, .28):
        fridge.rod((x + .13, 1.30, .44), (x + .13, 1.66, .44), .030, "ink", 6)
    fridge.box((0, 2.10, .418), (.52, .14, .044), "graphite", .012)
    for i in range(5):
        fridge.box((-.15 + .075 * i, 2.1, .447), (.041, .035, .011), "aqua")
    m.burnable("cold_storage", "מקרר תעשייתי", (2.51, 0, -1.79), (.31, .62, .44), fridge, "electrical")

    sink = cabinet(1.31, .70, .87, "steel", 2, metal=True)
    sink.box((-.16, .92, 0), (.68, .036, .50), "graphite", .013)
    sink.box((-.16, .943, 0), (.61, .022, .42), "denim", .011)
    sink.rod((.01, .89, -.23), (.01, 1.19, -.23), .029, "silver", 7)
    sink.rod((.01, 1.19, -.23), (.01, 1.19, .01), .030, "silver", 7)
    m.burnable("wash_station", "כיור שטיפה", (.53, 0, -1.84), (.47, .66, .41), sink, "metal")

    side_rack = shop_shelf(1.37)
    for x, y, color in ((-.36, .28, "denim"), (.22, .30, "silver"), (-.23, .81, "chalk"), (.26, 1.36, "steel")):
        side_rack.box((x, y + .11, .05), (.34, .22, .34), color, .019)
    m.burnable("utensil_rack", "מדף כלי מטבח", (-2.86, 0, .63), (.04, 1.29, .17), side_rack, "wood", math.pi / 2)


def warehouse_rack(width=2.03):
    g = Geometry()
    for x, z in product((-width / 2 + .068, width / 2 - .068), (-.365, .365)):
        g.box((x, 1.23, z), (.11, 2.46, .11), "denim", .011)
        for y in (.48, 1.19, 1.86):
            g.box((x, y, z + .061), (.047, .08, .016), "silver")
        g.box((x, .066, z), (.21, .135, .19), "mustard_light")
    for y in (.18, .94, 1.70):
        g.box((0, y, 0), (width, .085, .81), "oak")
        for z in (-.42, .42):
            g.box((0, y - .036, z), (width, .115, .076), "ochre")
    g.rod((-width / 2 + .10, .16, -.396), (width / 2 - .10, 2.32, -.396), .037, "denim", 4)
    return g


def storage(m):
    architecture(m, "silver", "denim", "concrete", window=False)
    markings = Geometry()
    for x in (-1.16, .90):
        for z in (-1.45, -.55, .35, 1.25):
            markings.box((x, .008, z), (.080, .016, .52), "mustard_light")
    for i in range(8):
        markings.box((.25 + i * .20, .007, -2.13), (.112, .014, .19),
                     "ochre" if i % 2 else "graphite", rotation=.43)
    m.part("aisle_marking", markings)
    for index, (x, z, angle) in enumerate(((-1.30, -1.72, 0), (-2.66, .12, math.pi / 2))):
        m.burnable(f"rack_{index + 1}", "מדפי מחסן", (x, 0, z), (.58, .95, .4), warehouse_rack(), "metal", angle)
        cargo = Geometry()
        for row in range(3):
            for i in range(3):
                if row == 2 and i == index:
                    continue
                h = .31 + ((row * 2 + i) % 3) * .09
                cargo.faces.extend(translated(carton(.45 + (i % 2) * .09, h, .58,
                                                     "kraft" if (i + row) % 2 else "card"),
                                               ((i - 1) * .57, .223 + row * .76, .028)).faces)
        m.burnable(f"cartons_{index + 1}", "קרטונים על מדפים", (x, 0, z), (.36, 1.14, .31), cargo, "paper", angle)

    load = Geometry()
    for x in (-.39, 0, .39):
        load.box((x, .053, 0), (.14, .104, .83), "wood_dark")
    for z in (-.36, -.18, 0, .18, .36):
        load.box((0, .128, z), (1.14, .065, .12), "oak")
    for at, dims, color in (((-.29, .162, -.02), (.48, .70, .69), "card"),
                            ((.26, .162, .03), (.49, .48, .65), "kraft"),
                            ((-.20, .864, -.03), (.58, .29, .54), "card")):
        load.faces.extend(translated(carton(*dims, color), at).faces)
    m.burnable("pallet", "משטח ארגזים", (1.45, 0, -1.35), (.3, .47, .30), load, "paper", -.18)

    trolley = Geometry()
    for x in (-.28, .28):
        trolley.rod((x, .13, 0), (x, 1.27, -.20), .046, "ochre", 6)
        trolley.box((x, .15, .03), (.105, .25, .22), "rubber", .026)
    trolley.rod((-.31, 1.27, -.20), (.31, 1.27, -.20), .053, "rubber", 6)
    trolley.box((0, .115, .22), (.55, .064, .59), "ochre", .021)
    for y in (.48, .83):
        trolley.rod((-.28, y, -.16), (.28, y, -.16), .032, "ochre", 4)
    m.burnable("hand_truck", "עגלת משא", (2.68, 0, -.98), (0, .45, .13), trolley, "metal", -.31)

    locker = cabinet(1.27, .48, 1.98, "denim", 3, metal=True)
    for x, c in ((-.41, "ochre"), (0, "aqua"), (.41, "steel")):
        for y in (1.65, 1.72, 1.79):
            locker.box((x, y, .266), (.23, .028, .024), c)
    m.burnable("lockers", "לוקרים לציוד", (1.38, 0, -2.00), (.31, 1.14, .27), locker, "metal")


ROOMS = [
    ("kids-room", "חדר ילדים", kids_room, (1.29, 0, 1.58)),
    ("office", "משרד", office, (1.44, 0, 1.42)),
    ("shop", "חנות", shop, (1.22, 0, 1.45)),
    ("restaurant-kitchen", "מטבח מסעדה", restaurant_kitchen, (1.40, 0, 1.47)),
    ("storage", "מחסן", storage, (1.35, 0, 1.53)),
]


def build_rooms():
    for ident, label, furnish, rescue in ROOMS:
        model = Model(ident)
        furnish(model)
        model.camera((6, 5.7, 12), (0, 1.15, 0), 3.46)
        yield room_finish(model, label, rescue, ((-3.32, -.168, -2.42), (3.32, 3.117, 2.485)),
                          {"node": "flood_surface", "origin": [0, 0, 0], "size": [6.31, 4.49]})
