import json

with open('data/benchmark_cache.json', encoding='utf-8') as f:
    data = json.load(f)

keys = set()
for row in data:
    keys.update(row.keys())

with open('tmp_cache_result.txt', 'w', encoding='utf-8') as out:
    out.write('총 행 수: ' + str(len(data)) + '\n')
    out.write('필드 목록:\n')
    for k in sorted(keys):
        out.write('  ' + k + '\n')
    out.write('\n1인당 교외연구비 있음: ' + str('1인당 교외연구비' in keys) + '\n')
    # null이 아닌 값이 있는지
    non_null = [r for r in data if r.get('1인당 교외연구비') is not None]
    out.write('non-null 행 수: ' + str(len(non_null)) + '\n')
