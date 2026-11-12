import boto3
from botocore.config import Config

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

try:
    res = client.list_objects_v2(Bucket=bucket, MaxKeys=5)
    print("Objects in bucket:")
    for obj in res.get('Contents', []):
        print(" -", obj['Key'], obj['Size'])
except Exception as e:
    print("S3 error:", e)
