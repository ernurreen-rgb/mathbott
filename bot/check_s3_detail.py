with open('.env.prod.test', 'r') as f:
    for line in f:
        if line.startswith('S3_') or 'STORAGE' in line:
            print(repr(line.strip()))
