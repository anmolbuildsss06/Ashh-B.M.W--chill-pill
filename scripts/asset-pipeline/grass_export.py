# Export the grass clump from Simple_Realistic_Grass.blend, thinned to N blades, with a per-vertex
# "height" (0 root → 1 tip) stored as vertex colour for the wind/colour shader.
import bpy, bmesh, sys, random, mathutils
src, out, keep_n = sys.argv[-3], sys.argv[-2], int(sys.argv[-1])
bpy.ops.wm.open_mainfile(filepath=src)
o = bpy.data.objects['grass_03.001']
me = o.data.copy()
me.transform(mathutils.Matrix.Diagonal((1, 1, 1, 1)))  # clump is authored at unit scale, Z-up
bm = bmesh.new(); bm.from_mesh(me)
seen, isl = set(), []
for f in bm.faces:
    if f in seen: continue
    comp, st = [], [f]; seen.add(f)
    while st:
        c = st.pop(); comp.append(c)
        for e in c.edges:
            for nf in e.link_faces:
                if nf not in seen: seen.add(nf); st.append(nf)
    isl.append(comp)
random.seed(7)
keep = set(map(id, random.sample(isl, min(keep_n, len(isl)))))
bmesh.ops.delete(bm, geom=[f for c in isl if id(c) not in keep for f in c], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(me); bm.free()
zs = [v.co.z for v in me.vertices]
zmin, zmax = min(zs), max(zs)
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
me.transform(mathutils.Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -zmin)))
# height → colour attribute
ca = me.color_attributes.new('h', 'FLOAT_COLOR', 'POINT')
for i, v in enumerate(me.vertices):
    h = (v.co.z) / (zmax - zmin)
    ca.data[i].color = (h, h, h, 1)
obj = bpy.data.objects.new('grass', me)
bpy.context.scene.collection.objects.link(obj)
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_normals=True,
    export_texcoords=False, export_materials='NONE', export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_cameras=False, export_lights=False)
print('GRASS', len(me.polygons), 'faces', sum(len(p.vertices) - 2 for p in me.polygons), 'tris', 'height', round(zmax - zmin, 3),
      'width', round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3))
