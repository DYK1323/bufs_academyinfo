# 대학공시 데이터 분석 툴

## 프로젝트 개요

대학알리미 공시 데이터를 연 1회 정제·누적하고, 여러 구성원이 웹에서 순위·비교·추이를 조회할 수 있는 분석 툴이다. 전체 기능 명세는 **`docs/spec.md`** 를 참조한다.

중요한 구조 변경이 있었을 때는 사용자가 요청하지 않아도 이 파일을 업데이트한다.

---

## 핵심 제약 (반드시 준수)

| 제약 | 내용 |
|------|------|
| 분석 페이지 | 서버 없는 정적 HTML — GitHub Pages 배포, 외부 API 호출 금지 |
| 관리자 도구 | Python 로컬 실행 전용 — 외부 배포하지 않음 |
| 데이터 저장 | `data/*.json` 항목별 분리, 연도 누적 방식 |
| JSON 저장 원칙 | **자수(raw data)만 저장** — 비율 지표는 저장하지 않고 분석 페이지에서 즉석 계산 |
| JS 라이브러리 | CDN만 사용 (npm 빌드 도구 없음) |
| 인증 | 없음 — 링크를 아는 사람만 접근하는 구조 |
| 우리 대학 기본값 | `부산외국어대학교` — 분석 페이지 접속 시 기본 강조 |
| 데이터 보관 범위 | 최근 5년 — 5년 초과 연도는 JSON 누적 시 자동 제외 |

---

## 저장소 구조

```
/
├── CLAUDE.md                      # 이 파일
├── index.html                     # 분석 페이지 (GitHub Pages)
├── index.css                      # 분석 페이지 스타일 (레이아웃/컴포넌트)
├── admin.html                     # 관리자 페이지
├── normalize_gui.py               # 정제 도구 (Python/tkinter)
├── download_academyinfo.py        # 다운로드 자동화 (Playwright)
├── field_mapping.json             # 필드 매핑 (자동 생성/갱신)
├── merge_rules.json               # 캠퍼스 합산 방식 (sum/skip/master)
├── calc_rules.json                # 비율 지표 산식 정의 (분석 페이지에서 사용)
├── css/
│   └── tokens.css                 # CSS 디자인 토큰 (:root 변수 — index.html·admin.html 공용)
├── js/                            # 분석 페이지 JS (index.html에서 순서대로 로드)
│   ├── state.js                   # AppState, 전역 상수 (OUR_UNIV, ROWS_PER_PAGE, DATA_PATH, cssVar)
│   ├── utils.js                   # Utils, FilterUtils, BenchmarkUtils, 공통 헬퍼 함수
│   ├── data.js                    # DataService (fetch, aggregateByUniversity 등)
│   ├── filter.js                  # FilterManager (항목 변경, 필터 적용, 정렬)
│   ├── app.js                     # App.init(), 이벤트 바인딩, 전역 remove* 함수
│   └── views/
│       ├── ranking.js             # RankingView (순위 표) + ThreatView (위협 레이더)
│       ├── simulator.js           # SimulatorView (목표 시뮬레이터)
│       ├── trend.js               # TrendView (추이 분석) + BumpView (순위 변동)
│       └── benchmark.js           # BenchmarkView + scatter
├── data/
│   ├── 기준대학.json              # 캠퍼스 합산 기준 + 대학 속성
│   ├── 학과분류.json              # 학과 계열 대/중/소 분류 (관리자 직접 관리)
│   ├── manifest.json              # 분석 페이지 공시항목 목록 (indicator·source·columns 정의)
│   ├── benchmark_cache.json       # 벤치마크 뷰용 사전 계산 캐시 (대학별 지표값, admin.html 생성)
│   └── {항목키}.json              # 항목별 누적 데이터 (최근 5년 보관)
└── docs/
    └── spec.md                    # 기능 명세서
```

### JS 로드 순서 (의존성)

```
state.js → utils.js → data.js → views/ranking.js → views/simulator.js
        → views/trend.js → views/benchmark.js → filter.js → app.js
```

모든 파일이 전역 스코프를 공유하므로 ES module import 없이 순서만 유지하면 된다.

### 공유 유틸리티 (js/utils.js)

| 객체/함수 | 설명 |
|-----------|------|
| `Utils` | 포맷팅, 빈 상태, CSV 내보내기 |
| `FilterUtils.matchesFilters(r, f)` | FilterManager·ThreatView·BumpView 공용 필터 로직 |
| `BenchmarkUtils.baseFilter(r)` | 국공립/사립 + 대학교/산업대학 기본 필터 |
| `BenchmarkUtils.getIndicators(sample)` | benchmarkCache 레코드에서 지표 키 목록 추출 |
| `BenchmarkUtils.sigmaFilter(vals)` | σ-trimming (±3σ 범위 내 값만) |
| `BenchmarkUtils.groupAvg(rows, ind)` | baseFilter + σ-trimming 단일 지표 평균 |
| `BenchmarkUtils.groupAvgMulti(rows, inds)` | 다중 지표 평균 (`{ind: avg}` 반환) |
| `BenchmarkUtils.populateDatalist(dlId, names)` | datalist 요소 채우기 |
| `METRO`, `DONGNAM` | 수도권/동남권 지역 Set (모듈 수준 상수) |
| `getPrimaryIndicator(item)` | manifest 항목에서 주 지표 추출 |
| `buildCalcRulesForItem(calcRules, item)` | exclude_rows 적용한 calcRules 생성 |

---

## 컴포넌트별 역할

### normalize_gui.py (Python/tkinter)

- 대학알리미 xlsx 파일을 정제하여 `data/*.json`에 누적하는 로컬 GUI 도구
- **의존 패키지**: `pip install pandas openpyxl` (tkinter는 Python 기본 내장)
- 수정 시 다음 로직의 순서를 반드시 유지할 것:
  1. 시트 선택 (Sheet1 → raw → empty → 첫 번째)
  2. **병합 해제 전에** A열에서 연도(4자리) 탐색 → 데이터 시작 행 확정
  3. 병합 해제 + fill
  4. 헤더 flatten
  5. 필드 매핑 적용 (`field_mapping.json` 역방향 조회)
  6. 새 필드 발견 시 팝업
  7. JSON 누적

### merge_rules.json

캠퍼스 합산 시 항목별 처리 방식 정의. `normalize_gui.py`가 읽어서 적용.

- `sum`: 캠퍼스별 자수 합산
- `skip`: JSON에 저장하지 않음 (비율 지표)
- `master`: 기준파일(`기준대학.json`) 값 사용 (설립구분, 지역 등)

### calc_rules.json

비율 지표 산식 정의. `index.html`(분석 페이지 JS)과 `admin.html`이 읽어서 사용.

```json
{
  "지표명": {
    "label": "화면 표시명",
    "visible": true,
    "sort_asc": false,
    "unit": "%",
    "decimal_places": 2,
    "year_offset": 1,
    "exclude_rows": { "계열": ["의학계열"] },
    "numerator": ["분자_필드1", "분자_필드2"],
    "denominator_base": "분모_기준_필드",
    "denominator_exclude": ["분모_제외_필드1"],
    "multiply": 100,
    "used_in": ["항목키"]
  },
  "최솟값 지표": {
    "label": "화면 표시명",
    "visible": false,
    "min_of": ["지표A", "지표B"],
    "used_in": []
  },
  "N년평균 중간값": {
    "rolling_avg": "원본_필드명",
    "rolling_years": 5
  }
}
```

- `visible`: 분석 페이지 지표 선택 드롭다운에 노출 여부 (false면 중간 계산용)
- `sort_asc`: 순위 정렬 방향 — true면 낮을수록 높은 순위 (중도탈락률 등)
- `unit`: 표시 단위 문자열 (예: `"%"`, `"명"`)
- `decimal_places`: 표시 소수점 자리수
- `year_offset`: 기준연도 오프셋 — 1이면 전년도 데이터를 해당 연도 값으로 사용 (중도탈락률 등)
- `used_in`: 이 지표가 사용되는 공시항목 키 목록 (admin.html 드롭다운 연동)
- `exclude_rows`: 산식 계산 전 특정 행 제외 (예: 의학계열 제외). 대학 단위 합산 전 원시 행에 적용.
- `min_of`: 다른 산식 결과의 최솟값을 취하는 2단계 계산. 1단계 산식 완료 후 처리.
- `rolling_avg`: 지정 필드의 최근 N년 평균을 계산하는 중간값. 다른 산식의 `numerator`에서 참조 가능. `rolling_years` 생략 시 기본값 5년. 해당 대학의 연도별 합산 후 연도 평균으로 계산됨.
- 산식 변경 시 이 파일만 수정하면 되며 코드는 건드리지 않아도 된다.

### download_academyinfo.py (Playwright)

- 대학알리미 공시데이터 추이 페이지(Canvas UI)에서 파일을 일괄 다운로드
- Canvas 좌표 클릭 방식 — CSS 셀렉터 사용 불가
- 수정 시 `CANVAS_X`, `FIRST_ROW_Y`, `ROW_HEIGHT` 값을 유지할 것

### index.html (분석 페이지)

- HTML 구조만 포함 — JS는 `js/` 디렉터리, CSS는 `css/tokens.css` + `index.css`로 분리
- 항목 선택 시 해당 `data/{항목키}.json`만 동적 로드 (전체 로드 금지)
- KRDS 디자인 시스템 준수 (CDN: `cdn.jsdelivr.net/npm/krds-uiux@1.0.1`)
- 차트: ECharts 5.4.3 (CDN, defer 로드)
- 주요 JS 객체: `AppState`, `DataService`, `FilterManager`, `RankingView`, `TrendView`, `Utils`

**순위 보기 (`#ranking-view`)**
- `AppState.computed.rankKey`: 정렬 기준 지표 (데이터 로드 시 고정, 변경 안 됨)
- `_rank` 필드: 정렬 고정 기준의 순위 (표시 정렬과 무관하게 항상 유지)
- KPI 바: 상위 백분율 / 전체 순위 / 지표값 (숫자 크게, 단위 작게)
- 대학명 검색 필터 (`nameQuery`)
- CSV 내보내기: `_rank` 기준 순위 포함

**추이 분석 (`#trend-view`)**
- `TrendView.buildAllYears()`: 전체 연도별 `aggregateByUniversity()` 호출 → `AppState.trend.allYears` 캐시
- 항목 변경 시 `allYears` 및 `selectedYears` 초기화
- 좌측 패널 (`#trend-side-panel`): 비교 그룹 체크박스(색상 도트) / 연도 선택 / Y축 범위 / 대학 추가
- 그룹 평균 필터: `['국공립','사립']` 설립구분 + `['대학교','산업대학']` 대학구분 + 3σ 이상치 제거
- `AppState.trend.selectedYears`: 선택 연도 Set (비면 전체)
- `AppState.trend.yMin` / `yMax`: Y축 범위 (null이면 자동)
- 필터 바: 추이 뷰 활성 시 공시항목 드롭다운만 표시 (`#filter-bar.trend-mode`)

**산포도 (`#scatter-view`)**
- `benchmarkCache` 기반 — X/Y축 항목, 연도, 설립·지역 필터는 필터 바에 위치
- X/Y축 범위(min/max) 입력은 **필터 바가 아닌 `#scatter-view` 카드 내부** 차트 위에 위치 (`scatter-range-input` / `scatter-range-auto`)
- `AppState.scatter.xMin` / `xMax` / `yMin` / `yMax`: 축 범위 (null이면 자동)
- Auto 버튼: 해당 축 입력란을 비우고 자동 범위로 복원

### admin.html (관리자 페이지)

- PAT(Personal Access Token) 입력 후 GitHub API로 JSON 파일 직접 편집·저장
- 연결 성공 후 탭(기준대학 매핑 / 산식 관리 / 공시항목) 표시
- **저장 방식**: 파일별 순차 저장 (GET SHA → PUT) — 병렬 PUT 시 GitHub race condition 방지
- 로드 파일: `data/기준대학.json`, `calc_rules.json`, `data/manifest.json`, `field_mapping.json`

**산식 관리 탭**
- `calcData` 객체에 로컬 반영 → "적용" 버튼으로 확정 → 하단 "GitHub에 저장"
- `exclude_rows` UI: 필드명 + 제외값 행 추가/삭제

**공시항목 탭**
- 카드별 "적용" 버튼 → `manifestData[idx]` 업데이트 (산식과 동일 패턴)
- 필드명(KEY) 셀: `field_mapping.json` 키 + `calc_rules.json` 키를 `<optgroup>` 드롭다운으로 선택

### field_mapping.json

```json
{
  "표준필드명": ["alias1", "alias2", ...],
  "해외취업자수": []
}
```

- 키: 표준 필드명, 값: 지금까지 쓰인 모든 별칭 배열
- `normalize_gui.py`가 자동으로 읽고 갱신함 — 수동 편집도 가능

### manifest.json (`data/manifest.json`)

분석 페이지 공시항목 목록. admin.html에서 편집, index.html이 읽어서 항목 드롭다운 구성.

```json
[
  {
    "indicator": "정원내 신입생 충원율",
    "sources": ["대학_4-다. 신입생 충원 현황_학과별자료"],
    "columns": [
      { "key": "입학정원 (A)", "label": "입학정원" },
      { "key": "정원내 신입생 충원율", "label": "충원율(%)" }
    ]
  },
  {
    "indicator": "장학금 지급률",
    "sources": [
      "대학_12-다-1. 장학금 수혜 현황_학교별자료",
      "대학_12-다-2. 학비감면 준수 여부_학교별자료"
    ],
    "columns": []
  }
]
```

- `indicator`: `calc_rules.json`의 지표명 (키)
- `sources`: `data/{항목키}.json` 파일명 배열 (확장자 제외) — 복수 소스 지원, 단일 소스도 배열로 표기
- `columns`: 순위 표에 표시할 컬럼 목록 — `key`는 raw 필드명 또는 calc_rules 지표명, `label`은 헤더 표시명
- 복수 소스인 경우 캐시 생성 시 `기준대학명 + 기준연도` 기준으로 join 후 산식 적용

### benchmark_cache.json (`data/benchmark_cache.json`)

벤치마크 뷰(레이더·히트맵) 용 사전 계산 캐시. admin.html에서 생성·저장, index.html이 읽어서 사용.

```json
[
  {
    "기준대학명": "가야대학교",
    "기준연도": 2025,
    "지역": "경남",
    "설립구분": "사립",
    "대학구분": "대학교",
    "수도권여부": "N",
    "정원내 신입생 충원율": 95.11,
    "중도탈락률(재학생)": 8.9,
    "전임교원 확보율": 68.04
  }
]
```

- 대학별 1개 레코드 (최신 연도 기준)
- 지표값은 calc_rules.json 산식 적용 후 계산된 값 (비율 등 포함)
- `BenchmarkUtils.getIndicators(sample)`로 지표 키 목록 추출
- raw data가 아닌 계산 결과를 저장하는 유일한 예외 파일 — admin.html에서만 생성

### 기준대학.json

```json
[
  {
    "대학명": "연세대학교(미래캠퍼스)",
    "기준대학명": "연세대학교",
    "설립구분": "사립",
    "대학구분": "4년제",
    "지역": "강원",
    "수도권여부": "N",
    "비고": ""
  }
]
```

---

## 데이터 구조 규칙

### 항목별 JSON (`data/{항목키}.json`)

```json
[
  {
    "기준연도": 2023,
    "기준대학명": "서울대학교",
    "학과명": "컴퓨터공학부",
    "필드1": 값,
    "필드2": 값
  }
]
```

- 레코드 배열(array of objects) 형태
- 같은 항목 + 같은 연도 재처리 시 해당 연도 전체 덮어쓰기 (중복 안전)
- 새 연도에 추가된 필드는 이전 연도 레코드에서 `null`

### 항목 키 규칙

파일명 앞의 연도 패턴 제거:
```
2024년__대학_6-나-(1)_전임교원_확보율_학과별자료.xlsx
→ 대학_6-나-(1)_전임교원_확보율_학과별자료
```

---

## 개발 현황

| 파일 | 상태 | 비고 |
|------|------|------|
| `normalize_gui.py` | ✅ 구현 완료 | 테스트 필요 |
| `download_academyinfo.py` | ✅ 구현 완료 | TEST_MODE=True로 먼저 테스트 |
| `index.html` | ✅ 구현 완료 | 순위 보기 + 추이 분석 뷰 모두 완성 |
| `admin.html` | ✅ 구현 완료 | 기준대학 매핑 / 산식 관리 / 공시항목 관리 |
| 캠퍼스 합산 로직 | 🔲 미착수 | `normalize_gui.py`에 추가 예정 |

---

## 향후 과제

### 교육비 환원율 — 건축비 데이터 통합

교육비 환원율 산식에 건축비 항목이 필요하나, 공시 데이터에 건축비가 없어 별도 수집 필요.

**데이터 출처 및 특이사항**
- 출처: 대학재정정보시스템 (본분교 합산본) + 직접 수집 결산서 (일부 대학 개별)
- 단위: 천원 (공시 데이터는 원 단위 → 저장 시 ×1000 변환 필요)

**계산 흐름**
```
건축비(천원) × 1000 → 건축비_원(원 단위, raw 저장)
→ 최근 5년 평균 (calc_rules.json: rolling_avg)
→ × 0.025 (2.5% 반영, calc_rules.json: multiply)
→ 교육비 환원율 분자에 합산
```

**구현 필요 항목**
1. 건축비 join 스크립트: 대학명을 `기준대학.json`으로 정규화 후 `건축비_원` 필드로 저장
2. JS calc_rules 엔진: `rolling_avg` 타입 구현 (현재 명세만 있고 JS 미구현)
3. calc_rules.json: `건축비_환원분` 산식 정의 (`rolling_avg` + `multiply: 0.025`)
4. 대학명 미매칭 처리: join 스크립트에서 미매칭 목록 출력 → `기준대학.json` alias 추가

---

## 코딩 컨벤션

- **Python**: 함수 단위 분리, 타입 힌트 작성, 한국어 주석 허용
- **HTML/JS**: 단일 파일 원칙, ES6+ 사용, `const`/`let` 사용 (`var` 금지)
- **JSON**: `ensure_ascii=False`, 들여쓰기 2칸
- **커밋**: `data/*.json` 변경은 별도 커밋으로 분리

---

## 자주 묻는 것

**Q. 분석 페이지에서 fetch가 안 됩니다 (CORS 오류)**
→ 로컬에서 `file://`로 열 경우 발생. `python -m http.server 8080`으로 로컬 서버 실행 후 테스트.

**Q. normalize_gui.py에서 "A열에서 연도값을 찾을 수 없습니다" 오류**
→ 파일의 A열 데이터가 세로 병합된 구조. `detect_data_start()`의 병합 맵 로직이 정상 동작하는지 확인.

**Q. 같은 파일을 두 번 실행해도 괜찮나요?**
→ 안전함. 같은 연도 데이터는 덮어쓰고 다른 연도는 유지됨.

**Q. admin.html 저장 시 "SHA mismatch" 오류**
→ GitHub CDN 캐시 또는 병렬 PUT race condition. 현재 코드는 파일별 순차 저장(GET→PUT)으로 방지되어 있음. 재발 시 브라우저 새로고침 후 재시도.

**Q. admin.html 공시항목에서 수정 후 저장했는데 반영이 안 됨**
→ 카드 수정 후 반드시 **"적용" 버튼**을 눌러야 `manifestData`에 반영됨. 적용 없이 GitHub 저장 시 기존값이 그대로 저장됨.
