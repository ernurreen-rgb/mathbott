import urllib.request
import re
import json

def fetch_form(url):
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    html = urllib.request.urlopen(req).read().decode('utf-8')
    match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', html, re.DOTALL)
    if not match:
        print("No FB_PUBLIC_LOAD_DATA_ found")
        return None
    data = json.loads(match.group(1))
    return data

data = fetch_form('https://forms.gle/ZaxsCDjUPYX1aGZW6')
print("Title:", data[1][8] if len(data[1]) > 8 else "Unknown")
print("Desc:", data[1][0] if len(data[1]) > 0 else "")
items = data[1][1]
print(f"Total items in Form 3 (Жер телімі): {len(items)}")

for idx, item in enumerate(items):
    # item[0]: item id, item[1]: title, item[2]: description, item[3]: type, item[4]: options/data
    title = item[1]
    desc = item[2]
    # Check if there is an image in item[6] or elsewhere
    images = []
    # Let's inspect raw item representation length or key parts
    print(f"Item {idx}: title={repr(title)}, desc={repr(desc)}, type={item[3] if len(item) > 3 else None}")
    if len(item) > 6 and item[6]:
        print(f"   item[6]: {str(item[6])[:150]}")
