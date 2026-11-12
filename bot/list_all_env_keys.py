with open('.env.prod.test', 'r') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key = line.split('=')[0]
        val = line.split('=', 1)[1]
        print(f"{key}: len={len(val)}, starts={val[:8]}...")
