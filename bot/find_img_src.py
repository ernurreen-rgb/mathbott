import urllib.request
import re

req = urllib.request.Request(
    'https://forms.gle/ZaxsCDjUPYX1aGZW6',
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
)
html = urllib.request.urlopen(req).read().decode('utf-8')
img_srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html)
print(f"Total img tags: {len(img_srcs)}")
for src in img_srcs[:10]:
    print(src)

# Also check for googleusercontent in the html
gurls = re.findall(r'https://[^"\'\s<>]+googleusercontent\.com[^"\'\s<>]+', html)
print(f"Total googleusercontent urls: {len(gurls)}")
for u in set(gurls)[:10]:
    print(u[:120])
