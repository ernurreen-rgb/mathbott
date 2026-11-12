import urllib.request
import re
import json
import os

url = 'https://forms.gle/PbrKZMjgDvHozzeM8'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', html, re.DOTALL)
if not match:
    print("Error: No FB_PUBLIC_LOAD_DATA_")
    exit(1)

data = json.loads(match.group(1))
title = data[1][8] if len(data[1]) > 8 else "Unknown"
print("Form title:", title)

items = data[1][1]
print(f"Total items in form: {len(items)}")

# Create directory for variant 1 images
out_dir = Path = 'tmp/variant_1'
os.makedirs(out_dir, exist_ok=True)

# Also extract all img urls from HTML in order
img_urls = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html)
print(f"Total img tags in HTML: {len(img_urls)}")

questions = []
for idx, item in enumerate(items):
    # item structure:
    # item[0]: question id
    # item[1]: question title/number
    # item[2]: description
    # item[3]: type
    # item[4]: options
    # item[9]: image info if any
    q_title = item[1]
    q_type = item[3] if len(item) > 3 else None
    
    # Check if there is an image
    img_id = None
    if len(item) > 9 and item[9] and len(item[9]) > 0:
        img_id = item[9][0][0]
    
    questions.append({
        "index": idx,
        "title": q_title,
        "type": q_type,
        "img_id": img_id,
        "raw_options": item[4] if len(item) > 4 else None
    })

print(f"Found {len(questions)} items.")
with open(f"{out_dir}/questions_meta.json", "w", encoding="utf-8") as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

# Download each image from img_urls
for i, img_url in enumerate(img_urls):
    filename = f"{out_dir}/q_{i+1:02d}.jpg"
    try:
        req_img = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_img) as resp, open(filename, 'wb') as f:
            f.write(resp.read())
    except Exception as e:
        print(f"Failed to download img {i+1}: {e}")

print("Downloaded all images to", out_dir)
