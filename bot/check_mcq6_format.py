import glob
import re

for fn in sorted(glob.glob('bot/import_variant_*.py')):
    with open(fn, 'r', encoding='utf-8') as f:
        text = f.read()
    slots = re.findall(r'"slot_index":\s*(3[6-9]|40).*?"answer":\s*([^,\n]+)', text, re.DOTALL)
    for s, a in slots:
        if not a.startswith('\'[') and not a.startswith('\"['):
            print(f"{fn} slot {s}: {a}")
print("Done checking.")
