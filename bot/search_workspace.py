import os

matches = []
for root, dirs, files in os.walk('.'):
    # skip .git, node_modules, .next, venv
    if any(p in root for p in ['.git', 'node_modules', '.next', 'venv']):
        continue
    for f in files:
        path = os.path.join(root, f)
        try:
            with open(path, 'r', encoding='utf-8') as fp:
                content = fp.read()
                if 'Жер телімі' in content or 'Жер' in content:
                    # check if relevant
                    for line_no, line in enumerate(content.splitlines()):
                        if 'Жер телімі' in line:
                            matches.append(f"{path}:{line_no+1}: {line.strip()[:100]}")
        except Exception:
            pass

print(f"Total matches: {len(matches)}")
for m in matches:
    print(m)
