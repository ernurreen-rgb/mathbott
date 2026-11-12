import urllib.request
import re

req = urllib.request.Request('https://forms.gle/NUmYYcn8r6MoMtKf7', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
img_srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html)
print("Form 25 img tags count:", len(img_srcs))
if img_srcs:
    print("First img:", img_srcs[0])
    req2 = urllib.request.Request(img_srcs[0], headers={'User-Agent': 'Mozilla/5.0'})
    with open('bot/form25_q1.jpg', 'wb') as f:
        f.write(urllib.request.urlopen(req2).read())
    print("Saved bot/form25_q1.jpg")
