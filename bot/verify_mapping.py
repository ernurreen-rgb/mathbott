import json
import re

with open('tmp/variant_1/questions_meta.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

# Let's inspect the html or img tags to verify exact mapping
with open('tmp/variant_1/q_41.jpg', 'rb') as f:
    size_41 = len(f.read())
print("Size of q_41.jpg:", size_41)

with open('tmp/variant_1/q_01.jpg', 'rb') as f:
    size_01 = len(f.read())
print("Size of q_01.jpg:", size_01)
