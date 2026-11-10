# Convert the Trees & Bushes pack into lightweight game GLBs.
# Foliage (many small disconnected leaf clusters) is thinned by keeping a random subset of leaf
# islands and scaling each kept cluster up so the canopy keeps its volume. Bark is decimated.
import bpy, bmesh, sys, random, json, mathutils
import os
src, out = sys.argv[-2], sys.argv[-1]
LOD = int(os.environ.get('LOD', '0'))
bpy.ops.wm.open_mainfile(filepath=src)
D = bpy.data
GROUND_Z = -1.8

# name -> (kind, budget faces for foliage, budget for bark)
VARIANTS = {
    'leaves.001': ('tree', 9000, 1400), 'tree.005': ('tree', 9000, 1400), 'tree.006': ('tree', 9000, 1400),
    'tree.007': ('tree', 9000, 1400), 'tree.008': ('tree', 9000, 1400), 'tree.009': ('tree', 9000, 1400),
    'leaves': ('bush', 3400, 300), 'tree': ('bush', 3400, 300), 'tree.001': ('bush', 3400, 300),
    'tree.002': ('bush', 3400, 300), 'tree.003': ('bush', 3400, 300), 'tree.004': ('bush', 3400, 300),
}

def islands_of(bm, faces):
    faces = set(faces)
    seen, result = set(), []
    for f in faces:
        if f in seen: continue
        comp, st = [], [f]
        seen.add(f)
        while st:
            c = st.pop(); comp.append(c)
            for e in c.edges:
                for nf in e.link_faces:
                    if nf in faces and nf not in seen: seen.add(nf); st.append(nf)
        result.append(comp)
    return result

def node_color(mat):
    for n in mat.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeBsdfDiffuse':
            return list(n.inputs['Color'].default_value)[:3]
    return [0.1, 0.1, 0.1]

report = {}
for i, (name, (kind, leaf_budget, bark_budget)) in enumerate(VARIANTS.items()):
    if LOD:
        leaf_budget, bark_budget = (1300, 220) if kind == 'tree' else (520, 60)
    random.seed(1000 + i)
    o = D.objects[name]
    me = o.data.copy()
    me.transform(o.matrix_world)
    bm = bmesh.new(); bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    # classify materials
    by_mat = {}
    for f in bm.faces: by_mat.setdefault(f.material_index, []).append(f)
    roles = {}
    to_delete = set()
    # foliage = the greener / brighter of the two materials (bark is dark red-brown)
    score = lambda c: c[1] / max(c[0], 1e-4) + sum(c) * 2
    mats = list(o.data.materials)
    leaf_mi = max(range(len(mats)), key=lambda k: score(node_color(mats[k]))) if len(mats) > 1 else 0
    tri = lambda comp: sum(len(f.verts) - 2 for f in comp)
    for mi, faces in by_mat.items():
        isl = islands_of(bm, faces)
        foliage = mi == leaf_mi
        roles[mi] = 'leaf' if foliage else 'bark'
        total = sum(tri(c) for c in isl)
        if foliage and total > leaf_budget:
            keep = leaf_budget / total
            # single-material plants: protect the trunk (largest pieces)
            protect = set()
            if len(mats) == 1:
                ranked = sorted(isl, key=lambda c: len(c), reverse=True)[:4]
                protect = {id(c) for c in ranked}
            grow = min(4.2 if LOD else 3.0, (1 / keep) ** 0.5 * 0.95)
            for comp in isl:
                if id(comp) in protect:
                    continue
                if random.random() < keep:
                    verts = {v for f in comp for v in f.verts}
                    c = sum((v.co for v in verts), mathutils.Vector()) / len(verts)
                    for v in verts: v.co = c + (v.co - c) * grow
                else:
                    to_delete.update(comp)
        elif not foliage and total > bark_budget:
            # keep the biggest pieces (trunk, limbs); drop twigs hidden by the canopy
            def size(comp):
                vs = [v.co for f in comp for v in f.verts]
                mn = mathutils.Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
                mx = mathutils.Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
                return (mx - mn).length
            used = 0
            for comp in sorted(isl, key=size, reverse=True):
                t = tri(comp)
                if used + t <= bark_budget or used == 0: used += t
                else: to_delete.update(comp)
    # a single-material object is all leaves+wood merged; treat by island size
    bmesh.ops.delete(bm, geom=list(to_delete), context='FACES')
    bm.to_mesh(me); bm.free()
    obj = D.objects.new('v_' + name, me)
    bpy.context.scene.collection.objects.link(obj)
    # recentre: base centre at origin, Z-up (exporter converts to Y-up)
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    me.transform(mathutils.Matrix.Translation((-cx, -cy, -GROUND_Z)))
    # materials -> Principled with the pack's colours (slightly lifted: the originals were tuned for Cycles GI)
    new_mats = []
    for mi, m in enumerate(o.data.materials):
        col = node_color(m)
        role = roles.get(mi, 'bark')
        nm = D.materials.new(f'{role}')
        nm.use_nodes = True
        p = nm.node_tree.nodes.get('Principled BSDF')
        lift = 1.9 if role == 'leaf' else 1.5
        p.inputs['Base Color'].default_value = [min(1, c * lift) for c in col] + [1]
        p.inputs['Roughness'].default_value = 0.85
        new_mats.append(nm)
    # NB: materials.clear() would reset every polygon's material_index to 0 — swap slots in place instead
    for k, nm in enumerate(new_mats): me.materials[k] = nm
    me.shade_smooth() if hasattr(me, 'shade_smooth') else None
    h = max(v.co.z for v in me.vertices)
    w = max(max(v.co.x for v in me.vertices) - min(v.co.x for v in me.vertices), max(v.co.y for v in me.vertices) - min(v.co.y for v in me.vertices))
    report[name] = {'kind': kind, 'tris': sum(len(p.vertices) - 2 for p in me.polygons), 'height': round(h, 2), 'width': round(w, 2), 'roles': roles}
    # export this one
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    fn = f"{out}/{kind}-{name.replace('.', '-')}{'-lod1' if LOD else ''}.glb"
    bpy.ops.export_scene.gltf(filepath=fn, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_texcoords=False, export_normals=True, export_cameras=False, export_lights=False)
    print('EXPORTED', fn, report[name])
json.dump(report, open(out + '/report.json', 'w'), indent=1)
