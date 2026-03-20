"""
대학개황정보 CSV → data/대학기본정보.json 변환 스크립트
- 매년 대학알리미에서 받은 CSV를 한 번 실행하면 갱신됨
- 본교 기준으로 지역·설립구분·대학구분을 추출 (캠퍼스 공유)
- 사용법: python convert_university_info.py [CSV파일명]
          파일명 생략 시 최신 대학개황정보_*.csv 자동 선택
"""

import csv
import json
import sys
import glob
from pathlib import Path

# ── 설립구분 정규화 ────────────────────────────────────────
def normalize_설립구분(raw: str) -> str:
    if raw in ('국립', '공립', '국립대법인'):
        return '국공립'
    if raw == '사립':
        return '사립'
    return raw  # 특별법국립, 특별법법인, 기타 → 그대로



def convert(csv_path: str, out_path: str):
    with open(csv_path, encoding='euc-kr') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    # 본교 + 폐교 제외만 추출 → 학교명 기준 딕셔너리
    결과 = {}
    for row in rows:
        if row['학교상태'] == '폐교':
            continue
        if row['본분교'] != '본교':
            continue
        학교명 = row['학교명'].strip()
        결과[학교명] = {
            '학교명':   학교명,
            '지역':     row['지역'].strip(),
            '설립구분': normalize_설립구분(row['설립구분'].strip()),
            '대학구분': row['학제'].strip(),   # 학제 원본값 그대로 (대학교, 교육대학, 전문대학 …)
        }

    output = sorted(결과.values(), key=lambda r: r['학교명'])

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"완료: {len(output)}개 대학 → {out_path}")
    # 설립구분별 현황
    from collections import Counter
    for k, v in sorted(Counter(r['설립구분'] for r in output).items()):
        print(f"  {k}: {v}개")


if __name__ == '__main__':
    base_dir = Path(__file__).parent

    if len(sys.argv) >= 2:
        csv_path = sys.argv[1]
    else:
        # 최신 대학개황정보_*.csv 자동 선택
        candidates = sorted(base_dir.glob('대학개황정보_*.csv'), reverse=True)
        if not candidates:
            print("오류: 대학개황정보_*.csv 파일을 찾을 수 없습니다.")
            sys.exit(1)
        csv_path = str(candidates[0])
        print(f"파일 자동 선택: {csv_path}")

    out_path = str(base_dir / 'data' / '대학기본정보.json')
    convert(csv_path, out_path)
