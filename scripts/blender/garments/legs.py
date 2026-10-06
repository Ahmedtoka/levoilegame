"""Legs garment plug-in: trousers, leggings and shoes (replaces the defaults by name).

trousers  straight-leg trousers: a seat shell over the hips that starts on the two leg
          tubes at the crotch (z 0.88, no cap) and flares into a 1.8 cm waistband rim
          (z 1.047-1.065, 6 mm proud, outside the tucked-in tops) with a small flat buckle
          at the front; two straight legs (same width from the thigh to the hem) with a
          crisp front crease (a hard-edged ridge), rings every 2-2.5 cm through the gusset
          and across the knee, and a clean closed hem at z 0.07. Weights: each tube is its
          own thigh / calf, the pelvis share grows from z 0.80 up through the seat (gusset),
          the knee blends over +-7.5 cm, the band rides mostly on the pelvis.
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
SEAT_Z0 = 0.90
SEAM_Z = 0.88          # the seat's lowest ring sits on the two leg tubes here (the crotch)
GUSSET_Z0 = 0.78       # below this a leg is all thigh; above, the pelvis share grows (gusset)
BAND_Z0, BAND_Z1 = 1.047, 1.065   # the proud rim of the waistband (1.8 cm tall)
BAND_EASE = 0.034      # the seat flares from SEAT_EASE to this under the rim (no ledge)
RIM = 0.006            # how far the rim stands proud of the seat (<= 8 mm)
BAND_OVER_BLOUSE = 0.008  # the band stays at least this far outside the tucked-in tops
SEAT_EASE = 0.03
FRONT_EASE = 0.014     # extra at the front of the seat top (z >= 0.95): the tucked hems swing there
KNEE_Z = 0.532         # calf bone head
KNEE_BLEND = 0.075     # thigh -> calf weights blend over +- this around the knee
KNEE_BACK_EASE = 0.006 # extra radius at the back of the knee
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


def _leg_ring(c, r, n, crease=None, shift=0.0, back=0.0):
    """Ring about +Z (CCW), slightly flatter front-to-back; with `crease` (a height, may be 0)
    the front point (-Y) becomes a ridge whose vertex is doubled (a hard edge once the seam
    quad is dropped). `back` adds radius at the back (+Y) only. Every ring of a loft must use
    the same mode (same point count)."""
    pts = []

    def put(aa, rr):
        rr += back * max(0.0, math.sin(aa)) ** 2
        pts.append(Vector((c.x + math.cos(aa) * rr, c.y + shift + math.sin(aa) * rr * 0.96, c.z)))

    for i in range(n):
        a = 2 * math.pi * i / n
        if crease is not None and i == (3 * n) // 4:
            da = math.radians(8)
            for aa, rr, dup in ((a - da, r, 1), (a, r + crease, 2), (a + da, r, 1)):
                for _ in range(dup):
                    put(aa, rr)
        else:
            put(a, r)
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


def _share(z):
    """Thigh share of the trousers by height: the gusset. 1 on the leg (z <= GUSSET_Z0), a
    LINEAR ramp to 0.06 at the top of the seat (z 1.00, where the tucked-in tops' hems are: they
    must stay inside), then 0.05 at the top of the band, so no ring moves differently from the
    one next to it and the band still leans on the hip it sits on. Linear, not smoothstep: the
    fabric over a thigh lifted 77 deg (Jog_Fwd_Loop's peak) compresses vertically by about
    share * lever arm, and a uniform slope keeps that just short of folding over."""
    t = max(0.0, min(1.0, (z - GUSSET_Z0) / (1.00 - GUSSET_Z0)))
    return 1 - 0.94 * t - 0.01 * _smooth(1.00, BAND_Z1, z)


def _column(ctx, z):
    """Torso column of the seat / band: the same pelvis -> spine_01 blend the tops use, so the
    tucked-in hems and the trousers move together when the torso bends."""
    return ctx.spine_weights(z)


def _tube_weights(ctx, p, sd):
    """One trouser leg: its own thigh / calf / foot (never the other leg's, even where the two
    tubes overlap near the crotch), the knee blended over +-7.5 cm, the gusset share above."""
    z = p.z
    th, ca, ft = "thigh_" + sd, "calf_" + sd, "foot_" + sd
    if z > KNEE_Z + KNEE_BLEND:
        w = {th: 1.0}
    elif z > KNEE_Z - KNEE_BLEND:
        t = _smooth(KNEE_Z + KNEE_BLEND, KNEE_Z - KNEE_BLEND, z)
        w = {th: 1 - t, ca: t}
    elif z > 0.12:
        w = {ca: 1.0}
    else:
        t = _smooth(0.12, 0.06, z)
        w = {ca: 1 - t, ft: t}
    s = _share(z)
    if s < 1:
        w = {k: v * s for k, v in w.items()}
        for k, v in _column(ctx, z).items():
            w[k] = w.get(k, 0) + v * (1 - s)
    return w


def _seat_weights(ctx, p):
    """Seat, band and buckle: the column plus the thigh share split left / right by x (the
    centre front / back is shared by both thighs)."""
    s = _share(p.z)
    g = _smooth(-0.025, 0.025, p.x)
    out = {k: v * (1 - s) for k, v in _column(ctx, p.z).items()}
    out["thigh_l"] = out.get("thigh_l", 0) + s * g
    out["thigh_r"] = out.get("thigh_r", 0) + s * (1 - g)
    return out


def _tube_ring_params(ctx, sd, z):
    """(centre, radius, crease, shift, back) of a trouser leg ring at height z."""
    H, K, A, at, tf = _leg_frame(ctx, sd)
    t = tf(z)
    r = _trouser_radius(t)
    # The thigh sits behind the bone: push the top rings back so they stay inside the seat.
    shift = 0.02 * (1 - _smooth(0.0, 0.45, t))
    crease = CREASE * _smooth(0.12, 0.3, t)
    c = at(z) + Vector(((1 if sd == "l" else -1) * LEG_SPREAD * _smooth(0.2, 0.7, t), 0, 0))
    # A little room at the back of the knee so the fold does not pinch when the knee bends.
    back = KNEE_BACK_EASE * max(0.0, 1 - ((z - KNEE_Z) / KNEE_BLEND) ** 2)
    return c, r, crease, shift, back


def build_trousers(ctx):
    _claim_name("trousers")
    b = ctx.Builder()
    roles = _Roles(b)
    n_leg = 12

    # --- legs: straight tubes from inside the seat to the hem, with the front crease.
    # Rings every 2 cm through the gusset (0.80-0.90) and across the knee (+-7.5 cm). The tube
    # ends 2 cm above the seam, inside the seat (higher rings sit above the hip joint and fold
    # the wrong way when the thigh swings).
    zs = [0.90, SEAM_Z, 0.86, 0.84, 0.82, 0.80, GUSSET_Z0, 0.74, 0.70, 0.66]
    zs += [KNEE_Z + KNEE_BLEND - 0.025 * i for i in range(7)]  # 0.607 .. 0.457
    zs += [0.40, 0.32, 0.24, 0.16, 0.104, HEM_Z]
    seam = {}
    for sd in ("l", "r"):
        rings = []
        for z in zs:
            c, r, crease, shift, back = _tube_ring_params(ctx, sd, z)
            ring = _leg_ring(c, r, n_leg, crease=crease, shift=shift, back=back)
            if z == SEAM_Z:
                seam[sd] = (ring, c, r, shift)
            rings.append(ring)
        rings.reverse()  # bottom-up: outward normals
        b.loft(rings)
        # Closed hem: an annulus turned 12 mm inward, facing down.
        hem = rings[0]
        c = sum(hem, Vector()) / len(hem)
        inner = [c + (p - c) * (1 - 0.012 / R_STRAIGHT) for p in hem]
        b.loft([inner, hem])
        roles.tag("leg_" + sd)

    # --- seat: starts ON the two tubes at the seam (its lowest ring is the outline of the union
    # of the two leg rings there, so there is no cap to warp when the legs split), and lofts up
    # through the hips into the waistband, which is the same surface with a small proud rim.
    slices = _hip_slices(ctx, SEAM_Z - 0.02, BAND_Z1 + 0.02)
    (ring_l, c_l, r_t, shift) = seam["l"]
    (ring_r, c_r, _, _) = seam["r"]

    def outside(p, c):
        return ((p.x - c.x) / r_t) ** 2 + ((p.y - c.y - shift) / (0.96 * r_t)) ** 2 > 1.0 + 1e-6

    keep_l = sorted((p for p in ring_l if outside(p, c_r)), key=lambda p: math.atan2(p.y - c_l.y - shift, p.x - c_l.x))
    keep_r = sorted((p for p in ring_r if outside(p, c_l)), key=lambda p: math.atan2(p.y - c_r.y - shift, p.x - c_r.x) % (2 * math.pi))
    half = 0.96 * r_t * math.sqrt(max(0.0, 1 - (c_l.x / r_t) ** 2))
    ymid = (c_l.y + c_r.y) / 2 + shift
    union = [Vector((0, ymid - half, SEAM_Z))] + keep_l + [Vector((0, ymid + half, SEAM_Z))] + keep_r
    dedup = []
    for p in union:
        if not dedup or (p - dedup[-1]).length > 1e-6:
            dedup.append(p)
    if (dedup[0] - dedup[-1]).length < 1e-6:
        dedup.pop()
    union = dedup
    n_seat = len(union)
    cy_u = sum(p.y for p in union) / n_seat
    angles = [math.atan2(p.y - cy_u, p.x) for p in union]

    # Measure the tops that are worn with the trousers where they overlap the band: the band
    # must stay outside them (>= BAND_OVER_BLOUSE).
    import bpy

    cy_b = sum(_col(slices, z, 3) for z in (1.03, 1.045, 1.06)) / 3
    top_r = [0.0] * n_seat
    for name in ("upper", "tee"):
        top = bpy.data.objects.get(name)
        if top is None:
            continue
        for v in top.data.vertices:
            p = v.co
            if 1.00 - 1e-4 <= p.z <= BAND_Z1 + 0.01:
                a = math.atan2(p.y - cy_b, p.x)
                d = math.hypot(p.x, p.y - cy_b)
                for i, ai in enumerate(angles):
                    if abs(((ai - a + math.pi) % (2 * math.pi)) - math.pi) < math.radians(20):
                        top_r[i] = max(top_r[i], d)

    def seat_ring(z):
        """Ellipse of the body slice at z plus the ease, sampled at the seam ring's angles."""
        base = SEAT_EASE + 0.008 * _smooth(0.97, 0.90, z)
        ease = base + (BAND_EASE - SEAT_EASE) * _smooth(1.00, BAND_Z0, z)
        rim = RIM * _smooth(BAND_Z0 - 0.007, BAND_Z0, z)
        front = FRONT_EASE * _smooth(0.95, 1.00, z)  # room for the tucked-in hems at the front
        rx, ry, cy = _col(slices, z, 1) + ease, _col(slices, z, 2) + ease, _col(slices, z, 3)
        pts = []
        for i, a in enumerate(angles):
            x, y = math.cos(a) * rx, math.sin(a) * ry
            d = math.hypot(x, y)
            d_min = (top_r[i] + BAND_OVER_BLOUSE) * _smooth(1.00, BAND_Z0, z)
            k = (max(d, d_min) + rim + front * max(0.0, -math.sin(a)) ** 2) / d
            pts.append(Vector((x * k, cy + y * k, z)))
        return pts

    seat_zs = [0.915, 0.94, 0.965, 0.99, 1.012, 1.03, BAND_Z0 - 0.007, BAND_Z0, BAND_Z1]
    first = seat_ring(0.915)
    # A blend ring eases the seat's lower edge onto the tubes (the ellipse is wider than them).
    blend = [Vector((u.x + (e.x - u.x) * 0.45, u.y + (e.y - u.y) * 0.45, SEAM_Z + 0.014)) for u, e in zip(union, first)]
    seat_rings = [union, blend] + [seat_ring(z) for z in seat_zs]
    b.loft(seat_rings)
    band1 = seat_rings[-1]
    inner_top = [Vector((math.cos(a) * (_col(slices, 1.06, 1) + 0.012), cy_b + math.sin(a) * (_col(slices, 1.06, 2) + 0.012), BAND_Z1)) for a in angles]
    b.loft([band1, inner_top])  # closed top (faces up: outer -> inner)
    # Crotch gusset: a small double-sided fin on the centre plane under the seam, between the
    # two inner thigh walls (inside both tubes at rest). Shared by both thighs, it stays between
    # the legs when they split and closes the slit under the seat.
    yf, yb = ymid - half, ymid + half
    fin = [Vector((0, yf, SEAM_Z)), Vector((0, ymid - half / 3, SEAM_Z - 0.022)), Vector((0, ymid + half / 3, SEAM_Z - 0.022)), Vector((0, yb, SEAM_Z)), Vector((0, ymid + half / 3, SEAM_Z)), Vector((0, ymid - half / 3, SEAM_Z))]
    i0 = b.add_ring(fin)
    for a, c, d in ((0, 1, 5), (2, 3, 4)):
        b.faces.append((i0[a], i0[c], i0[d]))
        b.faces.append((i0[a], i0[d], i0[c]))
    b.faces.append((i0[1], i0[2], i0[4], i0[5]))
    b.faces.append((i0[1], i0[5], i0[4], i0[2]))
    clear = [math.hypot(p.x, p.y - cy_b) - top_r[i] for i, p in enumerate(seat_rings[-2]) if top_r[i] > 0]
    print("LEGS seat ring n %d; band vs tops: min clearance %.4f m" % (n_seat, min(clear) if clear else -1))
    print("LEGS band rx %.3f ry %.3f cy %.3f" % (max(p.x for p in band1), (max(p.y for p in band1) - min(p.y for p in band1)) / 2, cy_b))

    # --- buckle: a small bevelled plate on the front of the band.
    zc = (BAND_Z0 + BAND_Z1) / 2
    y0 = min(p.y for p in band1)  # front
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
    roles.tag("seat")

    # Clearance report: the blouse must stay outside the seat (where it hangs over it).
    blouse = bpy.data.objects.get("upper")
    if blouse is not None:
        worst = 1.0
        for v in blouse.data.vertices:
            p = v.co
            if SEAT_Z0 <= p.z <= 0.995:
                rx, ry, cy = _col(slices, p.z, 1) + SEAT_EASE, _col(slices, p.z, 2) + SEAT_EASE, _col(slices, p.z, 3)
                a = math.atan2((p.y - cy) / ry, p.x / rx)
                seat_d = math.hypot(math.cos(a) * rx, math.sin(a) * ry)
                worst = min(worst, math.hypot(p.x, p.y - cy) - seat_d)
        print("LEGS seat vs blouse: min clearance %.4f m (positive = blouse outside)" % worst)

    _drop_degenerate(b)
    role_of = roles.lookup()

    def weights(p):
        role = role_of(p)
        if role == "seat":
            return _seat_weights(ctx, p)
        return _tube_weights(ctx, p, role[-1])

    return ctx.make_object("trousers", b, weights, "bottom")


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
