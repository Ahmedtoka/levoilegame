"""Wrapped-scarf hijab (style A) for build_avatar.py.

    hijab_classic  smooth cap + chin wrap + drape to mid-chest (part "hijab")
    hijab_long     same cap + wrap, drape to the waist            (part "hijab")
    hijab_band     under-scarf band along the face opening        (part "accent")

The cap is not a cut of the body: the head is sampled radially from its centre
(ray casts against the Head / neck faces), the radial map is max-filtered and
blurred so the cloth bulges smoothly over the ears instead of tracing them, and
the cap is a clean quad grid on that surface, 1.4 cm proud. The face opening is
an egg-shaped oval (chin crease -> cheeks -> rounded forehead top); the band
runs along it, 1.2 cm wide and 2 mm proud of the cap, and the cap edge tucks 3 mm
under the band's outer edge so no gap can open. The chin stays open: the band's
lower edge sits at the chin crease and the wrap passes under it.

The wrap + drape is a loft: a ring hugging the cap at the jaw, a rolled rim that
clears the tops' stand collars, a funnel down the neck, a nearly flat run over
the shoulders (above balloon sleeves) and pleated panels (6 folds, 8 mm) to a
rounded hem.

Coordinates: Blender Z-up, the character faces -Y, her left is +X (metres).
The cap, wrap and drape are built directly in enlarged-head space (HEAD_SCALE
about HEAD_PIVOT). build_avatar.py scales "hijab_band" after the plug-ins run, so
the band is built in the same space and then un-scaled here (see unscale()).
"""

import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ---------------------------------------------------------------- tuning (enlarged-head space)

C_BODY = Vector((0.0, 0.0, 1.655))  # head centre (body space): the eyes' height
OPEN_Z_BOTTOM = 1.538  # cap bottom / chin segment of the band (under the chin, behind the tip)
OPEN_Z_CHEEK = 1.665  # widest point of the opening (the cheekbones)
OPEN_Z_TOP = 1.745  # top of the opening on the forehead (brows end at ~1.708)
OPEN_X_MAX = 0.0874  # half-width of the opening at the cheeks (= face_zone's 0.076 x 1.15)
OPEN_CHIN = 0.60  # chin width as a fraction of the cheek width
OPEN_CENTRE = Vector((0.0, -0.11, 1.645))  # "outward" on the face = away from this point

CAP_OFF = 0.014  # cap proud of the head
CAP_EDGE = 0.009  # cap edge this far out from the opening (under the band's outer part)
BAND_W = 0.012
BAND_OFF = CAP_OFF + 0.002  # band 2 mm proud of the cap
CAP_M = 26  # points per cap ring
PLEATS = 6  # creases around the drape (36 points per ring: 6 per crease sector)
PLEAT_DEPTH = 0.010

# Radial map resolution.
N_PSI, N_E = 72, 69
E_MIN, E_MAX = -80.0, 90.0

_SURF = {}


# ---------------------------------------------------------------- the head as a smooth radial surface


def _dominant(body):
    names = {g.index: g.name for g in body.vertex_groups}
    dom = {}
    for v in body.data.vertices:
        if v.groups:
            g = max(v.groups, key=lambda g: g.weight)
            dom[v.index] = names[g.group]
    return dom


def _direction(psi, e):
    """psi: azimuth from the front (-Y) towards +X (CCW about +Z); e: elevation."""
    ce = math.cos(e)
    return Vector((math.sin(psi) * ce, -math.cos(psi) * ce, math.sin(e)))


class HeadSurface:
    """r(psi, e) from the head centre, smoothed; positions and normals in enlarged-head space."""

    def __init__(self, ctx):
        self.ctx = ctx
        body = ctx.body
        dom = _dominant(body)
        verts = [v.co.copy() for v in body.data.vertices]
        polys = [list(p.vertices) for p in body.data.polygons if all(dom.get(i, "") in ("Head", "neck_01") for i in p.vertices)]
        bvh = BVHTree.FromPolygons(verts, polys)
        self.c_enl = self.enl(C_BODY)
        # Raw radial map.
        r = [[None] * N_PSI for _ in range(N_E)]
        for j in range(N_E):
            e = math.radians(E_MIN + (E_MAX - E_MIN) * j / (N_E - 1))
            for i in range(N_PSI):
                psi = 2 * math.pi * i / N_PSI
                hit = bvh.ray_cast(C_BODY, _direction(psi, e), 0.6)
                r[j][i] = hit[3] if hit[0] is not None else None
        # Misses (rays down the neck hole) take the nearest value above.
        for i in range(N_PSI):
            last = None
            for j in range(N_E - 1, -1, -1):
                if r[j][i] is None:
                    r[j][i] = last if last is not None else 0.1
                else:
                    last = r[j][i]
        # Mirror symmetry about the median plane.
        for j in range(N_E):
            for i in range(1, N_PSI // 2):
                m = (r[j][i] + r[j][N_PSI - i]) / 2
                r[j][i] = r[j][N_PSI - i] = m
        # Cloth lies OVER the ears / brow ridge: max filter (±10 deg) then blur.
        r = self._filter(r, lambda vals: max(vals), dpsi=2, de=4)
        for _ in range(3):
            r = self._filter(r, lambda vals: sum(vals) / len(vals), dpsi=1, de=2)
        self.r = r
        # Positions and normals (enlarged space).
        self.p = [[self.enl(C_BODY + _direction(2 * math.pi * i / N_PSI, math.radians(E_MIN + (E_MAX - E_MIN) * j / (N_E - 1))) * r[j][i]) for i in range(N_PSI)] for j in range(N_E)]
        self.n = [[None] * N_PSI for _ in range(N_E)]
        for j in range(N_E):
            for i in range(N_PSI):
                jj = min(max(j, 1), N_E - 2)
                du = self.p[jj][(i + 1) % N_PSI] - self.p[jj][(i - 1) % N_PSI]
                dv = self.p[j + 1][i] - self.p[j - 1][i] if 0 < j < N_E - 1 else (self.p[min(j + 1, N_E - 1)][i] - self.p[max(j - 1, 0)][i])
                nrm = du.cross(dv)
                if nrm.length < 1e-9:
                    nrm = Vector((0, 0, 1)) if j > N_E // 2 else Vector((0, 0, -1))
                self.n[j][i] = nrm.normalized()

    @staticmethod
    def _filter(r, fn, dpsi, de):
        out = [[0.0] * N_PSI for _ in range(N_E)]
        for j in range(N_E):
            for i in range(N_PSI):
                vals = []
                for jj in range(max(0, j - de), min(N_E, j + de + 1)):
                    for ii in range(i - dpsi, i + dpsi + 1):
                        vals.append(r[jj][ii % N_PSI])
                out[j][i] = fn(vals)
        return out

    def enl(self, p):
        """Body space -> enlarged-head space (same formula as scale_head)."""
        ctx = self.ctx
        k = ctx.smooth(1.50, 1.55, p.z)
        return ctx.HEAD_PIVOT + (p - ctx.HEAD_PIVOT) * ctx.lerp(1.0, ctx.HEAD_SCALE, k)

    def unscale(self, p):
        """Inverse of enl(): what build_avatar's scale_head must see to produce p."""
        ctx = self.ctx
        pv = ctx.HEAD_PIVOT
        lo, hi = 1.40, 1.90
        for _ in range(40):
            z = (lo + hi) / 2
            f = ctx.lerp(1.0, ctx.HEAD_SCALE, ctx.smooth(1.50, 1.55, z))
            if pv.z + (z - pv.z) * f < p.z:
                lo = z
            else:
                hi = z
        z = (lo + hi) / 2
        f = ctx.lerp(1.0, ctx.HEAD_SCALE, ctx.smooth(1.50, 1.55, z))
        return pv + (p - pv) / f

    def sample(self, psi, e):
        """Bilinear (position, normal) at azimuth psi (rad) and elevation e (rad)."""
        u = (psi % (2 * math.pi)) / (2 * math.pi) * N_PSI
        v = (math.degrees(e) - E_MIN) / (E_MAX - E_MIN) * (N_E - 1)
        v = min(max(v, 0.0), N_E - 1 - 1e-9)
        i0 = int(u) % N_PSI
        i1 = (i0 + 1) % N_PSI
        j0 = int(v)
        j1 = min(j0 + 1, N_E - 1)
        fu, fv = u - int(u), v - j0
        p = (self.p[j0][i0] * (1 - fu) + self.p[j0][i1] * fu) * (1 - fv) + (self.p[j1][i0] * (1 - fu) + self.p[j1][i1] * fu) * fv
        n = (self.n[j0][i0] * (1 - fu) + self.n[j0][i1] * fu) * (1 - fv) + (self.n[j1][i0] * (1 - fu) + self.n[j1][i1] * fu) * fv
        return p, n.normalized()

    def at(self, psi, e, off):
        p, n = self.sample(psi, e)
        return p + n * off

    def elev_at_z(self, psi, z):
        """Elevation whose surface point sits at height z (bisection)."""
        lo, hi = math.radians(E_MIN), math.radians(E_MAX)
        for _ in range(24):
            mid = (lo + hi) / 2
            if self.sample(psi, mid)[0].z < z:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def psi_at_x(self, z, x):
        """Azimuth (0..pi/2, the +X side) whose surface point at height z has this x."""
        lo, hi = 0.0, math.pi / 2
        for _ in range(24):
            mid = (lo + hi) / 2
            if self.sample(mid, self.elev_at_z(mid, z))[0].x < x:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def angles(self, p):
        d = p - self.c_enl
        return math.atan2(d.x, -d.y) % (2 * math.pi), math.asin(max(-1.0, min(1.0, d.z / d.length)))

    def shift(self, psi, e, dist):
        """(psi, e) of the point `dist` further from the opening's centre along the surface."""
        p, n = self.sample(psi, e)
        v = p - OPEN_CENTRE
        v -= n * v.dot(n)
        if v.length < 1e-6:
            return psi, e
        return self.angles(p + v.normalized() * dist)


def surface(ctx):
    key = ctx.body.name
    if key not in _SURF:
        _SURF[key] = HeadSurface(ctx)
    return _SURF[key]


# ---------------------------------------------------------------- the face opening

N_LOW, N_UP, N_CHIN = 5, 6, 7


def opening_x(z):
    """Half-width of the opening at height z: an egg, narrow at the chin, round at the top."""
    if z <= OPEN_Z_CHEEK:
        t = (OPEN_Z_CHEEK - z) / (OPEN_Z_CHEEK - OPEN_Z_BOTTOM)
        return OPEN_X_MAX * (1 - (1 - OPEN_CHIN) * t * t)
    t = (z - OPEN_Z_CHEEK) / (OPEN_Z_TOP - OPEN_Z_CHEEK)
    return OPEN_X_MAX * math.sqrt(max(0.0, 1 - t * t))


def opening_loop(srf):
    """Inner edge of the band as (psi, e) samples, clockwise for someone facing her:
    left chin end (-X) up over the forehead, down to the right chin end (+X), then back
    under the chin. Returns (samples, index of the top sample, number of arch samples)."""
    zs = [OPEN_Z_BOTTOM + (OPEN_Z_CHEEK - OPEN_Z_BOTTOM) * k / N_LOW for k in range(N_LOW)]
    zs += [OPEN_Z_CHEEK + (OPEN_Z_TOP - OPEN_Z_CHEEK) * math.sin(math.pi / 2 * k / N_UP) for k in range(N_UP + 1)]
    right = []  # +X side, bottom -> top
    for z in zs:
        x = opening_x(z)
        psi = srf.psi_at_x(z, x) if x > 1e-4 else 0.0
        right.append((psi, srf.elev_at_z(psi, z)))
    left = [((2 * math.pi - psi) % (2 * math.pi), e) for psi, e in right]
    arch = left[:-1] + [right[-1]] + right[-2::-1]  # top sample once
    psi_r = right[0][0]
    chin = []
    for k in range(1, N_CHIN + 1):
        psi = psi_r - 2 * psi_r * k / (N_CHIN + 1)
        chin.append((psi % (2 * math.pi), srf.elev_at_z(psi, OPEN_Z_BOTTOM)))
    return arch + chin, len(left) - 1, len(arch)


def _claim(name):
    """The default piece of this name is renamed <name>_default (it is removed by the
    registry afterwards), so the new object AND its mesh data export under the clean name."""
    old = bpy.data.objects.get(name)
    if old is not None and old.name == name:
        old.name = name + "_default"
    me = bpy.data.meshes.get(name)
    if me is not None and me.name == name:
        me.name = name + "_default"


def _name(ob, name):
    _claim(name)
    ob.name = name
    ob.data.name = name
    return ob


def _weld(ob, dist=2e-4):
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(ob.data)
    bm.free()


# ---------------------------------------------------------------- cap


def build_cap(ctx, srf):
    """Quad cap: horizontal open rings from under the chin up to the opening's top, then
    closed latitude rings to the crown. Each ring runs CCW about +Z from the +X edge of
    the opening round the back to the -X edge; rings progress upwards (outward normals)."""
    loop, top, n_arch = opening_loop(srf)
    b = ctx.Builder()
    rings = []
    # Open rings: at the levels of the cap edge (the opening shifted CAP_EDGE outward).
    for k in range(top + 1):
        psi_l, e_l = srf.shift(*loop[k], CAP_EDGE)
        z = srf.sample(psi_l, e_l)[0].z
        a = (2 * math.pi - psi_l) if k < top else 0.0  # +X edge azimuth
        ring = []
        for i in range(CAP_M):
            psi = a + (2 * math.pi - 2 * a) * i / (CAP_M - 1)
            ring.append(srf.at(psi, srf.elev_at_z(psi, z), CAP_OFF))
        rings.append(ring)
    # Closed rings up to the crown.
    for e_deg in (50.0, 64.0, 78.0):
        e = math.radians(e_deg)
        rings.append([srf.at(2 * math.pi * i / (CAP_M - 1), e, CAP_OFF) for i in range(CAP_M)])
    ids = [b.add_ring(r) for r in rings]
    for k in range(len(ids) - 1):
        A, B = ids[k], ids[k + 1]
        for i in range(CAP_M - 1):
            b.faces.append((A[i], A[i + 1], B[i + 1], B[i]))
    pole = srf.at(0.0, math.pi / 2, CAP_OFF)
    b.cap(ids[-1], rings[-1], flip=False, point=pole)
    ob = ctx.make_object("hijab_cap", b, lambda p: {"Head": 1.0}, "hijab")
    _weld(ob)
    return ob


# ---------------------------------------------------------------- band


def build_band(ctx):
    srf = surface(ctx)
    loop, _, _ = opening_loop(srf)
    b = ctx.Builder()
    lip = [srf.at(psi, e, 0.003) for psi, e in loop]
    top_in = [srf.at(*srf.shift(psi, e, 0.0015), BAND_OFF) for psi, e in loop]
    top_out = [srf.at(*srf.shift(psi, e, BAND_W), BAND_OFF) for psi, e in loop]
    drop = [srf.at(*srf.shift(psi, e, BAND_W + 0.001), CAP_OFF - 0.003) for psi, e in loop]
    strips = [b.add_ring([srf.unscale(p) for p in ring]) for ring in (lip, top_in, top_out, drop)]
    n = len(loop)
    for k in range(len(strips) - 1):
        A, B = strips[k], strips[k + 1]
        for i in range(n):
            j = (i + 1) % n
            b.faces.append((A[i], A[j], B[j], B[i]))
    _claim("hijab_band")
    return _name(ctx.make_object("hijab_band", b, lambda p: {"Head": 1.0}, "accent"), "hijab_band")


# ---------------------------------------------------------------- wrap + drape

# The drape's cross-section at height z is the convex hull of the dressed chest (an ellipse:
# the torso + a loose top + 2 cm) and the two sleeve domes at the shoulders, so the cloth
# bridges from the chest to the arms like real fabric instead of a tube around everything.
# Neck funnel (z >= 1.49) clears the tops' collars (the blouse's polo neck: rx 0.080, ry 0.082 about
# y 0.03, up to z 1.592); the chest keeps >= 4.5 cm off the body (the staff waistcoat sits 4 cm out).
# (z, rx, y_front, y_back) in enlarged / world space.
CHEST = [
    (1.515, 0.112, -0.115, 0.135),
    (1.500, 0.150, -0.120, 0.140),
    (1.490, 0.205, -0.128, 0.160),
    (1.480, 0.225, -0.138, 0.172),
    (1.470, 0.235, -0.148, 0.180),
    (1.460, 0.240, -0.156, 0.186),
    (1.440, 0.240, -0.166, 0.192),
    (1.400, 0.235, -0.176, 0.196),
    (1.360, 0.225, -0.185, 0.192),
    (1.300, 0.200, -0.190, 0.182),
    (1.220, 0.175, -0.183, 0.166),
    (1.140, 0.160, -0.175, 0.155),
    (1.060, 0.155, -0.167, 0.150),
    (1.000, 0.152, -0.162, 0.148),
]
# Sleeve capsule: the upper arm hangs at (x, y); below z it is a cylinder of radius r, above
# it an ellipsoidal top h tall. The lofted sleeves measure r ~0.09 up to a flat shoulder cap
# (the abaya), so r is that plus 2 cm of air for a balloon sleeve or an arm swing.
ARM_X, ARM_Y, ARM_Z, ARM_R, ARM_H = 0.235, 0.057, 1.402, 0.110, 0.100
ARMS_ABOVE = 1.33  # below this the panels hang between the arms
CENTRE_Y = 0.01


def chest(z):
    s = CHEST
    if z >= s[0][0]:
        return s[0][1:]
    for a, c in zip(s, s[1:]):
        if c[0] <= z <= a[0]:
            t = (a[0] - z) / (a[0] - c[0])
            return tuple(a[k] + (c[k] - a[k]) * t for k in (1, 2, 3))
    return s[-1][1:]


def _hull(pts):
    """2D convex hull (monotone chain), CCW."""
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


_SECTIONS = {}


def section(z):
    """Hull polygon of the drape's cross-section at z."""
    key = round(z, 5)
    if key in _SECTIONS:
        return _SECTIONS[key]
    rx, yf, yb = chest(z)
    y0, ry = (yf + yb) / 2, (yb - yf) / 2
    pts = [(rx * math.sin(a), y0 - ry * math.cos(a)) for a in (2 * math.pi * i / 40 for i in range(40))]
    dz = max(0.0, z - ARM_Z)
    if z >= ARMS_ABOVE and dz < ARM_H:
        ra = ARM_R * math.sqrt(1 - (dz / ARM_H) ** 2)
        if ra > 0.004:
            for sx in (1, -1):
                pts += [(sx * ARM_X + ra * math.cos(a), ARM_Y + ra * math.sin(a)) for a in (2 * math.pi * i / 24 for i in range(24))]
    _SECTIONS[key] = _hull(pts)
    return _SECTIONS[key]


def radius_at(poly, psi):
    """Distance from (0, CENTRE_Y) to the polygon's edge in direction psi."""
    dx, dy = math.sin(psi), -math.cos(psi)
    best = 0.0
    for i in range(len(poly)):
        (px, py), (qx, qy) = poly[i], poly[(i + 1) % len(poly)]
        ex, ey = qx - px, qy - py
        den = dx * ey - dy * ex
        if abs(den) < 1e-12:
            continue
        wx, wy = px - 0.0, py - CENTRE_Y
        t = (wx * ey - wy * ex) / den
        s = (wx * dy - wy * dx) / den
        if t > 0 and -1e-9 <= s <= 1 + 1e-9:
            best = max(best, t)
    return best


def _dpsi(psi):
    """Angular distance from the front."""
    return min(psi, 2 * math.pi - psi)


# Folds are V-shaped creases: one every 60 deg (at +-30, +-90, +-150 from the front), 6 deg
# wide on each side (~2.5 cm on the drape), PLEAT_DEPTH deep. The ring's points sit exactly
# on the crease walls (offsets per 60-deg sector), so each crease stays a crisp pair of facets.
SECTOR = [-30.0, -14.0, -6.0, 0.0, 6.0, 14.0]
PSIS = [math.radians(30.0 + 60.0 * k + o) for k in range(PLEATS) for o in SECTOR]
CREASE_HALF = math.radians(6.0)


def fold(psi):
    """1 at the bottom of a crease, 0 on the flat cloth."""
    d = (psi - math.radians(30.0)) % math.radians(60.0)
    d = min(d, math.radians(60.0) - d)
    return max(0.0, 1 - d / CREASE_HALF)


def wrap_weights(ctx, p):
    """drape_weights, but the cloth lying on the shoulders and arms follows the sleeve
    underneath it (the same clavicle -> upper-arm blend as top_weights), so the sleeves
    cannot swing out from under it when she walks."""
    out = ctx.drape_weights(p)
    k = ctx.smooth(0.13, 0.21, abs(p.x)) if p.z < 1.53 else 0.0
    if k <= 0:
        return out
    sd = "l" if p.x >= 0 else "r"
    t = ctx.smooth(0.19, 0.27, abs(p.x))
    out = {bn: wt * (1 - k) for bn, wt in out.items()}
    out["upperarm_" + sd] = out.get("upperarm_" + sd, 0) + k * (0.4 + 0.6 * t)
    out["clavicle_" + sd] = out.get("clavicle_" + sd, 0) + k * 0.6 * (1 - t)
    return out


def build_wrap(ctx, srf, name, long):
    z_front, z_side = (1.02, 1.30) if long else (1.28, 1.38)
    psis = sorted(p % (2 * math.pi) for p in PSIS)

    def hem(psi):
        # Rounded hem: lowest at the front and back, rising over the arms; the creases hang 1.2 cm lower.
        z = z_front + (z_side - z_front) * (1 - abs(math.cos(psi))) ** 1.5
        return z - 0.012 * fold(psi)

    def pleated(psi, z):
        r = radius_at(section(z), psi)
        # Creases sink along the local surface normal: into the shoulder shelf from above,
        # into the hanging panels from the outside.
        h = 0.008
        dr = radius_at(section(z + h), psi) - radius_at(section(z - h), psi)
        nr, nz = 2 * h, -dr
        ln = math.hypot(nr, nz)
        nr, nz = nr / ln, nz / ln
        depth = -PLEAT_DEPTH * ctx.smooth(1.51, 1.45, z) * fold(psi)
        r += depth * nr
        z += depth * nz
        return Vector((r * math.sin(psi), CENTRE_Y - r * math.cos(psi), z))

    rings = []
    # Ring 0 hugs the cap at the jaw (3 mm above it); at the front it tucks under the band's chin segment.
    rings.append([srf.at(psi, math.radians(ctx.lerp(-67.0, -38.0, ctx.smooth(0.5, 1.15, _dpsi(psi)))), CAP_OFF + 0.003) for psi in psis])
    # Ring 1: the rolled rim, below the chin at the front, rising to the nape.
    rings.append([Vector((0.110 * math.sin(psi), 0.01 - 0.125 * math.cos(psi), 1.540 + 0.05 * (1 - math.cos(psi)) / 2)) for psi in psis])
    zs = [1.515, 1.50, 1.49, 1.48, 1.47, 1.455, 1.44, 1.40, 1.36]
    zs += [1.30, 1.24, 1.18, 1.12, 1.06, 1.00] if long else [1.32, 1.28, 1.25]
    for z in zs:
        rings.append([pleated(psi, z) for psi in psis])
    rings.reverse()  # bottom-up: outward normals
    b = ctx.Builder()
    ids = b.loft(rings)
    snapped = set()
    for ring in ids:
        for i, vi in enumerate(ring):
            hz = hem(psis[i])
            if b.verts[vi].z < hz:
                b.verts[vi] = pleated(psis[i], hz)
                snapped.add(vi)
    b.faces = [f for f in b.faces if not all(i in snapped for i in f)]
    return ctx.make_object(name + "_drape", b, lambda p: wrap_weights(ctx, p), "hijab")


def _build_hijab(ctx, name, long):
    srf = surface(ctx)
    _claim(name)
    cap = build_cap(ctx, srf)
    wrap = build_wrap(ctx, srf, name, long)
    return _name(ctx.join(cap, wrap), name)


def build_classic(ctx):
    return _build_hijab(ctx, "hijab_classic", False)


def build_long(ctx):
    return _build_hijab(ctx, "hijab_long", True)


PIECES = {
    "hijab_classic": (build_classic, "hijab"),
    "hijab_long": (build_long, "hijab"),
    "hijab_band": (build_band, "accent"),
}
