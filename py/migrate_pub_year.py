"""
기존 data/*.json 파일에 '공시연도' 필드를 소급 삽입하는 마이그레이션 스크립트.

규칙:
  - 이미 '공시연도' 있는 레코드 → 건너뜀 (멱등성 보장)
  - year_offset 있는 항목의 소스 파일   → 공시연도 = int(기준연도) + offset
  - 그 외                                → 공시연도 = int(기준연도)

실행:
  python migrate_pub_year.py
"""

import json
from pathlib import Path

SCRIPT_DIR   = Path(__file__).parent
DATA_DIR     = SCRIPT_DIR / "data"
CALC_RULES   = SCRIPT_DIR / "calc_rules.json"
MANIFEST     = DATA_DIR / "manifest.json"

# ── 1. year_offset 맵 로드 (indicator → offset) ───────────────────────────
calc_rules: dict = json.loads(CALC_RULES.read_text(encoding="utf-8"))
indicator_offset: dict[str, int] = {
    k: v["year_offset"]
    for k, v in calc_rules.items()
    if "year_offset" in v
}

# ── 2. source → max year_offset 맵 구성 ───────────────────────────────────
manifest: list = json.loads(MANIFEST.read_text(encoding="utf-8"))
source_offset: dict[str, int] = {}

for item in manifest:
    indicator = item.get("indicator", "")
    offset    = indicator_offset.get(indicator, 0)
    for src in item.get("sources", []):
        # 같은 소스를 여러 indicator가 참조할 경우 최댓값 사용
        source_offset[src] = max(source_offset.get(src, 0), offset)

print("소스별 year_offset:")
for src, off in source_offset.items():
    if off:
        print(f"  offset={off}  {src}")

# ── 3. 각 JSON 파일 마이그레이션 ──────────────────────────────────────────
json_files = sorted(DATA_DIR.glob("*.json"))
skip_files = {"manifest.json", "기준대학.json", "학과분류.json",
              "benchmark_cache.json", "benchmark_config.json"}

total_updated = 0

for jf in json_files:
    if jf.name in skip_files:
        continue

    item_key = jf.stem
    offset   = source_offset.get(item_key, 0)

    records: list = json.loads(jf.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        print(f"  건너뜀 (배열 아님): {jf.name}")
        continue

    updated = 0
    new_records = []
    for rec in records:
        if "공시연도" in rec:
            new_records.append(rec)
            continue

        try:
            base_year = int(rec.get("기준연도", 0))
        except (ValueError, TypeError):
            new_records.append(rec)
            continue

        # 기준연도 바로 다음 위치에 공시연도 삽입
        new_rec = {}
        for k, v in rec.items():
            new_rec[k] = v
            if k == "기준연도":
                new_rec["공시연도"] = base_year + offset
        new_records.append(new_rec)
        updated += 1

    if updated:
        jf.write_text(
            json.dumps(new_records, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        total_updated += updated
        print(f"  [OK] {jf.name}: {updated}개 레코드에 공시연도 추가 (offset={offset})")
    else:
        print(f"  [-] {jf.name}: 변경 없음 (이미 완료)")

print(f"\n완료: 총 {total_updated}개 레코드 업데이트")
