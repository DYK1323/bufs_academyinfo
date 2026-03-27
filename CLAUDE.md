# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 대학공시 데이터 분석 툴

## 개발 환경 명령어

```bash
# 로컬 분석 페이지 테스트 (CORS 우회)
python -m http.server 8080
# → http://localhost:8080 에서 index.html 확인

# Python 도구 의존 패키지 설치
pip install pandas openpyxl playwright
python -m playwright install chromium

# 데이터 정제 GUI 실행
python normalize_gui.py

# 기준대학목록 Excel → data/기준대학.json 변환 (연 1회 또는 신설·폐교 발생 시)
python convert_기준대학.py [기준대학목록_v2.xlsx]

# 대학개황 CSV → data/대학기본정보.json 변환 (연 1회)
python convert_university_info.py [대학개황정보.csv]
```

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
├── convert_university_info.py     # 대학개황 CSV → data/대학기본정보.json 변환
├── download_academyinfo.py        # 다운로드 자동화 (Playwright)
├── field_mapping.json             # 필드 매핑 (자동 생성/갱신)
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
│   ├── 기준대학.json              # 분석 대상 대학 화이트리스트 (convert_기준대학.py로 생성, admin.html에서 보완 편집)
│   ├── 대학기본정보.json          # 전국 대학 기본정보 (convert_university_info.py로 생성)
│   ├── 학과분류.json              # 학과 계열 대/중/소 분류 (관리자 직접 관리)
│   ├── manifest.json              # 분석 페이지 공시항목 목록 (indicator·source·columns 정의)
│   ├── benchmark_cache.json       # 벤치마크 뷰용 사전 계산 캐시 (대학별 지표값, admin.html 생성)
│   └── {항목키}.json              # 항목별 누적 데이터 (최근 5년 보관)
└── docs/
    └── spec.md                    # 기능 명세서 (최신 — 루트의 spec.md는 구버전 초안)
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
  7. **`공시연도` 삽입** — 파일명 앞 연도(`2025년__...`)를 두 번째 컬럼으로 삽입 (`pub_year_from_filename()`)
  8. JSON 누적
- **`parse_학교_field()`**: `학교` 컬럼 우선, 없으면 `학교명` 컬럼으로 fallback — `{대학명} _제N캠퍼스` / `{대학명} _분교` 형식을 파싱해 `대학명` / `본분교` / `캠퍼스` 컬럼 추가. 학점교류 현황처럼 `학교명` 필드를 쓰는 항목도 대응.
- **문자열 공백 제거**: JSON 저장 직전 모든 object 컬럼에 `.strip()` 적용 — raw 데이터의 trailing space로 인한 `baseUnivMap` 매핑 실패 방지

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
- `used_in`: 이 지표가 사용되는 공시항목 키 목록 (admin.html 드롭다운 연동)
- `exclude_rows`: 산식 계산 전 특정 행 제외 (예: 의학계열 제외). 대학 단위 합산 전 원시 행에 적용.
- `min_of`: 다른 산식 결과의 최솟값을 취하는 2단계 계산. 1단계 산식 완료 후 처리.
- `rolling_avg`: 지정 필드의 최근 N년 평균을 계산하는 중간값. 다른 산식의 `numerator`에서 참조 가능. `rolling_years` 생략 시 기본값 5년. 해당 대학의 연도별 합산 후 연도 평균으로 계산됨.
- `left_join`: `true`이면 캐시 생성 시 `sources[1]`(분모 소스)을 primary로 사용 — 분모가 있는 모든 대학을 포함하고 `sources[0]`(분자 소스)에 데이터가 없으면 numerator=null→0 처리. 공시 안 한 대학도 0%로 집계됨. 단일 소스 지표에는 무시됨. (예: 파견/유치 교환학생 비율 — 교환학생을 아예 공시 안 한 대학도 0%로 포함)
  - **⚠ IMPORTANT**: `left_join`이어도 소스 간 join 키는 **`기준연도`** 기준이다 (`공시연도` 기준으로 바꾸면 안 됨). sources[1](재학생, 공시연도=2024/기준연도=2024)과 sources[0](교환학생, 공시연도=2025/기준연도=2024)은 `기준연도=2024`로 join한다.
  - **⚠ IMPORTANT**: `left_join` 시 코드는 **primary(sources[1])를 먼저 순회**해 tempMap key를 생성하고, 이후 non-primary(sources[0])가 기존 key에 데이터를 추가한다. 소스를 `item.sources` 순서 그대로 순회하면 non-primary가 먼저 처리되어 skip되므로, 반드시 `orderedSources = [primarySource, ...나머지]`로 정렬 후 순회해야 한다.
  - **⚠ IMPORTANT**: 캐시에 저장되는 `공시연도`는 **항상 sources[0](주 소스)의 공시연도** 기준이다. `left_join`에서 sources[1]이 primary여서 tempRow를 먼저 생성하더라도, sources[0] 데이터가 병합될 때 `target.공시연도 = sources[0].공시연도`로 덮어써야 한다. 그래야 연도 선택기에 올바른 연도(2025)가 표시된다.
- 산식 변경 시 이 파일만 수정하면 되며 코드는 건드리지 않아도 된다.

### convert_university_info.py

- 대학알리미에서 받은 대학개황정보 CSV → `data/대학기본정보.json` 변환 (연 1회 실행)
- EUC-KR 인코딩 CSV 입력, 본교 기준으로 지역·설립구분·대학구분 추출 (캠퍼스 중복 제거)
- `설립구분` 정규화: `'국립'`·`'공립'`·`'국립대법인'` → `'국공립'` (특별법·기타는 그대로)
- `data/기준대학.json`과 다름: `기준대학.json`은 캠퍼스 합산 매핑+화이트리스트용, `대학기본정보.json`은 전국 대학 기본 속성

### convert_기준대학.py

- `기준대학목록_v2.xlsx` → `data/기준대학.json` 변환 (연 1회 또는 신설·폐교 발생 시)
- `기준대학여부='기준'` 행에서 지역·설립구분·대학구분 추출, 기준대학명 자기매핑 항목 생성
- 별칭·구 교명 행: 대학명→기준대학명 매핑만 출력 (메타 없음)
- 기존 `기준대학.json`의 통폐합·구 교명 이력 중 Excel에 없는 항목 자동 보존
- 설립구분 정규화: 국립/공립/국립대법인/특별법국립 → `국공립`, 특별법법인 → `특별법`

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
- **raw 컬럼 연도 처리** (`filter.js _reAggregate()`): 항목데이터의 `공시연도=selectedYear`인 행들 중 최솟값 `기준연도`를 구해 그 기준으로 raw 집계. 예) 파견 교환학생 비율(공시연도 2025) → baseYear=2024로 재학생 집계 → 올바른 연도 재학생 수 표시

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
- 연결 성공 후 탭 5개 표시: **기준대학 매핑 / 산식 관리 / 공시항목 / 데이터 조회 / 캐시 관리**
- **저장 방식**: 파일별 순차 저장 (GET SHA → PUT) — 병렬 PUT 시 GitHub race condition 방지
- **로드 파일**: `data/기준대학.json`, `calc_rules.json`, `data/manifest.json`, `field_mapping.json` + `GH.listDataFiles()`로 `data/` 폴더 항목 파일 목록 수집
- **저장소 기억**: `localStorage['gh_repo']` (저장소명), `sessionStorage['gh_token']` (PAT — 탭 닫으면 삭제)

**전역 상태 객체**
- `calcData` — 현재 편집 중인 calc_rules 객체 (적용 버튼으로 갱신)
- `manifestData` — 현재 편집 중인 manifest 배열 (적용 버튼으로 갱신)
- `State.fieldsBySource` — `[{ source: "소스파일명", fields: [...] }]` — 커스텀 자동완성 원본
- `State.dataFiles` — data/ 폴더 항목 파일명 목록 (소스 선택 드롭다운 원본)

**로컬 초안 자동저장** (`DRAFT_KEY = 'admin_draft_v2'`)
- `setDirty()` 호출 시 2초 debounce → `localStorage`에 `{ ts, repo, calc, manifest, 기준대학 }` 저장
- GitHub 재연결 시 동일 저장소 초안 발견 → 하단 복원 바 표시 ("복원하기" / "무시")
- GitHub 저장 성공 또는 초기화 시 초안 삭제
- 저장소가 다른 초안은 무시 (repo 필드로 식별)

**전역 datalist** (JS `refreshDatalistOptions()`로 채움)
- `#dl-data-files` — `State.dataFiles` (소스 파일 선택용)
- `#dl-raw-fields`, `#dl-all-fields`는 제거됨 — 산식 빌더는 커스텀 자동완성 사용

**산식 관리 탭**
- 좌측 필드 팔레트 없음 — 각 입력란에서 직접 검색
- 산식 빌더: 유형 라디오 (비율 / 합계 / MIN / N년평균)
  - 분자/분모 제외/MIN/N년평균 원본 필드: `data-fac="raw"` 또는 `data-fac="all"` 속성으로 커스텀 자동완성 연결
  - 분모: `data-fac="all"` (원시 + 계산 지표)
  - 나머지: `data-fac="raw"` (원시 필드만)

**필드 자동완성 시스템** (`State.fieldsBySource` / `facShow` / `facHide` / `facSelect`)
- `State.fieldsBySource`: `[{ source: "소스파일명", fields: [...] }]` — loadAll() 시 field_mapping.json 섹션별로 구성
- 빈 상태: 소스 파일명으로 그룹 구분해서 표시
- 검색 시: 플랫 목록 + 오른쪽에 소스명 힌트 + 매칭 문자 하이라이트
- `data-fac="all"` 이면 상단에 계산 지표(`calcData` 키) 그룹 추가
- 행 제외 조건: 필드명 입력란 (`data-fac="raw"`) + 제외값 (쉼표 구분)
- `facSelect()`: 드롭다운에서 값 선택 시 — `.chip-search-row` 내부 입력란이면 `addChipFromSearch()` 자동 호출 (수동 "추가" 클릭 불필요)
- "적용" → `calcData` 갱신 + `refreshDatalistOptions()` 호출 → 하단 "GitHub에 저장"

**공시항목 탭**
- `calc_rules.json`의 `visible: true` 지표 목록 기준으로 카드 자동 생성
- 소스 파일: `<select>`로 `State.dataFiles` 목록 선택 (`makeSourceSelectEl()`)
- 컬럼 key 셀: `field_mapping.json` 키 + `calc_rules.json` 키를 `<optgroup>` 드롭다운으로 선택
- 카드별 "적용" 버튼 → `manifestData[idx]` 업데이트
- 탭 전환 시 `renderManifest(manifestData)` 호출 → 산식 관리 변경 즉시 반영

**데이터 조회 탭**
- `data/*.json` 원시 데이터 직접 조회 (manifest sources 기준 드롭다운)
- 연도 / 설립구분 / 지역 / 대학명 필터 + 페이지 단위 렌더링
- 1 MB 초과 파일은 git blobs API(raw) 자동 fallback

**캐시 관리 탭**
- `visible` 지표 × manifest sources 기준으로 집계 대상 자동 구성
- 버튼 2개: **⚡ 캐시 생성 및 저장** (기존) / **🔍 데이터 검증** (저장 없이 join 품질 리포트)
- 대학별 · 연도별 원시 집계 → calc_rules 산식 적용 → `benchmark_cache.json` 생성·저장
- **연도 처리 방식 — 지표별 독립 계산**:
  - **지표마다 독립된 `tempMap`** 을 구성해 산식을 계산한 뒤, **지표값(결과)만** `mergedMap`에 저장한다. raw 필드를 지표 간에 공유하지 않는다.
  - **왜**: 소스파일에 같은 이름의 필드(예: `재학생_계(C)`)가 있을 때, 다른 지표에서 먼저 다른 연도의 값이 들어오면 올바른 값으로 덮어쓸 수 없는 문제가 있었음. (예: 재학생 충원율 기준연도=2025의 재학생=62가 먼저 들어가, 파견교환학생 기준연도=2024의 재학생=99가 무시됨)
  - **⚠ IMPORTANT — 1단계 (지표 내 소스 join)**: `tempMap` 키 = `대학명__기준연도` — **소스마다 `공시연도`가 달라도 `기준연도` 기준으로 묶는다.** `공시연도` 기준으로 join하면 공시연도가 다른 소스끼리 매칭이 안 돼 분자·분모가 분리된다. primary(기본: sources[0], left_join: sources[1])만 새 key를 생성하고, non-primary는 기존 key에만 데이터 추가.
  - **⚠ IMPORTANT — 2단계 (캐시 저장)**: `mergedMap` 키 = `대학명__공시연도` — **캐시는 `공시연도` 기준**으로 저장한다. 저장되는 `공시연도`는 항상 **sources[0](주 소스)의 공시연도**. `left_join`에서 sources[1]이 tempRow를 먼저 생성해도, sources[0] 데이터 병합 시 `target.공시연도`를 sources[0] 기준으로 덮어써야 연도 선택기에 올바른 연도가 표시된다.
  - **캐시 출력 연도**: `공시연도` 필드로 저장. `기준연도`는 캐시에 포함하지 않음.
  - 예) 파견 교환학생(sources[0], 공시연도=2025/기준연도=2024) + 재학생 현황(sources[1], 공시연도=2024/기준연도=2024) → **기준연도=2024**로 1단계 join → 파견비율 계산 → mergedMap에 **공시연도=2025**로 저장
- **대학명 인식**: `row['대학명'] || row['학교'] || row['학교명'] || '(미확인)'` — `학교명` 필드 사용 항목(예: 학점교류 현황)도 정상 인식
- **`GH.getFileSha(path)`**: SHA만 가져오는 전용 메서드 (benchmark_cache.json 같은 대용량 파일도 content 디코딩 없이 안전하게 SHA 취득) — 1MB 초과 시 Git Trees API fallback

**데이터 검증 도구 (`CacheManager.validate()`)**
- 캐시를 저장하지 않고 join 과정의 오류를 사전 탐지
- 결과는 `#cache-validation-wrap` 카드에 4개 섹션으로 표시:
  - **V1** `_aggregateRaw` — `baseUnivMap` 미매칭 대학명 (소스파일별 목록)
  - **V2** 1단계 tempMap join — 복수 소스 간 기준연도 키 불일치로 분자·분모 한쪽 누락
  - **V3** (지표별 독립 계산으로 cross-indicator merge 제거됨 — 해당 없음)
  - **V4** `_applyCalc` — numerator/denominator 필드 미존재 → `?? 0` 처리로 지표값 0 위험
- 이슈 없는 섹션 ✅ 접힘, 이슈 있는 섹션 ❌ 열림으로 표시

### field_mapping.json

```json
{
  "__shared": {
    "기준연도": ["기준년도"],
    "학교": [],
    "학과 (모집단위)": []
  },
  "대학_4-다. 신입생 충원 현황_학과별자료": {
    "입학정원 (A)": [],
    "모집인원_계": []
  }
}
```

- `__shared`: 여러 항목에 공통으로 등장하는 필드 (기준연도, 학교명, 지역 등 18개)
- 항목키 섹션: 해당 공시항목에만 등장하는 필드
- 값 배열: 같은 필드의 과거 별칭 목록 (빈 배열이면 별칭 없음)
- `normalize_gui.py`가 `load_mapping()` 시 자동 로드·갱신 — `__shared` + 항목키 섹션 병합 후 역방향 조회
- 구버전 플랫 구조(`{"표준명": [aliases]}`)는 `load_mapping()` 실행 시 `__shared`로 자동 마이그레이션

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
    "공시연도": 2025,
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
- `공시연도`: 주 소스(sources 배열 첫 번째)의 공시연도 — **index.html의 모든 연도 필터링은 이 값 기준**
  - `기준연도`는 join에만 사용하고 캐시 출력에는 포함하지 않음
  - filter.js / ranking.js / trend.js / benchmark.js 모두 `r.공시연도` 기준
  - `BENCHMARK_META_KEYS`에 `공시연도` 포함 — 지표 목록에 노출 안 됨
- 지표값은 calc_rules.json 산식 적용 후 계산된 값 (비율 등 포함)
- `BenchmarkUtils.getIndicators(sample)`로 지표 키 목록 추출
- raw data가 아닌 계산 결과를 저장하는 유일한 예외 파일 — admin.html에서만 생성

### 기준대학.json

분석 대상 대학 **화이트리스트** + 캠퍼스 합산 매핑. `convert_기준대학.py`로 생성, admin.html 기준대학 매핑 탭에서 보완 편집.

**등록 안 된 대학명은 캐시 생성 시 제외됨** — V1-B 검증에서 경고.

항목 유형 두 가지:

**① 기준 항목 (대학명 = 기준대학명, 메타 포함)**
```json
{"대학명": "가야대학교", "기준대학명": "가야대학교",
 "지역": "경남", "설립구분": "사립", "대학구분": "대학교"}
```

**② 별칭·구 교명 항목 (메타 없음)**
```json
{"대학명": "가야대학교(김해)", "기준대학명": "가야대학교"}
{"대학명": "경상대학교",       "기준대학명": "경상국립대학교", "비고": "2021 / 통폐합"}
```

- `수도권여부`: JSON에 저장하지 않음 — `_aggregateRaw()`에서 METRO Set으로 자동 계산
- `설립구분` 저장값: 국공립 / 사립 / 특별법 (raw 원값은 스크립트에서 정규화)
- 매년 신설·폐교·이름변경 시 Excel 업데이트 후 `convert_기준대학.py` 재실행

---

## 데이터 구조 규칙

### 항목별 JSON (`data/{항목키}.json`)

```json
[
  {
    "기준연도": 2023,
    "공시연도": 2024,
    "기준대학명": "서울대학교",
    "학과명": "컴퓨터공학부",
    "필드1": 값,
    "필드2": 값
  }
]
```

- 레코드 배열(array of objects) 형태
- `기준연도`: 데이터가 실제 다루는 학년도 (xlsx A열에서 추출)
- `공시연도`: 대학알리미에 공시된 연도 (파일명 앞 연도에서 추출) — 분석 페이지·캐시가 이 값 기준으로 연도 매칭
- 대부분의 항목은 `공시연도 = 기준연도`, 집계 시차가 있는 항목(중도탈락 등)은 다름
- 같은 항목 + 같은 `공시연도` 재처리 시 해당 연도 전체 덮어쓰기 (중복 안전)
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
| `admin.html` | ✅ 구현 완료 | 기준대학 / 산식 / 공시항목 / 데이터 조회 / 캐시 관리 (5탭) |
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

## 데이터 처리 원칙

- **매핑 실패 시 누락 금지**: 대학명 정규화·매핑이 실패해도 해당 레코드를 버리지 않는다. `기준대학명: null`로 표기하고 원본값을 함께 저장해 사용자가 오류를 직접 판단할 수 있도록 한다.
- **변환 스크립트 출력**: 매핑 실패 목록은 반드시 콘솔에 출력한다. 조용히 누락시키는 일은 없어야 한다.
- **검증 우선**: 필터링·제외 로직을 추가할 때는 제외된 항목을 확인할 수단(출력, 로그, null 표기)을 함께 제공한다.

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

**Q. admin.html 저장 시 "SHA mismatch" 오류**
→ GitHub CDN 캐시 또는 병렬 PUT race condition. 현재 코드는 파일별 순차 저장(GET→PUT)으로 방지되어 있음. 재발 시 브라우저 새로고침 후 재시도.

**Q. 캐시 생성 시 "nil is not a string" 또는 "'sha' wasn't supplied" 오류**
→ GitHub API PUT 시 SHA 처리 문제. 두 가지 원인: (1) 신규 파일에 sha 포함 — `putFile`에서 `sha ? {..., sha} : {...}` 분기로 처리. (2) benchmark_cache.json 같은 1MB 초과 파일을 `GH.getFile()`로 SHA 취득 시 content 디코딩 실패 — `GH.getFileSha(path)` 전용 메서드 사용으로 해결.

**Q. admin.html 공시항목에서 수정 후 저장했는데 반영이 안 됨**
→ 카드 수정 후 반드시 **"적용" 버튼**을 눌러야 `manifestData`에 반영됨. 적용 없이 GitHub 저장 시 기존값이 그대로 저장됨.

**Q. admin.html에서 작업하다 새로고침했는데 내용이 날아감**
→ "적용" 버튼 클릭 후 2초 이내에 새로고침하면 로컬 초안 저장 전일 수 있음. 재연결 시 초안이 있으면 하단에 복원 배너가 표시됨. 초안은 마지막 "적용" 시점 기준이므로, 적용 없이 입력 중이던 내용은 복원되지 않음.

**Q. 산식 빌더에서 분자 필드를 자동완성으로 선택했는데 저장이 안 됨**
→ 자동완성 드롭다운에서 클릭 시 chip이 자동 추가됨. 만약 chip이 안 보이면 `facSelect()` 내부에서 `.chip-search-row` 감지 후 `addChipFromSearch()` 호출하는 로직 확인.

**Q. 순위보기에서 복수 소스 지표(예: 파견 교환학생 비율)의 raw 컬럼 연도가 잘못 표시됨**
→ `filter.js _reAggregate()`는 항목데이터의 `공시연도=selectedYear` 행들 중 최솟값 `기준연도`를 찾아 그 기준으로 raw 집계함. 공시연도≠기준연도인 항목에서 소스별 연도 불일치가 생기면 이 로직 확인.

**Q. 캐시에 `(미확인)` 대학이 나타남**
→ 해당 소스 파일의 대학명 필드가 `대학명`, `학교`, `학교명` 중 어느 것도 아닌 경우. `_aggregateRaw()`의 대학명 lookup 코드(`row['대학명'] || row['학교'] || row['학교명']`)에 해당 필드명 추가 필요.
