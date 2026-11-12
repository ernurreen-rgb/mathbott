import urllib.request
import re
import json

def fetch_form(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', html, re.DOTALL)
    data = json.loads(match.group(1))
    return data

data = fetch_form('https://forms.gle/ZaxsCDjUPYX1aGZW6')
items = data[1][1]

for i in [1, 2, 8, 31, 36]:
    print(f"=== Item {i} ===")
    print(json.dumps(items[i], indent=2, ensure_ascii=False))
