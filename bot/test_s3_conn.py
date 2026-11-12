import os
import boto3
from botocore.config import Config

endpoint = os.environ.get('S3_ENDPOINT_URL')
region = os.environ.get('S3_REGION', 'us-east-2')
bucket = os.environ.get('S3_BUCKET', 'mathbot-images')
ak = os.environ.get('S3_ACCESS_KEY_ID')
sk = os.environ.get('S3_SECRET_ACCESS_KEY')

print(f"Endpoint: {endpoint}, Bucket: {bucket}, AK len: {len(ak) if ak else 0}, SK len: {len(sk) if sk else 0}")

client = boto3.client(
    "s3",
    endpoint_url=endpoint or None,
    region_name=region,
    aws_access_key_id=ak or None,
    aws_secret_access_key=sk or None,
    config=Config(signature_version="s3v4", connect_timeout=5, read_timeout=5)
)

try:
    res = client.list_objects_v2(Bucket=bucket, MaxKeys=5)
    print("Objects in bucket:", [obj['Key'] for obj in res.get('Contents', [])])
except Exception as e:
    print("S3 test error:", e)
