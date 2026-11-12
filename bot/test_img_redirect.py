import urllib.request

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        print(f"Redirect {code} to: {newurl}")
        return None

opener = urllib.request.build_opener(NoRedirect)
url = 'https://docs.google.com/forms-images-rt/AMfapbnt0ngkiXlaJGmt-ADuB4ptiTTYiG_4PXD12HT7tUkbuqtTjlM0ktoqzuTMGp7qOaKzqIkXdbgVGg7s-R97ep8jocDafBWVpbt2evMjNhm6K5Y7uMOZBgSGy_ao-4VUmofG8G5G7oJ2lGU4bU0DkoyRdpb-Ajbdl3pi_TKFnsbaQ4Sk6HXIEyrZFk4VK8IEI0bZpgaWjBGf2rPoQMphKYZtU2_b5P_Y7lEPbOg=w740'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    res = opener.open(req)
    print("Direct status:", res.status)
except Exception as e:
    print("Err:", e)
