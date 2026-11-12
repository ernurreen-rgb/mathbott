from PIL import Image
import os

print('VARIANT 1:')
for i in range(1, 41):
    path = f'tmp/variant_1/q_{i:02d}.jpg'
    if os.path.exists(path):
        with Image.open(path) as img:
            w, h = img.size
            tag = '*** LARGE/DIAGRAM ***' if h > 180 else ''
            print(f'Q{i:02d}: {w}x{h} {tag}')

print('\nVARIANT 2:')
for i in range(1, 41):
    path = f'tmp/variant_2/raw_images/q_{i:02d}.jpg'
    if os.path.exists(path):
        with Image.open(path) as img:
            w, h = img.size
            tag = '*** LARGE/DIAGRAM ***' if h > 180 else ''
            print(f'Q{i:02d}: {w}x{h} {tag}')
