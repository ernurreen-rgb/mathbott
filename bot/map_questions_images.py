import urllib.request
import re
import json

url = 'https://forms.gle/PbrKZMjgDvHozzeM8'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', html, re.DOTALL)
data = json.loads(match.group(1))
items = data[1][1]

# In the HTML, find image urls and their context
# Let's inspect where docs.google.com/forms-images-rt appear in the html relative to item IDs or titles
for i in range(1, 41):
    item = items[i]
    q_num = item[1]
    img_data = item[9] if len(item) > 9 else None
    print(f"Q{q_num}: item_id={item[0]}, img_info={img_data}")
