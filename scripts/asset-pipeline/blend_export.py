import bpy, bmesh, sys, mathutils
src, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
D = bpy.data
for o in list(D.objects):
    if o.type != 'MESH' or o.name.startswith(('Ground', 'Duplication', 'Windscreen_for_lattice')):
        D.objects.remove(o, do_unlink=True)
# keep subdivision modest so it runs on phones
for o in D.objects:
    for m in o.modifiers:
        if m.type == 'SUBSURF':
            m.levels = 1
# strip stray rim verts
rim = D.objects['Rim']
bm = bmesh.new(); bm.from_mesh(rim.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if (rim.matrix_world @ v.co).y > -1.0], context='VERTS')
bm.to_mesh(rim.data); bm.free()

CENTER = mathutils.Vector((0.712, -1.528, 0.363))
GROUND = 0.07
wheel_names = ['Rim', 'Tyre', 'Rim_cap']
def export(path, names):
    bpy.ops.object.select_all(action='DESELECT')
    for n in names: D.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = D.objects[names[0]]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_materials='EXPORT', export_image_format='NONE', export_cameras=False, export_lights=False,
        export_texcoords=False, export_normals=True, export_extras=False)

# wheel: recentre on its hub
for n in wheel_names:
    o = D.objects[n]
    o.matrix_world = mathutils.Matrix.Translation(-CENTER) @ o.matrix_world
bpy.context.view_layer.update()
export(out + '/m4-wheel.glb', wheel_names)
# body: everything else, tyre contact patch at y=0
body = [o.name for o in D.objects if o.name not in wheel_names]
for n in body:
    o = D.objects[n]
    o.matrix_world = mathutils.Matrix.Translation((0, 0, -GROUND)) @ o.matrix_world
bpy.context.view_layer.update()
export(out + '/m4-body.glb', body)
print('EXPORTED', len(body), 'body objects')
