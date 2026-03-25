"""
기준대학목록_v2.xlsx → data/기준대학.json 변환 스크립트

사용법:
    python convert_기준대학.py [엑셀파일명]
    python convert_기준대학.py 기준대학목록_v2.xlsx

Excel 컬럼 (0-indexed):
    [0] 학교명(공시)  → 대학명
    [2] 기준대학명
    [4] 기준대학여부  ('기준' = 메타 포함 마스터 항목)
    [8] 학제          → 대학구분
    [9] 지역
    [10] 설립구분     (정규화 후 저장)

기준대학여부='기준' 항목: 지역·설립구분·대학구분 포함
별칭·구 교명 항목:        대학명→기준대학명 매핑만

설립구분 정규화:
    국립 / 공립 / 국립대법인 / 특별법국립 → 국공립
    특별법법인 → 특별법
    사립 → 사립 (그대로)
"""

import sys
import json
import os
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("openpyxl이 필요합니다: pip install openpyxl")
    sys.exit(1)

# ── 설정 ────────────────────────────────────────────────
COL_공시명 = 0   # 학교명(공시)
COL_기준명 = 2   # 기준대학명
COL_기준여부 = 4  # 기준대학여부
COL_학제 = 8     # 학제 (대학교/산업대학/…)
COL_지역 = 9     # 지역
COL_설립 = 10    # 설립구분

국공립_원값 = {'국립', '공립', '국립대법인', '특별법국립'}

OUTPUT_PATH = Path(__file__).parent / 'data' / '기준대학.json'


def normalize_설립(raw: str | None) -> str | None:
    if not raw:
        return None
    if raw in 국공립_원값:
        return '국공립'
    if raw == '특별법법인':
        return '특별법'
    return raw  # 사립, 기타 그대로


def load_excel(xlsx_path: str) -> list[dict]:
    """Excel → JSON 엔트리 목록

    기준 항목(기준대학여부='기준')에서는 두 가지 엔트리를 생성한다:
    1. 공시명 → 기준대학명 매핑 (공시명 ≠ 기준대학명인 경우만)
    2. 기준대학명 자기매핑 + 메타 (대학명 = 기준대학명)
       → _aggregateRaw()에서 baseUnivMap.get(기준대학명)으로 메타 조회 시 사용
    """
    wb = openpyxl.load_workbook(xlsx_path)
    ws = wb.active
    entries: list[dict] = []
    master_seen: set[str] = set()  # 이미 자기매핑 항목을 생성한 기준대학명

    for row in ws.iter_rows(min_row=2, values_only=True):
        공시명 = (row[COL_공시명] or '').strip()
        기준명 = (row[COL_기준명] or '').strip()
        if not 공시명 or not 기준명:
            continue

        if row[COL_기준여부] == '기준':
            지역 = (row[COL_지역] or '').strip() or None
            설립 = normalize_설립(row[COL_설립])
            학제 = (row[COL_학제] or '').strip() or None

            # 공시명 ≠ 기준대학명이면 별도 매핑 항목 추가 (예: 가야대학교(김해) → 가야대학교)
            if 공시명 != 기준명:
                entries.append({'대학명': 공시명, '기준대학명': 기준명})

            # 기준대학명 자기매핑 항목 (메타 포함) — 기준대학명당 1회만
            if 기준명 not in master_seen:
                master_seen.add(기준명)
                master: dict = {'대학명': 기준명, '기준대학명': 기준명}
                if 지역:  master['지역'] = 지역
                if 설립:  master['설립구분'] = 설립
                if 학제:  master['대학구분'] = 학제
                entries.append(master)
        else:
            # 별칭·구 교명: 매핑만
            entries.append({'대학명': 공시명, '기준대학명': 기준명})

    return entries


def load_existing_json(path: Path) -> list[dict]:
    """기존 기준대학.json 로드 (없으면 빈 목록)"""
    if not path.exists():
        return []
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def merge(excel_entries: list[dict], existing: list[dict]) -> list[dict]:
    """
    Excel 항목을 주(主)로 하고,
    기존 JSON에만 있는 구 교명·통폐합 이력 항목을 보존한다.
    (Excel의 학교명(공시) 집합에 없는 항목만 유지)
    """
    excel_names = {e['대학명'] for e in excel_entries}
    preserved = [e for e in existing if e.get('대학명') not in excel_names]
    if preserved:
        print(f"  → 기존 JSON에서 {len(preserved)}개 항목 보존 (구 교명·이력)")
        for p in preserved:
            print(f"     {p['대학명']} → {p['기준대학명']}")
    return excel_entries + preserved


def sort_entries(entries: list[dict]) -> list[dict]:
    """기준대학명 → 대학명 순 정렬 (메타 있는 기준 항목이 별칭보다 앞으로)"""
    def key(e):
        is_master = 1 if '지역' in e else 2  # 기준 항목 우선
        return (e['기준대학명'], is_master, e['대학명'])
    return sorted(entries, key=key)


def main():
    if len(sys.argv) < 2:
        xlsx_path = '기준대학목록_v2.xlsx'
    else:
        xlsx_path = sys.argv[1]

    if not os.path.exists(xlsx_path):
        # 현재 스크립트 디렉터리에서도 탐색
        alt = Path(__file__).parent / xlsx_path
        if alt.exists():
            xlsx_path = str(alt)
        else:
            print(f"파일을 찾을 수 없습니다: {xlsx_path}")
            sys.exit(1)

    print(f"읽는 중: {xlsx_path}")
    excel_entries = load_excel(xlsx_path)
    print(f"  → Excel 항목: {len(excel_entries)}개")

    existing = load_existing_json(OUTPUT_PATH)
    print(f"  → 기존 JSON 항목: {len(existing)}개")

    merged = merge(excel_entries, existing)
    merged = sort_entries(merged)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f"\n저장 완료: {OUTPUT_PATH}")
    print(f"총 {len(merged)}개 항목")

    # 기준 항목(메타 포함) / 별칭 항목 통계
    masters = sum(1 for e in merged if '지역' in e)
    aliases = len(merged) - masters
    print(f"  기준 항목(메타 포함): {masters}개")
    print(f"  별칭·구 교명 항목:    {aliases}개")


if __name__ == '__main__':
    main()
