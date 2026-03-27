# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 대학공시 데이터 분석 툴

대학알리미 공시 데이터를 연 1회 정제·누적하고, 웹에서 순위·비교·추이를 조회하는 정적 HTML 분석 툴. 상세 기능 명세 → **`docs/spec.md`**, 아키텍처 상세 → **`docs/architecture.md`**

중요한 구조 변경이 있었을 때는 사용자가 요청하지 않아도 이 파일을 업데이트한다.

---

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
├── CLAUDE.md
├── index.html                     # 분석 페이지 (GitHub Pages)
├── admin.html                     # 관리자 페이지
├── normalize_gui.py               # 정제 도구 (Python/tkinter)
├── convert_university_info.py     # 대학개황 CSV → data/대학기본정보.json 변환
├── convert_기준대학.py
├── download_academyinfo.py        # 다운로드 자동화 (Playwright)
├── field_mapping.json             # 필드 매핑 (자동 생성/갱신)
├── calc_rules.json                # 비율 지표 산식 정의
├── css/
│   ├── tokens.css                 # CSS 디자인 토큰 (:root 변수 — index.html·admin.html 공용)
│   ├── common.css                 # 전역 리셋
│   ├── index.css                  # 분석 페이지 전용 스타일
│   └── admin.css                  # 관리자 페이지 전용 스타일
├── js/                            # 분석 페이지 JS (index.html에서 순서대로 로드)
│   ├── state.js
│   ├── utils.js
│   ├── data.js
│   ├── filter.js
│   ├── app.js
│   ├── views/
│   │   ├── ranking.js
│   │   ├── simulator.js
│   │   ├── trend.js
│   │   └── benchmark.js
│   └── admin/                     # 관리자 페이지 JS (admin.html에서 로드)
│       ├── gh.js
│       ├── state.js
│       ├── app.js
│       ├── fac.js
│       ├── tab-mapping.js
│       ├── tab-calc.js
│       ├── tab-manifest.js
│       ├── data-viewer.js
│       └── cache.js
├── data/
│   ├── 기준대학.json              # 분석 대상 화이트리스트 + 캠퍼스 합산 매핑
│   ├── 대학기본정보.json
│   ├── 학과분류.json
│   ├── manifest.json              # 공시항목 목록 (indicator·sources·columns 정의)
│   ├── benchmark_cache.json       # 벤치마크 뷰용 사전 계산 캐시 (admin.html 생성)
│   └── {항목키}.json              # 항목별 누적 데이터 (최근 5년)
└── docs/
    ├── spec.md                    # 기능 명세서
    ├── architecture.md            # 아키텍처·컴포넌트 상세
    └── changelog.md
```

### JS 로드 순서 (index.html 의존성)

```
state.js → utils.js → data.js → views/ranking.js → views/simulator.js
        → views/trend.js → views/benchmark.js → filter.js → app.js
```

모든 파일이 전역 스코프를 공유하므로 ES module import 없이 순서만 유지하면 된다.

---

## 코딩 컨벤션

- **Python**: 함수 단위 분리, 타입 힌트 작성, 한국어 주석 허용
- **HTML/JS**: ES6+ 사용, `const`/`let` 사용 (`var` 금지)
- **JSON**: `ensure_ascii=False`, 들여쓰기 2칸
- **커밋**: `data/*.json` 변경은 별도 커밋으로 분리
