from PIL import Image
from pathlib import Path
import os

out_dir = Path("tmp/variant_2/cropped")
os.makedirs(out_dir, exist_ok=True)

# 1. img_25: Icosahedron and net
im25 = Image.open("tmp/variant_2/raw_images/img_25.png")
crop25 = im25.crop((35, 157, 620, 335))
crop25.save(out_dir / "v2_q26_icosahedron.png")
print("Saved v2_q26_icosahedron.png", crop25.size)

# 2. img_34: Parabola graph
im34 = Image.open("tmp/variant_2/raw_images/img_34.png")
crop34 = im34.crop((270, 40, 560, 240))
crop34.save(out_dir / "v2_q35_parabola.png")
print("Saved v2_q35_parabola.png", crop34.size)

# 3. img_35: Cylinder + dome
im35 = Image.open("tmp/variant_2/raw_images/img_35.png")
crop35 = im35.crop((320, 65, 470, 260))
crop35.save(out_dir / "v2_q36_cylinder_dome.png")
print("Saved v2_q36_cylinder_dome.png", crop35.size)
