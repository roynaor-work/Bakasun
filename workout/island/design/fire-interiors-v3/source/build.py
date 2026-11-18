"""CC0-1.0. Run with Python 3, from any directory, to rebuild models and manifest."""
import json
import math
import sys

sys.dont_write_bytecode = True
from geometry import BASE, ROOT, Geometry, Model, arrow, cabinet, door_leaf, lock_badge, span, translated
from rooms import build_rooms, room_finish

HEIGHT = 3.2
CORE_X = 11.44
FLIGHT_X = (-.69, .69)
FLIGHT_WIDTH = 1.18
FRONT_Z, GOING, RISE = 1.82, .31, .20
TURN_Z = FRONT_Z - 8 * GOING
TURN_BACK = -1.98
ROOF_Y = 32
LEVELS = {
    4: ("מסחר", ("shop", "storage", "office")),
    5: ("מסעדה", ("restaurant-kitchen", "storage", "office")),
    6: ("משרדים", ("office", "office", "storage")),
    7: ("חדרי ילדים", ("kids-room", "office", "kids-room")),
    8: ("חדרי ילדים", ("kids-room", "kids-room", "storage")),
    9: ("משרדים", ("office", "office", "storage")),
    10: ("שירות וניהול", ("office", "storage", "office")),
}


def steps():
    for flight, x in enumerate(FLIGHT_X):
        sign = -1 if flight == 0 else 1
        start_z = FRONT_Z if flight == 0 else TURN_Z
        for i in range(8):
            yield x, (i + 1 + flight * 8) * RISE, start_z + sign * GOING * (i + .5), sign


def rail(g, a, b, steps_count=4):
    for i in range(steps_count + 1):
        u = i / steps_count
        x, y, z = (v * (1 - u) + w * u for v, w in zip(a, b))
        g.rod((x, y + .07, z), (x, y + .94, z), .025, "petrol", 6)
    for height, radius, color in ((.43, .019, "denim"), (.94, .031, "steel")):
        g.rod((a[0], a[1] + height, a[2]), (b[0], b[1] + height, b[2]), radius, color, 6)


def stairwell():
    m = Model("stairwell")
    front = Geometry()
    span(front, 9.96 - CORE_X, 14 - CORE_X, -.16, 0, FRONT_Z, 3.12, "concrete")
    span(front, 9.96 - CORE_X, 14 - CORE_X, -.153, -.067, 3.105, 3.16, "teal")
    for x in (-.69, .69):
        span(front, x - .55, x + .55, .001, .009, 2.04, 2.103, "ochre")
    arrow(front, -.68, .011, 2.48, math.pi / 2, "moss", .32)
    arrow(front, .78, .011, 2.51, math.pi, "moss", .24)
    lower = m.part("stair_front_landing", front)
    m.node("stair_top_landing", m.root, mesh=m.nodes[lower]["mesh"], translation=[0, 3.2, 0],
           extras={"hideInAssembly": True})

    structure = Geometry()
    for x, y, z, sign in steps():
        structure.box((x, y - .093, z), (FLIGHT_WIDTH, .186, GOING), "concrete")
        structure.box((x, y + .006, z - sign * .095), (FLIGHT_WIDTH + .018, .012, .062), "chalk")
    for flight, x in enumerate(FLIGHT_X):
        a_z, b_z = (FRONT_Z, TURN_Z) if flight == 0 else (TURN_Z, FRONT_Z)
        a_y, b_y = flight * 1.6, (flight + 1) * 1.6
        for dx in (-.44, .44):
            structure.rod((x + dx, a_y - .10, a_z), (x + dx, b_y - .17, b_z),
                          .071, "moss", 4)
        for dx in (-.54, .54):
            rail(structure, (x + dx, a_y, a_z), (x + dx, b_y, b_z))
    span(structure, -1.32, 1.32, 1.43, 1.60, TURN_BACK, TURN_Z, "concrete")
    rail(structure, (-1.30, 1.6, -1.87), (1.30, 1.6, -1.87))
    span(structure, -1.44, 1.33, 0, 3.08, -2.05, -1.98, "silver")
    span(structure, -1.43, 1.32, 1.60, 1.72, -1.98, -1.941, "moss")
    m.part("stair_flights_and_turn_landing", structure)

    west = Geometry()
    span(west, -1.49, -1.38, 0, 3.075, -2.04, 1.84, "sage")
    span(west, -1.49, -1.38, 0, 3.075, 2.99, 3.14, "sage")
    span(west, -1.49, -1.38, 2.38, 3.075, 1.84, 2.99, "sage")
    m.part("cutaway_stair_west", west)
    east = Geometry()
    span(east, 1.34, 1.43, 0, 3.075, -2.04, FRONT_Z, "silver")
    span(east, 1.33, 1.45, 2.34, 3.075, FRONT_Z, 3.16, "silver")
    m.part("cutaway_stair_east", east)

    face = Geometry()
    span(face, -1.49, 1.43, 0, .80, 3.11, 3.21, "sage_dark")
    span(face, -1.49, 1.43, .80, 2.69, 3.169, 3.205, "denim")
    span(face, -1.49, 1.43, 2.69, 3.04, 3.11, 3.21, "sage_dark")
    for x in (-1.42, -.46, .46, 1.37):
        face.box((x, 1.73, 3.207), (.045, 2.1, .076), "silver")
    m.part("cutaway_core_face", face)

    portal = Geometry()
    for z in (1.84, 2.99):
        portal.box((-1.42, 1.18, z), (.19, 2.36, .076), "ivory")
    portal.box((-1.42, 2.39, 2.416), (.19, .12, 1.24), "ivory", .012)
    portal.box((-1.43, .016, 2.41), (.23, .032, 1.11), "steel")
    portal.box((-1.52, 2.61, 2.38), (.055, .24, .76), "moss", .015)
    for i in range(3):
        portal.box((-1.554, 2.551 + i * .052, 2.24 + i * .12), (.015, .039, .26), "ivory")
    for x in (-1.21, 1.16):
        portal.box((x, 2.78, -1.92), (.20, .11, .14), "lamp", .015)
    m.part("stair_fire_door_frame", portal)
    m.burnable("door", "דלת אש", (-1.42, 0, 1.88), (-.48, 1.08, .04),
               door_leaf(height=2.30, color="clay", window=True), "metal",
               math.radians(167), door=True, closed_angle=math.pi / 2)

    sign = Geometry()
    sign.box((0, 0, 0), (.62, .55, .056), "oak", .023)
    sign.box((0, 0, .034), (.54, .47, .024), "moss", .011)
    for i in range(4):
        sign.box((-.126 + i * .077, -.12 + i * .074, .052), (.19, .045, .014), "chalk")
    m.burnable("notice_board", "לוח חדר מדרגות", (-.55, 2.32, -1.91), (0, 0, .10), sign, "paper")

    service = cabinet(.57, .34, 1.13, "clay", 1, metal=True)
    service.box((0, .75, .188), (.32, .23, .028), "ivory")
    m.burnable("service_cabinet", "ארון שירות מתחת למדרגות", (-.83, 0, -1.48),
               (.10, .74, .20), service, "electrical")

    m.anchor("stair_bottom", (-.69, 0, 2.51), role="stair_navigation", next="stair_turn")
    m.anchor("stair_turn", (0, 1.6, -1.32), role="stair_navigation", next="stair_top")
    m.anchor("stair_top", (.69, 3.2, FRONT_Z), role="stair_navigation")
    m.camera((6.6, 5.7, 10), (0, 1.55, .55), 3.76)
    asset, room = room_finish(m, "חדר מדרגות", (.11, 0, 2.7),
                              ((-1.61, -.17, -2.05), (2.56, 4.16, 3.21)),
                              {"node": "flood_surface", "origin": [.10, 0, 2.49], "size": [3.02, 1.16]},
                              smoke_xz=(0, .88), exit_at=(-1.45, 0, 2.42), exit_normal=(-1, 0, 0))
    room["size"] = [4.17, 4.16, 5.26]
    return asset, room


DIGITS = {
    "0": ("111", "101", "101", "101", "111"),
    "1": ("010", "110", "010", "010", "111"),
    "4": ("101", "101", "111", "001", "001"),
    "5": ("111", "100", "111", "001", "111"),
    "6": ("111", "100", "111", "101", "111"),
    "7": ("111", "001", "001", "010", "010"),
    "8": ("111", "101", "111", "101", "111"),
    "9": ("111", "101", "111", "001", "111"),
}


def number_plate(number):
    g = Geometry()
    text = str(number)
    g.box((0, 0, 0), (.73, .53, .06), "petrol", .02)
    for i, char in enumerate(text):
        start = -(.076 * (len(text) * 4 - 2)) / 2 + i * .304
        for row, pixels in enumerate(DIGITS[char]):
            for col, ink in enumerate(pixels):
                if ink == "1":
                    g.box((start + col * .076, .15 - row * .075, .035),
                          (.073, .073, .014), "ivory")
    return g


def upper_shell():
    m = Model("upper-shell")
    floor = Geometry()
    span(floor, -9.96, 9.96, -.17, -.025, .92, 3.12, "graphite")
    span(floor, -9.96, 9.96, -.149, -.058, 3.108, 3.171, "teal")
    for i in range(24):
        floor.box((-9.545 + i * .830, -.012, 2.02), (.818, .024, 2.15),
                  ("road", "linen", "road", "chalk")[i % 4])
    for x in (-7.33, -2.13, 3.48, 7.17, 8.94):
        arrow(floor, x, .004, 1.99, color="moss")
    for x in (-4.33, 2.31, 8.95):
        floor.box((x, .006, 1.14), (1.10, .012, .055), "ochre")
    slab = m.mesh("corridor_surface", floor)

    facade = Geometry()
    span(facade, -9.96, 9.96, .98, 2.79, 3.122, 3.156, "glass")
    span(facade, -9.96, 9.96, 0, .98, 3.10, 3.22, "sage_dark")
    span(facade, -9.96, 9.96, 2.79, 3.031, 3.10, 3.20, "chalk")
    for i in range(13):
        x = -9.91 + i * 1.651
        facade.box((x, 1.91, 3.17), (.078 if i % 4 else .165, 2.04, .13), "ivory")
    skin = m.mesh("corridor_face", facade)
    end = Geometry()
    span(end, -10.03, -9.91, 0, 3.02, .95, 3.15, "sage")
    end_mesh = m.mesh("corridor_end", end)

    railing = Geometry()
    for x in (-9.92, -6.64, -3.32, 0, 3.32, 6.64, 9.92):
        railing.rod((x, .05, 3.05), (x, .83, 3.05), .027, "moss", 6)
    railing.rod((-9.92, .84, 3.05), (9.92, .84, 3.05), .031, "steel", 8)
    # Corridor lights are suspended independently of ceiling visibility.
    for x in (-8.20, -2.61, 4.20, 9.11):
        railing.box((x, 2.92, 1.61), (.88, .091, .25), "steel", .012)
        railing.box((x, 2.868, 1.61), (.77, .019, .17), "lamp")
    rail_mesh = m.mesh("corridor_rail", railing)

    shaft_g = Geometry()
    span(shaft_g, 11.47, 11.60, 0, 3.20, -3.91, -2.02, "shale")
    span(shaft_g, 13.88, 14.00, 0, 3.20, -3.91, -2.02, "shale")
    span(shaft_g, 11.47, 14.00, 0, 3.20, -4.05, -3.91, "sage")
    for x in (11.76, 13.74):
        span(shaft_g, x - .03, x + .03, 0, 3.2, -3.88, -3.82, "steel")
    shaft = m.mesh("elevator_shaft", shaft_g)

    lift = Geometry()
    span(lift, 11.47, 12.65, 0, 3.2, -2.12, -1.99, "concrete")
    span(lift, 13.77, 14, 0, 3.2, -2.12, -1.99, "concrete")
    span(lift, 12.65, 13.77, 2.24, 3.2, -2.12, -1.99, "concrete")
    for x in (12.62, 13.79):
        lift.box((x, 1.12, -1.968), (.090, 2.24, .098), "petrol", .01)
    lift.box((13.21, 2.25, -1.966), (1.26, .10, .11), "petrol", .013)
    lift.box((13.22, .014, -2.01), (1.14, .028, .21), "steel")
    lock_badge(lift, 12.27, 1.48, -1.962)
    lift.box((12.27, 1.05, -1.966), (.163, .246, .064), "petrol", .013)
    lift.box((12.27, 1.08, -1.928), (.057, .058, .016), "poppy", .011)
    frame = m.mesh("elevator_frame", lift)

    panel = Geometry()
    panel.box((0, 1.095, 0), (.553, 2.18, .063), "steel", .015)
    panel.box((-.15, 1.095, .033), (.039, 2.12, .009), "silver")
    panel.box((.237, 1.095, .035), (.037, 2.13, .012), "metal")
    doors = m.mesh("elevator_door_panel", panel)

    approach = Geometry()
    span(approach, 12.87, 14, -.16, 0, -2.0, FRONT_Z, "concrete")
    for z in (-1.40, -.45, .48, 1.14):
        approach.box((13.41, .006, z), (.082, .012, .39), "steel")
    approach_mesh = m.mesh("elevator_approach", approach)
    side = Geometry()
    span(side, 13.89, 14.04, 0, 3.01, -1.99, FRONT_Z, "silver")
    side_mesh = m.mesh("elevator_outer_wall", side)

    cabin = Geometry()
    span(cabin, 11.64, 13.85, -.10, 0, -3.86, -2.054, "petrol")
    span(cabin, 11.64, 13.85, 0, 2.45, -3.84, -3.76, "denim")
    span(cabin, 11.64, 13.85, 2.38, 2.49, -3.84, -2.05, "steel")
    for side in (11.65, 13.83):
        cabin.box((side, 1.20, -2.93), (.075, 2.4, 1.76), "steel")
    cabin.box((12.72, 1.064, -3.69), (1.83, .071, .14), "silver", .008)
    cabin.box((12.75, 2.365, -2.92), (1.57, .038, 1.22), "lamp", .012)
    car = m.mesh("elevator_car", cabin)

    for n in LEVELS:
        y = elevation(n)
        parent = m.node(f"shell_floor_{n}", m.root, translation=[0, y, 0], extras={"floor": n})
        for name, mesh in (("corridor", slab), ("cutaway_corridor_face", skin), ("cutaway_corridor_end", end_mesh),
                           ("corridor_rail", rail_mesh), ("elevator_shaft", shaft),
                           ("elevator_frame", frame), ("elevator_approach", approach_mesh),
                           ("cutaway_elevator_outer", side_mesh)):
            m.node(f"{name}_f{n}", parent, mesh=mesh)
        plate = number_plate(n)
        m.part(f"floor_number_f{n}", plate, parent, translation=[9.36, 2.65, 3.208])
        lift_plate = number_plate(n)
        m.part(f"elevator_number_f{n}", lift_plate, parent, translation=[13.21, 2.58, -1.945],
               scale=[.86, .70, .86])
        for side, x in (("left", 12.931), ("right", 13.489)):
            m.node(f"elevator_door_{side}_f{n}", parent, mesh=doors, translation=[x, 0, -2.043],
                   extras={"role": "elevator_panel", "lockedDuringFire": True})
        m.node(f"elevator_threshold_f{n}", parent, translation=[13.21, 0, -1.984],
               extras={"role": "elevator_threshold", "evacuation": False, "lockedDuringFire": True})
        m.node(f"corridor_join_f{n}", parent, translation=[9.96, 0, 2.45],
               extras={"role": "stair_landing_connection"})
        if n == 4:
            m.node("elevator_car_parked", parent, mesh=car, extras={"parkedAt": 4, "evacuation": False})
    return m.save()


def roof():
    m = Model("roof")
    deck = Geometry()
    # Four pieces surround the stair void x=[10.02,12.87], z=[-2.05,1.82].
    for x0, x1, z0, z1 in ((-10.07, 10.02, -4.06, 3.25), (10.02, 14.07, -4.06, -2.05),
                            (12.87, 14.07, -2.05, FRONT_Z), (10.02, 14.07, FRONT_Z, 3.25)):
        span(deck, x0, x1, -.174, -.012, z0, z1, "shale")
        span(deck, x0 + .007, x1 - .007, -.022, .001, z0 + .007, z1 - .007, "concrete")
    for x in (-8, -6, -4, -2, 0, 2, 4, 6, 8):
        deck.box((x, .004, -.40), (.02, .008, 7.19), "silver")
    for x in (9.50, 8.18, 6.80):
        arrow(deck, x, .014, 2.42, math.pi, "moss", .37)
    for z in (-3.995, 3.185):
        deck.box((2, .315, z), (24.1, .63, .13), "sage")
        deck.box((2, .639, z), (24.15, .078, .215), "chalk", .013)
    for x in (-10.005, 14.005):
        deck.box((x, .315, -.405), (.13, .63, 7.16), "sage")
        deck.box((x, .639, -.405), (.23, .078, 7.20), "chalk", .013)
    m.part("roof_deck_and_parapet", deck)

    bulk = Geometry()
    span(bulk, 10.02, 10.14, 0, 2.57, -2.03, 1.82, "sage")
    span(bulk, 10.02, 10.14, 0, 2.57, 3.02, 3.15, "sage")
    span(bulk, 10.02, 10.14, 2.37, 2.57, 1.82, 3.02, "sage")
    span(bulk, 10.02, 12.90, 0, 2.57, -2.03, -1.91, "sage")
    m.part("roof_bulkhead", bulk)
    shell = Geometry()
    span(shell, 12.81, 12.92, 0, 2.57, -2.04, 3.16, "sage_dark")
    span(shell, 10.02, 12.84, 0, 2.57, 3.05, 3.17, "sage_dark")
    span(shell, 9.97, 12.98, 2.57, 2.71, -2.09, 3.23, "chalk")
    m.part("cutaway_roof_bulkhead", shell)

    exit_frame = Geometry()
    for z in (1.842, 2.982):
        exit_frame.box((10.03, 1.18, z), (.19, 2.36, .079), "ivory")
    exit_frame.box((10.03, 2.40, 2.412), (.19, .11, 1.23), "ivory", .012)
    exit_frame.box((10.03, .011, 2.412), (.21, .022, 1.10), "steel")
    for i in range(6):
        exit_frame.box((9.85, .007, 1.93 + .19 * i), (.15, .014, .098), "ochre")
    m.part("roof_exit_frame", exit_frame)
    m.part("roof_exit_door", translated(door_leaf(color="moss", window=True), (10.03, 0, 1.881),
                                      math.radians(23)))
    exit_sign = Geometry()
    exit_sign.box((9.944, 2.481, 2.416), (.06, .19, .71), "moss", .012)
    for i in range(3):
        exit_sign.box((9.903, 2.43 + .042 * i, 2.29 + .123 * i), (.025, .035, .24), "ivory")
    m.part("roof_exit_sign", exit_sign)

    equipment = Geometry()
    for x, z in ((-5.4, -1.98), (-2.6, -1.98), (2.8, -.94)):
        equipment.box((x, .14, z), (2.12, .28, 1.33), "shale", .02)
        equipment.box((x, .59, z), (1.87, .72, 1.15), "steel", .044)
        equipment.box((x, .95, z), (1.95, .095, 1.21), "silver", .024)
        for i in range(8):
            equipment.box((x, .325 + i * .067, z + .586), (1.53, .027, .035), "denim")
        for dx in (-.45, .45):
            equipment.cylinder((x + dx, 1.017, z), .31, .043, "petrol", 16)
            for dz in (-.18, -.06, .06, .18):
                equipment.box((x + dx, 1.045, z + dz), (.46, .017, .031), "silver")
    for x in (-7.95, -.18, 6.55):
        equipment.cylinder((x, .175, -2.96), .18, .35, "steel", 10)
        equipment.cylinder((x, .365, -2.96), .23, .09, "silver", 10)
    m.part("roof_service_equipment", equipment)
    m.anchor("roof_stair_arrival", (12.13, 0, 2.51), role="stair_top", next="roof_exit")
    m.anchor("roof_exit", (10.02, 0, 2.42), role="navigation_threshold", next="roof_assembly_point", normal=[-1, 0, 0])
    m.anchor("roof_assembly_point", (6.35, 0, 1.78), role="roof_destination")
    return m.save()


def elevation(floor):
    return round((floor - 1) * HEIGHT, 3)


def world(translation, local):
    return [round(a + b, 4) for a, b in zip(translation, local)]


def stair_connections():
    data = []
    for floor in range(3, 11):
        y = elevation(floor)
        translation = [CORE_X, y, 0]
        bottom_y = .114 if floor == 3 else 0
        path = [(-.69, bottom_y, 2.51)]
        for x, height, z, _ in steps():
            if height > 1.6 and len(path) == 9:
                path.extend([(-.69, 1.6, -1.32), (.69, 1.6, -1.32)])
            path.append((x, height, z))
        path.append((.69, 3.2, 2.51))
        data.append({"id": f"stairs_{floor}_to_{floor + 1}" if floor < 10 else "stairs_10_to_roof",
                     "from": floor, "to": floor + 1 if floor < 10 else "roof",
                     "roomType": "stairwell", "model": "stairwell", "translation": translation,
                     "hideNodes": ["stair_front_landing"] if floor == 3 else [],
                     "anchors": ["stair_bottom", "stair_turn", "stair_top"],
                     "path": [world(translation, point) for point in path]})
    return data


def main():
    (ROOT / "models").mkdir(exist_ok=True)
    pairs = [*build_rooms(), stairwell()]
    assets = [asset for asset, _ in pairs] + [upper_shell(), roof()]
    rooms = [room for _, room in pairs]
    room_map = {room["id"]: room for room in rooms}
    stairs = stair_connections()
    floors = []
    for number, (label, types) in LEVELS.items():
        floor_rooms = []
        for index, (room_type, x) in enumerate(zip(types, (-6.64, 0, 6.64))):
            translation = [x, elevation(number), -1.5]
            room = room_map[room_type]
            floor_rooms.append({"id": f"f{number}_room_{index + 1}", "type": room_type,
                                "model": room["model"], "translation": translation,
                                "door": world(translation, room["doorLocal"]),
                                "rescue": world(translation, room["rescueLocal"])})
        stair_id = stairs[number - 3]["id"]
        floors.append({"number": number, "label": label, "elevation": elevation(number),
                       "shellNode": f"shell_floor_{number}", "rooms": floor_rooms,
                       "stairwell": stair_id,
                       "corridor": {"clearWidth": 2.2, "centerline": [
                           [-9.86, elevation(number), 2.42], [10.02, elevation(number), 2.42]]},
                       "elevator": {"threshold": f"elevator_threshold_f{number}",
                                    "panels": [f"elevator_door_{side}_f{number}" for side in ("left", "right")],
                                    "evacuation": False,
                                    "approach": [[13.44, elevation(number), 2.42],
                                                 [13.44, elevation(number), -1.71]]}})
    base_doc = json.loads((BASE / "manifest.json").read_text())
    legacy_models = [a for a in base_doc["assets"]
                     if a["id"] in {"building-shell", *(f"building-floor-{i}" for i in range(1, 4))}]
    for asset in legacy_models:
        asset["path"] = "../fire-multifloor-v2/" + asset["path"]
    manifest = {
        "schemaVersion": 3, "id": "fire-interiors-v3", "license": "CC0-1.0",
        "units": "metres", "up": "+Y", "front": "+Z", "origin": [0, 0, 0],
        "base": {"ref": "codex/fire-multifloor-v2", "commit": "8979e5557380bd9944b631f6844fe056a26de8cc",
                 "floorNumbers": [1, 2, 3], "models": legacy_models},
        "preview": {"path": "preview.html", "viewport": [844, 390], "network": "same-origin",
                    "modules": ["../../vendor/three.module.js", "../../vendor/GLTFLoader.js",
                                "../../vendor/BufferGeometryUtils.js", "../fire-multifloor-v2/runtime.mjs",
                                "preview.mjs", "effects.mjs"],
                    "icon": "../../assets/icons/island-192.png"},
        "limits": {"packageBytes": 8_000_000, "roomTotalTriangles": 6000},
        "assets": assets, "rooms": rooms,
        "building": {
            "floorHeight": HEIGHT, "upperFloorNumbers": list(LEVELS), "floorShellModel": "upper-shell",
            "footprintXZ": [[-10.08, -4.06], [14.08, 3.25]],
            "floors": floors, "groundExit": [13.1, 0, 4],
            "stairs": {"risersPerStorey": 16, "riseMeters": RISE, "goingMeters": GOING,
                       "flightWidthMeters": FLIGHT_WIDTH, "turnLandingDepthMeters": 1.32,
                       "stops": stairs, "lowerFlightsModel": "building-shell"},
            "roof": {"model": "roof", "translation": [0, ROOF_Y, 0], "arrival": "roof_stair_arrival",
                     "exit": "roof_exit", "destination": "roof_assembly_point",
                     "path": [[12.13, ROOF_Y, 2.51], [10.02, ROOF_Y, 2.42], [6.35, ROOF_Y, 1.78]]},
            "elevator": {"floors": list(LEVELS), "car": "elevator_car_parked", "parkedAt": 4,
                         "evacuation": False, "lockedDuringFire": True},
        },
        "stateContract": {"parent": "burn_<name>", "intact": "intact_<name>",
                          "burnt": "burnt_<name>", "fire": "fire_<name>", "default": "intact",
                          "burningUses": "intact", "burntStoredScale": [0, 0, 0],
                          "burntActiveScale": [1, 1, 1]},
        "effects": {
            "flame": {"atlas": "../fire-multifloor-v2/effects/fire.png", "frames": 8, "framePixels": 128, "fps": 12},
            "smoke": {"atlas": "../fire-multifloor-v2/effects/smoke.png", "frames": 8, "framePixels": 128, "fps": 8,
                      "layers": ["ceiling", "mid", "low"],
                      "modes": [
                          {"id": "off", "label": "ללא", "opacity": [0, 0, 0]},
                          {"id": "light", "label": "קל", "opacity": [.30, 0, 0]},
                          {"id": "medium", "label": "בינוני", "opacity": [.47, .27, 0]},
                          {"id": "heavy", "label": "כבד", "opacity": [.66, .55, .42]}]},
            "flood": {"module": "effects.mjs", "anchor": "flood_surface", "maxDepthMeters": .32,
                      "fillMetersPerSecond": .18},
        },
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    for asset in assets:
        print(f"{asset['path']:<38} {asset['bytes']:>7,} B    {asset['storedTriangles']:>5,} triangles")
    print(f"{sum(asset['bytes'] for asset in assets):,} B")
    print(f"{sum(len(room['items']) for room in rooms)} burnable templates")


if __name__ == "__main__":
    main()
