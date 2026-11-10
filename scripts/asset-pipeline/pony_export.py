# Export each rigged pony from "MirceaKitsune's Gmod ponies" (Blend Swap #62439, CC-BY 3.0) as a skinned GLB.
# - Blender 2.65 texture slots don't survive into modern Blender, so textures are re-linked by name.
# - Eyes sit on lattice-deformed meshes under separate eye armatures; they are baked and re-parented to the Head bone.
# - Each pony is moved to the origin, standing on the ground, facing -Y (glTF +Z).
import bpy, sys, os, re, mathutils, json
src, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
D = bpy.data
PONIES = ['twilight', 'rainbow', 'fluttershy', 'pinkie', 'applejack', 'rarity', 'derpy', 'lyra', 'bonbon', 'trixie']
ALIASES = {'pinkie': ['pinkie', 'pinkie_pie'], 'rainbow': ['rainbow_dash', 'rainbow']}
TEX_SIZE = {'body': 1024, 'default': 512}

def norm(n):
    n = n.lower()
    n = re.sub(r'^txtr_', '', n)
    n = re.sub(r'\.(tif|tiff|png|jpg)(\.\d+)?$', '', n)
    n = re.sub(r'\.\d+$', '', n)
    n = re.sub(r'\.(t|ti)$', '', n)  # truncated ".tif"
    return n.rstrip('.')

IMAGES = {norm(i.name): i for i in D.images if i.size[0] > 0}

PART_KEYS = {
    'body': ['body'], 'eye_ball_left': ['eyes', 'eye'], 'eye_ball_right': ['eyes', 'eye'],
    'hair_front': ['hair_front', 'hair_fron', 'hair_fro', 'hair'], 'hair_back': ['hair_back_u', 'hair_back', 'hair_bac', 'hair'],
    'hair_bottom': ['hair_back_l'], 'hair': ['hair'], 'tail': ['tail'], 'tail_upper': ['tail_upper'], 'tail_lower': ['tail_lower'],
    'wings_spread': ['wings'], 'wings_folded': ['wings'], 'horn': ['horn'], 'hat': ['hat'], 'cape': ['cape'], 'gem': ['gem'],
    'hair_rib': ['hairband'], 'tail_rib': ['hairband'],
}
FLAT = {
    'mouth_up': (0.96, 0.96, 0.94), 'mouth_down': (0.96, 0.96, 0.94), 'tongue': (0.9, 0.35, 0.4),
    'eyelashes': (0.02, 0.02, 0.02), 'eyelashes_upper': (0.02, 0.02, 0.02), 'eyelashes_lower': (0.02, 0.02, 0.02),
}

def find_image(pony, part):
    aliases = ALIASES.get(pony, [pony])
    for key in PART_KEYS.get(part, []):
        for a in aliases:
            target = f'{a}_{key}'
            for n, img in IMAGES.items():
                if n == target or n.startswith(target + '_') or n.startswith(target) or (len(n) >= 14 and target.startswith(n)):
                    return img
    return None

def make_mat(name, img=None, color=(1, 1, 1), size=512, rough=0.65):
    m = D.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = rough
    if img:
        if img.size[0] > size:
            img = img.copy(); img.scale(size, size)
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = (*color, 1)
    return m

report = {}
for pony in PONIES:
    # fresh file each time so earlier edits don't leak
    bpy.ops.wm.open_mainfile(filepath=src)
    D = bpy.data
    IMAGES = {norm(i.name): i for i in D.images if i.size[0] > 0}
    arm = D.objects.get(f'{pony}_armature') or D.objects[f'{pony}__armature']
    prefix = pony + '_'
    members = [o for o in D.objects if (o.name.startswith(prefix) or (pony == 'applejack' and o.name == 'pplejack_eyelashes'))]
    meshes = [o for o in members if o.type == 'MESH']
    dg = bpy.context.evaluated_depsgraph_get()
    missing = []
    keep = []
    for o in meshes:
        part = o.name[len(prefix):] if o.name.startswith(prefix) else 'eyelashes'
        if part.startswith('eye_ball'):
            # bake lattice + eye rig into a plain mesh, parent to Head bone
            ev = o.evaluated_get(dg)
            me = D.meshes.new_from_object(ev)
            me.transform(o.matrix_world)
            eo = D.objects.new(o.name + '_baked', me)
            bpy.context.scene.collection.objects.link(eo)
            eo.parent = arm
            eo.parent_type = 'BONE'
            eo.parent_bone = 'Head'
            # keep world placement: inverse of the bone's world matrix at rest
            pb = arm.pose.bones['Head']
            bone_world = arm.matrix_world @ pb.matrix @ mathutils.Matrix.Translation((0, pb.bone.length, 0))
            eo.matrix_parent_inverse = bone_world.inverted()
            o_target = eo
        else:
            o_target = o
        # subdivision: one level keeps the cartoon shapes smooth
        for mod in o_target.modifiers:
            if mod.type == 'SUBSURF':
                mod.levels = 1; mod.render_levels = 1
        # materials
        if part in FLAT:
            mat = make_mat(f'{pony}_{part}', color=FLAT[part], rough=0.4 if 'mouth' in part else 0.6)
        else:
            img = find_image(pony, part)
            if not img: missing.append(part)
            mat = make_mat(f'{pony}_{part}', img=img, size=TEX_SIZE['body'] if part == 'body' else TEX_SIZE['default'])
        o_target.data.materials.clear()  # (safe: single-material meshes)
        o_target.data.materials.append(mat)
        keep.append(o_target)
    # remove originals of eyes + eye rigs / lattices
    for o in list(members):
        if o.type in ('LATTICE',) or (o.type == 'ARMATURE' and o != arm) or (o.type == 'MESH' and o.name.split('_')[-2:-1] == ['ball'] and not o.name.endswith('_baked')):
            D.objects.remove(o, do_unlink=True)
    # move pony to origin, feet on ground
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    minz = min((o.evaluated_get(dg).matrix_world @ mathutils.Vector(c)).z for o in keep if o.name in D.objects for c in o.evaluated_get(dg).bound_box)
    arm.location = (0, 0, arm.location.z - minz)
    bpy.context.view_layer.update()
    # select + export
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for o in keep:
        if o.name in D.objects: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    fn = f'{out}/pony-{pony}.glb'
    bpy.ops.export_scene.gltf(filepath=fn, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_skins=True, export_animations=False, export_materials='EXPORT', export_image_format='JPEG',
        export_image_quality=80, export_cameras=False, export_lights=False, export_def_bones=False)
    parts = sorted(o.name for o in keep)
    report[pony] = {'missing': missing, 'parts': len(parts), 'size': os.path.getsize(fn)}
    print('PONY', pony, report[pony])
json.dump(report, open(out + '/report.json', 'w'), indent=1)
