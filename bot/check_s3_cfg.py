with open('.env.prod.test', 'r') as f:
    for line in f:
        if any(k in line for k in ['S3_', 'IMAGE_', 'STORAGE']):
            key = line.split('=')[0]
            val = line.split('=')[1].strip()
            print(f"{key} = {val[:10]}... (len {len(val)})")
