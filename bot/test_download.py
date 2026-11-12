import urllib.request

url = 'https://docs.google.com/forms-images-rt/AMfapbnt0ngkiXlaJGmt-ADuB4ptiTTYiG_4PXD12HT7tUkbuqtTjlM0ktoqzuTMGp7qOaKzqIkXdbgVGg7s-R97ep8jocDafBWVpbt2evMjNhm6K5Y7uMOZBgSGy_ao-4VUmofG8G5G7oJ2lGU4bU0DkoyRdpb-Ajbdl3pi_TKFnsbaQ4Sk6HXIEyrZFk4VK8IEI0bZpgaWjBGf2rPoQMphKYZtU2_b5P_Y7lEPbOg=w740'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
        print("Success! Size:", len(data), "Content-Type:", resp.headers.get('Content-Type'))
        with open('test_img.png', 'wb') as f:
            f.write(data)
except Exception as e:
    print("Err:", e)
