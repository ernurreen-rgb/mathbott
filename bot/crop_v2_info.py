from PIL import Image
from pathlib import Path
import os

out_dir = Path("tmp/variant_2/cropped")
os.makedirs(out_dir, exist_ok=True)

# 1. img_25: Icosahedron and net
# Let's inspect img_25 dimensions
im25 = Image.open("tmp/variant_2/raw_images/img_25.png")
print("im25 size:", im25.size)

# 2. img_34: Parabola graph
im34 = Image.open("tmp/variant_2/raw_images/img_34.png")
print("im34 size:", im34.size)

# 3. img_35: Cylinder + dome
im35 = Image.open("tmp/variant_2/raw_images/img_35.png")
print("im35 size:", im35.size)
