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
clears the tops' collars, then rings fitted 2 cm outside the tops so the scarf falls
from the chin and lies on the shoulders and the bust (its sides end on the shoulder
tops; the sleeves stay outside it), six soft folds converging toward the chin, and a
gentle U hem at mid-chest (classic) or the waist (long).

Coordinates: Blender Z-up, the character faces -Y, her left is +X (metres).
The head is the UBC head cut ("head", body space, enlarged later by build()); the
body is the chibi template (scripts/blender/chibi.py), which has no head. The cap,
wrap and drape are built directly in enlarged-head space: ctx.HEAD_SCALE
(= chibi.HEAD_SCALE) about HEAD_PIVOT, through the exact scale_head formula. build_avatar.py scales "hijab_band" after the plug-ins run, so
the band is built in the same space and then un-scaled here (see unscale()).
"""

import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ---------------------------------------------------------------- tuning (enlarged-head space)

C_BODY = Vector((0.0, 0.0, 1.655))  # head centre (body space): the eyes' height
# The face opening, in BODY space (scaled by HEAD_SCALE about HEAD_PIVOT at run time):
# build_avatar's face_zone box is |x| < 0.076, 1.575 < z < 1.735, in front of the ears.
OPEN_Z_BOTTOM_BODY = 1.540  # cap bottom / chin segment of the band: under the chin, behind the tip
OPEN_Z_CHEEK_BODY = 1.650  # widest point of the opening (the cheekbones)
OPEN_Z_TOP_BODY = 1.730  # top of the opening on the forehead (the brows end at 1.687)
OPEN_X_MAX_BODY = 0.076  # half-width at the cheeks (= face_zone)
OPEN_CHIN = 0.60  # chin width as a fraction of the cheek width
OPEN_CENTRE_BODY = Vector((0.0, -0.10, 1.645))  # "outward" on the face = away from this point

CAP_OFF = 0.014  # cap proud of the head
CAP_EDGE = 0.009  # cap edge this far out from the opening (under the band's outer part)
BAND_W = 0.012
BAND_OFF = CAP_OFF + 0.002  # band 2 mm proud of the cap
CAP_M = 26  # points per cap ring
PLEATS = 6  # creases around the drape (36 points per ring: 6 per crease sector)
PLEAT_DEPTH = 0.008

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
        head = bpy.data.objects.get("head")  # the UBC head + neck cut, still in body space
        if head is not None:
            verts = [v.co.copy() for v in head.data.vertices]
            polys = [list(p.vertices) for p in head.data.polygons]
        else:  # a body that still carries its head
            body = ctx.body
            dom = _dominant(body)
            verts = [v.co.copy() for v in body.data.vertices]
            polys = [list(p.vertices) for p in body.data.polygons if all(dom.get(i, "") in ("Head", "neck_01") for i in p.vertices)]
        bvh = BVHTree.FromPolygons(verts, polys)
        self.c_enl = self.enl(C_BODY)
        # The opening in enlarged space.
        self.z_bottom = self.enl(Vector((0, 0, OPEN_Z_BOTTOM_BODY))).z
        self.z_cheek = self.enl(Vector((0, 0, OPEN_Z_CHEEK_BODY))).z
        self.z_top = self.enl(Vector((0, 0, OPEN_Z_TOP_BODY))).z
        self.x_max = OPEN_X_MAX_BODY * ctx.HEAD_SCALE
        self.centre = self.enl(OPEN_CENTRE_BODY)
        print(f"HIJAB opening (head space): z {self.z_bottom:.3f}..{self.z_top:.3f}, cheeks +-{self.x_max:.4f}, scale {ctx.HEAD_SCALE}")
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
        v = p - self.centre
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


def opening_x(srf, z):
    """Half-width of the opening at height z: an egg, narrow at the chin, round at the top."""
    if z <= srf.z_cheek:
        t = (srf.z_cheek - z) / (srf.z_cheek - srf.z_bottom)
        return srf.x_max * (1 - (1 - OPEN_CHIN) * t * t)
    t = (z - srf.z_cheek) / (srf.z_top - srf.z_cheek)
    return srf.x_max * math.sqrt(max(0.0, 1 - t * t))


def opening_loop(srf):
    """Inner edge of the band as (psi, e) samples, clockwise for someone facing her:
    left chin end (-X) up over the forehead, down to the right chin end (+X), then back
    under the chin. Returns (samples, index of the top sample, number of arch samples)."""
    zs = [srf.z_bottom + (srf.z_cheek - srf.z_bottom) * k / N_LOW for k in range(N_LOW)]
    zs += [srf.z_cheek + (srf.z_top - srf.z_cheek) * math.sin(math.pi / 2 * k / N_UP) for k in range(N_UP + 1)]
    right = []  # +X side, bottom -> top
    for z in zs:
        x = opening_x(srf, z)
        psi = srf.psi_at_x(z, x) if x > 1e-4 else 0.0
        right.append((psi, srf.elev_at_z(psi, z)))
    left = [((2 * math.pi - psi) % (2 * math.pi), e) for psi, e in right]
    arch = left[:-1] + [right[-1]] + right[-2::-1]  # top sample once
    psi_r = right[0][0]
    chin = []
    for k in range(1, N_CHIN + 1):
        psi = psi_r - 2 * psi_r * k / (N_CHIN + 1)
        chin.append((psi % (2 * math.pi), srf.elev_at_z(psi, srf.z_bottom)))
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

# The drape FALLS from the chin wrap and lies against the dressed body: each ring is an
# ellipse ~2 cm outside the larger of the two tops, the abaya as exported at ec0bf05 (chest
# front y -0.165 at z 1.36 with its 8 mm trim at -0.173, -0.15 at 1.44, back 0.195 at 1.16,
# torso rx ~0.23); the blouse (chibi torso + 2.2 cm) sits further inside it. The front hangs plumb from the
# rim onto the bust, the back from the nape down the shoulder blades. The scarf's sides end on
# the shoulder tops (the sleeves stay outside it), so there is no shelf over the arms.
# (z, rx, y_front, y_back), world space. Neck funnel (z >= 1.50) clears the collars: the
# blouse's turtleneck (rx 0.070, ry 0.072, cy 0.038, to z 1.585) and the abaya's (r ~0.087).
CHEST = [
    (1.515, 0.105, -0.150, 0.160),
    (1.500, 0.150, -0.150, 0.148),
    (1.490, 0.200, -0.152, 0.162),
    (1.475, 0.235, -0.156, 0.172),
    (1.455, 0.250, -0.165, 0.180),
    (1.430, 0.250, -0.178, 0.190),
    (1.400, 0.250, -0.186, 0.198),
    (1.360, 0.250, -0.190, 0.205),
    (1.300, 0.245, -0.190, 0.210),
    (1.220, 0.235, -0.186, 0.212),
    (1.140, 0.230, -0.182, 0.215),
    (1.060, 0.235, -0.180, 0.220),
    (1.000, 0.240, -0.180, 0.222),
]
SHOULDER_Z = 1.49  # the scarf's side edges sit here, on top of the shoulders (sleeve heads are at z ~1.47)


def chest(z):
    s = CHEST
    if z >= s[0][0]:
        return s[0][1:]
    for a, c in zip(s, s[1:]):
        if c[0] <= z <= a[0]:
            t = (a[0] - z) / (a[0] - c[0])
            return tuple(a[k] + (c[k] - a[k]) * t for k in (1, 2, 3))
    return s[-1][1:]


def ellipse_point(psi, z):
    rx, yf, yb = chest(z)
    return Vector((rx * math.sin(psi), (yf + yb) / 2 - (yb - yf) / 2 * math.cos(psi), z))


def _dpsi(psi):
    """Angular distance from the front."""
    return min(psi, 2 * math.pi - psi)


# Six soft folds, one every 60 deg (at +-30, +-90, +-150 from the front); the rings narrow
# towards the neck, so the folds converge toward the chin. The ring's points sit on the fold
# walls (offsets per 60-deg sector) so each valley keeps its shape.
SECTOR = [-30.0, -14.0, -6.0, 0.0, 6.0, 14.0]
PSIS = [math.radians(30.0 + 60.0 * k + o) for k in range(PLEATS) for o in SECTOR]
FOLD_HALF = math.radians(10.0)


def fold(psi):
    """1 at the bottom of a fold, 0 on the flat cloth (rounded profile)."""
    d = (psi - math.radians(30.0)) % math.radians(60.0)
    d = min(d, math.radians(60.0) - d)
    if d >= FOLD_HALF:
        return 0.0
    return 0.5 * (1 + math.cos(math.pi * d / FOLD_HALF))


def wrap_weights(ctx, p):
    """drape_weights, but the cloth on the shoulders follows the clavicle / upper arm a
    little (the same blend as the tops), so it moves with the shoulder when she walks."""
    out = ctx.drape_weights(p)
    k = ctx.smooth(0.14, 0.22, abs(p.x)) * 0.7 if p.z < 1.53 else 0.0
    if k <= 0:
        return out
    sd = "l" if p.x >= 0 else "r"
    t = ctx.smooth(0.20, 0.28, abs(p.x))
    out = {bn: wt * (1 - k) for bn, wt in out.items()}
    out["upperarm_" + sd] = out.get("upperarm_" + sd, 0) + k * (0.4 + 0.6 * t)
    out["clavicle_" + sd] = out.get("clavicle_" + sd, 0) + k * 0.6 * (1 - t)
    return out


def build_wrap(ctx, srf, name, long):
    z_front, z_back = (1.02, 1.08) if long else (1.28, 1.32)
    psis = sorted(p % (2 * math.pi) for p in PSIS)

    def hem(psi):
        # A gentle U: lowest at the centre front (and back), rising smoothly to the shoulder
        # tops at the sides; the fold valleys hang 8 mm lower.
        a = _dpsi(psi)
        a0 = math.radians(30.0 if long else 10.0)  # the long panels keep their width to the waist
        if a <= math.pi / 2:
            z0, t = z_front, ctx.smooth(a0, math.radians(80.0), a)
        else:
            z0, t = z_back, ctx.smooth(a0, math.radians(80.0), math.pi - a)
        return ctx.lerp(z0, SHOULDER_Z, t) - 0.008 * fold(psi)

    def pleated(psi, z):
        p = ellipse_point(psi, z)
        depth = PLEAT_DEPTH * ctx.smooth(1.50, 1.44, z) * fold(psi)
        if depth <= 0:
            return p
        # The fold sinks along the surface normal (ring tangent x slope tangent = outward).
        tp = ellipse_point(psi + 0.02, z) - ellipse_point(psi - 0.02, z)
        tz = ellipse_point(psi, z + 0.008) - ellipse_point(psi, z - 0.008)
        n = tp.cross(tz)
        if n.length < 1e-9:
            return p
        return p - n.normalized() * depth

    rings = []
    # Ring 0 hugs the cap at the jaw (3 mm above it); at the front it tucks under the band's chin segment.
    rings.append([srf.at(psi, math.radians(ctx.lerp(-67.0, -38.0, ctx.smooth(0.5, 1.15, _dpsi(psi)))), CAP_OFF + 0.003) for psi in psis])
    # Ring 1: the rolled rim, below the chin at the front (the enlarged chin tip is at y -0.14,
    # z 1.56), round the collars at the sides, rising to the nape.
    rings.append([Vector((0.105 * math.sin(psi), 0.005 - 0.155 * math.cos(psi), 1.515 + 0.075 * (1 - math.cos(psi)) / 2)) for psi in psis])
    zs = [1.50, 1.49, 1.475, 1.455, 1.43, 1.40, 1.36]
    zs += [1.30, 1.22, 1.14, 1.06, 1.00] if long else [1.32, 1.28, 1.25]
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
