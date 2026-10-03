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
OUT = os.path.abspath(arg("--out", "public/models/mall"))
BAKE_DIR = os.path.join(OUT, "_bake")
WORK = os.path.join(BAKE_DIR, "work.blend")
os.makedirs(BAKE_DIR, exist_ok=True)

BAKE_GROUPS = ("arch", "fixtures", "soft", "hardware")
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
DROP = {"Shirt_Button", "Stitched_Collar", "Front_Placket_Seam"}
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
    if b in ARCH:
        return "arch"
    if b.startswith(HARDWARE_PREFIX):
        return "hardware"
    if mats & SOFT_MATS:
        return "soft"
    return "fixtures"


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
def setup_cycles():
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 1
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
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
    res = RES if GROUP != "hardware" else max(1024, RES // 2)
    log(len(objs), "objects", res, "px, device", setup_cycles())

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
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=6.0 / res)
    bpy.ops.object.mode_set(mode="OBJECT")
    # Drop edit-mode UV selection/pin sub-attributes (".vs.", ".es.", ".pn.") that trip Cycles' sync.
    for o in objs:
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
    img.save_render(path, scene=scene)  # applies the AgX view transform + exposure
    for m, n in added:
        m.node_tree.nodes.remove(n)
    scene[f"baked_{GROUP}"] = True
    bpy.ops.wm.save_as_mainfile(filepath=WORK, compress=False)
    log("saved", path)


# =========================================================================
# export
# =========================================================================
def stage_export():
    out_objs = []
    for g in BAKE_GROUPS:
        objs = [o for o in scene.objects if o.type == "MESH" and o.get("bake_group") == g]
        if not objs:
            continue
        path = os.path.join(BAKE_DIR, f"{g}.png")
        select_only(objs)
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
        tex = bpy.data.images.load(path, check_existing=False)
        tex.name = f"store_{g}"
        mat = bpy.data.materials.new(f"baked_{g}")
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = tex
        nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.9
        me.materials.clear()
        me.materials.append(mat)
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


{"prep": stage_prep, "bake": stage_bake, "export": stage_export}[STAGE]()
log("STAGE_OK")
