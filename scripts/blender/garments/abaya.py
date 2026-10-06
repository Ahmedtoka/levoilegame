"""Abaya, style A "classic with a front band" (garment plug-in for build_avatar.py).

Replaces three default pieces by name (the runtime needs no change):

  upper_abaya  ONE piece to the floor on the Bitmoji (chibi) body: a loose A-line body
               hanging straight from the shoulders, flaring to rx 0.325 / ry 0.27 at the
               hem (z 0.02), six soft vertical folds growing to 2 cm at the hem (half
               depth on the front half, so the knees-forward idle never shows the
               leggings), wide bell sleeves along the new (longer) arm bones to the
               hands' wrist, and a rounded collar around the exported neck (the UBC
               neck enlarged x1.6: sides 0.068, throat -0.01, nape 0.10 at z 1.49-1.51).
               Below the hips the cross-section is a soft superellipse (flatter front
               and back, 1 cm clear of the leggings at the knee in Idle without the
               runtime's skirt_f swing) and it is skinned like a skirt (ctx.leg_weights):
               the sides follow the legs, the front / back panels swing with skirt_f /
               skirt_b. Leggings stay underneath (modesty).
  cuffs        4 cm contrast cuffs worn OUTSIDE the sleeve ends (1.2 cm larger
               radius, skinned exactly like the sleeve end so the gap never changes).
  abaya_trim   2.5 cm contrast band down the centre front, from the collar to
               z 0.05 on the abaya's own surface, 3 mm proud of the cloth.

The chest, upper back, shoulders and collar sit INSIDE hijab_classic's drape hull
(scripts/blender/garments/hijab.py CHEST table + sleeve capsules) by >= 1 cm, so
the hijab lies over the abaya; the sleeve heads stay under its shoulder capsules.

Everything is a clean loft: big smooth shapes, no muscle detail. The body mesh is
only measured, never exported. Coordinates: Z up, the character faces -Y, left is +X.
"""

import math

import bpy

# ---------------------------------------------------------------- tuning
N_TORSO = 36            # ring segments: 6 per fold
N_SLEEVE = 16
FOLDS = 6
FOLD_HIP = 0.016        # fold amplitude at the hips (zero above the bust) ...
FOLD_HEM = 0.020        # ... growing to this at the hem
FOLD_FRONT = 0.5        # the front half folds at this fraction of the depth (knee room)
HEM_Z = 0.02            # just above the floor
NECK_EASE = 0.009       # neckline clearance around the exported neck
NECK_Z = 1.488          # neckline height (level): the roll tops out under the jaw (1.525) and
                        # inside the hijab's funnel at the nape
SLEEVE_X0 = 0.15        # sleeve root (capped), hidden inside the torso
SLEEVE_X1 = 0.63        # open end: 5 cm over the hands' wrist end (x 0.58)
SLEEVE_R = [(0.15, 0.072), (0.30, 0.076), (0.42, 0.084), (0.55, 0.094), (0.63, 0.100)]  # bell: radius by |x|
SLEEVE_DROP = 0.010     # the sleeve axis sits this much under the arm bone at the shoulder ...
SLEEVE_WRIST = (0.030, 1.405)   # ... and ends centred on the hands' wrist (y, z)
SLEEVE_FWD = 0.012      # the sleeve head sits a little forward of the arm axis (inside the torso)
CUFF_LEN = 0.040
CUFF_GAP = 0.012        # cuff radius - sleeve radius (>= 1 cm, no z-fighting)
BAND_HALF = 0.0125      # 2.5 cm band
BAND_PROUD = (0.0015, 0.0035)   # edges / top of the band over the cloth
TRIM_BOTTOM_Z = 0.05

_SPEC = {}


# ---------------------------------------------------------------- helpers


def _lerp(a, b, t):
    return a + (b - a) * t


def _table(rows, z):
    """Piecewise-linear lookup of (z, value) rows, clamped at the ends."""
    s = sorted(rows)
    if z <= s[0][0]:
        return s[0][1]
    for (z0, v0), (z1, v1) in zip(s, s[1:]):
        if z <= z1:
            return _lerp(v0, v1, (z - z0) / (z1 - z0))
    return s[-1][1]


def _release(name):
    """Free the piece's name: the registry renames our object AFTER creating it, while the
    default piece still holds the name, so without this the GLB would carry '<name>.001'
    (the runtime looks pieces up by exact name). The default is deleted by the registry."""
    old = bpy.data.objects.get(name)
    if old is not None:
        old.name = name + "_default"
        old.data.name = name + "_default"


# ---------------------------------------------------------------- the shared spec


def _spec(ctx):
    """Measured once per build: the exported neck, the arm bones and the body's width,
    plus the designed silhouette. All three pieces are cut from the same numbers."""
    key = id(ctx)
    if key in _SPEC:
        return _SPEC[key]
    smooth, Vector = ctx.smooth, ctx.Vector
    hip = ctx.HIP_Z   # above: torso skinning; below: skirt skinning
    pv, hs = ctx.HEAD_PIVOT, ctx.HEAD_SCALE

    def head_space(p):
        k = 1 + (hs - 1) * smooth(1.50, 1.55, p.z)
        return pv + (p - pv) * k

    # The neck as it is exported: the "head" piece (UBC head + neck, enlarged about HEAD_PIVOT
    # after the plug-ins run). Measured at the collar's height band.
    head = bpy.data.objects.get("head")
    src = head if head is not None else ctx.body
    verts = [head_space(v.co) for v in src.data.vertices if 1.44 <= v.co.z <= 1.60 and abs(v.co.x) < 0.12]
    band = [p for p in verts if NECK_Z - 0.004 <= p.z <= NECK_Z + 0.026]
    throat = min((p.y for p in band if abs(p.x) < 0.03), default=-0.01)
    nape = max((p.y for p in band if abs(p.x) < 0.03), default=0.11)
    side = max((abs(p.x) for p in band if abs(p.y - 0.03) < 0.06), default=0.07)
    n_front, n_back, n_rx = throat - NECK_EASE - 0.011, nape + NECK_EASE, side + NECK_EASE
    n_cy, n_ry = (n_front + n_back) / 2, (n_back - n_front) / 2
    print(f"ABAYA neck (exported, z {NECK_Z:.3f}-{NECK_Z + 0.026:.3f}): throat={throat:.4f} nape={nape:.4f} side={side:.4f} -> neckline rx={n_rx:.4f} ry={n_ry:.4f} cy={n_cy:.4f}")

    # Body width as a floor over the torso (the sleeves cover the shoulders, so only a little ease is needed).
    body = ctx.torso_sections(hip, 1.47, ease=0.0)
    b_rx = [(z, rx) for z, rx, ry, cy in body]

    # Designed silhouette by nominal height: half-width, centre-front y, centre-back y.
    zn = NECK_Z
    rx_t = [(HEM_Z, 0.325), (0.25, 0.305), (0.52, 0.295), (0.62, 0.285), (0.75, 0.272), (0.85, 0.258), (hip, 0.240), (1.10, 0.222), (1.22, 0.202), (1.30, 0.198), (1.36, 0.210), (1.40, 0.214), (1.46, 0.214), (1.475, 0.195), (1.482, 0.140), (zn, n_rx)]
    yf_t = [(HEM_Z, -0.250), (0.25, -0.246), (0.45, -0.245), (0.55, -0.242), (0.62, -0.226), (0.75, -0.196), (0.85, -0.168), (hip, -0.142), (1.10, -0.150), (1.22, -0.160), (1.26, -0.168), (1.38, -0.170), (1.40, -0.165), (1.44, -0.155), (1.46, -0.145), (1.475, -0.130), (1.482, -0.080), (zn, n_front)]
    yb_t = [(HEM_Z, 0.295), (0.25, 0.274), (0.52, 0.254), (0.75, 0.240), (0.85, 0.228), (hip, 0.215), (1.10, 0.200), (1.22, 0.180), (1.30, 0.168), (1.44, 0.165), (1.46, 0.160), (1.475, 0.150), (1.482, 0.130), (zn, n_back)]

    def section(z):
        """(rx, ry, cy) of the abaya ring at nominal height z (before folds)."""
        rx = _table(rx_t, z)
        if hip <= z < 1.47:
            rx = max(rx, _table(b_rx, z) + 0.016)
        yf, yb = _table(yf_t, z), _table(yb_t, z)
        return rx, (yb - yf) / 2, (yf + yb) / 2

    def exponent(z):
        """Superellipse exponent: round above the hips, flatter front/back down the skirt."""
        return 2.0 + 0.8 * smooth(0.92, 0.62, z)

    def fold_depth(z):
        if z >= hip:
            return FOLD_HIP * smooth(1.30, hip, z)
        return _lerp(FOLD_HIP, FOLD_HEM, (hip - z) / (hip - HEM_Z))

    def ring(z, dr=0.0, dz=0.0, n=N_TORSO):
        rx, ry, cy = section(z)
        rx, ry = rx + dr, ry + dr
        d = fold_depth(z) / max(rx, 1e-3)
        e = 2.0 / exponent(z)
        pts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ca, sa = math.cos(a), math.sin(a)
            # Crests at the centre front and back, troughs at the sides; shallower on the front half.
            k = 1 - d * math.cos(FOLDS * a) * (FOLD_FRONT if sa < 0 else 1.0)
            x = rx * math.copysign(abs(ca) ** e, ca)
            y = ry * math.copysign(abs(sa) ** e, sa)
            pts.append(Vector((x * k, cy + y * k, z + dz)))
        return pts

    def front_pt(z, x):
        """(y, z) of the abaya's front surface at x for the ring of nominal height z."""
        pts = ring(z)
        front = sorted((p for p in pts if p.y < section(z)[2]), key=lambda p: p.x)
        for p, q in zip(front, front[1:]):
            if p.x <= x <= q.x:
                f = (x - p.x) / max(q.x - p.x, 1e-6)
                return _lerp(p.y, q.y, f), _lerp(p.z, q.z, f)
        p = min(front, key=lambda p: p.y)
        return p.y, p.z

    def weights(p):
        """Torso skinning above the hips; skirt skinning (legs + swinging panels) below."""
        if p.z >= hip:
            return ctx.top_weights(p)
        rx, ry, cy = section(p.z)
        return ctx.leg_weights(p, rx, hip_z=hip, hem_z=HEM_Z + 0.02, ry=ry)

    # Sleeve axis along the arm bones (shoulder -> wrist), drooping to the hands' wrist.
    sh = Vector(ctx.bones["upperarm_l"].head_local)
    el = Vector(ctx.bones["lowerarm_l"].head_local)
    wr = Vector(ctx.bones["hand_l"].head_local)
    print(f"ABAYA arm bones: shoulder={tuple(round(v, 4) for v in sh)} elbow={tuple(round(v, 4) for v in el)} wrist={tuple(round(v, 4) for v in wr)}")
    a0, a1 = Vector((sh.x, sh.y, sh.z - SLEEVE_DROP)), Vector((SLEEVE_X1, SLEEVE_WRIST[0], SLEEVE_WRIST[1]))

    def axis(x):
        t = (abs(x) - a0.x) / (a1.x - a0.x)
        c = a0.lerp(a1, t)
        # The sleeve head sits forward of the arm so its cap stays inside the torso's back.
        return Vector((abs(x), c.y - SLEEVE_FWD * (1 - smooth(0.15, 0.40, abs(x))), c.z))

    def sleeve_r(x):
        return _table(SLEEVE_R, abs(x))

    t_el = (el.x - sh.x) / (wr.x - sh.x)   # the elbow's fraction along the arm (~0.5)

    def sleeve_weights(p):
        """Clavicle -> upper arm at the head, upper arm, blend across the real elbow, lower arm."""
        ax = abs(p.x)
        sd = "l" if p.x >= 0 else "r"
        if ax <= sh.x:
            return ctx.top_weights(p)
        t = (ax - sh.x) / (wr.x - sh.x)
        if t < 0.15:
            k = smooth(0.0, 0.15, t)
            return {"clavicle_" + sd: 0.6 * (1 - k), "upperarm_" + sd: 0.4 + 0.6 * k}
        if t < t_el - 0.08:
            return {"upperarm_" + sd: 1.0}
        if t < t_el + 0.08:
            k = smooth(t_el - 0.08, t_el + 0.08, t)
            return {"upperarm_" + sd: 1 - k, "lowerarm_" + sd: k}
        return {"lowerarm_" + sd: 1.0}

    spec = dict(hip=hip, zn=zn, section=section, ring=ring, front_pt=front_pt, weights=weights, axis=axis, sleeve_r=sleeve_r, sleeve_weights=sleeve_weights)
    _SPEC[key] = spec
    return spec


# ---------------------------------------------------------------- upper_abaya


def build_upper(ctx):
    _release("upper_abaya")
    sp = _spec(ctx)
    b = ctx.Builder()
    hip, zn = sp["hip"], sp["zn"]

    # Body, hem to neckline: dense rings where the silhouette turns (knees, hips, bust, shoulders, neck).
    zs = [HEM_Z, 0.12, 0.22, 0.32, 0.42, 0.50, 0.58, 0.66, 0.74, 0.82, 0.90, hip, 1.04, 1.10, 1.16, 1.22, 1.28, 1.34, 1.38, 1.42, 1.455, 1.47, 1.478, 1.483, zn]
    rings = [sp["ring"](z) for z in zs]
    # Rounded collar: a soft roll around the neckline, closing back in towards the neck.
    for dz, dr in ((0.005, 0.010), (0.011, 0.014), (0.017, 0.011), (0.021, 0.004), (0.022, -0.001)):
        rings.append(sp["ring"](zn, dr=dr, dz=dz))
    b.loft(rings)

    torso = ctx.make_object("upper_abaya", b, sp["weights"], "top")

    # Sleeves: a bell from the root to past the wrist, capped at the root (inside the torso).
    # Their own object (skinned along the arm bones), joined into the torso.
    xs = [SLEEVE_X0, 0.19, 0.23, 0.27, 0.31, 0.35, 0.39, 0.43, 0.47, 0.51, 0.55, 0.585, 0.61, SLEEVE_X1]
    s = ctx.Builder()
    for sgn in (1, -1):
        srings = []
        for x in xs:
            c = sp["axis"](x)
            r = sp["sleeve_r"](x)
            srings.append(ctx.ellipse((sgn * c.x, c.y, c.z), (0, 1, 0), (0, 0, 1), r, r, N_SLEEVE))
        if sgn < 0:
            srings.reverse()          # progress along +x again -> outward normals
            s.loft(srings, cap_end=True)
        else:
            s.loft(srings, cap_start=True)
    sleeves = ctx.make_object("upper_abaya_sleeves", s, sp["sleeve_weights"], "top")
    return ctx.join(torso, sleeves)


# ---------------------------------------------------------------- cuffs


def build_cuffs(ctx):
    _release("cuffs")
    sp = _spec(ctx)
    b = ctx.Builder()
    xa = SLEEVE_X1 + 0.004 - CUFF_LEN
    xb = SLEEVE_X1 + 0.004
    rs = sp["sleeve_r"](xa)
    rc = rs + CUFF_GAP
    for sgn in (1, -1):
        rings = []
        # (x, radius): an annulus just outside the sleeve, the band, then a small inner lip at the end.
        for x, r in ((xa, rs + 0.0015), (xa, rc), (xb, rc), (xb, rc - 0.006)):
            c = sp["axis"](x)
            rings.append(ctx.ellipse((sgn * c.x, c.y, c.z), (0, 1, 0), (0, 0, 1), r, r, N_SLEEVE))
        if sgn < 0:
            rings.reverse()
        b.loft(rings)
    # Same skinning as the sleeve end, so the 1.2 cm clearance holds in every pose.
    return ctx.make_object("cuffs", b, sp["sleeve_weights"], "trim")


# ---------------------------------------------------------------- abaya_trim


def build_trim(ctx):
    _release("abaya_trim")
    sp = _spec(ctx)
    b = ctx.Builder()
    zn = sp["zn"]
    # Stations down the centre front, on the abaya's own surface (by nominal ring height).
    zs = [zn - 0.003, 1.478, 1.46, 1.44, 1.42, 1.39, 1.36, 1.32, 1.27, 1.21, 1.15, 1.09, 1.03, 0.97, 0.90, 0.82, 0.73, 0.63, 0.52, 0.42, 0.32, 0.22, 0.13, TRIM_BOTTOM_Z]
    xs = (-BAND_HALF, -BAND_HALF + 0.003, BAND_HALF - 0.003, BAND_HALF)
    e, t = BAND_PROUD
    rows = []
    for z in zs:
        row = []
        for i, x in enumerate(xs):
            y, zz = sp["front_pt"](z, x)
            row.append(ctx.Vector((x, y - (e if i in (0, 3) else t), zz)))
        rows.append(row)
    ids = [b.add_ring(r) for r in rows]
    for k in range(len(ids) - 1):
        up, lo = ids[k], ids[k + 1]
        for c in range(3):
            b.faces.append((lo[c], lo[c + 1], up[c + 1], up[c]))   # faces -Y (the front)
    # Same skinning as the cloth under it, so it never lifts off.
    return ctx.make_object("abaya_trim", b, sp["weights"], "trim")


PIECES = {"upper_abaya": (build_upper, "top"), "cuffs": (build_cuffs, "trim"), "abaya_trim": (build_trim, "trim")}
