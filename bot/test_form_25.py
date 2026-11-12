import urllib.request
import re
import json

def fetch_form(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', html, re.DOTALL)
    data = json.loads(match.group(1))
    return data

data = fetch_form('https://forms.gle/NUmYYcn8r6MoMtKf7')
print("Title:", data[1][8] if len(data[1]) > 8 else "Unknown")
items = data[1][1]
print(f"Total items: {len(items)}")
for i in [1, 2, 3]:
    print(f"Item {i}:", items[i][1], "Image:", items[i][9] if len(items[i]) > 9 else None)
