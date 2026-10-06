"""Legs garment plug-in: trousers, leggings and shoes (replaces the defaults by name).

trousers  straight-leg trousers: a seat shell over the hips, a visible 3.5 cm waistband
          (z 1.03-1.065) that sits >= 1 cm outside the blouse with a small flat buckle at
          the front, two straight legs (same width from the thigh to the hem) with a
          crisp front crease (a hard-edged ridge) and a clean closed hem at z 0.07.
leggings  a snug tube per leg (6 mm ease), hip to ankle, tapering into the shoe.
shoes     closed flats with a 2.5 cm heel block, a thin sole edge and a rounded toe,
          standing on the floor (lowest point z = 0) in the rest / idle pose.

Coordinates: Blender Z-up, the character faces -Y, her left is +X (metres).
Modesty: the trousers reach the ankles under the hem, the leggings are never skin
(they are the `bottom` colour) and run from inside the blouse / skirt to inside the shoe.
"""

import math

from mathutils import Vector

# Leg radius by fraction of the way down (0 = hip joint, 1 = ankle), UBC female (see build_avatar.py).
LEG_RADIUS = [(0.0, 0.108), (0.25, 0.092), (0.5, 0.072), (0.75, 0.066), (1.0, 0.052)]

TROUSER_EASE = 0.024   # room over the thigh (the legs almost touch there, as on the body)
KNEE_EASE = 0.014      # from the knee down (so the two legs read as two legs, not one column)
R_STRAIGHT = 0.082     # the straight leg's radius (knee to hem): no taper, no flare
LEG_SPREAD = 0.014     # the tubes drift outward towards the hem (a clear gap between the legs)
HEM_Z = 0.07
CREASE = 0.0045        # front crease ridge height
SEAT_Z0, SEAT_Z1 = 0.90, 1.03
BAND_Z0, BAND_Z1 = 1.03, 1.065
BAND_EASE = 0.052      # over the body: >= 1 cm outside the blouse (body + ~3.5 cm there)
BAND_OVER_BLOUSE = 0.012
SEAT_EASE = 0.03
LEGGING_EASE = 0.006
HEEL = 0.025           # heel block height
SOLE = 0.006           # sole edge thickness


def _at(table, t):
    s = sorted(table)
    for (a, ra), (b, rb) in zip(s, s[1:]):
        if a <= t <= b:
            return ra + (rb - ra) * (t - a) / (b - a)
    return s[0][1] if t < s[0][0] else s[-1][1]


def _drop_degenerate(b):
    """Faces with two coincident corners (ridge seams, collapsed sole points) are dropped."""
    keep = []
    for f in b.faces:
        pts = [b.verts[i] for i in f]
        ok = True
        for i in range(len(pts)):
            for j in range(i + 1, len(pts)):
                if (pts[i] - pts[j]).length < 1e-6:
                    ok = False
        if ok:
            keep.append(f)
    b.faces = keep


def _dominant(body):
    names = {g.index: g.name for g in body.vertex_groups}
    out = {}
    for v in body.data.vertices:
        if v.groups:
            g = max(v.groups, key=lambda g: g.weight)
            out[v.index] = names[g.group]
    return out


def _hip_slices(ctx, z0, z1, step=0.01, bones=("pelvis", "thigh_l", "thigh_r", "spine_01")):
    """(z, rx, ry, cy) of the hips / seat from the body (pelvis + thigh vertices only: no hands)."""
    dom = _dominant(ctx.body)
    pts = [v.co.copy() for v in ctx.body.data.vertices if dom.get(v.index, "") in bones and z0 - 0.03 <= v.co.z <= z1 + 0.03 and abs(v.co.x) < 0.25]
    out = []
    z = z0
    while z <= z1 + 1e-6:
        sl = [p for p in pts if abs(p.z - z) < 0.015]
        if len(sl) >= 6:
            rx = max(abs(p.x) for p in sl)
            ys = [p.y for p in sl]
            out.append((z, rx, (max(ys) - min(ys)) / 2, (max(ys) + min(ys)) / 2))
        z += step
    sm = []
    for i in range(len(out)):
        nb = out[max(0, i - 2): i + 3]
        sm.append((out[i][0], sum(r[1] for r in nb) / len(nb), sum(r[2] for r in nb) / len(nb), sum(r[3] for r in nb) / len(nb)))
    return sm


def _claim_name(name):
    """The default piece of the same name still exists while the plug-in builds (the registry
    removes it afterwards): move it and its mesh out of the way so the new object and mesh get
    the exact name (otherwise Blender exports `trousers.001`, which the runtime never finds)."""
    import bpy

    old = bpy.data.objects.get(name)
    if old is not None:
        old.name = name + "_default"
    me = bpy.data.meshes.get(name)
    if me is not None:
        me.name = name + "_default"


def _col(table, z, k):
    s = sorted(table, key=lambda r: r[0])
    for a, b in zip(s, s[1:]):
        if a[0] <= z <= b[0]:
            return a[k] + (b[k] - a[k]) * (z - a[0]) / (b[0] - a[0])
    return s[0][k] if z < s[0][0] else s[-1][k]


# ---------------------------------------------------------------- legs (shared by trousers and leggings)


def _leg_frame(ctx, sd):
    """Hip, knee, ankle joints and a point-at-height function along the leg bones."""
    H, K, A = (Vector(ctx.bones[n + "_" + sd].head_local) for n in ("thigh", "calf", "foot"))

    def at(z):
        if z >= K.z:
            return K.lerp(H, (z - K.z) / (H.z - K.z)) if z <= H.z else H + Vector((0, 0, z - H.z))
        d = A - K
        return K + d * ((z - K.z) / d.z)

    def t(z):
        return max(0.0, min(1.2, (H.z - z) / (H.z - A.z)))

    return H, K, A, at, t


def _leg_ring(c, r, n, crease=None, shift=0.0):
    """Ring about +Z (CCW), slightly flatter front-to-back; with `crease` (a height, may be 0)
    the front point (-Y) becomes a ridge whose vertex is doubled (a hard edge once the seam
    quad is dropped). Every ring of a loft must use the same mode (same point count)."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        if crease is not None and i == (3 * n) // 4:
            da = math.radians(8)
            for aa, rr, dup in ((a - da, r, 1), (a, r + crease, 2), (a + da, r, 1)):
                for _ in range(dup):
                    pts.append(Vector((c.x + math.cos(aa) * rr, c.y + shift + math.sin(aa) * rr * 0.96, c.z)))
        else:
            pts.append(Vector((c.x + math.cos(a) * r, c.y + shift + math.sin(a) * r * 0.96, c.z)))
    return pts


def _trouser_radius(t):
    k_top = 0.88 + 0.12 * _smooth(0.0, 0.3, t)
    ease = TROUSER_EASE + (KNEE_EASE - TROUSER_EASE) * _smooth(0.3, 0.5, t)
    return max(R_STRAIGHT, _at(LEG_RADIUS, t) * k_top + ease)


def _smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- trousers


class _Roles:
    """Tags every vertex of a Builder with the role it was built as; looked up by position
    (nearest point) from the weight function, which only sees positions."""

    def __init__(self, b):
        self.b, self.n, self.tags = b, 0, []

    def tag(self, role):
        self.tags += [role] * (len(self.b.verts) - self.n)
        self.n = len(self.b.verts)

    def lookup(self):
        from mathutils.kdtree import KDTree

        kd = KDTree(len(self.b.verts))
        for i, v in enumerate(self.b.verts):
            kd.insert(v, i)
        kd.balance()
        return lambda p: self.tags[kd.find(p)[1]]


def build_trousers(ctx):
    _claim_name("trousers")
    b = ctx.Builder()
    roles = _Roles(b)
    n_leg = 12

    # --- legs: straight tubes from inside the seat to the hem, with the front crease.
    zs = [0.955, 0.932, 0.90, 0.86, 0.80, 0.72, 0.64, 0.56, 0.48, 0.40, 0.32, 0.24, 0.16, 0.104, HEM_Z]
    for sd in ("l", "r"):
        H, K, A, at, tf = _leg_frame(ctx, sd)
        rings = []
        for z in zs:
            t = tf(z)
            r = _trouser_radius(t)
            # The thigh sits behind the bone: push the top rings back so they stay inside the seat.
            shift = 0.02 * (1 - _smooth(0.0, 0.45, t))
            crease = CREASE * _smooth(0.12, 0.3, t)
            c = at(z) + Vector(((1 if sd == "l" else -1) * LEG_SPREAD * _smooth(0.2, 0.7, t), 0, 0))
            rings.append(_leg_ring(c, r, n_leg, crease=crease, shift=shift))
        rings.reverse()  # bottom-up: outward normals
        b.loft(rings)
        # Closed hem: an annulus turned 12 mm inward, facing down.
        hem = rings[0]
        c = sum(hem, Vector()) / len(hem)
        inner = [c + (p - c) * (1 - 0.012 / R_STRAIGHT) for p in hem]
        b.loft([inner, hem])
    roles.tag("leg")

    # --- seat: the hips from z 0.90 to the band, with a shallow cap closing the crotch.
    slices = _hip_slices(ctx, SEAT_Z0 - 0.02, BAND_Z1 + 0.02)
    n_seat = 24
    seat_zs = [0.90, 0.925, 0.95, 0.98, 1.005, SEAT_Z1]
    seat_rings = []
    for z in seat_zs:
        ease = SEAT_EASE + 0.008 * _smooth(0.97, 0.90, z)
        seat_rings.append(ctx.ellipse((0, _col(slices, z, 3), z), (1, 0, 0), (0, 1, 0), _col(slices, z, 1) + ease, _col(slices, z, 2) + ease, n_seat))
    ids = b.loft(seat_rings)
    b.cap(ids[0], seat_rings[0], flip=True, point=Vector((0, _col(slices, 0.90, 3), 0.88)))
    roles.tag("seat")

    # --- waistband: 1.03-1.065, >= 1 cm outside the blouse, a ledge over the seat and a closed top.
    rx_b = max(_col(slices, z, 1) for z in (1.02, 1.03, 1.045, 1.06, 1.07)) + BAND_EASE
    ry_b = max(_col(slices, z, 2) for z in (1.02, 1.03, 1.045, 1.06, 1.07)) + BAND_EASE
    cy_b = sum(_col(slices, z, 3) for z in (1.03, 1.045, 1.06)) / 3
    # Measure the real blouse where it overlaps the band and push the band outside it.
    import bpy

    blouse = bpy.data.objects.get("upper")
    band_radial = [1.0] * n_seat
    if blouse is not None:
        sect = [0.0] * n_seat
        for v in blouse.data.vertices:
            p = v.co
            if BAND_Z0 - 0.01 <= p.z <= BAND_Z1 + 0.01:
                a = math.atan2(p.y - cy_b, p.x) % (2 * math.pi)
                i = int(round(a / (2 * math.pi) * n_seat)) % n_seat
                d = math.hypot(p.x, p.y - cy_b)
                sect[i] = max(sect[i], d)
        # Fill the gaps from the neighbours and use the max of the estimate and the measure.
        for i in range(n_seat):
            if sect[i] == 0.0:
                sect[i] = max(sect[(i - 1) % n_seat], sect[(i + 1) % n_seat])
        for i in range(n_seat):
            a = 2 * math.pi * i / n_seat
            est = math.hypot(math.cos(a) * rx_b, math.sin(a) * ry_b)
            band_radial[i] = max(est, max(sect[i], sect[(i - 1) % n_seat], sect[(i + 1) % n_seat]) + BAND_OVER_BLOUSE)
        print("LEGS band vs blouse: min clearance %.4f m" % min(band_radial[i] - sect[i] for i in range(n_seat) if sect[i] > 0))
    else:
        for i in range(n_seat):
            a = 2 * math.pi * i / n_seat
            band_radial[i] = math.hypot(math.cos(a) * rx_b, math.sin(a) * ry_b)
    # Smooth the band outline (3 taps) so a single blouse vertex never makes a bump.
    band_radial = [(band_radial[(i - 1) % n_seat] + 2 * band_radial[i] + band_radial[(i + 1) % n_seat]) / 4 for i in range(n_seat)]

    def band_ring(z, scale=1.0):
        return [Vector((math.cos(2 * math.pi * i / n_seat) * band_radial[i] * scale, cy_b + math.sin(2 * math.pi * i / n_seat) * band_radial[i] * scale, z)) for i in range(n_seat)]

    band0, band1 = band_ring(BAND_Z0), band_ring(BAND_Z1)
    b.loft([seat_rings[-1], band0])          # ledge under the band (faces down: inner -> outer)
    b.loft([band0, band1])                   # the band itself
    inner_top = ctx.ellipse((0, cy_b, BAND_Z1), (1, 0, 0), (0, 1, 0), _col(slices, 1.06, 1) + 0.012, _col(slices, 1.06, 2) + 0.012, n_seat)
    b.loft([band1, inner_top])               # closed top (faces up: outer -> inner)
    print("LEGS band rx %.3f ry %.3f cy %.3f (body rx %.3f ry %.3f)" % (max(band_radial), band_radial[6], cy_b, rx_b - BAND_EASE, ry_b - BAND_EASE))

    # --- buckle: a small bevelled plate on the front of the band.
    zc = (BAND_Z0 + BAND_Z1) / 2
    y0 = cy_b - band_radial[18]  # front (angle 270 deg)
    bw, bh = 0.017, 0.012
    n_bk = 12

    def plate(scale, y):
        pts = []
        for i in range(n_bk):
            a = 2 * math.pi * i / n_bk
            c, s = math.cos(a), math.sin(a)
            pts.append(Vector((math.copysign(abs(c) ** 0.55, c) * bw * scale, y, zc + math.copysign(abs(s) ** 0.55, s) * bh * scale)))
        return pts

    b.loft([plate(1.0, y0 + 0.002), plate(0.82, y0 - 0.004)], cap_end=True)
    # A raised centre bar across the buckle.
    bar = [Vector((x, y0 - 0.004 - dy, zc + z)) for x, z, dy in ((-0.003, -0.009, 0), (0.003, -0.009, 0), (0.003, 0.009, 0), (-0.003, 0.009, 0))]
    top = [Vector((p.x * 0.7, p.y - 0.0025, p.z)) for p in bar]
    b.loft([bar, top], cap_end=True)
    roles.tag("band")

    # Clearance report: the blouse must stay outside the seat (where it hangs over it).
    if blouse is not None:
        worst = 1.0
        for v in blouse.data.vertices:
            p = v.co
            if SEAT_Z0 <= p.z <= BAND_Z0 - 0.005:
                rx, ry, cy = _col(slices, p.z, 1) + SEAT_EASE, _col(slices, p.z, 2) + SEAT_EASE, _col(slices, p.z, 3)
                a = math.atan2((p.y - cy) / ry, p.x / rx)
                seat_d = math.hypot(math.cos(a) * rx, math.sin(a) * ry)
                worst = min(worst, math.hypot(p.x, p.y - cy) - seat_d)
        print("LEGS seat vs blouse: min clearance %.4f m (positive = blouse outside)" % worst)

    _drop_degenerate(b)
    role_of = roles.lookup()

    def weights(p):
        role = role_of(p)
        if role == "band":
            # Band + buckle ride with the torso column like the blouse does.
            return ctx.spine_weights(min(p.z, BAND_Z1))
        if role == "seat":
            return _seat_weights(ctx, p, slices)
        out = ctx.leg_tube_weights(p)
        # The tube's top rings (inside the seat, above the hip joint) lean on the pelvis so they
        # do not swing out through the seat / a blouse hem with the thigh.
        k = 0.5 * _smooth(0.90, 0.96, p.z)
        if k > 0:
            out = {bn: w * (1 - k) for bn, w in out.items()}
            out["pelvis"] = out.get("pelvis", 0) + k
        return out

    return ctx.make_object("trousers", b, weights, "bottom")


def _seat_weights(ctx, p, slices):
    z = p.z
    # Thigh share grows from the band down to the crotch; it stays moderate where a blouse
    # (pelvis-weighted) may still hang over the seat, so the seat does not swing through it.
    t = _smooth(SEAT_Z1, 0.90, z)
    col = ctx.spine_weights(z)
    fl = math.exp(-((p.x - 0.089) / 0.075) ** 2)
    fr = math.exp(-((p.x + 0.089) / 0.075) ** 2)
    share = 0.9 * t
    out = {k: w * (1 - share) for k, w in col.items()}
    out["thigh_l"] = out.get("thigh_l", 0) + share * fl / (fl + fr)
    out["thigh_r"] = out.get("thigh_r", 0) + share * fr / (fl + fr)
    return out


# ---------------------------------------------------------------- leggings


def build_leggings(ctx):
    _claim_name("leggings")
    b = ctx.Builder()
    n = 12
    zs = [0.99, 0.96, 0.932, 0.88, 0.80, 0.70, 0.60, 0.532, 0.45, 0.36, 0.27, 0.19, 0.14, 0.104, 0.08, 0.06]
    for sd in ("l", "r"):
        H, K, A, at, tf = _leg_frame(ctx, sd)
        rings = []
        for z in zs:
            t = tf(z)
            if z > 0.14:
                k_top = 0.9 + 0.1 * _smooth(0.3, 0.5, t)
                r = _at(LEG_RADIUS, t) * k_top + LEGGING_EASE
            else:
                # The ankle narrows into the shoe's cuff (0.060 at z 0.14 -> 0.042 at the end).
                r = _col(((0.14, 0.060), (A.z, 0.054), (0.08, 0.046), (0.06, 0.042)), z, 1)
            shift = 0.012 * (1 - _smooth(0.0, 0.3, t))
            rings.append(_leg_ring(at(z), r, n, shift=shift))
        rings.reverse()
        b.loft(rings)
    return ctx.make_object("leggings", b, ctx.leg_tube_weights, "bottom")


# ---------------------------------------------------------------- shoes


def _shoe_ring(cx, y, hw, zb, zt, px, k, zbot):
    """Closed cross-section (CCW about -Y): a rounded arch from +X over the top to -X,
    then the sole edge and the heel block (k < 1) or flat sole, back to +X."""
    pts = []
    for i in range(7):
        a = math.pi * i / 6
        c, s = math.cos(a), math.sin(a)
        pts.append(Vector((cx + math.copysign(abs(c) ** px, c) * hw, y, zb + (zt - zb) * s)))
    lip = 1.04 * hw
    kw = k * hw
    zs = zb - SOLE
    for x, z in ((-lip, zb), (-lip, zs), (-kw, zs), (-kw, zbot), (kw, zbot), (kw, zs), (lip, zs), (lip, zb)):
        pts.append(Vector((cx + x, y, z)))
    return pts


# Stations heel -> toe for the left foot (y, half-width, upper bottom z, top z, arch power, heel block k, bottom z).
SHOE_STATIONS = [
    (0.100, 0.016, HEEL, 0.050, 0.85, 0.90, 0.012),   # heel back: the block's bottom edge is chamfered
    (0.096, 0.034, HEEL, 0.072, 0.80, 0.90, 0.006),   # so the heel rolls instead of digging in
    (0.088, 0.044, HEEL, 0.082, 0.70, 0.90, 0.0),
    (0.062, 0.052, HEEL, 0.088, 0.60, 0.90, 0.0),
    (0.052, 0.053, HEEL, 0.088, 0.60, 0.90, 0.0),
    (0.044, 0.053, HEEL - 0.003, 0.087, 0.60, 1.04, HEEL - 0.003 - SOLE),
    (0.020, 0.052, 0.014, 0.078, 0.62, 1.04, 0.014 - SOLE),
    (-0.010, 0.051, 0.008, 0.064, 0.66, 1.04, 0.002),
    (-0.045, 0.051, SOLE, 0.050, 0.70, 1.04, 0.0),
    (-0.085, 0.050, SOLE, 0.040, 0.75, 1.04, 0.0),
    (-0.120, 0.046, SOLE, 0.032, 0.80, 1.04, 0.0),
    (-0.150, 0.035, SOLE + 0.001, 0.023, 0.90, 1.04, 0.001),
    (-0.168, 0.016, SOLE + 0.004, 0.016, 1.0, 1.04, 0.006),
]


def build_shoes(ctx):
    _claim_name("shoes")
    b = ctx.Builder()
    for sd in ("l", "r"):
        cx = ctx.bones["foot_" + sd].head_local.x
        rings = [_shoe_ring(abs(cx), y, hw, zb, zt, px, k, zbot) for y, hw, zb, zt, px, k, zbot in SHOE_STATIONS]
        if cx < 0:
            rings = [[Vector((-p.x, p.y, p.z)) for p in reversed(r)] for r in rings]
        b.loft(rings, cap_start=True, cap_end=True)  # heel -> toe runs along -Y: outward normals
        # Ankle cuff: the collar the leggings / trousers hem go into (slightly flared at the top).
        ay = ctx.bones["foot_" + sd].head_local.y - 0.004
        b.loft([ctx.ellipse((cx, ay, z), (1, 0, 0), (0, 1, 0), r, r + 0.004, 14) for z, r in ((0.040, 0.049), (0.070, 0.052), (0.095, 0.056))])
    _drop_degenerate(b)
    print("LEGS shoes lowest z %.4f toe y %.3f heel y %.3f" % (min(v.z for v in b.verts), min(v.y for v in b.verts), max(v.y for v in b.verts)))

    def w(p):
        # The heel, cuff and instep belong to the foot bone; only the toe box bends with the ball.
        sd = "l" if p.x >= 0 else "r"
        t = _smooth(-0.07, -0.14, p.y)
        return {"foot_" + sd: 1 - t * 0.7, "ball_" + sd: t * 0.7}

    return ctx.make_object("shoes", b, w, "shoes")


PIECES = {
    "trousers": (build_trousers, "bottom"),
    "leggings": (build_leggings, "bottom"),
    "shoes": (build_shoes, "shoes"),
}
