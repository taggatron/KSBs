import bpy
import os

# --------------------------------------------------
# CONFIG
# --------------------------------------------------
BAKE_TYPES = ["DIFFUSE", "NORMAL", "ROUGHNESS", "METALLIC"]
IMG_SIZE = 2048
EXPORT_NAME = "baked_model_pbr.glb"
OUTPUT_DIR = bpy.path.abspath("//baked_textures")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Use Cycles for baking
bpy.context.scene.render.engine = 'CYCLES'

# --------------------------------------------------
# FUNCTIONS
# --------------------------------------------------
def create_bake_image(obj_name, mat_name, bake_type):
    """Create a new image for baking"""
    img_name = f"{obj_name}_{mat_name}_{bake_type.lower()}.png"
    img_path = os.path.join(OUTPUT_DIR, img_name)
    image = bpy.data.images.new(img_name, width=IMG_SIZE, height=IMG_SIZE)
    image.filepath_raw = img_path
    image.file_format = 'PNG'
    return image, img_path

# --------------------------------------------------
# MAIN LOOP
# --------------------------------------------------
for obj in bpy.context.selected_objects:
    if obj.type != 'MESH':
        continue

    bpy.context.view_layer.objects.active = obj
    print(f"\n🔹 Baking object: {obj.name}")

    if not obj.data.uv_layers:
        print(f"⚠️ Skipping {obj.name}: No UV map found.")
        continue

    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue

        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            print(f"⚠️ Skipping {mat.name}: No Principled BSDF node.")
            continue

        for bake_type in BAKE_TYPES:
            image, img_path = create_bake_image(obj.name, mat.name, bake_type)
            img_node = nodes.new('ShaderNodeTexImage')
            img_node.image = image
            nodes.active = img_node  # Must be active for baking

            # Bake
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj

            try:
                bpy.ops.object.bake(type=bake_type, use_clear=True)
                image.save()
                print(f"✅ Baked {bake_type} for {obj.name} → {img_path}")
            except Exception as e:
                print(f"❌ Bake failed ({bake_type}) for {obj.name}: {e}")
                nodes.remove(img_node)
                continue

            # --------------------------------------------------
            # Reconnect baked texture
            # --------------------------------------------------
            if bake_type == "DIFFUSE":
                for link in list(links):
                    if link.to_socket == bsdf.inputs.get("Base Color"):
                        links.remove(link)
                links.new(img_node.outputs["Color"], bsdf.inputs["Base Color"])

            elif bake_type == "NORMAL":
                normal_node = nodes.new('ShaderNodeNormalMap')
                links.new(img_node.outputs["Color"], normal_node.inputs["Color"])
                for link in list(links):
                    if link.to_socket == bsdf.inputs.get("Normal"):
                        links.remove(link)
                links.new(normal_node.outputs["Normal"], bsdf.inputs["Normal"])

            elif bake_type == "ROUGHNESS":
                for link in list(links):
                    if link.to_socket == bsdf.inputs.get("Roughness"):
                        links.remove(link)
                links.new(img_node.outputs["Color"], bsdf.inputs["Roughness"])

            elif bake_type == "METALLIC":
                for link in list(links):
                    if link.to_socket == bsdf.inputs.get("Metallic"):
                        links.remove(link)
                links.new(img_node.outputs["Color"], bsdf.inputs["Metallic"])

            print(f"🔗 Connected {bake_type} map to {mat.name}")

print("\n🎉 Baking complete!")

# --------------------------------------------------
# EXPORT baked scene to GLB (Blender 4.4+)
# --------------------------------------------------
export_path = os.path.join(OUTPUT_DIR, EXPORT_NAME)
bpy.ops.export_scene.gltf(
    filepath=export_path,
    export_format='GLB',
    use_selection=True,        # only selected objects
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO'
)

print(f"\n🚀 Exported baked PBR model to: {export_path}")