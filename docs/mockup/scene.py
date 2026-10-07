import bpy, math, os, sys
argv = sys.argv[sys.argv.index("--") + 1:]
SCREEN, OUT, SAMPLES = argv[0], argv[1], int(argv[2])
MM = 0.001

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def mat(name, color, rough=0.5, metal=0.0, coat=0.0, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    return m

def rounded_box(name, sx, sy, sz, bevel, loc, material, segs=16):
    bpy.ops.mesh.primitive_cube_add(size=1, location=[v * MM for v in loc])
    o = bpy.context.object; o.name = name
    o.scale = (sx * MM, sy * MM, sz * MM)
    bpy.ops.object.transform_apply(scale=True)
    m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel * MM; m.segments = segs; m.limit_method = "NONE"
    bpy.ops.object.shade_smooth()
    o.data.materials.append(material)
    return o

def cylinder(name, r, depth, loc, material, bevel=0.6):
    bpy.ops.mesh.primitive_cylinder_add(radius=r * MM, depth=depth * MM, vertices=96, location=[v * MM for v in loc])
    o = bpy.context.object; o.name = name
    m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel * MM; m.segments = 8; m.limit_method = "ANGLE"
    bpy.ops.object.shade_smooth()
    o.data.materials.append(material)
    return o

# Materials
body_m = mat("body", (0.012, 0.025, 0.05), rough=0.42)          # deep navy soft-touch
glass_m = mat("glass", (0.0, 0.0, 0.0), rough=0.12, coat=0.3)
red_m = mat("red", (0.42, 0.02, 0.02), rough=0.28, coat=0.6)
grey_m = mat("grey", (0.08, 0.085, 0.09), rough=0.35)
alu_m = mat("alu", (0.8, 0.8, 0.82), rough=0.22, metal=1.0)
port_m = mat("port", (0.005, 0.005, 0.005), rough=0.6)
print_m = mat("print", (0.55, 0.58, 0.62), rough=0.5)

# Screen with emission texture
scr_m = bpy.data.materials.new("screen"); scr_m.use_nodes = True
nt = scr_m.node_tree; n = nt.nodes; l = nt.links
bsdf = n["Principled BSDF"]
tex = n.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(SCREEN)
bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
bsdf.inputs["Roughness"].default_value = 0.05
bsdf.inputs["Coat Weight"].default_value = 1.0
l.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 1.0

# Body: 46 x 128 x 15 mm
rounded_box("body", 46, 128, 15, 7.0, (0, 0, 7.5), body_m)
# Glass front over the AMOLED, flush-ish on top
rounded_box("glass", 34, 41.5, 1.2, 2.2, (0, 30, 15.2), glass_m, segs=10)
# Active area 1.8" (approx. 29 x 35 mm), plane with UVs
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 30 * MM, 15.82 * MM))
s = bpy.context.object; s.name = "display"; s.scale = (29.2 * MM, 35.5 * MM, 1); bpy.ops.object.transform_apply(scale=True)
s.data.materials.append(scr_m)
# Aim button (BOOT) with aluminium ring, click button (PWR) below
cylinder("ring", 10.5, 1.4, (0, -8, 15.2), alu_m, bevel=0.5)
cylinder("aim", 9.0, 3.0, (0, -8, 16.2), red_m, bevel=1.2)
rounded_box("click", 22, 9, 3.0, 2.8, (0, -30, 15.6), grey_m, segs=10)
# USB-C at the bottom edge
rounded_box("usbc", 9, 3, 3.2, 1.5, (0, -64.2, 7.5), port_m, segs=6)
# Printed label
bpy.ops.object.text_add(location=(0, -46 * MM, 15.02 * MM))
t = bpy.context.object; t.data.body = "LZ SPOTLIGHT"; t.data.align_x = "CENTER"; t.data.align_y = "CENTER"
t.data.size = 3.2 * MM; t.data.extrude = 0.02 * MM; t.data.space_character = 1.25
t.data.materials.append(print_m)

# Group and pose the device on the table
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.empty_add(location=(0, 0, 0)); root = bpy.context.object
for o in bpy.data.objects:
    if o is not root: o.parent = root
root.rotation_euler = (0, 0, math.radians(-18))

# Table: warm grey with fine noise bump
bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
floor = bpy.context.object
fm = bpy.data.materials.new("table"); fm.use_nodes = True
fn = fm.node_tree.nodes; fl = fm.node_tree.links; fb = fn["Principled BSDF"]
noise = fn.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 900; noise.inputs["Detail"].default_value = 8
ramp = fn.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.05, 0.048, 0.045, 1); ramp.color_ramp.elements[1].color = (0.085, 0.082, 0.078, 1)
bump = fn.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.08
fl.new(noise.outputs["Fac"], ramp.inputs["Fac"]); fl.new(ramp.outputs["Color"], fb.inputs["Base Color"])
fl.new(noise.outputs["Fac"], bump.inputs["Height"]); fl.new(bump.outputs["Normal"], fb.inputs["Normal"])
fb.inputs["Roughness"].default_value = 0.62
floor.data.materials.append(fm)

# World: Blender's bundled studio HDRI, dimmed
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
wn = world.node_tree.nodes; env = wn.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(os.path.join(os.path.dirname(bpy.app.binary_path), "../Resources/" + ".".join(bpy.app.version_string.split(".")[:2]) + "/datafiles/studiolights/world/studio.exr"))
world.node_tree.links.new(env.outputs["Color"], wn["Background"].inputs["Color"])
wn["Background"].inputs["Strength"].default_value = 0.12

def area(name, loc, rot, size, power, color=(1, 1, 1)):
    bpy.ops.object.light_add(type="AREA", location=loc, rotation=[math.radians(a) for a in rot])
    a = bpy.context.object; a.data.size = size; a.data.energy = power; a.data.color = color
    return a

area("key", (-0.25, 0.18, 0.42), (-30, -38, 0), 0.35, 7)
area("rim", (0.3, 0.32, 0.22), (-60, 45, 0), 0.25, 5, (0.85, 0.9, 1.0))
area("fill", (0.25, -0.35, 0.3), (50, 30, 0), 0.4, 1.2)

# Camera: 3/4 view, shallow depth of field on the screen
bpy.ops.object.camera_add(location=(0.10, -0.28, 0.33))
cam = bpy.context.object; scene.camera = cam
cam.data.lens = 85
target = bpy.data.objects["display"]
c = cam.constraints.new("TRACK_TO"); c.target = root; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
cam.data.dof.use_dof = True; cam.data.dof.focus_object = target; cam.data.dof.aperture_fstop = 5.6

r = scene.render
r.engine = "CYCLES"; r.resolution_x = 1600; r.resolution_y = 1000; r.film_transparent = False
scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
scene.cycles.device = "CPU"
RES = float(argv[3]) if len(argv) > 3 else 1.0
r.resolution_percentage = int(RES * 100)
scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Medium High Contrast"
r.filepath = OUT
bpy.ops.render.render(write_still=True)
