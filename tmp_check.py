import json

with open('data/대학_12-가. 연구비 수혜 실적_학교별자료.json', encoding='utf-8') as f:
    data = json.load(f)

rows_2016 = [r for r in data if str(r.get('공시연도','')) == '2016']
rows_2023 = [r for r in data if str(r.get('공시연도','')) == '2023']

print('=== 2016 keys ===')
for k in rows_2016[0].keys():
    print(k)

print()
print('=== 2023 keys ===')
for k in rows_2023[0].keys():
    print(k)

# 전임교원 관련 필드만
print()
print('=== 2016 전임교원 관련 ===')
for k, v in rows_2016[0].items():
    if '전임' in k:
        print(f'  {k}: {v}')

print()
print('=== 2023 전임교원 관련 ===')
for k, v in rows_2023[0].items():
    if '전임' in k:
        print(f'  {k}: {v}')
