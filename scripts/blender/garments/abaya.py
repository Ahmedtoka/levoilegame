"""Abaya, style A "classic with a front band" (garment plug-in for build_avatar.py).

Replaces three default pieces by name (the runtime needs no change):

  upper_abaya  A loose A-line body hanging straight from the shoulders down to hip
               height (hem at HIP_Z - 0.02, wide enough for skirt_flare to tuck under
               it), six soft vertical folds, wide bell sleeves that widen to the wrist,
               and a rounded collar that closes at the base of the jaw (the neckline
               dips at the front, under the chin, and rises at the nape).
  cuffs        4 cm contrast cuffs worn OUTSIDE the sleeve ends (1.2 cm larger
               radius, skinned exactly like the sleeve end so the gap never changes).
  abaya_trim   2.5 cm contrast band down the centre front, from the collar to
               z 0.05: 3 mm proud of the abaya, then over the skirt_flare below the hem
               (that part is skinned with ctx.leg_weights like the skirt itself).

The chest, upper back and collar are sized to sit INSIDE hijab_classic's drape and
chin wrap (6-8 mm), so the hijab lies over the abaya; only the shoulders and sleeve
heads, which are wider than the drape cone, come out of it.

Everything is a clean loft: big smooth shapes, no muscle detail. The body mesh is
only measured, never exported. Coordinates: Z up, the character faces -Y, left is +X.
"""

import math
import sys

import bpy

# ---------------------------------------------------------------- tuning
N_TORSO = 36            # ring segments: 6 per fold
N_SLEEVE = 16
FOLDS = 6
FOLD_DEPTH = 0.016      # fold amplitude at the hem (m); zero above the bust
NECK_EASE = 0.009       # neckline clearance around the (enlarged) neck
NECK_TILT = 0.028       # the neckline is this much lower at the front than at the back
SLEEVE_X0 = 0.15        # sleeve root (capped), hidden inside the torso
SLEEVE_X1 = 0.655       # open end, just past the wrist (|x| ~ 0.64)
SLEEVE_R = [(0.15, 0.076), (0.30, 0.079), (0.42, 0.085), (0.55, 0.093), (0.655, 0.100)]  # bell: radius by |x|
SLEEVE_FWD = 0.016      # the sleeve head sits a little forward of the arm axis (inside the torso)
CUFF_LEN = 0.040
CUFF_GAP = 0.012        # cuff radius - sleeve radius (>= 1 cm, no z-fighting)
BAND_HALF = 0.0125      # 2.5 cm band
BAND_PROUD = (0.0015, 0.0035)   # edges / top of the band over the abaya cloth
BAND_PROUD_SKIRT = (0.004, 0.0075)
TRIM_BOTTOM_Z = 0.05

# Hip ring of skirt_flare (z, rx, ry); the weights use it, the band's path measures the real mesh.
SKIRT_FLARE = [(1.06, 0.182, 0.136), (0.95, 0.205, 0.150), (0.80, 0.225, 0.165), (0.52, 0.262, 0.195), (0.25, 0.292, 0.222), (0.02, 0.318, 0.246)]

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


def _at(sections, z, k):
    s = sorted(sections, key=lambda r: r[0])
    for a, b in zip(s, s[1:]):
        if a[0] <= z <= b[0]:
            return _lerp(a[k], b[k], (z - a[0]) / (b[0] - a[0]))
    return s[0][k] if z < s[0][0] else s[-1][k]


def _skirt_table():
    main = sys.modules.get("__main__")
    return getattr(main, "SKIRT_FLARE", None) or SKIRT_FLARE


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
    """Measured once per build: the neck, the sleeve axis and the skirt's front line,
    plus the designed silhouette. All three pieces are cut from the same numbers."""
    key = id(ctx)
    if key in _SPEC:
        return _SPEC[key]
    smooth = ctx.smooth
    hem = ctx.HIP_Z - 0.02
    pv, hs = ctx.HEAD_PIVOT, ctx.HEAD_SCALE

    def head_space(p):
        k = 1 + (hs - 1) * smooth(1.50, 1.55, p.z)
        return pv + (p - pv) * k

    # The neck as it is exported (the head + neck piece is enlarged about HEAD_PIVOT):
    # throat front just under the sternal notch, nape and sides at the top of the neck.
    verts = [head_space(v.co) for v in ctx.body.data.vertices if 1.49 <= v.co.z <= 1.60 and abs(v.co.x) < 0.1]
    throat = min(p.y for p in verts if 1.50 <= p.z <= 1.528 and abs(p.x) < 0.03)
    nape = max(p.y for p in verts if 1.53 <= p.z <= 1.59 and abs(p.x) < 0.03)
    side = max(abs(p.x) for p in verts if 1.52 <= p.z <= 1.575 and abs(p.y - pv.y) < 0.04)
    n_cy = (throat + nape) / 2 - 0.004
    n_r = max((nape - throat) / 2, side) + NECK_EASE
    print(f"ABAYA neck (head space): throat={throat:.4f} nape={nape:.4f} side={side:.4f} -> collar r={n_r:.4f} cy={n_cy:.4f} front={n_cy - n_r:.4f} back={n_cy + n_r:.4f}")

    # Body width as a floor (the sleeves cover the shoulders, so only a little ease is needed).
    body = ctx.torso_sections(hem, 1.49, ease=0.0)
    b_rx = [(z, rx) for z, rx, ry, cy in body]

    # Designed silhouette by nominal height: half-width, centre-front y, centre-back y.
    zn = 1.535  # neckline (nominal; tilted: front at zn - NECK_TILT, back at zn + NECK_TILT)
    rx_t = [(hem, 0.232), (1.10, 0.214), (1.22, 0.198), (1.30, 0.196), (1.36, 0.210), (1.40, 0.214), (1.46, 0.214), (1.475, 0.205), (1.49, 0.185), (1.50, 0.165), (1.52, 0.115), (zn, n_r)]
    yf_t = [(hem, -0.134), (1.10, -0.146), (1.20, -0.144), (1.26, -0.142), (1.38, -0.142), (1.40, -0.138), (1.42, -0.129), (1.44, -0.108), (1.46, -0.096), (1.48, -0.078), (1.50, -0.058), (1.52, -0.040), (zn, n_cy - n_r)]
    yb_t = [(hem, 0.216), (1.06, 0.204), (1.20, 0.182), (1.30, 0.170), (1.42, 0.168), (1.44, 0.163), (1.46, 0.156), (1.48, 0.137), (1.50, 0.116), (1.52, 0.108), (zn, n_cy + n_r)]

    def section(z):
        """(rx, ry, cy) of the abaya ring at nominal height z (before folds and tilt)."""
        rx = max(_table(rx_t, z), _table(b_rx, z) + 0.016 if z < 1.47 else 0.0)
        yf, yb = _table(yf_t, z), _table(yb_t, z)
        return rx, (yb - yf) / 2, (yf + yb) / 2

    def tilt(z):
        return NECK_TILT * smooth(1.45, zn, z)

    def fold_depth(z):
        return FOLD_DEPTH * smooth(1.30, hem, z)

    def ring(z, dr=0.0, dz=0.0, n=N_TORSO):
        rx, ry, cy = section(z)
        rx, ry = rx + dr, ry + dr
        d = fold_depth(z) / max(rx, 1e-3)
        t = tilt(z)
        pts = []
        for i in range(n):
            a = 2 * math.pi * i / n
            k = 1 - d * math.cos(FOLDS * a)      # crests at the centre front and back, troughs at the sides
            pts.append(ctx.Vector((rx * k * math.cos(a), cy + ry * k * math.sin(a), z + dz + t * math.sin(a))))
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

    # Sleeve axis: from the arm root to the wrist, measured on the body.
    secs = ctx.limb_sections(lambda p: 0.17 < p.x < 0.66 and p.z > 1.28, "x", 0.19, 0.64, ease=0.0)
    root = next(c for a, c, r in secs if a >= 0.19 - 1e-6)
    wrist = secs[-1][1]
    root, wrist = ctx.Vector((0.19, root.y, root.z)), ctx.Vector((0.64, wrist.y, wrist.z))
    print(f"ABAYA arm axis: root={tuple(round(v, 4) for v in root)} wrist={tuple(round(v, 4) for v in wrist)} body r at wrist={secs[-1][2]:.4f}")

    def axis(x):
        t = (abs(x) - 0.19) / (0.64 - 0.19)
        c = root.lerp(wrist, t)
        # The sleeve head sits forward of the arm so its cap stays inside the torso's back.
        return ctx.Vector((abs(x), c.y - SLEEVE_FWD * (1 - smooth(0.15, 0.40, abs(x))), c.z))

    def sleeve_r(x):
        return _table(SLEEVE_R, abs(x))

    # The skirt's centre-front line (the real mesh, so the band follows its pleats).
    skirt_rows = []
    sk = bpy.data.objects.get("skirt_flare")
    if sk is not None:
        by_z = {}
        for v in sk.data.vertices:
            if abs(v.co.x) < 0.045 and v.co.y < ctx.SKIRT_Y:
                by_z.setdefault(round(v.co.z, 3), []).append(v.co.y)
        skirt_rows = sorted((z, min(ys)) for z, ys in by_z.items())
    if len(skirt_rows) < 4:
        skirt_rows = [(z, ctx.SKIRT_Y - ry - 0.004) for z, rx, ry in _skirt_table()]
        print("ABAYA skirt_flare not found: band uses the table")

    def skirt_front(z):
        return _table(skirt_rows, z)

    spec = dict(hem=hem, zn=zn, neck=(n_r, n_cy), section=section, ring=ring, front_pt=front_pt, axis=axis, sleeve_r=sleeve_r, skirt_front=skirt_front)
    _SPEC[key] = spec
    return spec


# ---------------------------------------------------------------- upper_abaya


def build_upper(ctx):
    _release("upper_abaya")
    sp = _spec(ctx)
    b = ctx.Builder()
    hem, zn = sp["hem"], sp["zn"]

    # Body: dense rings where the silhouette turns (hem flare, bust, shoulders, neck).
    zs = [hem, 1.00, 1.03, 1.06, 1.10, 1.14, 1.18, 1.22, 1.26, 1.30, 1.34, 1.38, 1.41, 1.44, 1.465, 1.48, 1.495, 1.51, 1.523, zn]
    rings = [sp["ring"](z) for z in zs]
    # Rounded collar: a soft roll around the (tilted) neckline, closing back in towards the neck.
    for dz, dr in ((0.005, 0.010), (0.011, 0.014), (0.017, 0.011), (0.021, 0.004), (0.022, -0.001)):
        rings.append(sp["ring"](zn, dr=dr, dz=dz))
    b.loft(rings)

    # Sleeves: a bell from the root to past the wrist, capped at the root (inside the torso).
    xs = [SLEEVE_X0, 0.19, 0.23, 0.27, 0.31, 0.35, 0.39, 0.43, 0.47, 0.51, 0.55, 0.59, 0.625, SLEEVE_X1]
    for sgn in (1, -1):
        srings = []
        for x in xs:
            c = sp["axis"](x)
            r = sp["sleeve_r"](x)
            srings.append(ctx.ellipse((sgn * c.x, c.y, c.z), (0, 1, 0), (0, 0, 1), r, r, N_SLEEVE))
        if sgn < 0:
            srings.reverse()          # progress along +x again -> outward normals
            b.loft(srings, cap_end=True)
        else:
            b.loft(srings, cap_start=True)
    return ctx.make_object("upper_abaya", b, ctx.top_weights, "top")


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
    return ctx.make_object("cuffs", b, ctx.top_weights, "trim")


# ---------------------------------------------------------------- abaya_trim


def build_trim(ctx):
    _release("abaya_trim")
    sp = _spec(ctx)
    b = ctx.Builder()
    hem, zn = sp["hem"], sp["zn"]
    table = _skirt_table()
    # Stations down the centre front: on the abaya (by nominal ring height), then on the skirt.
    z_top = [zn - 0.004, 1.52, 1.50, 1.48, 1.46, 1.44, 1.42, 1.39, 1.36, 1.32, 1.27, 1.21, 1.15, 1.09, 1.03, hem + 0.004]
    z_skirt = [hem - 0.01, 0.95, 0.90, 0.84, 0.78, 0.70, 0.62, 0.52, 0.42, 0.32, 0.22, 0.13, TRIM_BOTTOM_Z]
    xs = (-BAND_HALF, -BAND_HALF + 0.003, BAND_HALF - 0.003, BAND_HALF)
    rows = []
    for z in z_top:
        e, t = BAND_PROUD
        row = []
        for i, x in enumerate(xs):
            y, zz = sp["front_pt"](z, x)
            row.append(ctx.Vector((x, y - (e if i in (0, 3) else t), zz)))
        rows.append(row)
    for z in z_skirt:
        e, t = BAND_PROUD_SKIRT
        y = sp["skirt_front"](z)
        rows.append([ctx.Vector((x, y - (e if i in (0, 3) else t), z)) for i, x in enumerate(xs)])
    ids = [b.add_ring(r) for r in rows]
    for k in range(len(ids) - 1):
        up, lo = ids[k], ids[k + 1]
        for c in range(3):
            b.faces.append((lo[c], lo[c + 1], up[c + 1], up[c]))   # faces -Y (the front)

    def weights(p):
        if p.z >= hem - 0.002:
            return ctx.top_weights(p)
        return ctx.leg_weights(p, _at(table, p.z, 1), ry=_at(table, p.z, 2))

    return ctx.make_object("abaya_trim", b, weights, "trim")


PIECES = {"upper_abaya": (build_upper, "top"), "cuffs": (build_cuffs, "trim"), "abaya_trim": (build_trim, "trim")}
