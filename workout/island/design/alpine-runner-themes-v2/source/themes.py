# SPDX-License-Identifier: CC0-1.0
"""Art direction and inventory for the six original environments."""
from geometry import rgb


def palette(snow, white, shade, ice, dark, rock, timber, accent, light):
    return {k: rgb(v) for k, v in locals().items()}


THEMES = {
    "forest": {
        "name": "יער", "title": "יער המחטים", "accent": "#b7dc83",
        "palette": palette("d9e8e8", "f3f7f2", "a3c1bf", "83a8a7", "244843", "556e60", "815b44", "b8ce73", "ffd68a"),
        "sky": ("547e8b", "b4cfbd", "f7d9a1"), "ridges": ("628a82", "99b1a3", "d8dad0", "315e57", "80a098"),
        "light": ("#f4f9df", "#6a8d90", "#ffe7b7", "#bee2ed", "#a8bfbd"),
        "weather": {"kind": "snow", "name": "שלג קל", "count": 70, "speed": [0.016, 0.12],
                    "size": [0.48, 1.75], "opacity": 0.64, "color": "#f3fcf5"},
        "props": [
            ("fir", "אשוח מושלג"), ("larch", "לאריקס"), ("birch", "ליבנה"), ("log-stack", "ערימת בולי עץ"),
            ("stump", "גדם מכוסה שלג"), ("footbridge-rail", "מעקה עץ"), ("trail-lantern", "פנס שביל"),
            ("boulder", "סלע טחב"), ("berry-brush", "שיח גרגרים"), ("trail-post", "עמוד סימון"),
        ],
    },
    "ice": {
        "name": "קרח", "title": "בקיע הקרח", "accent": "#88e9fb",
        "palette": palette("c8e9f2", "ebfbfc", "a4d0e4", "60bdd6", "285472", "498da8", "63819c", "69e4ed", "c9fdfd"),
        "sky": ("3d729b", "9ad9ee", "e7f8f6"), "ridges": ("6daac9", "8fcde0", "effbfa", "327692", "85c4d7"),
        "light": ("#d8f7ff", "#627dae", "#e2fdff", "#9aefff", "#a1d4e8"),
        "weather": {"kind": "fog", "name": "ערפל קרח", "center": 0.60, "width": 0.16, "speed": 0.045,
                    "opacity": 0.32, "color": "#dafaff"},
        "props": [
            ("blue-spire", "צריח קרח כחול"), ("split-shards", "מקבץ גבישים"), ("ice-wall", "קיר קרחון"),
            ("icefall", "מפל קרח"), ("glacial-boulder", "בולדר קרח"), ("frost-lantern", "פנס קפוא"),
            ("rope-marker", "יתדות וחבל"), ("survey-tripod", "חצובת מדידה"), ("drift", "דיונת שלג"),
            ("frozen-arch", "קשת קרח צדדית"),
        ],
    },
    "frozen-lava": {
        "name": "לבה קפואה", "title": "רכס הבזלת", "accent": "#f5a478",
        "palette": palette("dce4ef", "f2eef1", "a4afbf", "7c8ea7", "433b51", "625365", "774e57", "de865d", "f9c391"),
        "sky": ("4b4b74", "b3808c", "ffc5a1"), "ridges": ("786079", "b27c84", "eac0b1", "523e52", "926b7a"),
        "light": ("#e3edff", "#7e718c", "#ffe2c7", "#c9c9ff", "#b892a0"),
        "weather": {"kind": "fog", "name": "ערפל מעל הבזלת", "center": 0.66, "width": 0.13, "speed": -0.062,
                    "opacity": 0.29, "color": "#e8c7de"},
        "props": [
            ("basalt-column", "עמוד בזלת"), ("column-cluster", "אשכול עמודים"), ("obsidian-fin", "שן אובסידיאן"),
            ("frozen-fissure", "סדק קפוא"), ("strata", "שכבות בזלת"), ("frosted-shelf", "מדף בזלת מכוסה כפור"),
            ("survey-beacon", "משואת מדידה"), ("cairn", "גל אבנים"), ("copper-ore", "גוש סלע עם עורק נחושת"),
            ("ridge-marker", "סמן רכס"),
        ],
    },
    "aurora": {
        "name": "אורורה", "title": "עמק הזוהר", "accent": "#9dfad1",
        "palette": palette("9cb7cf", "c2d8e4", "708fad", "587f9e", "293855", "445873", "465876", "65e2b9", "b5ffe1"),
        "sky": ("12182f", "254575", "619f9f"), "ridges": ("394c7d", "58769a", "94b5c9", "253653", "59799a"),
        "light": ("#c5ddff", "#577694", "#ccdfff", "#9affea", "#557991"),
        "weather": {"kind": "glow", "name": "זוהר צפוני", "opacity": 0.76, "speed": 0.22,
                    "color": "#53edbf", "secondary": "#a590ff", "bands": [0.33, 0.48]},
        "props": [
            ("night-fir", "אשוח לילה"), ("prism", "מנסרת קרח"), ("violet-crystals", "גבישים סגולים"),
            ("ground-beacon", "משואת קרקע"), ("guide-bollard", "עמוד תאורת ניווט"), ("array-dish", "צלחת מצפה"),
            ("observation-pod", "עמדת תצפית"), ("mica-boulder", "סלע נציץ"), ("light-rail", "מעקה מואר"),
            ("wind-sock", "שק רוח"),
        ],
    },
    "village": {
        "name": "כפר", "title": "כפר הגגות", "accent": "#ffc375",
        "palette": palette("e0e6ec", "fff3df", "b0bed1", "90aab9", "3e5060", "6e7c8f", "a06550", "dc7858", "ffd480"),
        "sky": ("607893", "ddac95", "ffdcaa"), "ridges": ("7b8fa7", "bd9da0", "f5d9c7", "586677", "a88d85"),
        "light": ("#f5f0eb", "#8696b2", "#ffdfaf", "#cee7fc", "#c4b7bc"),
        "weather": {"kind": "snow", "name": "פתיתי ערב", "count": 84, "speed": [-0.022, 0.15],
                    "size": [0.55, 2.3], "opacity": 0.81, "color": "#fff8e8"},
        "props": [
            ("chalet", "בקתה מוארת"), ("clock-tower", "מגדל שעון"), ("supply-shed", "מחסן עצים"),
            ("lamp-post", "פנס רחוב"), ("snow-bench", "ספסל בשלג"), ("split-fence", "גדר כפרית"),
            ("sled-rack", "מתלה מזחלות"), ("wood-pile", "ערימת עצים"), ("market-stall", "דוכן מקורה"),
            ("planter", "אדנית מחטנית"),
        ],
    },
    "summit": {
        "name": "פסגה", "title": "קו הפסגה", "accent": "#a9caff",
        "palette": palette("d7e6f7", "f0f8ff", "a8bbd4", "7e9ab9", "3a4f71", "637b9c", "567497", "e3815d", "edc17f"),
        "sky": ("2b5994", "77abd5", "deebef"), "ridges": ("688ebd", "a2bfda", "f0f7fd", "3e628e", "9eb7d3"),
        "light": ("#e5f4ff", "#7f99bc", "#fff3df", "#a9d6ff", "#a6bfdc"),
        "weather": {"kind": "snow", "name": "סחף שלג", "count": 110, "speed": [0.24, 0.07],
                    "size": [0.42, 1.45], "opacity": 0.72, "color": "#f8fcff", "streaks": 3.2},
        "props": [
            ("ridge-spire", "מחט סלע"), ("stacked-slate", "לוחות צפחה"), ("wind-carved-bank", "תלולית שלג"),
            ("summit-cairn", "גל אבני פסגה"), ("ridge-flag", "דגל רכס"), ("rope-stanchion", "עמודי חבל"),
            ("expedition-crate", "ארגז משלחת"), ("weather-mast", "תורן מדידה"), ("rescue-hut", "בקתת חילוץ"),
            ("ridge-telescope", "טלסקופ תצפית"),
        ],
    },
}

# Slots retain the ids and centerline curves used by v1.
TILES = [
    ("straight", "פתיחת המסלול"), ("gentle_turn", "עיקול"), ("slope", "מדרון"), ("bridge", "גשר"),
    ("ice_tunnel", "מעבר מקורה"), ("village", "רחבה"), ("forest", "מעבר צר"), ("summit", "קו הרכס"),
]
