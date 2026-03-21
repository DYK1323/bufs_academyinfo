'use strict';

/* ═══════════════════════════════════════════════════════
   CSS 변수 읽기 헬퍼 — JS에서 토큰을 단일 소스로 참조
═══════════════════════════════════════════════════════ */
const cssVar = (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim();

/* ═══════════════════════════════════════════════════════
   상수
═══════════════════════════════════════════════════════ */
const OUR_UNIV    = '부산외국어대학교';
const ROWS_PER_PAGE = 50;
const DATA_PATH   = './data/';

/* ═══════════════════════════════════════════════════════
   AppState
═══════════════════════════════════════════════════════ */
const AppState = {
  filters: {
    항목키: null,
    연도: null,
    지역: [],
    설립Quick: '전체',
    특별법제외: true,
    지역그룹: '전국',
    대학구분그룹: '일반대학',
  },
  raw: {
    manifest: [],
    기준대학: [],
    항목데이터: [],
    calcRules: {},
    currentItem: null,
    benchmarkCache: null,  // benchmark_cache.json (대학×연도×지표 집계)
  },
  computed: {
    aggregated: [],
    filtered: [],
    sorted: [],
    currentPage: 1,
    rankKey: null,
    sortKey: '_rank',
    sortDir: 'asc',
    nameQuery: '',
  },
  trend: {
    groups: new Set(['전국 평균', '전국 사립', '비수도권', '동남권']),
    customUnivs: [],
    allYears: null,
    selectedYears: new Set(),
    yMin: null,
    yMax: null,
  },
  bump: {
    userAdded: [],      // 사용자가 직접 추가한 대학
    userRemoved: [],    // 사용자가 직접 제거한 동남권 대학
    selectedYears: new Set(),
  },
  radar: {
    customUnivs: [],
    groups: new Set(['동남권', '전국 사립']),
    normMode: 'minmax',
  },
  benchmark: {
    customUnivs: [],
    activeTab: null,
    gapFound: '전체',
    gapRegion: '전국',
  },
  heatmap: {
    region: '전국',
    설립: '전체',
  },
  _baseUnivMap: new Map(),
  _univInfoMap: new Map(),
};
