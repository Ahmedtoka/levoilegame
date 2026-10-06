"""Hair plug-in: four Bitmoji-like styles built from big, clean, chunky locks.

    hair_long      long straight hair past the shoulders (back curtain + front locks)
    hair_bun       low bun at the nape
    hair_ponytail  high ponytail, tail to the shoulder blades
    hair_bob       chin-length bob covering the ears

The base look is "smooth straight" with a side parting (on her left, x > 0): a smooth
cap hugging the skull (ray-cast onto the body's head so it fits the sculpt) carrying soft
lock ridges and a parting groove, a swept fringe of lock tubes over the forehead, then the
style's own hanging hair. Everything is modelled on the UNSCALED head: build() enlarges the
hair about HEAD_PIVOT afterwards. Above the ears the hems stay clear of the brows, the
round glasses and their temples; the hanging hair is weighted to the torso below the chin
so a head turn never swings it through the shoulders.

The plug-in also repaints the Quaternius hair images in place (T_Hair_2_BaseColor /
T_Hair_2_Normal), so export_textures writes a smooth mid-grey strand mask as hair.png
(the runtime multiplies it by the chosen hair colour) and a soft strand normal map.
"""

import math
import os
import tempfile

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# Head centre of the spherical parametrisation and the vertical axis of the hanging hair.
C = Vector((0.0, 0.011, 1.655))
AX = Vector((0.0, 0.030, 0.0))
PART_A = 17.0  # parting azimuth (degrees; 0 = front, + = her left / +X)
THICK = 0.013  # cap thickness over the skull
LOCK_N = 10  # sides per lock tube (round enough to shade as a smooth ridge)


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def d_sph(a, e):
    """Unit direction at azimuth a (0 = front, -Y; +90 = her left, +X) and elevation e (degrees)."""
    a, e = math.radians(a), math.radians(e)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


def wrap180(a):
    return (a + 180.0) % 360.0 - 180.0


# ---------------------------------------------------------------- the skull


class Skull:
    """Ray casts against the body's head so every hair surface fits the sculpt."""

    def __init__(self, body):
        me = body.data
        self.bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

    def cast(self, origin, d, fallback=0.09):
        loc, _n, _i, dist = self.bvh.ray_cast(Vector(origin), Vector(d).normalized(), 0.6)
        return (loc, dist) if loc is not None else (Vector(origin) + Vector(d).normalized() * fallback, fallback)

    def surf(self, a, e, h):
        """Point h metres outside the skull in direction (a, e) from C."""
        d = d_sph(a, e)
        loc, _ = self.cast(C, d)
        return loc + d * h

    def side_r(self, a, z):
        """Skull radius from the vertical axis at height z (horizontal ray)."""
        d = Vector((math.sin(math.radians(a)), -math.cos(math.radians(a)), 0.0))
        _, dist = self.cast(Vector((AX.x, AX.y, z)), d, 0.085)
        return dist

    def solve_e(self, a, z_target, h):
        """Elevation at which the hair surface in column a reaches height z_target."""
        lo, hi = -60.0, 85.0
        for _ in range(16):
            mid = (lo + hi) / 2
            if self.surf(a, mid, h).z < z_target:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2


# ---------------------------------------------------------------- mesh collector


class Mesh:
    """Vertices + faces with per-loop UVs (so a wrapped seam still keeps UVs in 0..1)."""

    def __init__(self):
        self.v, self.f, self.uv = [], [], []

    def vert(self, p):
        self.v.append(Vector(p))
        return len(self.v) - 1

    def face(self, ids, uvs):
        self.f.append(tuple(ids))
        self.uv.append(tuple(uvs))

    def grid(self, cols, uvs, wrap=False):
        """Columns run CCW (seen from above) and each runs top-down: faces come out facing outward."""
        n = len(cols)
        for i in range(n if wrap else n - 1):
            j = (i + 1) % n
            A, B = cols[i], cols[j]
            ua, ub = uvs[i], uvs[j]
            if wrap and j == 0:
                ub = [(u + 1.0, v) for u, v in ub]
            for k in range(len(A) - 1):
                self.face((A[k], A[k + 1], B[k + 1], B[k]), (ua[k], ua[k + 1], ub[k + 1], ub[k]))

    def fan(self, centre, ring, uv_c, uvs, wrap=True):
        """Triangles from a pole vertex to a CCW ring below it (outward normals)."""
        n = len(ring)
        for i in range(n if wrap else n - 1):
            j = (i + 1) % n
            uj = uvs[j]
            if wrap and j == 0:
                uj = (uj[0] + 1.0, uj[1])
            self.face((centre, ring[i], ring[j]), (((uvs[i][0] + uj[0]) / 2, uv_c[1]), uvs[i], uj))

    def tube(self, pts, outs, width, thick, taper, n=LOCK_N, u_range=(0.0, 1.0), v_range=(0.0, 1.0), tip=0.01, ridges=0, ridge_amp=0.4):
        """A tapered lock along a centreline: flat ellipses (width along the surface, thick outward).
        `ridges` > 0 bumps the outer face into that many soft lock ridges across the width."""
        N = len(pts)
        rings, ruvs = [], []
        for i, c in enumerate(pts):
            d = (pts[min(i + 1, N - 1)] - pts[max(i - 1, 0)]).normalized()
            o = Vector(outs[i])
            o = (o - d * o.dot(d)).normalized()
            u = o.cross(d).normalized()
            f = i / (N - 1)
            k = taper(f)
            ring, ruv = [], []
            for s in range(n):
                t = 2 * math.pi * s / n
                bump = 1.0
                if ridges and math.sin(t) > 0:
                    x = 0.5 + 0.5 * math.cos(t)  # 0..1 across the width
                    bump = 1 + ridge_amp * (0.5 - 0.5 * math.cos(2 * math.pi * ridges * x)) * math.sin(t)
                ring.append(self.vert(c + u * (math.cos(t) * width * k) + o * (math.sin(t) * thick * k * bump)))
                ruv.append((lerp(u_range[0], u_range[1], s / n), lerp(v_range[0], v_range[1], f)))
            rings.append(ring)
            ruvs.append(ruv)
        for k in range(N - 1):
            a, b = rings[k], rings[k + 1]
            for i in range(n):
                j = (i + 1) % n
                ua, ub = ruvs[k], ruvs[k + 1]
                uj = (u_range[1], ua[j][1]) if j == 0 else ua[j]
                ujb = (u_range[1], ub[j][1]) if j == 0 else ub[j]
                self.face((a[i], a[j], b[j], b[i]), (ua[i], uj, ujb, ub[i]))
        # Rounded ends: a point a little beyond each end ring.
        for ring, ruv, sgn, c, c2 in ((rings[0], ruvs[0], -1, pts[0], pts[1]), (rings[-1], ruvs[-1], 1, pts[-1], pts[-2])):
            d = (c - c2).normalized()
            ci = self.vert(c + d * tip * taper(0.0 if sgn < 0 else 1.0))
            for i in range(n):
                j = (i + 1) % n
                uv_c = (sum(x[0] for x in ruv) / n, ruv[0][1])
                if sgn > 0:
                    self.face((ci, ring[i], ring[j]), (uv_c, ruv[i], ruv[j]))
                else:
                    self.face((ci, ring[j], ring[i]), (uv_c, ruv[j], ruv[i]))


def lock_taper(f):
    """Emerges thin from the parting, fattens, then tapers to a rounded tip."""
    return lerp(0.55, 1.0, smooth(0.0, 0.3, f)) * lerp(1.0, 0.3, smooth(0.55, 1.0, f))


def tail_taper(f):
    return lerp(0.5, 1.0, smooth(0.0, 0.18, f)) * lerp(1.0, 0.35, smooth(0.5, 1.0, f))


# ---------------------------------------------------------------- weights


def hair_w(p):
    """Head above the chin, then the neck and the torso: hanging hair stays with the body when the head turns."""
    z = p.z
    if z >= 1.575:
        return {"Head": 1.0}
    if z >= 1.49:
        t = smooth(1.49, 1.575, z)
        return {"Head": t, "neck_01": 1 - t}
    if z >= 1.40:
        t = smooth(1.40, 1.49, z)
        return {"neck_01": t, "spine_03": 1 - t}
    if z >= 1.28:
        t = smooth(1.28, 1.40, z)
        return {"spine_03": t, "spine_02": 1 - t}
    return {"spine_02": 1.0}


# ---------------------------------------------------------------- the cap (skull-hugging shell)


def hairline_z(a):
    """Front hairline height by azimuth: clear of the brows (z < 1.69 for |x| < 0.065), the fringe
    side (her right, a < 0) sweeps lower towards the temple."""
    if a < 0:
        return 1.716 - 0.014 * smooth(-8, -38, a) - 0.02 * smooth(-38, -60, a)
    return 1.716 - 0.012 * smooth(8, 35, a) - 0.016 * smooth(35, 60, a)


def hem_tucked(a, nape=1.605, ear=1.684, back_start=100.0):
    """Hem of a cap with the ears showing: hairline at the front, above the ears at the sides,
    down to the nape behind them."""
    a = wrap180(a)
    s = abs(a)
    if s <= 60:
        return hairline_z(a)
    if s <= 95:
        return lerp(hairline_z(math.copysign(60, a)), ear, smooth(60, 72, s))
    return lerp(ear, nape, smooth(95, 132, s))


def cap_thickness(a, e, ridges=8, amp=0.009, part=0.007):
    """Base thickness + soft lock ridges (troughs at the parting) + the parting groove."""
    a = wrap180(a)
    t = THICK
    k = smooth(88, 55, e)
    t += amp * k * (0.5 - 0.5 * math.cos(math.radians(ridges * (a - PART_A))))
    # Parting groove: from the hairline up to the crown.
    g = math.exp(-((a - PART_A) / 7.0) ** 2) * smooth(5, 25, e) * (1 - smooth(70, 88, e))
    t -= part * g
    return t


def build_cap(m, sk, hem, cols=36, rows=8, thick=cap_thickness, u_scale=1.0):
    a0 = 180.0  # seam at the back
    pole = m.vert(sk.surf(0, 90, thick(0, 90)))
    col_ids, col_uvs = [], []
    for i in range(cols):
        a = a0 + 360.0 * i / cols
        e_hem = sk.solve_e(a, hem(a), THICK * 0.4)
        ids, uvs = [], []
        for k in range(1, rows + 1):
            f = k / rows
            e = 90 - (90 - e_hem) * f
            taper = lerp(1.0, 0.35, smooth(0.78, 1.0, f))
            p = sk.surf(a, e, thick(a, e) * taper)
            ids.append(m.vert(p))
            uvs.append(((i / cols) * u_scale, 1.0 - f * 0.92))
        col_ids.append(ids)
        col_uvs.append(uvs)
    m.fan(pole, [c[0] for c in col_ids], (0.5, 1.0), [c[0] for c in col_uvs])
    m.grid(col_ids, col_uvs, wrap=True)


# ---------------------------------------------------------------- the swept fringe (lock tubes on the cap)

# (azimuth, elevation) stations; the lock centre sits a little above the cap surface.
FRINGE = [
    # her right (the big side): the fringe sweeps from the parting across the forehead to the temple
    ([(PART_A, 42), (2, 38), (-18, 34), (-38, 30), (-56, 22), (-70, 12)], 0.04, 0.013),
    ([(PART_A, 58), (-6, 54), (-30, 48), (-54, 38), (-76, 26), (-92, 12)], 0.042, 0.013),
    ([(PART_A, 74), (-24, 71), (-58, 60), (-84, 44), (-100, 28), (-110, 14)], 0.044, 0.012),
    # her left (the small side)
    ([(PART_A, 44), (30, 40), (46, 33), (62, 24), (74, 12)], 0.038, 0.012),
    ([(PART_A, 60), (40, 56), (64, 46), (86, 32), (100, 16)], 0.042, 0.012),
]


def fringe(m, sk, locks=FRINGE, lift=-0.001):
    """Half-embedded lock tubes: the centre sits on the cap surface so they shade as rounded
    ridges; both ends sink into the cap."""
    for n, (st, width, thick) in enumerate(locks):
        pts, outs = [], []
        last = len(st) - 1
        for i, (a, e) in enumerate(st):
            h = cap_thickness(a, e) + lift - (0.006 if i in (0, last) else 0.0)
            pts.append(sk.surf(a, e, h))
            outs.append(d_sph(a, e))
        m.tube(pts, outs, width, thick, lock_taper, u_range=((n % 4) * 0.25, (n % 4) * 0.25 + 0.25))


def back_sweep(m, sk, target, stations, width=0.036, thick=0.012):
    """Locks from the crown sweeping back and down into a tie / bun at `target`."""
    for n, st in enumerate(stations):
        pts = [sk.surf(a, e, cap_thickness(a, e) - 0.001 - (0.006 if i == 0 else 0.0)) for i, (a, e) in enumerate(st)]
        outs = [d_sph(a, e) for a, e in st]
        pts.append(Vector(target))
        outs.append((Vector(target) - C).normalized())
        m.tube(pts, outs, width, thick, lock_taper, u_range=((n % 4) * 0.25, (n % 4) * 0.25 + 0.25))


# ---------------------------------------------------------------- hanging hair (curtains)


def ridge(a, a0, a1, n):
    """0..1 lock profile across an azimuth span: n locks, peaks at the lock centres."""
    return 0.5 - 0.5 * math.cos(2 * math.pi * n * (a - a0) / (a1 - a0))


def curtain(m, sk, a0, a1, z_top, hem_fn, radius_fn, cols, rows, n_locks, ridge_amp, scallop, thick_top=0.005):
    """Rows of hanging hair between azimuths a0..a1 (about the vertical axis AX): the top row
    tucks under the cap, the hem scallops with the locks."""
    col_ids, col_uvs = [], []
    hems = [hem_fn(a0 + (a1 - a0) * i / cols) for i in range(cols + 1)]
    z_lo = min(hems)
    for i in range(cols + 1):
        a = a0 + (a1 - a0) * i / cols
        r_lock = ridge(a, a0, a1, n_locks)
        hem = hem_fn(a) - scallop * r_lock
        ids, uvs = [], []
        for k in range(rows + 1):
            f = k / rows
            z = lerp(z_top, hem, f)
            t = lerp(thick_top, THICK, smooth(0.0, 0.18, f))
            amp = ridge_amp * smooth(0.05, 0.3, f)
            edge = lerp(1.0, 0.4, smooth(0.86, 1.0, f))  # soft rounded hem
            x, y = radius_fn(a, z, sk, t + amp * r_lock, edge)
            ids.append(m.vert(Vector((x, y, z))))
            uvs.append((0.01 + 0.98 * i / cols, (z - z_lo) / (z_top - z_lo)))
        col_ids.append(ids)
        col_uvs.append(uvs)
    m.grid(col_ids, col_uvs)


def _at(table, z, k):
    s = sorted(table, key=lambda r: r[0])
    for a, b in zip(s, s[1:]):
        if a[0] <= z <= b[0]:
            return lerp(a[k], b[k], (z - a[0]) / (b[0] - a[0]))
    return s[0][k] if z < s[0][0] else s[-1][k]


# Long hair: (z, rx, ry, cy, y_min) — a half-ellipse behind the head, flattening to a slab
# behind the back (never through the shoulders).
LONG_PROFILE = [(1.72, 0.092, 0.098, 0.03, -1), (1.62, 0.104, 0.112, 0.03, -1), (1.55, 0.110, 0.118, 0.032, -1), (1.47, 0.124, 0.122, 0.036, 0.152), (1.30, 0.136, 0.118, 0.04, 0.150), (1.12, 0.142, 0.114, 0.045, 0.138)]


def long_radius(a, z, sk, t, edge):
    ar = math.radians(a)
    rx, ry, cy, ymin = (_at(LONG_PROFILE, z, k) for k in (1, 2, 3, 4))
    x, y = rx * math.sin(ar), cy - ry * math.cos(ar)
    r_e = math.hypot(x, y - AX.y)
    r = r_e + t * edge
    if z > 1.585:
        r = max(r, sk.side_r(a, z) + t * edge)
    x, y = (x / r_e) * r, AX.y + ((y - AX.y) / r_e) * r
    if ymin > 0:
        # Behind the back the curtain flattens to a slab clear of the shoulder blades (back columns only).
        k = smooth(1.5, 1.46, z) * smooth(60, 40, abs(a - 180.0))
        y = lerp(y, max(y, ymin + t * edge * 0.5), k)
    return x, y


def long_hem(a):
    """Long at the back, rising above the shoulders at the sides."""
    s = abs(a - 180.0)
    return lerp(1.14, 1.50, smooth(38, 72, s))


class BobRadius:
    """Falls straight from the widest ring around the ears, flaring a little at the hem."""

    def __init__(self, sk):
        self.sk = sk
        self.cache = {}

    def __call__(self, a, z, sk, t, edge):
        key = round(a, 3)
        if key not in self.cache:
            self.cache[key] = max(sk.side_r(a, zz) for zz in (1.625, 1.645, 1.665, 1.685))
        r = self.cache[key] + t * edge + 0.01 * smooth(1.66, 1.59, z)
        ar = math.radians(a)
        return r * math.sin(ar), AX.y - r * math.cos(ar)


# ---------------------------------------------------------------- the styles


def _finish(ctx, m, name):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in m.v], [], m.f)
    me.validate()
    uv = me.uv_layers.new(name="UVMap")
    for poly, uvs in zip(me.polygons, m.uv):
        for li, t in zip(poly.loop_indices, uvs):
            uv.data[li].uv = (min(1.0, max(0.0, t[0])), min(1.0, max(0.0, t[1])))
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    groups = {}
    for i, v in enumerate(me.vertices):
        ws = {k: x for k, x in hair_w(Vector(v.co)).items() if x > 0.002}
        tot = sum(ws.values()) or 1.0
        for bn, x in ws.items():
            g = groups.get(bn) or ob.vertex_groups.new(name=bn)
            groups[bn] = g
            g.add([i], x / tot, "REPLACE")
    ob.parent = ctx.arm
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = ctx.arm
    ob["part"] = "hair"
    return ob


def build_long(ctx):
    sk = Skull(ctx.body)
    m = Mesh()
    build_cap(m, sk, lambda a: hem_tucked(a, nape=1.615))
    fringe(m, sk)
    curtain(m, sk, 104, 256, 1.705, long_hem, long_radius, cols=30, rows=9, n_locks=5, ridge_amp=0.014, scallop=0.02)
    # Front hair: one wide flat sheet per side falling from behind the ear, lying against the
    # collarbone and upper chest (in front of the blouse), ending at z 1.30 with a rounded tip.
    sheet = [(0.098, 0.062, 1.65), (0.112, 0.012, 1.605), (0.114, -0.05, 1.55), (0.108, -0.108, 1.49), (0.098, -0.155, 1.43), (0.09, -0.19, 1.37), (0.085, -0.206, 1.33), (0.082, -0.212, 1.30)]

    def sheet_taper(f):
        return lerp(0.55, 1.0, smooth(0.0, 0.3, f)) * lerp(1.0, 0.5, smooth(0.7, 1.0, f))

    for s in (1, -1):
        pts = [Vector((s * x, y, z)) for x, y, z in sheet]
        outs = [Vector((p.x, p.y - AX.y, 0.0)).normalized() for p in pts]
        m.tube(pts, outs, 0.066, 0.015, sheet_taper, n=12, u_range=(0.5, 1.0), tip=0.02, ridges=2)
    return _finish(ctx, m, "hair_long")


def build_bob(ctx):
    sk = Skull(ctx.body)
    m = Mesh()

    def hem(a):
        a = wrap180(a)
        s = abs(a)
        if s <= 44:
            return hairline_z(a)
        return lerp(hairline_z(math.copysign(44, a)), 1.648, smooth(44, 58, s))

    build_cap(m, sk, hem)
    fringe(m, sk)
    curtain(m, sk, 50, 310, 1.682, lambda a: 1.586 - 0.006 * smooth(140, 180, abs(a - 180)), BobRadius(sk), cols=36, rows=5, n_locks=6, ridge_amp=0.009, scallop=0.007, thick_top=0.006)
    return _finish(ctx, m, "hair_bob")


BUN_C = Vector((0.0, 0.126, 1.612))


def bun(m, c, rx=0.05, ry=0.034, rz=0.042, coils=3):
    """A coiled low bun: a flattened sphere with three soft coil ridges, rings about the Y axis."""
    rings_n, seg = 6, 12
    ids, uvs = [], []
    for k in range(rings_n + 1):
        e = -80 + 152 * k / rings_n  # from against the head (y min) towards the back pole
        ring, ruv = [], []
        for i in range(seg):
            t = 2 * math.pi * i / seg
            ce, se = math.cos(math.radians(e)), math.sin(math.radians(e))
            coil = 1 + 0.12 * math.sin(coils * t + 2.2 * math.radians(e))
            x = rx * ce * math.cos(t) * coil
            z = rz * ce * math.sin(t) * coil
            y = ry * se
            ring.append(m.vert(c + Vector((x, y, z))))
            ruv.append((i / seg, k / rings_n))
        ids.append(ring)
        uvs.append(ruv)
    # Rings progress along +Y (away from the head) and run clockwise about it: reversed quads face out.
    for k in range(rings_n):
        a, b = ids[k], ids[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            ua, ub = uvs[k], uvs[k + 1]
            uj = (1.0, ua[j][1]) if j == 0 else ua[j]
            ujb = (1.0, ub[j][1]) if j == 0 else ub[j]
            m.face((a[i], b[i], b[j], a[j]), (ua[i], ub[i], ujb, uj))
    pole = m.vert(c + Vector((0, ry, 0)))
    last, luv = ids[-1], uvs[-1]
    for i in range(seg):
        j = (i + 1) % seg
        uj = (1.0, luv[j][1]) if j == 0 else luv[j]
        m.face((pole, last[j], last[i]), ((0.5, 1.0), uj, luv[i]))


def build_bun(ctx):
    sk = Skull(ctx.body)
    m = Mesh()
    build_cap(m, sk, lambda a: hem_tucked(a, nape=1.598))
    fringe(m, sk)
    # Hair gathered into the bun: locks sweeping from the crown and the sides down to the nape.
    back_sweep(m, sk, BUN_C + Vector((0, -0.012, 0.012)), [
        [(PART_A, 76), (120, 72), (160, 50), (175, 22), (178, -2)],
        [(PART_A, 70), (-100, 66), (-150, 46), (-170, 20), (-178, -2)],
        [(60, 36), (110, 24), (150, 8), (168, -10)],
        [(-66, 36), (-112, 24), (-150, 8), (-168, -10)],
    ], width=0.04, thick=0.011)
    bun(m, BUN_C)
    return _finish(ctx, m, "hair_bun")


TIE = Vector((0.0, 0.104, 1.716))


def build_ponytail(ctx):
    sk = Skull(ctx.body)
    m = Mesh()
    build_cap(m, sk, lambda a: hem_tucked(a, nape=1.598))
    fringe(m, sk)
    # Pulled back into the tie high on the back of the head.
    back_sweep(m, sk, TIE + Vector((0, -0.01, 0.004)), [
        [(PART_A, 78), (130, 80), (172, 62), (178, 42)],
        [(PART_A, 66), (-120, 76), (-168, 58), (-178, 40)],
        [(70, 40), (120, 44), (160, 44), (174, 36)],
        [(-74, 40), (-124, 44), (-162, 44), (-176, 36)],
    ], width=0.04, thick=0.011)
    # The tail: a pinched root at the tie, swelling, then falling to the shoulder blades.
    path = [(0.0, 0.104, 1.716), (0.0, 0.128, 1.712), (0.0, 0.156, 1.69), (0.004, 0.172, 1.65), (0.006, 0.178, 1.59), (0.004, 0.176, 1.52), (0.0, 0.172, 1.45), (-0.004, 0.17, 1.38), (-0.006, 0.17, 1.31), (-0.004, 0.172, 1.26)]
    pts = [Vector(p) for p in path]
    outs = [Vector((0, 0.7, 0.7)) for _ in pts]  # never parallel to the path (back-up at the root, back down the tail)

    def taper(f):
        root = lerp(0.42, 1.0, smooth(0.04, 0.25, f))
        return root * lerp(1.0, 0.3, smooth(0.6, 1.0, f))

    m.tube(pts, outs, 0.04, 0.03, taper, n=10, u_range=(0.0, 0.5), tip=0.012)
    # Three lock ridges along the tail: thin tubes riding on it.
    for n, (dx, dy) in enumerate(((0.024, 0.006), (-0.022, 0.01), (0.0, 0.024))):
        sub = [Vector((p.x + dx * taper(i / (len(pts) - 1)), p.y + dy * taper(i / (len(pts) - 1)), p.z)) for i, p in enumerate(pts[1:])]
        outs2 = [Vector((dx, dy, 0)).normalized() for _ in sub]
        m.tube(sub, outs2, 0.016, 0.009, taper, n=5, u_range=(0.5 + 0.16 * n, 0.66 + 0.16 * n))
    return _finish(ctx, m, "hair_ponytail")


# ---------------------------------------------------------------- the atlas (hair.png / hair_n.png)


def paint_atlas():
    """Repaint the Quaternius hair images in place: a smooth mid-grey strand mask (mid-grey =
    the chosen colour, lighter = sheen, darker = the shadow between locks) and a soft normal map."""
    try:
        import numpy as np
    except ImportError:
        print("PLUGIN hair.py: numpy missing, keeping the Quaternius atlas")
        return
    S = 1024
    rng = np.random.default_rng(122)
    u = (np.arange(S) + 0.5) / S
    v = (np.arange(S) + 0.5) / S
    U, V = np.meshgrid(u, v)
    lin = np.full((S, S), 0.37, dtype=np.float32)  # linear 0.37 -> the hair colour unchanged
    for freq, amp in ((3, 0.05), (7, 0.035), (16, 0.016), (37, 0.007)):
        ph = rng.uniform(0, 2 * math.pi)
        wob = 0.12 * np.sin(2 * math.pi * (1.5 * V) + rng.uniform(0, 6.0))
        lin += amp * np.sin(2 * math.pi * (freq * U) + ph + wob)
    # Sheen band across every lock (an angel ring on the cap, a highlight down the hanging hair).
    lin += 0.06 * np.exp(-(((V - 0.62) / 0.14) ** 2)) * (0.75 + 0.25 * np.sin(2 * math.pi * 9 * U))
    lin -= 0.05 * np.clip((0.12 - V) / 0.12, 0, 1)  # the tips a touch darker
    lin = np.clip(lin, 0.1, 0.8)
    srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    rgba = np.ones((S, S, 4), dtype=np.float32)
    rgba[:, :, 0] = rgba[:, :, 1] = rgba[:, :, 2] = srgb
    # Normal map: gentle grooves between strands (tangent-space, +Z up).
    slope = np.zeros((S, S), dtype=np.float32)
    for freq, amp in ((3, 0.35), (7, 0.25), (16, 0.1)):
        slope += amp * np.cos(2 * math.pi * freq * U + rng.uniform(0, 6.0))
    nx = np.clip(slope * 0.4, -0.5, 0.5)
    nz = np.sqrt(np.clip(1 - nx * nx, 0.0, 1.0))
    nrm = np.ones((S, S, 4), dtype=np.float32)
    nrm[:, :, 0] = nx * 0.5 + 0.5
    nrm[:, :, 1] = 0.5
    nrm[:, :, 2] = nz * 0.5 + 0.5
    out_dir = os.path.join(tempfile.gettempdir(), "lv-hair-atlas")
    os.makedirs(out_dir, exist_ok=True)
    for key, arr in (("T_Hair_2_BaseColor", rgba), ("T_Hair_2_Normal", nrm)):
        targets = [i for i in bpy.data.images if i.name.startswith(key)]
        if not targets:
            print("PLUGIN hair.py: image missing", key)
            continue
        path = os.path.join(out_dir, key + ".png")
        tmp = bpy.data.images.new("lv_painted", S, S, alpha=True)
        tmp.pixels = arr.ravel().tolist()
        tmp.filepath_raw = path
        tmp.file_format = "PNG"
        tmp.save()
        bpy.data.images.remove(tmp)
        for img in targets:
            if img.packed_files:
                img.unpack(method="REMOVE")
            img.filepath = path
            img.filepath_raw = path
            img.source = "FILE"
            img.reload()
            print("PLUGIN hair.py: painted", img.name, img.size[:])


_PAINTED = False


def _first(factory):
    def run(ctx):
        global _PAINTED
        if not _PAINTED:
            _PAINTED = True
            paint_atlas()
        return factory(ctx)

    return run


PIECES = {
    "hair_long": (_first(build_long), "hair"),
    "hair_bun": (_first(build_bun), "hair"),
    "hair_ponytail": (_first(build_ponytail), "hair"),
    "hair_bob": (_first(build_bob), "hair"),
}
