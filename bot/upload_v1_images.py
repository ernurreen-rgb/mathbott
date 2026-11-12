import boto3
from botocore.config import Config
from pathlib import Path

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

cropped_dir = Path("tmp/variant_1/cropped")
uploaded = []
for p in cropped_dir.glob("*.png"):
    data = p.read_bytes()
    key = p.name
    print(f"Uploading {key} ({len(data)} bytes)...")
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType="image/png"
    )
    uploaded.append(key)

print(f"Successfully uploaded {len(uploaded)} images to S3!")
