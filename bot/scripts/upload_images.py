"""Plan/upload existing images into the configured private S3-compatible bucket."""
import argparse
from hashlib import sha256
import mimetypes
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import load_environment
from settings import get_settings
from utils.file_storage import get_s3_client, normalize_stored_image_filename


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="../images")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    load_environment()
    directory = Path(args.source).resolve(strict=True)
    files = [path for path in sorted(directory.iterdir()) if path.is_file() and normalize_stored_image_filename(path.name)]
    print(f"Images: {len(files)}; bytes: {sum(path.stat().st_size for path in files)}")
    if not args.apply:
        print("Plan only. Add --apply after configuring S3_BUCKET and storage credentials.")
        return
    from botocore.exceptions import ClientError
    settings = get_settings()
    if not settings.s3_bucket:
        parser.error("S3_BUCKET must be configured")
    client = get_s3_client()
    uploaded = skipped = 0
    for path in files:
        data = path.read_bytes()
        digest = sha256(data).hexdigest()
        try:
            existing = client.head_object(Bucket=settings.s3_bucket, Key=path.name)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") not in {"404", "NoSuchKey", "NotFound"}:
                raise
        else:
            if existing.get("Metadata", {}).get("sha256") != digest:
                raise ValueError(f"Existing object differs; refusing to overwrite {path.name}")
            skipped += 1
            continue
        client.put_object(Bucket=settings.s3_bucket, Key=path.name, Body=data,
                          ContentType=mimetypes.guess_type(path.name)[0] or "application/octet-stream",
                          Metadata={"sha256": digest})
        uploaded += 1
    print(f"Uploaded: {uploaded}; already present: {skipped}")


if __name__ == "__main__":
    main()
