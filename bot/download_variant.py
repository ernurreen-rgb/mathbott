import urllib.request
import re
import json
import os
import sys
from pathlib import Path

def download_variant(url: str, var_name: str):
    base_dir = Path("tmp") / var_name
    img_dir = base_dir / "raw_images"
    os.makedirs(img_dir, exist_ok=True)
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    req = urllib.request.Request(url, headers=headers)
    html = urllib.request.urlopen(req).read().decode('utf-8')
    
    with open(base_dir / "form.html", "w", encoding="utf-8") as f:
        f.write(html)
        
    match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', html, re.DOTALL)
    if not match:
        print("Error: FB_PUBLIC_LOAD_DATA_ not found")
        return
        
    data = json.loads(match.group(1))
    title = data[1][8] if len(data[1]) > 8 else "Unknown"
    items = data[1][1]
    print(f"Form Title: {title}, Items: {len(items)}")
    
    img_urls = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html)
    # Filter only googleusercontent or relevant images
    img_urls = [u for u in img_urls if 'googleusercontent.com' in u or 'docs.google.com' in u]
    print(f"Found {len(img_urls)} image URLs in HTML")
    
    # Download images
    downloaded = []
    for idx, u in enumerate(img_urls):
        ext = 'png'
        fname = f"img_{idx:02d}.{ext}"
        fpath = img_dir / fname
        if fpath.exists() and fpath.stat().st_size > 1000:
            downloaded.append({"index": idx, "url": u, "filename": fname, "size": fpath.stat().st_size})
            continue

        success = False
        for attempt in range(4):
            try:
                r = urllib.request.Request(u, headers=headers)
                content = urllib.request.urlopen(r, timeout=15).read()
                with open(fpath, "wb") as f:
                    f.write(content)
                downloaded.append({"index": idx, "url": u, "filename": fname, "size": len(content)})
                success = True
                break
            except Exception as e:
                import time
                time.sleep(1)
        if not success:
            print(f"Failed to download image {idx} after 4 attempts")
            
    # Save parsed metadata
    with open(base_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump({
            "title": title,
            "items_count": len(items),
            "images": downloaded
        }, f, ensure_ascii=False, indent=2)
        
    print(f"Variant {var_name} downloaded successfully! ({len(downloaded)} images)")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python download_variant.py <url> <variant_dir_name>")
        sys.exit(1)
    download_variant(sys.argv[1], sys.argv[2])
