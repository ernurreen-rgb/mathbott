from pathlib import Path

variants = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 23, 24, 25, 26]
missing = []
for v in variants:
    p = Path(f"tmp/variant_{v}/raw_images")
    count = len(list(p.glob("*.png")))
    if count != 40:
        missing.append((v, count))
    else:
        print(f"Variant {v:02d}: OK ({count} images)")

if missing:
    print(f"Variants with missing images: {missing}")
else:
    print("\nALL 23 VARIANTS HAVE EXACTLY 40 IMAGES!")
