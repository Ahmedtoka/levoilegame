"""Blouse style C: polo-neck blouse with balloon sleeves and a belt (replaces `upper` and `belt`).

upper: fitted torso (2.5 cm ease) from the waist hem (z 1.06, just over the skirt / trouser
       waistband) up to a turtleneck under the jaw, a 2 mm raised placket down the front, and
       long sleeves with a light balloon on the forearm gathered into a 3 cm cuff at the wrist.
       Under the hem a snug "tucked" tail runs down to z 0.96 so nothing is open between the
       hem and the bottoms whatever their waist height (modesty rule: no body is exported).
belt:  a 4 cm band at the waist (z 1.08-1.12), 12 mm proud of the blouse (3 mm outside the
       staff vest), with a flat rectangular buckle at the front.
"""

import math

import bpy

HEM_Z = 1.06
TAIL_Z = 0.96
SHOULDER_Z = 1.48  # last measured torso ring; above it the trapezius bevel and the collar
COLLAR = (0.080, 0.082, 0.030)  # rx, ry, cy of the polo neck (inside the hijab chin wrap)
TORSO_N = 28
SLEEVE_N = 14
EASE = 0.025
BELT_Z0, BELT_Z1 = 1.08, 1.12
BELT_OUT = 0.012  # proud of the blouse
PLACKET_HALF = 0.011
PLACKET_RAISE = 0.002


def _claim(name):
    """Move the default piece (object + mesh) of this name out of the way first, so the
    replacement is exported as `name` and not `name.001` (the runtime looks pieces up by name)."""
    for coll in (bpy.data.objects, bpy.data.meshes):
        old = coll.get(name)
        if old is not None:
            old.name = name + "_default"


def _interp(rows, x):
    """Linear interpolation of (key, *values) rows at key x (clamped)."""
    rows = sorted(rows, key=lambda r: r[0])
    if x <= rows[0][0]:
        return rows[0][1:]
    for a, b in zip(rows, rows[1:]):
        if a[0] <= x <= b[0]:
            t = (x - a[0]) / (b[0] - a[0])
            return tuple(va + (vb - va) * t for va, vb in zip(a[1:], b[1:]))
    return rows[-1][1:]


def _torso_rings(ctx):
    """(z, rx, ry, cy) from the hem to the collar top."""
    smooth, lerp = ctx.smooth, ctx.lerp
    secs = [(z, rx, ry, cy) for z, rx, ry, cy in ctx.torso_sections(HEM_Z, SHOULDER_Z, ease=EASE) if z <= SHOULDER_Z + 1e-6]
    z_sh, rx_sh, ry_sh, cy_sh = secs[-1]
    crx, cry, ccy = COLLAR
    # Trapezius bevel: shoulder -> neck over 4 cm, then the turtleneck with a rolled top edge.
    secs += [
        (1.495, lerp(rx_sh, crx, 0.40), lerp(ry_sh, cry, 0.3), lerp(cy_sh, ccy, 0.3)),
        (1.508, lerp(rx_sh, crx, 0.82), lerp(ry_sh, cry, 0.7), lerp(cy_sh, ccy, 0.7)),
        (1.518, crx, cry, ccy),
        (1.545, crx, cry, ccy),
        (1.572, crx + 0.006, cry + 0.006, ccy),  # fold bulge
        (1.592, crx + 0.002, cry + 0.002, ccy),  # top edge
    ]
    return secs


def _tail_rings(ctx):
    """Snug rings under the hem (inside the skirt / trousers): the tucked tail."""
    base = {round(z, 3): (rx, ry, cy) for z, rx, ry, cy in ctx.torso_sections(TAIL_Z - 0.02, HEM_Z, ease=0.0)}
    rows = sorted((z, rx, ry, cy) for z, (rx, ry, cy) in base.items())
    out = []
    for z, ease in ((1.045, 0.006), (1.02, 0.005), (0.99, 0.005), (TAIL_Z, 0.005)):
        rx, ry, cy = _interp(rows, z)
        out.append((z, rx + ease, ry + ease, cy))
    return out


def _sleeve(ctx, b, sgn):
    """One sleeve: fitted upper arm, light balloon on the forearm (fuller on the outside of the
    arm, snug toward the body), gathered into a crisp 3 cm cuff that is closed at the wrist."""
    Vector, smooth, lerp = ctx.Vector, ctx.smooth, ctx.lerp
    pred = lambda p: sgn * p.x > 0.17 and sgn * p.x < 0.645 and p.z > 1.28
    meas = ctx.limb_sections(pred, "x", sgn * 0.19, sgn * 0.645, step=0.02, ease=0.0)
    rows = [(abs(a), c.y, c.z, r) for a, c, r in meas]

    def fit(x):
        cy, cz, r = _interp(rows, x)
        return cy, cz, r

    # Balloon radius by station (abs x): fit + ease on the upper arm, then the puff and the gather.
    stations = [0.19, 0.22, 0.26, 0.30, 0.34, 0.38, 0.42, 0.45, 0.48, 0.51, 0.54, 0.57, 0.59, 0.605, 0.617, 0.622, 0.626, 0.657]
    # Balloon: fullness by station, peaking on the forearm and still full where it is gathered.
    puff = [(0.42, 0.0), (0.45, 0.008), (0.48, 0.018), (0.51, 0.027), (0.54, 0.033), (0.57, 0.034), (0.59, 0.033), (0.605, 0.031), (0.617, 0.029)]
    cuff_r = 0.069
    rings = []
    for x in stations:
        cy, cz, r0 = fit(x)
        # The upper arm is fitted (a slimmer sleeve head so the balloon reads against it).
        base = r0 + lerp(0.016, 0.022, smooth(0.19, 0.32, x))
        if x >= 0.626 - 1e-6:
            r, shift, fold = cuff_r, 0.0, 0.0
        elif x >= 0.622 - 1e-6:
            r, shift, fold = cuff_r + 0.003, 0.0, 0.0  # the lip just above the cuff
        else:
            p = _interp(puff, x)[0] if x >= 0.42 else 0.0
            r = base + 0.6 * p
            shift = 0.5 * p  # the fullness sits on top of the arm (= outside when the arm hangs)
            fold = 0.0035 * smooth(0.47, 0.56, x) * (1 - smooth(0.60, 0.62, x))
        c = Vector((sgn * x, cy, cz + shift))
        ring = ctx.ellipse(c, (0, 1, 0), (0, 0, 1), r, r, SLEEVE_N)
        if fold > 0:
            # Six soft folds running along the arm, converging at the gather.
            for i in range(SLEEVE_N):
                a = 2 * math.pi * i / SLEEVE_N
                k = 1 + (fold / r) * math.sin(6 * a + 0.3)
                ring[i] = c + (ring[i] - c) * k
        rings.append(ring)
    if sgn < 0:
        rings.reverse()  # rings must progress along +x for outward normals
    b.loft(rings, cap_start=True, cap_end=True)  # closed at the shoulder and at the wrist


def _placket(ctx, b, rings):
    """A 2.2 cm wide, 2 mm raised strip down the front from under the collar to the hem.
    Separate vertices for the top and the two walls so the edges shade crisply."""
    Vector = ctx.Vector
    pts = [(z, cy - ry) for z, rx, ry, cy in rings if HEM_Z - 1e-6 <= z <= 1.50]
    pts.sort()
    tops, lw, rw = [], [], []
    for z, yf in pts:
        y0, y1 = yf + 0.0005, yf - PLACKET_RAISE  # base just inside the blouse surface, top raised
        tops.append(b.add_ring([Vector((-PLACKET_HALF, y1, z)), Vector((PLACKET_HALF, y1, z))]))
        lw.append(b.add_ring([Vector((-PLACKET_HALF, y0, z)), Vector((-PLACKET_HALF, y1, z))]))
        rw.append(b.add_ring([Vector((PLACKET_HALF, y1, z)), Vector((PLACKET_HALF, y0, z))]))
    for k in range(len(pts) - 1):
        # Faces wind so the normals face -y (front) / -x / +x.
        b.faces.append((tops[k][0], tops[k][1], tops[k + 1][1], tops[k + 1][0]))
        b.faces.append((lw[k][0], lw[k][1], lw[k + 1][1], lw[k + 1][0]))
        b.faces.append((rw[k][0], rw[k][1], rw[k + 1][1], rw[k + 1][0]))


def _upper_weights(ctx, p):
    """ctx.top_weights, but below the belt the torso leans toward the pelvis so the tucked tail
    stays inside the skirt (pelvis-weighted) when the spine bends."""
    if abs(p.x) <= 0.19 and p.z < 1.10:
        z = p.z - 0.05 * ctx.smooth(1.10, 1.02, p.z)
        return ctx.spine_weights(z)
    return ctx.top_weights(p)


def build_upper(ctx):
    _claim("upper")
    b = ctx.Builder()
    rings = _torso_rings(ctx)
    ctx.loft_torso(b, rings, n=TORSO_N)
    tail = _tail_rings(ctx)
    # Tail: from the hem ring downward (rings reversed so the loft runs -z with outward normals
    # -> build it bottom-up instead).
    tail_secs = sorted(tail + [rings[0]], key=lambda r: r[0])
    ctx.loft_torso(b, tail_secs, n=TORSO_N)
    _placket(ctx, b, rings)
    for sgn in (1, -1):
        _sleeve(ctx, b, sgn)
    return ctx.make_object("upper", b, lambda p: _upper_weights(ctx, p), "top")


def build_belt(ctx):
    """4 cm band at the waist with crisp top / bottom edges and a flat buckle at the front."""
    _claim("belt")
    b = ctx.Builder()
    Vector = ctx.Vector
    rows = [(z, rx, ry, cy) for z, rx, ry, cy in ctx.torso_sections(BELT_Z0 - 0.04, BELT_Z1 + 0.04, ease=EASE)]
    n = 24

    def ring(z, out):
        rx, ry, cy = _interp(rows, z)
        return ctx.ellipse((0, cy, z), (1, 0, 0), (0, 1, 0), rx + out, ry + out, n)

    inner, outer = 0.003, BELT_OUT
    # Outer face (its own vertices), then the top and bottom walls (their own vertices).
    b.loft([ring(BELT_Z0, outer), ring(BELT_Z1, outer)])
    bot_in, bot_out = b.add_ring(ring(BELT_Z0, inner)), b.add_ring(ring(BELT_Z0, outer))
    top_out, top_in = b.add_ring(ring(BELT_Z1, outer)), b.add_ring(ring(BELT_Z1, inner))
    for i in range(n):
        j = (i + 1) % n
        b.faces.append((bot_in[i], bot_in[j], bot_out[j], bot_out[i]))  # faces -z
        b.faces.append((top_out[i], top_out[j], top_in[j], top_in[i]))  # faces +z
    # Buckle: a flat box on the front, 6 cm wide x 3.2 cm tall x 6 mm deep, 4 mm outside the band.
    rx, ry, cy = _interp(rows, (BELT_Z0 + BELT_Z1) / 2)
    y_face = cy - ry - outer
    hw, z0, z1, d = 0.030, BELT_Z0 + 0.004, BELT_Z1 - 0.004, 0.006
    y_back, y_front = y_face + 0.002, y_face - d
    v = lambda x, y, z: Vector((x, y, z))
    front = b.add_ring([v(-hw, y_front, z0), v(hw, y_front, z0), v(hw, y_front, z1), v(-hw, y_front, z1)])
    b.faces.append((front[0], front[1], front[2], front[3]))
    for (x0, x1), side in (((-hw, hw), "top"), ((hw, -hw), "bottom")):
        zz = z1 if side == "top" else z0
        q = b.add_ring([v(x0, y_front, zz), v(x1, y_front, zz), v(x1, y_back, zz), v(x0, y_back, zz)])
        b.faces.append((q[0], q[1], q[2], q[3]))
    for x, flip in ((hw, False), (-hw, True)):
        q = b.add_ring([v(x, y_front, z0), v(x, y_back, z0), v(x, y_back, z1), v(x, y_front, z1)])
        b.faces.append((q[0], q[1], q[2], q[3]) if not flip else (q[3], q[2], q[1], q[0]))
    # Prong: a thin bar across the buckle's middle.
    pw = 0.004
    q = b.add_ring([v(-pw, y_front - 0.002, z0 + 0.004), v(pw, y_front - 0.002, z0 + 0.004), v(pw, y_front - 0.002, z1 - 0.004), v(-pw, y_front - 0.002, z1 - 0.004)])
    b.faces.append((q[0], q[1], q[2], q[3]))
    return ctx.make_object("belt", b, lambda p: ctx.spine_weights(p.z), "trim")


PIECES = {"upper": (build_upper, "top"), "belt": (build_belt, "trim")}
