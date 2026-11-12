import boto3
from botocore.config import Config
from pathlib import Path
import sys

endpoint = "https://br-icy-surf-b5pbfazh.storage.c-7.us-east-2.aws.neon.tech"
region = "us-east-2"
bucket = "mathbot-images"
ak = "nak_live_457e5adf34144097a8c57610676c966d"
sk = "nsk_live_c72a0803d432e73930e8be42e236bf76b9707b928032c057af891690225f362d"

client = boto3.client(
    "s3",
    endpoint_url=endpoint,
    region_name=region,
    aws_access_key_id=ak,
    aws_secret_access_key=sk,
    config=Config(signature_version="s3v4")
)

def upload_folder(folder_path: str):
    p = Path(folder_path)
    for f in p.glob("*.png"):
        data = f.read_bytes()
        print(f"Uploading {f.name} ({len(data)} bytes)...", flush=True)
        client.put_object(
            Bucket=bucket,
            Key=f.name,
            Body=data,
            ContentType="image/png"
        )
        print(f"Uploaded {f.name}!", flush=True)

if __name__ == '__main__':
    folder = sys.argv[1] if len(sys.argv) > 1 else "tmp/variant_2/cropped"
    upload_folder(folder)
