import re

for filepath in ['bot/import_variant_1.py', 'bot/import_variant_2.py']:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Clean dollar signs inside tasks_data strings
    # We can replace '$' with '' inside the file, but be careful not to affect regex or other logic.
    # In tasks_data, all texts and options are strings.
    # Let's clean '$' from r"..." and "..." in tasks_data:
    lines = content.split('\n')
    new_lines = []
    in_tasks = False
    for line in lines:
        if line.startswith('tasks_data = ['):
            in_tasks = True
        elif line.startswith('async def import_variant():'):
            in_tasks = False
        
        if in_tasks:
            # remove $ from strings
            line = line.replace('$', '')
        new_lines.append(line)
    
    updated = '\n'.join(new_lines)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(updated)
    print(f"Cleaned {filepath}")
