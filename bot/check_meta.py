import json

with open('tmp/variant_1/questions_meta.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

for item in items[:10]:
    print(f"Index {item['index']}: title={repr(item['title'])}, type={item['type']}, img_id={item['img_id']}")

print("...")
for item in items[30:]:
    print(f"Index {item['index']}: title={repr(item['title'])}, type={item['type']}, img_id={item['img_id']}")
