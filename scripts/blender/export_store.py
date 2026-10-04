"""Bake the Le Voile boutique (Cycles) and export a web-ready GLB + anchors.

Run through the driver (fresh Blender process per stage, retries on crash):

    node scripts/bake-store.mjs [--res 4096] [--samples 256]

Stages (each: blender -b <file> -P export_store.py -- --stage <name> ...):
  prep    EL_REBAT_Render.blend -> _bake/work.blend + store-anchors.json
          include the ceiling (invisible to bake rays, like the open-top render),
          drop cameras/micro details, single-user data, decimate garments, tag
          every mesh with a bake group.
  bake    work.blend --group <arch|fixtures|soft|hardware>
          give the group's objects a shared "Bake" UV atlas, bake Cycles
          diffuse + GI + emission, save PNG with the scene's AgX look.
  export  work.blend -> store.glb (one mesh + one baked material per group,
          live glass/mirror materials, Draco + WebP)
"""

import json
import math
import os
import re
import sys
import time

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default):
    if name in ARGS:
        return type(default)(ARGS[ARGS.index(name) + 1])
    return default


STAGE = arg("--stage", "prep")
GROUP = arg("--group", "")
RES = arg("--res", 4096)
SAMPLES = arg("--samples", 256)
SAFE = arg("--safe", 0)  # 1 = single-threaded sync (slow, avoids a Cycles sync race)
OUT = os.path.abspath(arg("--out", "public/models/mall"))
# Working files (work.blend, raw/denoised atlases) live outside public/ so they are never deployed.
BAKE_DIR = os.path.abspath(arg("--work", "tools/bake-work"))
WORK = os.path.join(BAKE_DIR, "work.blend")
os.makedirs(BAKE_DIR, exist_ok=True)

BAKE_GROUPS = ("arch", "ceiling", "fixtures", "soft", "hardware")
HALF_RES_GROUPS = {"ceiling", "hardware"}
t0 = time.time()
scene = bpy.context.scene
vl = bpy.context.view_layer


def log(*a):
    print(f"[{time.time() - t0:7.1f}s] [{STAGE}{':' + GROUP if GROUP else ''}]", *a, flush=True)


def base_name(n):
    return re.sub(r"\.\d+$", "", n)


def select_only(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    vl.objects.active = active or (objs[0] if objs else None)


# =========================================================================
# prep
# =========================================================================
ANCHOR_GROUPS = [
    "Wood_Base", "Top_Wood_Shelf", "Hanging_Rail", "Tabletop", "Gondola_Top", "Gondola_Cabinet", "NEW",
    "Checkout_Counter_Body", "Checkout_Worktop", "Payment_Terminal", "Le Voile", "Brand_Oak_Panel",
    "Fitting_Room_Left", "Fitting_Room_Right", "Fitting_Room_Front_Left", "Fitting_Room_Front_Right", "Fitting_Bench",
    "Scarf_Bay_1_Backing", "Scarf_Bay_2_Backing", "Scarf_Bay_3_Backing", "Scarf_Bay_4_Backing", "Scarf_Bay_5_Backing",
    "Scarf_Header", "Right_Wall_Back", "Right_Bay_Header", "Right_Lower_Cabinet", "Lower_Cabinet", "Oak_Divider",
    "Rear_Display_Back", "Rear_Display_Side", "Rear_Display_Header", "Mannequin_Base", "Torso", "Plant_Pot",
    "Mirror_Frame", "Mirror_Surface", "Door_Glass", "Front_Glass_Panel", "Left_Wall", "Right_Wall", "Rear_Wall",
    "Floor_150sqm", "Right_Bay_Divider",
]
COLLIDER_GROUPS = [
    "Left_Wall", "Right_Wall", "Rear_Wall", "Front_Glass_Panel", "Wood_Base", "Tabletop", "Gondola_Cabinet",
    "Checkout_Counter_Body", "Fitting_Room_Left", "Fitting_Room_Right", "Fitting_Room_Front_Left",
    "Fitting_Room_Front_Right", "Rear_Display_Back", "Rear_Display_Side", "Lower_Cabinet", "Right_Lower_Cabinet",
    "Mannequin_Base", "Plant_Pot", "Mirror_Frame", "Door_Glass", "Fitting_Bench",
]
GLASS = {"Clear_Architectural_Glass"}
ARCH = {"Foundation", "Floor_150sqm", "Left_Wall", "Right_Wall", "Rear_Wall", "Skirting", "Wall_Crown", "Rear_Crown",
        "Dark_Ceiling", "Lighting_Track", "Ceiling_Spot_Housing", "Ceiling_Spot_Lens", "Window_Mullion",
        "Front_Bottom_Frame", "Front_Top_Frame", "Door_Edge", "Door_Handle", "Optional_Ceiling"}
CEILING = {"Dark_Ceiling", "Lighting_Track", "Ceiling_Spot_Housing", "Ceiling_Spot_Lens", "Optional_Ceiling"}
HARDWARE_PREFIX = ("Hanger", "Scarf_Rail", "Rack_Post", "Rack_Crossbar", "Hanging_Rail", "Right_Hanging_Rail",
                   "Rear_Hanging_Rail", "Curtain_Rod", "Right_Cabinet_Door_Handle", "Accessory_Drawer_Handle")
SOFT_MATS = {f"Woven_Fabric_{i:02d}" for i in range(13)} - {"Woven_Fabric_05"}
DROP = {"Shirt_Button", "Stitched_Collar", "Front_Placket_Seam", "Foundation",
        # window mannequins: the web app puts its own showcase models on the bases
        "Torso", "Head", "Neck", "Leg", "Shoe", "Upper_Arm", "Forearm", "Hand",
        "Long_Skirt", "Skirt_Pleat", "Wide_Leg_Jeans", "Jeans_Waist"}
DECIMATE = {"Top": 0.22, "Long_Dress": 0.3, "Trousers": 0.35, "Folded_Scarf": 0.3, "Hanger_Hook": 0.2,
            "Hanger_Left": 0.5, "Hanger_Right": 0.5, "Hanger_Base": 0.5}


def to_three(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def world_bounds(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


def box_three(mn, mx):
    return {"min": [round(mn.x, 3), round(mn.z, 3), round(-mx.y, 3)], "max": [round(mx.x, 3), round(mx.z, 3), round(-mn.y, 3)]}


def group_of(o):
    b = base_name(o.name)
    mats = {s.material.name for s in o.material_slots if s.material}
    if mats & GLASS:
        return "glass"
    if b == "Mirror_Surface":
        return "mirror"
    if b in CEILING:
        return "ceiling"
    if b in ARCH:
        return "arch"
    if b.startswith(HARDWARE_PREFIX):
        return "hardware"
    if mats & SOFT_MATS:
        return "soft"
    return "fixtures"


def save_texcoords(meshes):
    """Store each object's Generated (bbox-normalised) and Object coordinates as attributes,
    so procedural materials look the same after the group is joined into one object."""
    import numpy as np

    for o in meshes:
        me = o.data
        n = len(me.vertices)
        if n == 0:
            continue
        co = np.empty(n * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        mn = co.min(0)
        size = np.maximum(co.max(0) - mn, 1e-4)
        for name, values in (("lv_orco", (co - mn) / size), ("lv_objco", co)):
            a = me.attributes.get(name) or me.attributes.new(name, "FLOAT_VECTOR", "POINT")
            a.data.foreach_set("vector", values.astype(np.float32).ravel())


PROCEDURAL = {"TEX_NOISE", "TEX_VORONOI", "TEX_WAVE", "TEX_GRADIENT", "TEX_MAGIC", "TEX_BRICK", "TEX_CHECKER", "TEX_WHITE_NOISE"}


def patch_materials():
    """Point procedural textures at the saved coordinates instead of implicit Generated/Object."""
    for m in bpy.data.materials:
        if not m.use_nodes or not m.node_tree:
            continue
        nt = m.node_tree
        cache = {}

        def attr(name):
            if name not in cache:
                n = nt.nodes.new("ShaderNodeAttribute")
                n.attribute_type = "GEOMETRY"
                n.attribute_name = name
                cache[name] = n
            return cache[name]

        for node in list(nt.nodes):
            if node.type in PROCEDURAL and "Vector" in node.inputs and not node.inputs["Vector"].is_linked:
                nt.links.new(attr("lv_orco").outputs["Vector"], node.inputs["Vector"])
            if node.type == "TEX_COORD" and getattr(node, "object", None) is None:
                for out, name in (("Generated", "lv_orco"), ("Object", "lv_objco")):
                    for link in list(node.outputs[out].links):
                        nt.links.new(attr(name).outputs["Vector"], link.to_socket)


def stage_prep():
    anchors = {"units": "metres; three.js Y-up (x, y, z) = blender (x, z, -y)", "groups": {}, "colliders": [], "lights": []}
    for ob in scene.objects:
        b = base_name(ob.name)
        if ob.type == "MESH" and b in ANCHOR_GROUPS:
            mn, mx = world_bounds(ob)
            anchors["groups"].setdefault(b, []).append({"name": ob.name, **box_three(mn, mx), "center": to_three((mn + mx) / 2)})
        if ob.type == "MESH" and b in COLLIDER_GROUPS:
            mn, mx = world_bounds(ob)
            pad = 0.25 if b == "Mannequin_Base" else 0.0
            bx = box_three(mn - Vector((pad, pad, 0)), mx + Vector((pad, pad, 0)))
            bx["max"][1] = max(bx["max"][1], 1.8)
            bx["kind"] = b
            anchors["colliders"].append(bx)
        if ob.type == "LIGHT":
            anchors["lights"].append({"name": ob.name, "type": ob.data.type, "energy": ob.data.energy,
                                      "color": list(ob.data.color), "pos": to_three(ob.location), "size": getattr(ob.data, "size", 0)})
    with open(os.path.join(OUT, "store-anchors.json"), "w", encoding="utf8") as f:
        json.dump(anchors, f, indent=1)
    log("anchors", len(anchors["groups"]), "groups,", len(anchors["colliders"]), "colliders")

    def walk(lc):
        yield lc
        for c in lc.children:
            yield from walk(c)

    for lc in walk(vl.layer_collection):
        if lc.name == "Ceiling_Assembly":
            lc.exclude = False
    vl.update()

    for ob in list(scene.objects):
        if ob.type in {"CAMERA", "GPENCIL", "CURVE", "FONT"}:
            bpy.data.objects.remove(ob, do_unlink=True)
        elif ob.type == "MESH" and (base_name(ob.name) in DROP or ob.hide_render or ob.hide_get()):
            bpy.data.objects.remove(ob, do_unlink=True)
    vl.update()
    meshes = [o for o in scene.objects if o.type == "MESH"]
    select_only(meshes)
    bpy.ops.object.make_single_user(object=True, obdata=True, material=False)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")

    for o in meshes:
        r = DECIMATE.get(base_name(o.name))
        if r is None and base_name(o.name).startswith("Garment_"):
            r = 0.35
        if r:
            m = o.modifiers.new("dec", "DECIMATE")
            m.ratio = r
            m.use_collapse_triangulate = True
    with_mods = [o for o in meshes if o.modifiers]
    if with_mods:
        select_only(with_mods)
        bpy.ops.object.convert(target="MESH")
    meshes = [o for o in scene.objects if o.type == "MESH"]
    save_texcoords(meshes)
    patch_materials()
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    log("meshes", len(meshes), "triangles", tris)

    counts = {}
    for o in meshes:
        g = group_of(o)
        o["bake_group"] = g
        counts[g] = counts.get(g, 0) + 1
        # Ceiling and glass must not block light while baking.
        if base_name(o.name) in CEILING or g == "glass":
            o.visible_shadow = False
            o.visible_diffuse = False
            o.visible_glossy = False
            o.visible_transmission = False
    log("groups", counts)
    bpy.ops.wm.save_as_mainfile(filepath=WORK, compress=False)
    log("saved", WORK)


# =========================================================================
# bake (one group per process)
# =========================================================================
def uv_bounds(layer):
    import numpy as np

    uv = np.empty(len(layer.data) * 2, dtype=np.float32)
    layer.data.foreach_get("uv", uv)
    return float(uv.min()), float(uv.max())


def normalize_uvs(layer):
    import numpy as np

    uv = np.empty(len(layer.data) * 2, dtype=np.float32)
    layer.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    lo = uv.min(0)
    extent = float((uv.max(0) - lo).max())
    uv = (uv - lo) / extent * 0.996 + 0.002
    layer.data.foreach_set("uv", uv.astype(np.float32).ravel())


def setup_cycles():
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.render.threads_mode = "FIXED" if SAFE else "AUTO"
    if SAFE:
        scene.render.threads = 1
    prefs = bpy.context.preferences.addons["cycles"].preferences
    # CUDA kernels ship precompiled; OptiX JIT-compiles kernels in every fresh process.
    for backend in ("CUDA", "OPTIX", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            if any(d.type == backend for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                return backend
        except Exception:
            continue
    return "CPU"


def stage_bake():
    objs = [o for o in scene.objects if o.type == "MESH" and o.get("bake_group") == GROUP]
    res = max(1024, RES // 2) if GROUP in HALF_RES_GROUPS else RES
    log(len(objs), "objects", res, "px, device", setup_cycles())
    # One object = one bake pass (baking N selected objects runs N passes).
    select_only(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    joined = vl.objects.active
    joined.name = f"store_{GROUP}"
    # The join inherits the first object's (often skewed) scale, which collapses smart_project UVs.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    objs = [joined]
    log("joined", len(joined.data.polygons), "faces")

    for o in objs:
        me = o.data
        prev = [uv for uv in me.uv_layers if uv.active_render]
        uv = me.uv_layers.get("Bake") or me.uv_layers.new(name="Bake")
        me.uv_layers.active = uv
        (prev[0] if prev and prev[0].name != "Bake" else uv).active_render = True
    select_only(objs)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    # Uniform texel density across objects (smart_project normalizes each object on its own).
    bpy.ops.uv.average_islands_scale()
    # CONCAVE (the default) silently gives up on ~150k-face meshes; CONVEX/AABB are fast and reliable.
    for shape in ("CONVEX", "AABB"):
        bpy.ops.uv.pack_islands(rotate=True, shape_method=shape, margin_method="FRACTION", margin=6.0 / res)
        bpy.ops.object.mode_set(mode="OBJECT")
        lo, hi = uv_bounds(objs[0].data.uv_layers["Bake"])
        if lo >= -0.01 and hi <= 1.01:
            break
        log(f"pack {shape} out of bounds ({lo:.2f}..{hi:.2f}), retrying")
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.select_all(action="SELECT")
    else:
        # The packer laid islands out without scaling them into 0..1 (happens on very large meshes):
        # the layout is non-overlapping, so a uniform rescale is all that's needed.
        bpy.ops.uv.pack_islands(rotate=True, shape_method="AABB", margin_method="FRACTION", margin=6.0 / res)
        bpy.ops.object.mode_set(mode="OBJECT")
        normalize_uvs(objs[0].data.uv_layers["Bake"])
        lo, hi = uv_bounds(objs[0].data.uv_layers["Bake"])
        log(f"normalized packed UVs to {lo:.3f}..{hi:.3f}")
    # Drop edit-mode UV selection/pin sub-attributes (".vs.", ".es.", ".pn.") that trip Cycles' sync,
    # on every mesh in the scene (they all get synced for the bake).
    for o in [m for m in scene.objects if m.type == "MESH"]:
        me = o.data
        for name in [a.name for a in me.attributes if a.name.startswith((".vs.", ".es.", ".pn."))]:
            a = me.attributes.get(name)
            if a is not None:
                me.attributes.remove(a)
        me.update()
    vl.update()
    log("uv packed")

    bk = scene.render.bake
    bk.use_pass_direct = True
    bk.use_pass_indirect = True
    bk.use_pass_diffuse = True
    bk.use_pass_glossy = False
    bk.use_pass_transmission = True
    bk.use_pass_emit = True
    bk.margin = 8
    bk.margin_type = "EXTEND"
    bk.target = "IMAGE_TEXTURES"

    img = bpy.data.images.new(f"bake_{GROUP}", res, res, alpha=False, float_buffer=True)
    added = []
    for m in {s.material for o in objs for s in o.material_slots if s.material}:
        m.use_nodes = True
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        m.node_tree.nodes.active = n
        added.append((m, n))
    for o in objs:
        if not o.material_slots:
            mat = bpy.data.materials.new(f"default_{GROUP}")
            mat.use_nodes = True
            n = mat.node_tree.nodes.new("ShaderNodeTexImage")
            n.image = img
            mat.node_tree.nodes.active = n
            o.data.materials.append(mat)
    select_only(objs)
    bpy.ops.object.bake(type="COMBINED", use_clear=True, margin=8)
    log("baked")
    path = os.path.join(BAKE_DIR, f"{GROUP}.png")
    img.save_render(path.replace(".png", "_raw.png"), scene=scene)  # AgX look, not denoised (fallback)
    for m, n in added:
        m.node_tree.nodes.remove(n)
    scene[f"baked_{GROUP}"] = True
    bpy.ops.wm.save_as_mainfile(filepath=WORK, compress=False)
    try:
        denoise_and_save(img, path)
        log("denoised", path)
    except Exception as exc:  # keep the raw bake if OIDN/compositor is unavailable
        import shutil
        shutil.copyfile(path.replace(".png", "_raw.png"), path)
        log("denoise failed, using raw bake:", exc)
    log("saved", path)


def denoise_and_save(img, path):
    """OpenImageDenoise via the compositor; the 8-bit save applies the scene's AgX look.
    Runs after work.blend is saved, so the temporary scene changes are never persisted."""
    sc = bpy.context.scene
    sc.use_nodes = True
    tree = sc.node_tree
    tree.nodes.clear()
    n_img = tree.nodes.new("CompositorNodeImage")
    n_img.image = img
    n_dn = tree.nodes.new("CompositorNodeDenoise")
    n_dn.use_hdr = True
    n_out = tree.nodes.new("CompositorNodeComposite")
    tree.links.new(n_img.outputs["Image"], n_dn.inputs["Image"])
    tree.links.new(n_dn.outputs["Image"], n_out.inputs["Image"])
    cam = bpy.data.objects.new("tmp_cam", bpy.data.cameras.new("tmp_cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    for o in sc.objects:
        o.hide_render = o is not cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x, sc.render.resolution_y = img.size
    sc.render.resolution_percentage = 100
    sc.render.use_compositing = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "8"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


# =========================================================================
# export
# =========================================================================
_baked_mats = {}


def baked_material(g, path):
    if g in _baked_mats:
        return _baked_mats[g]
    tex = bpy.data.images.load(path, check_existing=True)
    tex.name = f"store_{g}"
    mat = bpy.data.materials.new(f"baked_{g}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = tex
    nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    _baked_mats[g] = mat
    return mat


def prepare_group(g):
    """Joined group object with only the Bake UV and the single baked material."""
    objs = [o for o in scene.objects if o.type == "MESH" and o.get("bake_group") == g]
    if not objs:
        return None
    select_only(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    j = vl.objects.active
    j.name = f"store_{g}"
    me = j.data
    for name in [uv.name for uv in me.uv_layers if uv.name != "Bake"]:
        layer = me.uv_layers.get(name)
        if layer is not None:
            me.uv_layers.remove(layer)
    me.uv_layers["Bake"].active = True
    me.uv_layers["Bake"].active_render = True
    me.materials.clear()
    me.materials.append(baked_material(g, os.path.join(BAKE_DIR, f"{g}.png")))
    return j
def stage_export():
    out_objs = []
    for g in BAKE_GROUPS:
        objs = [o for o in scene.objects if o.type == "MESH" and o.get("bake_group") == g]
        if not objs:
            continue
        path = os.path.join(BAKE_DIR, f"{g}.png")
        select_only(objs)
        if len(objs) > 1:
            bpy.ops.object.join()
        j = vl.objects.active
        j.name = f"store_{g}"
        me = j.data
        for name in [uv.name for uv in me.uv_layers if uv.name != "Bake"]:
            layer = me.uv_layers.get(name)
            if layer is not None:
                me.uv_layers.remove(layer)
        me.uv_layers["Bake"].active = True
        me.uv_layers["Bake"].active_render = True
        me.materials.clear()
        me.materials.append(baked_material(g, path))
        out_objs.append(j)
        log("joined", g, len(me.polygons), "faces")

    for g in ("glass", "mirror"):
        objs = [o for o in scene.objects if o.type == "MESH" and o.get("bake_group") == g]
        if not objs:
            continue
        select_only(objs)
        if len(objs) > 1:
            bpy.ops.object.join()
        j = vl.objects.active
        j.name = f"store_{g}"
        m = bpy.data.materials.new(f"live_{g}")
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (0.86, 0.91, 0.93, 1) if g == "glass" else (0.92, 0.92, 0.92, 1)
        b.inputs["Metallic"].default_value = 0.0 if g == "glass" else 1.0
        b.inputs["Roughness"].default_value = 0.05
        if g == "glass":
            b.inputs["Alpha"].default_value = 0.16
        j.data.materials.clear()
        j.data.materials.append(m)
        out_objs.append(j)

    select_only(out_objs)
    glb = os.path.join(OUT, "store.glb")
    kw = dict(
        filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT", export_cameras=False,
        export_lights=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12, export_image_format="WEBP",
    )
    try:
        bpy.ops.export_scene.gltf(**kw, export_image_quality=85)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    log("exported", glb, f"{os.path.getsize(glb) / 1e6:.1f} MB")


# =========================================================================
# kit: cut the baked boutique into reusable fixture pieces (kit.glb)
# =========================================================================
def three_box_to_blender(b, pad=(0.0, 0.0), z=None):
    """anchors use three.js coords (x, y, z) = blender (x, z, -y)."""
    x0, y0 = b["min"][0] - pad[0], -b["max"][2] - pad[1]
    x1, y1 = b["max"][0] + pad[0], -b["min"][2] + pad[1]
    z0, z1 = z if z else (b["min"][1], b["max"][1])
    return [x0, y0, z0, x1, y1, z1]


def union(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), min(b[2] for b in boxes),
            max(b[3] for b in boxes), max(b[4] for b in boxes), max(b[5] for b in boxes)]


def kit_pieces(anchors):
    g = anchors["groups"]
    pieces = []  # (name, [x0,y0,z0,x1,y1,z1] blender coords, front vector in blender coords)
    for i, it in enumerate(sorted(g.get("Wood_Base", []), key=lambda it: it["name"])):
        pieces.append((f"rack_{i + 1}", three_box_to_blender(it, (0.28, 0.2), (0.0, 2.45)), (1, 0, 0)))
    for it in g.get("Tabletop", []):
        pieces.append(("table", three_box_to_blender(it, (0.15, 0.15), (0.0, 1.4)), (0, -1, 0)))
    for it in g.get("Gondola_Cabinet", []):
        pieces.append(("gondola", three_box_to_blender(it, (0.12, 0.12), (0.0, 1.45)), (0, -1, 0)))
    for i, it in enumerate(sorted(g.get("Lower_Cabinet", []), key=lambda it: it["center"][2])):
        b = three_box_to_blender(it, (0.06, 0.06), (0.0, 3.12))
        b[0], b[3] = -5.0, -4.28
        pieces.append((f"scarfbay_{i + 1}", b, (1, 0, 0)))
    for i, it in enumerate(sorted(g.get("Right_Lower_Cabinet", []), key=lambda it: it["center"][2])):
        b = three_box_to_blender(it, (0.06, 0.08), (0.0, 3.12))
        b[0], b[3] = 4.24, 5.0
        pieces.append((f"hangbay_{i + 1}", b, (-1, 0, 0)))
    rear = [three_box_to_blender(it) for k in ("Rear_Display_Back", "Rear_Display_Side", "Rear_Display_Header") for it in g.get(k, [])]
    if rear:
        b = union(rear)
        pieces.append(("reardisplay", [b[0] - 0.05, b[1] - 0.15, 0.0, b[3] + 0.05, b[4] + 0.05, 3.12], (0, -1, 0)))
    counter = [three_box_to_blender(it) for k in ("Checkout_Counter_Body", "Checkout_Worktop", "Payment_Terminal") for it in g.get(k, [])]
    if counter:
        b = union(counter)
        pieces.append(("counter", [b[0] - 0.1, b[1] - 0.1, 0.0, b[3] + 0.1, b[4] + 0.1, 1.75], (0, -1, 0)))
    pieces.append(("brandpanel", [-1.8, 7.2, 1.9, 1.3, 7.5, 2.9], (0, -1, 0)))
    pieces.append(("plant", [-2.7, 6.3, 0.0, -1.6, 7.0, 1.75], (0, -1, 0)))
    pieces.append(("pendant", [-2.25, 6.1, 2.6, -1.35, 6.9, 3.7], (0, -1, 0)))
    pieces.append(("fitting", [1.35, 5.68, 0.0, 4.92, 7.5, 2.95], (0, -1, 0)))
    return pieces


def stage_kit():
    import bmesh
    import numpy as np
    from mathutils import Matrix

    anchors = json.load(open(os.path.join(OUT, "store-anchors.json"), encoding="utf8"))
    groups = [prepare_group(g) for g in ("fixtures", "soft", "hardware")]
    groups = [g for g in groups if g]
    for g in groups:
        g.data.transform(g.matrix_world)  # world-space vertices make the box tests trivial
        g.matrix_world = Matrix.Identity(4)

    centres = {}
    for g in groups:
        me = g.data
        c = np.empty(len(me.polygons) * 3, dtype=np.float32)
        me.polygons.foreach_get("center", c)
        centres[g.name] = c.reshape(-1, 3)

    index = {"units": "metres, three.js Y-up; origin = footprint centre at floor level", "pieces": {}}
    kit_objs = []
    for name, box, front in kit_pieces(anchors):
        x0, y0, z0, x1, y1, z1 = box
        origin = Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0.0))
        root = bpy.data.objects.new(f"kit_{name}", None)
        scene.collection.objects.link(root)
        root.location = origin
        parts = 0
        for g in groups:
            c = centres[g.name]
            inside = (c[:, 0] >= x0) & (c[:, 0] <= x1) & (c[:, 1] >= y0) & (c[:, 1] <= y1) & (c[:, 2] >= z0) & (c[:, 2] <= z1)
            if not inside.any():
                continue
            bm = bmesh.new()
            bm.from_mesh(g.data)
            bm.faces.ensure_lookup_table()
            drop = [f for f, keep in zip(bm.faces, inside) if not keep]
            bmesh.ops.delete(bm, geom=drop, context="FACES")
            me = bpy.data.meshes.new(f"kit_{name}_{g.name}")
            bm.to_mesh(me)
            bm.free()
            for mat in g.data.materials:  # bmesh doesn't carry material slots over
                me.materials.append(mat)
            me.transform(Matrix.Translation(-origin))
            part = bpy.data.objects.new(me.name, me)
            scene.collection.objects.link(part)
            part.parent = root
            kit_objs.append(part)
            parts += 1
        if not parts:
            bpy.data.objects.remove(root)
            continue
        kit_objs.append(root)
        index["pieces"][name] = {
            "size": [round(x1 - x0, 3), round(z1 - z0, 3), round(y1 - y0, 3)],
            "front": [front[0], front[2], -front[1]],
            "source": [round(origin.x, 3), 0, round(-origin.y, 3)],
        }
        log("piece", name, parts, "parts")

    select_only(kit_objs)
    glb = os.path.join(OUT, "kit.glb")
    kw = dict(
        filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT", export_cameras=False,
        export_lights=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12, export_image_format="WEBP",
    )
    try:
        bpy.ops.export_scene.gltf(**kw, export_image_quality=85)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    with open(os.path.join(OUT, "kit.json"), "w", encoding="utf8") as f:
        json.dump(index, f, indent=1)
    log("kit exported", glb, f"{os.path.getsize(glb) / 1e6:.1f} MB", len(index["pieces"]), "pieces")


{"prep": stage_prep, "bake": stage_bake, "export": stage_export, "kit": stage_kit}[STAGE]()
log("STAGE_OK")
