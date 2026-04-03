"""
학과(전공)분류표 CSV → data/학과분류.json 변환 스크립트

사용법:
    python convert_학과분류.py [학과(전공)분류표(2023).csv]

출력:
    data/학과분류.json  ─ 학과명 기준 중복 제거·정렬된 분류 목록
"""
import sys
import csv
import json
from pathlib import Path


def convert(csv_path: Path, out_path: Path) -> None:
    seen: dict[str, dict] = {}

    with open(csv_path, encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            학과명 = row.get('학과명', '').strip()
            대계열 = row.get('대계열', '').strip().removesuffix('계열')
            학과코드 = row.get('학과코드', '').strip()
            if not 학과명 or not 대계열:
                continue
            if 학과명 not in seen:
                seen[학과명] = {'학과코드': 학과코드, '학과명': 학과명, '대계열': 대계열}

    result = sorted(seen.values(), key=lambda x: (x['대계열'], x['학과명']))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    from collections import Counter
    stats = Counter(r['대계열'] for r in result)
    print(f"변환 완료: 총 {len(result)}개 학과명 → {out_path}")
    print("대계열별 학과 수:")
    for 계열, cnt in sorted(stats.items()):
        print(f"  {계열}: {cnt}개")


if __name__ == '__main__':
    if len(sys.argv) > 1:
        csv_file = Path(sys.argv[1])
    else:
        candidates = sorted(Path('.').glob('학과(전공)분류표*.csv'))
        if not candidates:
            print('오류: CSV 파일을 찾을 수 없습니다.')
            print('사용법: python convert_학과분류.py [학과(전공)분류표(2023).csv]')
            sys.exit(1)
        csv_file = candidates[0]
        print(f'파일 자동 감지: {csv_file}')

    out_file = Path('data') / '학과분류.json'
    convert(csv_file, out_file)