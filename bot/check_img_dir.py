import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path('.')))
from utils.file_storage import get_images_dir

print("Images dir:", get_images_dir())
print("Exists?", get_images_dir().exists())
if get_images_dir().exists():
    print("Files in images dir:", list(get_images_dir().iterdir())[:10])
