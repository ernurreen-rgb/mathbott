import urllib.request
import re
import json
import os
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

VARIANTS = {
    3: ("https://forms.gle/ZaxsCDjUPYX1aGZW6", "Жер телімі"),
    9: ("https://forms.gle/nVVkoiz6cz9Ggads9", "Проектор"),
    10: ("https://forms.gle/NPwZ1bFi1Z3AiXxK6", "Өрт шелегі"),
    11: ("https://forms.gle/7t5jHCtAwc9fNaff8", "Банк картасы"),
    12: ("https://forms.gle/tiy3Kbmyjny6NBVQ7", "Қорап"),
    13: ("https://forms.gle/tFzVUxVe49zmwtZ79", "Қадам"),
    14: ("https://forms.gle/K4LD9Y6VDpNchoyp7", "Призма"),
    15: ("https://forms.gle/cp13NJnU5ejshsMH9", "Үш дос"),
    16: ("https://forms.gle/m11CRAwPrzzXsxV66", "Рим цифры"),
    17: ("https://forms.gle/o5PDvjJsGL6trEvX8", "Гүлзар"),
    18: ("https://forms.gle/RYmZcTcjysQTkers7", "Бекет"),
    19: ("https://forms.gle/i2tV4TN9NLjkh6ug9", "Себет"),
    20: ("https://forms.gle/vEX3sfVxzpSDUrJYA", "Мая шөп"),
    23: ("https://forms.gle/bUHgNv8NCssK4pjn9", "Фибанначи сандары"),
    24: ("https://forms.gle/mid9mWckrUKFFh9D9", "Баспалдақ"),
    25: ("https://forms.gle/NUmYYcn8r6MoMtKf7", "Семей көпірі"),
    26: ("https://forms.gle/akuk5ELcpyFx4VJA6", "Торғай"),
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

def download_one(var_num, url, title_kz):
    var_name = f"variant_{var_num}"
    base_dir = Path("tmp") / var_name
    img_dir = base_dir / "raw_images"
    os.makedirs(img_dir, exist_ok=True)

    meta_path = base_dir / "meta.json"
    if meta_path.exists():
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            if len(meta.get("images", [])) == 40:
                print(f"Variant {var_num} already downloaded ({len(meta['images'])} images). Skipping.")
                return
        except Exception:
            pass

    print(f"Downloading {var_name} ({title_kz}): {url} ...")
    req = urllib.request.Request(url, headers=headers)
    try:
        html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8')
    except Exception as e:
        print(f"Failed to fetch HTML for variant {var_num}: {e}")
        return

    with open(base_dir / "form.html", "w", encoding="utf-8") as f:
        f.write(html)

    img_urls = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html)
    img_urls = [u for u in img_urls if 'googleusercontent.com' in u or 'docs.google.com' in u]
    print(f"Variant {var_num}: found {len(img_urls)} image URLs")

    downloaded = []
    for idx, u in enumerate(img_urls):
        fname = f"img_{idx:02d}.png"
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
            print(f"Variant {var_num}: failed to download img {idx}")

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({
            "variant_num": var_num,
            "title": title_kz,
            "url": url,
            "images": downloaded
        }, f, ensure_ascii=False, indent=2)

    print(f"Variant {var_num} done! {len(downloaded)} images saved.")

def main():
    print(f"Starting download for {len(VARIANTS)} variants...")
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(download_one, num, u, t) for num, (u, t) in VARIANTS.items()]
        for f in futures:
            f.result()
    print("All remaining variants downloaded!")

if __name__ == '__main__':
    main()
