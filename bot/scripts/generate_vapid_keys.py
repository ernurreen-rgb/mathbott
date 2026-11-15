"""Print a new VAPID key pair for Web Push (the daily streak reminder).

From bot/: python scripts/generate_vapid_keys.py
Set both values on the API (Vercel project qazmath-api): VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
The private key is a secret. Replacing the pair later invalidates every saved subscription,
so students would have to turn reminders on again.
"""
import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def main() -> None:
    vapid = Vapid()
    vapid.generate_keys()
    private_key = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    public_key = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    print(f"VAPID_PUBLIC_KEY={_b64url(public_key)}")
    print(f"VAPID_PRIVATE_KEY={_b64url(private_key)}")


if __name__ == "__main__":
    main()
