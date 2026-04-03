import json

with open('data/대학_12-가. 연구비 수혜 실적_학교별자료.json', encoding='utf-8') as f:
    data = json.load(f)

rows_2016 = [r for r in data if str(r.get('공시연도','')) == '2016']
rows_2023 = [r for r in data if str(r.get('공시연도','')) == '2023']

with open('tmp_keys_result.txt', 'w', encoding='utf-8') as out:
    out.write('=== 2016 keys ===\n')
    for k in rows_2016[0].keys():
        out.write(k + '\n')

    out.write('\n=== 2023 keys ===\n')
    for k in rows_2023[0].keys():
        out.write(k + '\n')

    out.write('\n=== 2016 전임교원 관련 ===\n')
    for k, v in rows_2016[0].items():
        if '전임' in k:
            out.write(f'  {k}: {v}\n')

    out.write('\n=== 2023 전임교원 관련 ===\n')
    for k, v in rows_2023[0].items():
        if '전임' in k:
            out.write(f'  {k}: {v}\n')
