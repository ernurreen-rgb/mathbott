import os
from PIL import Image

for i in range(1, 41):
    path = f"tmp/variant_1/q_{i:02d}.jpg"
    if os.path.exists(path):
        im = Image.open(path)
        print(f"q_{i:02d}.jpg: size={im.size}")
