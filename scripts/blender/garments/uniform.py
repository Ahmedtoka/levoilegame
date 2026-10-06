"""Staff uniform: a closed V-neck waistcoat worn over the blouse, and the chest logo patch.

vest  - fitted sleeveless waistcoat, 4 cm outside the body (>= 1.2 cm outside the
        2.5 cm blouse), hem band at the hip (z 1.04-1.07), two front panels meeting
        on a raised button stand with three buttons, a V-neck, two welt pockets and
        armholes cut clear of the blouse's balloon sleeves. The shoulder straps close
        over the shoulder with a yoke ring around the blouse's neck.
logo  - a flat 7 x 3 cm patch centred on the chest (uv 0..1 -> the brand logo).

The vest is a (column x row) grid on the torso's ellipses, clipped against the
V-neck / back-neck line and the armhole curve so every edge is crisp.
"""

import math

from mathutils import Vector
from mathutils.bvhtree import BVHTree

import bpy

EASE = 0.040  # blouse ease (0.025) + 1.5 cm
ROWS = [1.04, 1.07, 1.10, 1.13, 1.16, 1.19, 1.22, 1.25, 1.28, 1.31, 1.34, 1.37, 1.40, 1.43, 1.46, 1.48, 1.50]
HEM_PROUD = 0.003  # the 3 cm hem band (z 1.04-1.07) stands 3 mm proud
LIFT = [(1.44, 0.0), (1.46, 0.010), (1.48, 0.018), (1.50, 0.024)]  # the top rings rise above the blouse's shoulder shelf
NECK = (0.108, 0.102, 0.022, 1.540)  # yoke inner ring around the blouse's neck: rx, ry, cy, z
N_COLS = 40
V_APEX_Z, V_SLOPE = 1.375, 2.0  # V-neck edge: z = apex + slope * |x|
BACK_NECK_Z, BACK_CURVE = 1.50, 6.0  # rounded back neck: z = 1.50 + 6 x^2
HEM_EASE, HEM_EASE_TOP = 0.015, 1.14  # the hem band swells backwards so it covers the skirt's top ring
CHEST_EASE = 0.012  # extra forward ease on the upper-chest slope (z 1.36-1.48)
FRONT_Y = 0.03  # y below this counts as the front (V-neck), above as the back
PLACKET_X, PLACKET_PROUD = 0.010, 0.002  # button stand: 2 cm wide, 2 mm proud
BUTTON_ZS, BUTTON_R, BUTTON_PROUD = (1.105, 1.175, 1.245), 0.0065, 0.003
POCKET_Z, POCKET_X, POCKET_W, POCKET_H, POCKET_TILT, POCKET_PROUD = 1.135, 0.085, 0.070, 0.016, 0.008, 0.002
# Armhole edge |x| by height (piecewise linear): nothing is cut below z 1.26.
ARMHOLE = [(1.25, 0.40), (1.29, 0.185), (1.33, 0.160), (1.38, 0.143), (1.44, 0.132), (1.80, 0.128)]
LOGO_W, LOGO_H, LOGO_Z, LOGO_PROUD = 0.070, 0.030, 1.33, 0.002


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def _at(table, z, k=1):
    s = sorted(table, key=lambda r: r[0])
    for a, b in zip(s, s[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return a[k] + (b[k] - a[k]) * t
    return s[0][k] if z < s[0][0] else s[-1][k]


class Surface:
    """The vest's torso ellipses: (rx, ry, cy) by height, from the body plus EASE."""

    def __init__(self, ctx):
        self.secs = ctx.torso_sections(1.00, 1.52, ease=EASE)

    def at(self, z):
        rx, ry, cy = _at(self.secs, z, 1), _at(self.secs, z, 2), _at(self.secs, z, 3)
        # Over the hips the band grows backwards only (the front keeps its line).
        e = HEM_EASE * smoothstep(HEM_EASE_TOP, ROWS[0], z)
        # The upper chest slopes ~45 deg back towards the shoulders, where a horizontal ease
        # gives less clearance at right angles to the blouse: push the front out there.
        f = CHEST_EASE * smoothstep(1.33, 1.40, z) * (1 - smoothstep(1.46, 1.50, z))
        return rx + e, ry + e + f, cy + e - f

    def ring_point(self, u, z):
        rx, ry, cy = self.at(z)
        return Vector((rx * math.cos(u), cy + ry * math.sin(u), z))

    def front_point(self, x, z):
        rx, ry, cy = self.at(z)
        return Vector((x, cy - ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2)), z))

    def normal(self, p):
        rx, ry, cy = self.at(p.z)
        n = Vector((p.x / (rx * rx), (p.y - cy) / (ry * ry), 0.0))
        return n.normalized()


def lift(z):
    return _at(LIFT, z) if z >= LIFT[0][0] else 0.0


# ---------------------------------------------------------------- clipping fields (>= 0 inside the vest)


def f_armhole(p):
    return _at(ARMHOLE, p.z) - abs(p.x)


def f_neckline(p):
    if p.y < FRONT_Y:
        return V_APEX_Z + V_SLOPE * abs(p.x) - p.z
    return BACK_NECK_Z + BACK_CURVE * p.x * p.x - p.z


def clip(poly, f):
    """Sutherland-Hodgman against f >= 0 (f sampled at the corners, linear along edges)."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        fa, fb = f(a), f(b)
        if fa >= 0:
            out.append(a)
        if (fa >= 0) != (fb >= 0):
            out.append(a.lerp(b, fa / (fa - fb)))
    return out if len(out) >= 3 else []


# ---------------------------------------------------------------- vest


def build_vest(ctx):
    surf = Surface(ctx)
    b = ctx.Builder()

    # Columns run counter-clockwise about +z starting just right of the front centre;
    # the front centre is the button stand (two surface columns, two raised ones).
    cols = [("u", -math.pi / 2 + 2 * math.pi * k / N_COLS, 0.0) for k in range(1, N_COLS)]
    cols += [("x", -PLACKET_X, 0.0), ("x", -PLACKET_X, PLACKET_PROUD), ("x", PLACKET_X, PLACKET_PROUD), ("x", PLACKET_X, 0.0)]
    # Rows: hem band (3 mm proud) with a ledge at 1.07, the torso rings, then the yoke over the shoulders.
    rows = [("z", 1.04, HEM_PROUD), ("z", 1.07, HEM_PROUD), ("z", 1.07, 0.0)]
    rows += [("z", z, 0.0) for z in ROWS[2:]]
    rows += [("yoke", 0.5, 0.0), ("yoke", 1.0, 0.0)]

    def torso_point(col, z, proud):
        kind, a, cproud = col
        p = surf.ring_point(a, z) if kind == "u" else surf.front_point(a, z)
        p += surf.normal(p) * max(proud, cproud)
        p.z += lift(z)
        return p

    def neck_point(col):
        kind, a, _ = col
        rx, ry, cy, z = NECK
        if kind == "u":
            return Vector((rx * math.cos(a), cy + ry * math.sin(a), z))
        return Vector((a, cy - ry * math.sqrt(max(0.0, 1 - (a / rx) ** 2)), z))

    def point(col, row):
        kind, v, proud = row
        if kind == "z":
            return torso_point(col, v, proud)
        return torso_point(col, ROWS[-1], 0.0).lerp(neck_point(col), v)

    grid = [[point(c, r) for r in rows] for c in cols]
    index = {}

    def vid(p):
        key = (round(p.x, 5), round(p.y, 5), round(p.z, 5))
        i = index.get(key)
        if i is None:
            i = len(b.verts)
            b.verts.append(Vector(key))
            b.uvs.append((0.0, 0.0))
            index[key] = i
        return i

    nc, nr = len(cols), len(rows)
    for i in range(nc):
        j = (i + 1) % nc
        for k in range(nr - 1):
            poly = [grid[i][k], grid[j][k], grid[j][k + 1], grid[i][k + 1]]
            for f in (f_armhole, f_neckline):
                poly = clip(poly, f)
                if not poly:
                    break
            if not poly:
                continue
            ids = []
            for p in poly:
                v = vid(p)
                if v not in ids:
                    ids.append(v)
            if len(ids) >= 3:
                b.faces.append(tuple(ids))

    # Buttons: short cylinders on the button stand, 3 mm proud of it.
    for zb in BUTTON_ZS:
        base = surf.front_point(0.0, zb)
        n = surf.normal(base)
        back = base + n * PLACKET_PROUD
        front = back + n * BUTTON_PROUD
        ex = Vector((1, 0, 0))
        ez = n.cross(ex).normalized()
        ring_b = [back + ex * (BUTTON_R * math.cos(a)) + ez * (BUTTON_R * math.sin(a)) for a in (2 * math.pi * s / 8 for s in range(8))]
        ring_f = [front + ex * (BUTTON_R * math.cos(a)) + ez * (BUTTON_R * math.sin(a)) for a in (2 * math.pi * s / 8 for s in range(8))]
        ids = b.loft([ring_b, ring_f], cap_end=True)

    # Welt pockets: a slightly tilted 7 x 1.6 cm bar, 2 mm proud, following the surface.
    for s in (1, -1):
        x0, x1 = s * (POCKET_X - POCKET_W / 2), s * (POCKET_X + POCKET_W / 2)
        z_in, z_out = POCKET_Z, POCKET_Z + POCKET_TILT
        corners = [(x0, z_in - POCKET_H / 2), (x1, z_out - POCKET_H / 2), (x1, z_out + POCKET_H / 2), (x0, z_in + POCKET_H / 2)]
        if s < 0:
            corners.reverse()
        base = [surf.front_point(x, z) for x, z in corners]
        top = [p + surf.normal(p) * POCKET_PROUD for p in base]
        ib = b.add_ring(base)
        it = b.add_ring(top)
        b.faces.append((it[0], it[1], it[2], it[3]))
        for q in range(4):
            r = (q + 1) % 4
            b.faces.append((ib[q], ib[r], it[r], it[q]))

    vest = ctx.make_object("vest", b, lambda p: ctx.top_weights(Vector((p.x, p.y, min(p.z, 1.50)))), "vest")
    report(vest)
    return vest


def report(vest):
    """Console QA: clearance of the vest's vertices from the blouse and the skirts."""
    for other in ("upper", "skirt_straight", "trousers"):
        ob = bpy.data.objects.get(other)
        if ob is None:
            continue
        me = ob.data
        tree = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
        worst, inside = (9.0, None), 0
        for v in vest.data.vertices:
            loc, nor, _, dist = tree.find_nearest(v.co)
            if loc is None:
                continue
            if other == "upper" and (v.co - loc).dot(nor) < 0:
                inside += 1
            if dist < worst[0]:
                worst = (dist, tuple(round(c, 3) for c in v.co))
        print("UNIFORM vest vs %s: min clearance %.4f m at %s, vertices inside: %d" % (other, worst[0], worst[1], inside))


# ---------------------------------------------------------------- logo


def build_logo(ctx):
    """Flat 7 x 3 cm patch centred on the chest, 2 mm proud of the vest's front (uv 0..1)."""
    surf = Surface(ctx)
    b = ctx.Builder()
    c = surf.front_point(0.0, LOGO_Z)
    y = c.y - LOGO_PROUD
    x0, x1 = -LOGO_W / 2, LOGO_W / 2
    z0, z1 = LOGO_Z - LOGO_H / 2, LOGO_Z + LOGO_H / 2
    ids = b.add_ring([Vector((x0, y, z0)), Vector((x1, y, z0)), Vector((x1, y, z1)), Vector((x0, y, z1))])
    b.uvs[ids[0]], b.uvs[ids[1]], b.uvs[ids[2]], b.uvs[ids[3]] = (0, 0), (1, 0), (1, 1), (0, 1)
    b.faces.append((ids[0], ids[1], ids[2], ids[3]))
    return ctx.make_object("logo", b, lambda p: ctx.spine_weights(p.z), "logo")


PIECES = {"vest": (build_vest, "vest"), "logo": (build_logo, "logo")}
