import os
from pathlib import Path
import boto3
from botocore.config import Config

env_file = Path('bot/.env.prod.test')
with open(env_file, 'r') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip().strip('"').strip("'")

endpoint = os.environ.get('S3_ENDPOINT_URL')
bucket = os.environ.get('S3_BUCKET', 'mathbot-images')
client = boto3.client(
    's3',
    endpoint_url=endpoint or None,
    region_name=os.environ.get('S3_REGION', 'us-east-2'),
    aws_access_key_id=os.environ.get('S3_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('S3_SECRET_ACCESS_KEY'),
    config=Config(signature_version='s3v4')
)
res = client.list_objects_v2(Bucket=bucket, Prefix='v')
print('Uploaded images:', [obj['Key'] for obj in res.get('Contents', [])])
