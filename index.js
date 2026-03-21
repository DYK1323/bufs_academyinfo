'use strict';

/* ═══════════════════════════════════════════════════════
   CSS 변수 읽기 헬퍼 — JS에서 토큰을 단일 소스로 참조
═══════════════════════════════════════════════════════ */
const cssVar = (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim();

/* ═══════════════════════════════════════════════════════
   상수
═══════════════════════════════════════════════════════ */
const OUR_UNIV = '부산외국어대학교';
const ROWS_PER_PAGE = 50;
const DATA_PATH = './data/';

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
    selectedYears: new Set(),  // 비면 전체 연도 표시
  },
  radar: {
    customUnivs: [],
    groups: new Set(['동남권', '전국 사립']),
    normMode: 'minmax',
  },
  benchmark: {
    customUnivs: [],    // 선택된 비교 대학 목록
    activeTab: null,    // 현재 탭 (대학명 또는 null)
    gapFound: '전체',   // 갭 차트 설립 필터
    gapRegion: '전국',  // 갭 차트 지역 필터
  },
  heatmap: {
    region: '전국',
    설립: '전체',
  },
  _baseUnivMap: new Map(),
  _univInfoMap: new Map(),
};

/* ═══════════════════════════════════════════════════════
   Utils
═══════════════════════════════════════════════════════ */
const Utils = {
  formatNumber(n, decimals = 0) {
    if (n == null || isNaN(n)) return '-';
    return n.toLocaleString('ko-KR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  },
  formatPercent(n, decimals = 1) {
    if (n == null || isNaN(n)) return '-';
    return n.toLocaleString('ko-KR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + '%';
  },
  formatValue(n, unit, decimals) {
    if (n == null || isNaN(n)) return '-';
    if (unit === '%') {
      const d = decimals ?? 1;
      return n.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%';
    }
    if (unit === '만원' || unit === '원') return Math.round(n).toLocaleString('ko-KR') + unit;
    if (unit === '명' || unit === '개') return Math.round(n).toLocaleString('ko-KR') + unit;
    const d = decimals ?? 0;
    return n.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  },
  formatDelta(cur, prev) {
    if (cur == null || prev == null || isNaN(cur) || isNaN(prev)) return '<span class="delta-none">-</span>';
    const diff = cur - prev;
    if (diff === 0) return '<span class="delta-none">±0</span>';
    const cls = diff > 0 ? 'delta-up' : 'delta-down';
    const sign = diff > 0 ? '▲' : '▼';
    return `<span class="${cls}">${sign} ${Math.abs(diff).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</span>`;
  },
  calcTopPercent(rank, total) {
    if (!total) return '-';
    return ((rank / total) * 100).toFixed(1);
  },
  buildFilterDescription(filters) {
    const parts = [];
    const 구분라벨 = { '전체': '전체대학', '일반대학': '4년제 일반대학', '교육대학포함': '교육대학 포함' };
    parts.push(구분라벨[filters.대학구분그룹] || filters.대학구분그룹);
    if (filters.설립Quick !== '전체') parts.push(filters.설립Quick);
    if (filters.지역그룹 !== '전국') parts.push(filters.지역그룹);
    return parts.join(' · ');
  },
  showLoading() {
    const emptyEl = document.getElementById('empty-state');
    const tableCard = document.getElementById('table-card');
    const kpiBar = document.getElementById('kpi-bar');
    if (emptyEl) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><span style="font-size:13px;color:var(--sidebar-text)">데이터 불러오는 중...</span></div>';
    }
    if (tableCard) tableCard.style.display = 'none';
    if (kpiBar) kpiBar.innerHTML = '';
  },
  showEmptyState(reason) {
    const messages = {
      'no-item':    { icon: '📋', title: '공시 항목을 선택해 주세요', desc: '상단 필터에서 공시 항목을 선택하면<br>전국 대학 순위 데이터가 표시됩니다.' },
      'no-data':    { icon: '📂', title: '데이터가 없습니다', desc: '<code>normalize_gui.py</code>로 데이터를 먼저 처리해 주세요.<br>처리 후 <code>data/</code> 폴더에 JSON 파일이 생성됩니다.' },
      'fetch-error':{ icon: '⚠️', title: '데이터를 불러오지 못했습니다', desc: '로컬에서 실행 중이라면:<br><code>python -m http.server 8080</code> 실행 후<br><code>http://localhost:8080</code>으로 접속하세요.' },
      'no-results': { icon: '🔍', title: '조건에 해당하는 대학이 없습니다', desc: '필터 조건을 조정해 보세요.' },
    };
    const m = messages[reason] || messages['no-item'];
    const emptyEl = document.getElementById('empty-state');
    const tableCard = document.getElementById('table-card');
    const kpiBar = document.getElementById('kpi-bar');
    if (emptyEl) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${m.icon}</div><div class="empty-title">${m.title}</div><div class="empty-desc">${m.desc}</div></div>`;
    }
    if (tableCard) tableCard.style.display = 'none';
    if (kpiBar) kpiBar.innerHTML = '';
  },
  exportCSV(rows, columns, filename) {
    const BOM = '\uFEFF';
    const header = columns.map(c => c.label).join(',');
    const body = rows.map(row =>
      columns.map(c => {
        const val = (row[c.key] != null ? row[c.key] : '');
        return String(val).includes(',') ? `"${val}"` : val;
      }).join(',')
    ).join('\n');
    const blob = new Blob([BOM + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  },
};

function getPrimaryIndicator(item) {
  if (!item) return null;
  if (item.indicators?.length) return item.indicators.find(i => i.is_primary) || item.indicators[0];
  if (item.sort_key) return { id: item.sort_key, unit: '%', decimal_places: 2, sort_asc: item.sort_asc || false };
  return null;
}

function buildCalcRulesForItem(calcRules, item) {
  const indicators = item?.indicators || [];
  if (!indicators.some(i => i.exclude_rows)) return calcRules;
  const merged = { ...calcRules };
  for (const ind of indicators) {
    if (!ind.exclude_rows) continue;
    const rule = merged[ind.id];
    if (!rule) continue;
    if (rule.min_of) {
      for (const childKey of rule.min_of) {
        if (merged[childKey]) merged[childKey] = { ...merged[childKey], exclude_rows: ind.exclude_rows };
      }
    } else {
      merged[ind.id] = { ...rule, exclude_rows: ind.exclude_rows };
    }
  }
  return merged;
}

/* ═══════════════════════════════════════════════════════
   DataService
═══════════════════════════════════════════════════════ */
const DataService = {
  async fetchJSON(path, fallback) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch { return fallback; }
  },
  async fetchManifest()        { return this.fetchJSON(`${DATA_PATH}manifest.json`, []); },
  async fetchBaseUnivData()    { return this.fetchJSON(`${DATA_PATH}기준대학.json`, []); },
  async fetchCalcRules()       { return this.fetchJSON('./calc_rules.json', {}); },
  async fetchUnivInfo()        { return this.fetchJSON(`${DATA_PATH}대학기본정보.json`, []); },
  async fetchBenchmarkCache()  { return this.fetchJSON(`${DATA_PATH}benchmark_cache.json`, null); },
  buildUnivInfoMap(rows) {
    const map = new Map();
    for (const row of rows) { if (row['학교명']) map.set(row['학교명'], row); }
    return map;
  },
  async fetchItemData(item) {
    const itemKey = typeof item === 'string' ? item : (item?.key ?? '');
    const indicators = typeof item === 'object' ? (item?.indicators || []) : [];
    const sources = indicators.length
      ? [...new Set(indicators.flatMap(ind => ind.sources?.length ? ind.sources : [itemKey]))]
      : [itemKey];
    if (sources.length === 1) return this.fetchJSON(`${DATA_PATH}${encodeURIComponent(sources[0])}.json`, null);
    const results = await Promise.all(sources.map(src => this.fetchJSON(`${DATA_PATH}${encodeURIComponent(src)}.json`, null)));
    if (results.some(r => r === null)) return null;
    const getYear = r => parseInt(r['기준연도'] ?? r['기준년도'], 10);
    const yearSets = results.map(rows => new Set(rows.map(getYear).filter(y => !isNaN(y))));
    const commonYears = yearSets.reduce((a, b) => new Set([...a].filter(y => b.has(y))));
    return results.flatMap(rows => rows.filter(r => commonYears.has(getYear(r))));
  },
  buildBaseUnivMap(rows) {
    const map = new Map();
    for (const row of rows) { const key = row['대학명']; if (key) map.set(key, row); }
    return map;
  },
  extractYears(rows) {
    const years = [...new Set(rows.map(r => {
      const y = r['기준연도'] ?? r['기준년도'];
      return y != null ? parseInt(y, 10) : null;
    }).filter(y => y != null && !isNaN(y)))];
    return years.sort((a, b) => b - a);
  },
  aggregateByUniversity(rows, targetYear, calcRules, baseUnivMap, prevYear = null, univInfoMap = new Map()) {
    const ratioKeys = new Set(Object.keys(calcRules));
    const getYear = r => parseInt(r['기준연도'] ?? r['기준년도'], 10);
    const yearRows = rows.filter(r => getYear(r) === targetYear);
    const prevRows = prevYear != null ? rows.filter(r => getYear(r) === prevYear) : [];
    const METRO_REGIONS = new Set(['서울', '경기', '인천']);

    const groupBy = (rowSet) => {
      const groups = new Map();
      for (const row of rowSet) {
        const parsedName = row['대학명'] || row['학교'] || '(미확인)';
        const key = baseUnivMap.get(parsedName)?.['기준대학명'] || parsedName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      return groups;
    };

    const sumGroup = (groupRows) => {
      if (!groupRows.length) return {};
      const result = {};
      const firstRow = groupRows[0];
      for (const field of Object.keys(firstRow)) {
        if (ratioKeys.has(field)) continue;
        const nums = groupRows.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
        result[field] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : firstRow[field];
      }
      return result;
    };

    const sumFields = (filteredRows, fields) => {
      const result = {};
      for (const field of fields) {
        const nums = filteredRows.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
        result[field] = nums.length ? nums.reduce((a, b) => a + b, 0) : 0;
      }
      return result;
    };

    // rolling_avg 규칙: 해당 대학의 sourceField를 forYear 기준 numYears개 연도 합산 후 평균
    const computeRollingAvg = (univName, sourceField, numYears, forYear) => {
      const startYear = forYear - numYears + 1;
      const yearVals = [];
      for (let y = startYear; y <= forYear; y++) {
        const yRows = rows.filter(r => {
          if (getYear(r) !== y) return false;
          const parsedName = r['대학명'] || r['학교'] || '(미확인)';
          return (baseUnivMap.get(parsedName)?.['기준대학명'] || parsedName) === univName;
        });
        if (!yRows.length) continue;
        const nums = yRows.map(r => r[sourceField]).filter(v => typeof v === 'number' && !isNaN(v));
        if (nums.length) yearVals.push(nums.reduce((a, b) => a + b, 0));
      }
      return yearVals.length ? yearVals.reduce((a, b) => a + b, 0) / yearVals.length : null;
    };

    const applyCalcRules = (summed, rawRows) => {
      const result = { ...summed };
      for (const [key, rule] of Object.entries(calcRules)) {
        if (rule.min_of) continue;
        if (rule.rolling_avg) continue; // 이미 summed에 주입됨
        let num, den;
        if (rule.exclude_rows && rawRows) {
          const filtered = rawRows.filter(r => Object.entries(rule.exclude_rows).every(([f, vs]) => !vs.includes(r[f])));
          const needed = [...(rule.numerator || []), rule.denominator_base, ...(rule.denominator_exclude || [])];
          const fs = sumFields(filtered, needed);
          num = (rule.numerator || []).reduce((acc, f) => acc + (fs[f] ?? result[f] ?? 0), 0);
          const denBase1 = rule.denominator_base;
          den = !isNaN(Number(denBase1)) ? Number(denBase1) : (fs[denBase1] ?? result[denBase1] ?? 0);
          for (const excl of (rule.denominator_exclude || [])) den -= (fs[excl] ?? result[excl] ?? 0);
        } else {
          num = (rule.numerator || []).reduce((acc, f) => acc + (result[f] ?? summed[f] ?? 0), 0);
          const denBase2 = rule.denominator_base;
          den = !isNaN(Number(denBase2)) ? Number(denBase2) : (result[denBase2] ?? summed[denBase2] ?? 0);
          for (const excl of (rule.denominator_exclude || [])) den -= (result[excl] ?? summed[excl] ?? 0);
        }
        result[key] = den > 0 ? (num / den) * (rule.multiply ?? 1) : null;
      }
      for (const [key, rule] of Object.entries(calcRules)) {
        if (!rule.min_of) continue;
        const vals = rule.min_of.map(k => result[k]).filter(v => v != null && !isNaN(v));
        result[key] = vals.length ? Math.min(...vals) : null;
      }
      return result;
    };

    const rollingRules = Object.entries(calcRules).filter(([, r]) => r.rolling_avg);
    const injectRollingAvg = (summed, univName, forYear) => {
      for (const [key, rule] of rollingRules) {
        summed[key] = computeRollingAvg(univName, rule.rolling_avg, rule.rolling_years ?? 5, forYear);
      }
    };

    const currentGroups = groupBy(yearRows);
    const prevGroups = prevYear != null ? groupBy(prevRows) : new Map();
    const result = [];
    for (const [univName, univRows] of currentGroups) {
      const summed = sumGroup(univRows);
      injectRollingAvg(summed, univName, targetYear);
      const withRatios = applyCalcRules(summed, univRows);
      const info = univInfoMap.get(univName) || {};
      const 지역 = info['지역'] || univRows[0]['지역'] || '미확인';
      const 설립구분 = info['설립구분'] || univRows[0]['설립구분'] || '미확인';
      const 대학구분 = info['대학구분'] || univRows[0]['학교종류'] || '미확인';
      const 수도권여부 = METRO_REGIONS.has(지역) ? 'Y' : 'N';
      let prevSummed = null;
      if (prevGroups.has(univName) && prevYear != null) {
        const ps = sumGroup(prevGroups.get(univName));
        injectRollingAvg(ps, univName, prevYear);
        prevSummed = applyCalcRules(ps, prevGroups.get(univName));
      }
      result.push({ 기준대학명: univName, 지역, 설립구분, 대학구분, 수도권여부, ...withRatios, _prev: prevSummed, _isOurs: univName === OUR_UNIV });
    }
    return result;
  },
  detectPrimaryValueField(aggregated, calcRules) {
    if (!aggregated.length) return null;
    const calcKeys = Object.keys(calcRules).filter(k => !calcRules[k].rolling_avg);
    if (calcKeys.length) return calcKeys[0];
    const sample = aggregated[0];
    for (const [k, v] of Object.entries(sample)) {
      if (k.startsWith('_') || ['기준대학명','지역','설립구분','대학구분','수도권여부','기준연도'].includes(k)) continue;
      if (typeof v === 'number') return k;
    }
    return null;
  },
};

/* ═══════════════════════════════════════════════════════
   FilterManager
═══════════════════════════════════════════════════════ */
const FilterManager = {
  _msState: {},
  init() {
    document.getElementById('filter-item').addEventListener('change', e => this.onItemChange(e.target.value || null));
    document.getElementById('filter-year').addEventListener('change', e => this.onYearChange(e.target.value ? parseInt(e.target.value) : null));
    document.getElementById('univ-type-group').addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn'); if (!btn) return;
      AppState.filters.대학구분그룹 = btn.dataset.val;
      document.querySelectorAll('#univ-type-group .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === btn.dataset.val));
      this._triggerRender();
    });
    document.getElementById('found-quick').addEventListener('click', e => { const btn = e.target.closest('.seg-btn'); if (btn) this.onFoundQuick(btn.dataset.val); });
    document.getElementById('chk-special-excl').addEventListener('change', e => { AppState.filters.특별법제외 = e.target.checked; FilterManager._triggerRender(); });
    document.getElementById('region-group').addEventListener('click', e => { const btn = e.target.closest('.seg-btn'); if (btn) this.onRegionGroup(btn.dataset.val); });
    document.addEventListener('click', e => {
      for (const msId of Object.keys(this._msState)) {
        const el = document.getElementById(msId);
        if (el && !el.contains(e.target)) {
          el.querySelector('.multi-select-dropdown').classList.remove('open');
          el.querySelector('.multi-select-trigger').classList.remove('open');
        }
      }
    });
  },
  renderItemSelect(manifest) {
    const sel = document.getElementById('filter-item');
    sel.innerHTML = '<option value="">지표 선택</option>';
    if (!manifest.length) { sel.innerHTML += '<option value="" disabled>등록된 항목이 없습니다</option>'; return; }
    for (const item of manifest) {
      const key = item?.key ?? item; const label = item?.label || key;
      const opt = document.createElement('option'); opt.value = key; opt.textContent = label;
      sel.appendChild(opt);
    }
  },
  renderYearSelect(years) {
    const sel = document.getElementById('filter-year');
    sel.innerHTML = '';
    for (const y of years) {
      const opt = document.createElement('option'); opt.value = y; opt.textContent = y + '년'; sel.appendChild(opt);
    }
    if (years.length) { AppState.filters.연도 = years[0]; sel.value = years[0]; }
  },
  renderAllMultiSelects(aggregated = null) { /* 확장 시 추가 */ },
  onFoundQuick(val) {
    AppState.filters.설립Quick = val;
    document.querySelectorAll('#found-quick .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.val === val));
    this._triggerRender();
  },
  onRegionGroup(val) {
    AppState.filters.지역그룹 = val;
    document.querySelectorAll('#region-group .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.val === val));
    this._triggerRender();
  },
  async onItemChange(itemKey) {
    AppState.filters.항목키 = itemKey;
    AppState.raw.currentItem = AppState.raw.manifest.find(m => (m?.key ?? m) === itemKey) || null;
    AppState.trend.allYears = null;
    AppState.trend.selectedYears.clear();
    AppState.bump.userAdded = [];
    AppState.bump.userRemoved = [];
    AppState.bump.selectedYears = new Set();
    AppState.trend.yMin = null; AppState.trend.yMax = null;
    document.getElementById('trend-ymin').value = '';
    document.getElementById('trend-ymax').value = '';
    if (!itemKey) { Utils.showEmptyState('no-item'); return; }
    Utils.showLoading();
    document.getElementById('table-card').style.display = 'none';
    const rows = await DataService.fetchItemData(AppState.raw.currentItem || itemKey);
    AppState.raw.항목데이터 = rows || [];
    if (!rows) { Utils.showEmptyState('fetch-error'); return; }
    if (!rows.length) { Utils.showEmptyState('no-data'); return; }
    const years = DataService.extractYears(rows);
    this.renderYearSelect(years);
    this._reAggregate();
  },
  onYearChange(year) { AppState.filters.연도 = year; this._reAggregate(); },
  _reAggregate() {
    const { 항목데이터, calcRules, currentItem } = AppState.raw;
    const year = AppState.filters.연도;
    if (!year || !항목데이터.length) { Utils.showEmptyState('no-data'); return; }
    const calcRulesForItem = buildCalcRulesForItem(calcRules, currentItem);
    AppState.computed.aggregated = DataService.aggregateByUniversity(항목데이터, year, calcRulesForItem, AppState._baseUnivMap, year - 1, AppState._univInfoMap);
    this.renderAllMultiSelects(AppState.computed.aggregated);
    const primaryInd = getPrimaryIndicator(currentItem);
    const resolvedKey = primaryInd?.id || DataService.detectPrimaryValueField(AppState.computed.aggregated, calcRules);
    AppState.computed.rankKey = resolvedKey;
    AppState.computed.sortKey = '_rank';
    AppState.computed.sortDir = 'asc';
    AppState.computed.currentPage = 1;
    this.applyFilters();
    if (document.getElementById('trend-view')?.classList.contains('visible')) TrendView.activate();
    if (document.getElementById('bump-view')?.classList.contains('visible')) BumpView.activate();
  },
  applyFilters() {
    const { aggregated } = AppState.computed;
    const f = AppState.filters;
    const METRO = new Set(['서울', '경기', '인천']);
    const DONGNAM = new Set(['부산', '울산', '경남']);
    const 허용대학구분 = f.대학구분그룹 === '전체' ? null
                      : f.대학구분그룹 === '교육대학포함' ? new Set(['대학교', '산업대학', '교육대학'])
                      : new Set(['대학교', '산업대학']);
    AppState.computed.filtered = aggregated.filter(row => {
      if (허용대학구분 && row.대학구분 && row.대학구분 !== '미확인' && !허용대학구분.has(row.대학구분)) return false;
      if (f.지역.length && !f.지역.includes(row.지역)) return false;
      if (f.설립Quick === '사립' && row.설립구분 !== '사립') return false;
      if (f.특별법제외 && ['특별법국립','특별법법인','기타'].includes(row.설립구분)) return false;
      if (f.지역그룹 === '비수도권' && METRO.has(row.지역)) return false;
      if (f.지역그룹 === '동남권' && !DONGNAM.has(row.지역)) return false;
      if (f.지역그룹 === '부산' && row.지역 !== '부산') return false;
      return true;
    });
    this._sortAndRender();
  },
  _sortAndRender() {
    const { filtered, sortKey, sortDir, rankKey } = AppState.computed;
    if (rankKey) {
      const sortAsc = getPrimaryIndicator(AppState.raw.currentItem)?.sort_asc === true;
      const forRank = [...filtered].sort((a, b) => {
        const av = a[rankKey] ?? (sortAsc ? Infinity : -Infinity);
        const bv = b[rankKey] ?? (sortAsc ? Infinity : -Infinity);
        return typeof av === 'string'
          ? (sortAsc ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko'))
          : (sortAsc ? av - bv : bv - av);
      });
      forRank.forEach((row, i) => { row._rank = i + 1; });
    } else {
      filtered.forEach((row, i) => { row._rank = i + 1; });
    }
    if (sortKey) {
      AppState.computed.sorted = [...filtered].sort((a, b) => {
        const av = a[sortKey] ?? -Infinity; const bv = b[sortKey] ?? -Infinity;
        if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko');
        return sortDir === 'asc' ? av - bv : bv - av;
      });
    } else {
      AppState.computed.sorted = [...filtered];
    }
    RankingView.render();
    if (document.getElementById('simulator-view')?.classList.contains('visible')) SimulatorView.activate();
  },
  _triggerRender() {
    this.applyFilters();
    if (document.getElementById('bump-view')?.classList.contains('visible')) BumpView.render();
  },
};

/* ═══════════════════════════════════════════════════════
   RankingView
═══════════════════════════════════════════════════════ */
const RankingView = {
  render() {
    const { sorted, currentPage } = AppState.computed;
    const emptyEl = document.getElementById('empty-state');
    const tableCard = document.getElementById('table-card');
    if (!sorted.length) { Utils.showEmptyState('no-results'); return; }
    if (emptyEl) emptyEl.style.display = 'none';
    if (tableCard) tableCard.style.display = '';
    this.renderKpiBar(sorted);
    this.renderTable(sorted, currentPage);
    this.renderPagination(sorted.length, currentPage);
    // 위협 레이더 (비동기 없이 동기 계산)
    const threatRows = ThreatView.compute();
    ThreatView.render(threatRows);
  },
  renderKpiBar(sorted) {
    const kpiEl = document.getElementById('kpi-bar');
    const ourIdx = sorted.findIndex(r => r._isOurs);
    const total = sorted.length;
    const filterDesc = Utils.buildFilterDescription(AppState.filters);
    const itemKey = AppState.filters.항목키 || '';
    const year = AppState.filters.연도 || '';
    const calcRules = AppState.raw.calcRules;
    const rankKey = AppState.computed.rankKey;
    const rankLabel = rankKey && calcRules[rankKey] ? calcRules[rankKey].label : rankKey || '';
    if (ourIdx === -1) {
      kpiEl.innerHTML = `<div class="card kpi-card"><div class="kpi-badge">🏫</div><div class="kpi-info"><div class="kpi-univ">${OUR_UNIV}</div><div class="kpi-context">${filterDesc} · ${year}년 · ${itemKey}</div></div><div class="kpi-warn">현재 필터 조건에 ${OUR_UNIV}이(가) 포함되어 있지 않습니다.</div></div>`;
      return;
    }
    const ourRow = sorted[ourIdx];
    const rank = ourRow._rank ?? (ourIdx + 1);
    const topPct = Utils.calcTopPercent(rank, total);
    const rankVal = rankKey ? ourRow[rankKey] : null;
    const primaryInd = getPrimaryIndicator(AppState.raw.currentItem);
    const rankUnit = primaryInd?.unit || '%';
    const rankDecimals = primaryInd?.decimal_places ?? 1;
    const rankValFormatted = Utils.formatValue(rankVal, rankUnit, rankDecimals);
    const rankValNum = rankValFormatted !== '-' ? rankValFormatted.replace(rankUnit, '') : '-';
    kpiEl.innerHTML = `
      <div class="card kpi-card">
        <div class="kpi-badge">🏫</div>
        <div class="kpi-info">
          <div class="kpi-univ">${OUR_UNIV}</div>
          <div class="kpi-context">${filterDesc} · ${year}년 · ${itemKey}</div>
          <div class="kpi-rank-detail">${total}개교 중 순위 기준: ${rankLabel || itemKey}</div>
        </div>
        <div class="kpi-stats">
          <div class="kpi-stat"><div class="kpi-stat-pre">&nbsp;</div><div class="kpi-stat-value">${topPct}<span class="kpi-stat-unit">%</span></div><div class="kpi-stat-label">상위 백분율</div></div>
          <div class="kpi-stat"><div class="kpi-stat-pre">&nbsp;</div><div class="kpi-stat-value">${rank}<span class="kpi-stat-unit">위</span></div><div class="kpi-stat-label">순위 (${total}개교 중)</div></div>
          ${rankVal != null ? `<div class="kpi-stat"><div class="kpi-stat-pre">&nbsp;</div><div class="kpi-stat-value">${rankValNum}<span class="kpi-stat-unit">${rankUnit}</span></div><div class="kpi-stat-label">${rankLabel}</div></div>` : ''}
        </div>
      </div>`;
  },
  renderTable(sorted, page) {
    const calcRules = AppState.raw.calcRules;
    const { sortKey, sortDir, rankKey } = AppState.computed;
    const itemConfig = AppState.raw.currentItem;
    let columns;
    if (itemConfig?.columns?.length) {
      columns = itemConfig.columns;
    } else {
      const metaFields = new Set(['기준대학명', '지역', '설립구분', '대학구분', '수도권여부', '기준연도']);
      const numericFields = Object.keys(sorted[0] || {}).filter(k => !k.startsWith('_') && !metaFields.has(k) && typeof sorted[0][k] === 'number');
      const ratioKeys = Object.keys(calcRules);
      const rawFields = numericFields.filter(k => !ratioKeys.includes(k));
      columns = [
        ...(rawFields.length ? [{ key: rawFields[0], label: rawFields[0] }] : []),
        ...(ratioKeys.length ? [{ key: ratioKeys[0], label: calcRules[ratioKeys[0]]?.label || ratioKeys[0] }] : []),
      ];
    }
    const ratioKeySet = new Set(Object.keys(calcRules));
    const isRatioCol = (key) => ratioKeySet.has(key) && (calcRules[key]?.multiply ?? 1) > 1;
    const colIndicatorMap = new Map();
    for (const ind of (itemConfig?.indicators || [])) colIndicatorMap.set(ind.id, ind);
    const formatCell = (key, val) => {
      const ind = colIndicatorMap.get(key);
      if (ind) return Utils.formatValue(val, ind.unit, ind.decimal_places);
      return isRatioCol(key) ? Utils.formatPercent(val) : Utils.formatNumber(val);
    };
    const makeSortIcon = (key) => key !== sortKey ? '<span class="sort-icon none"></span>' : `<span class="sort-icon ${sortDir}"></span>`;
    const thead = document.getElementById('ranking-thead');
    thead.innerHTML = `<tr>
      <th class="sortable td-num" data-key="_rank" style="width:50px;">순위 ${makeSortIcon('_rank')}</th>
      <th class="sortable" data-key="기준대학명">대학명 ${makeSortIcon('기준대학명')}</th>
      <th class="sortable" data-key="지역">지역 ${makeSortIcon('지역')}</th>
      <th class="sortable" data-key="설립구분">설립 ${makeSortIcon('설립구분')}</th>
      ${columns.map(c => `<th class="sortable td-num" data-key="${c.key}">${c.label} ${makeSortIcon(c.key)}</th>`).join('')}
      <th class="td-num">전년대비</th><th class="td-num">상위%</th>
    </tr>`;
    thead.querySelectorAll('th.sortable').forEach(th => th.addEventListener('click', () => this.onHeaderClick(th.dataset.key)));
    const nameQuery = AppState.computed.nameQuery;
    const displayRows = nameQuery ? sorted.filter(r => (r.기준대학명 || '').toLowerCase().includes(nameQuery)) : sorted;
    const start = (page - 1) * ROWS_PER_PAGE;
    const pageRows = displayRows.slice(start, start + ROWS_PER_PAGE);
    const total = displayRows.length;
    const deltaKey = (sortKey === '_rank' || !sortKey) ? rankKey : sortKey;
    const tbody = document.getElementById('ranking-tbody');
    tbody.innerHTML = '';
    pageRows.forEach((row, i) => {
      const rank = row._rank ?? (start + i + 1);
      const tr = document.createElement('tr');
      if (row._isOurs) tr.classList.add('our-university');
      const topPct = Utils.calcTopPercent(rank, total);
      const deltaVal = deltaKey ? Utils.formatDelta(row[deltaKey], row._prev?.[deltaKey] ?? null) : '-';
      const rankClass = rank <= 3 ? ' top3' : '';
      tr.innerHTML = `
        <td class="td-rank${rankClass}">${rank}</td>
        <td class="td-univ"><span class="td-univ-inner" title="${row.기준대학명}">${row.기준대학명}</span>${row._isOurs ? '<span class="our-tag">우리</span>' : ''}</td>
        <td class="col-region">${row.지역 || '-'}</td>
        <td class="col-found">${row.설립구분 || '-'}</td>
        ${columns.map(c => `<td class="td-num">${formatCell(c.key, row[c.key])}</td>`).join('')}
        <td class="td-delta">${deltaVal}</td>
        <td class="td-percent">${topPct}%</td>`;
      tbody.appendChild(tr);
    });
    const infoEl = document.getElementById('table-info');
    if (infoEl) {
      infoEl.innerHTML = nameQuery
        ? `검색 결과 <strong>${total.toLocaleString()}</strong>개교 / 전체 ${sorted.length.toLocaleString()}개교 · ${AppState.filters.연도}년`
        : `총 <strong>${total.toLocaleString()}</strong>개교 · ${AppState.filters.연도}년 기준`;
    }
  },
  renderPagination(total, currentPage) {
    const totalPages = Math.ceil(total / ROWS_PER_PAGE);
    const pagEl = document.getElementById('pagination');
    if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
    const maxBtns = 7;
    let start = Math.max(1, currentPage - Math.floor(maxBtns / 2));
    let end = Math.min(totalPages, start + maxBtns - 1);
    if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
    let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;
    if (start > 1) html += `<button class="page-btn" data-page="1">1</button><span style="color:var(--text-muted);padding:0 4px;">…</span>`;
    for (let p = start; p <= end; p++) html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    if (end < totalPages) html += `<span style="color:var(--text-muted);padding:0 4px;">…</span><button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
    pagEl.innerHTML = html;
    pagEl.querySelectorAll('.page-btn:not(:disabled)').forEach(btn => btn.addEventListener('click', () => this.onPageChange(parseInt(btn.dataset.page))));
  },
  onHeaderClick(key) {
    if (AppState.computed.sortKey === key) AppState.computed.sortDir = AppState.computed.sortDir === 'asc' ? 'desc' : 'asc';
    else { AppState.computed.sortKey = key; AppState.computed.sortDir = key === '_rank' ? 'asc' : 'desc'; }
    AppState.computed.currentPage = 1;
    FilterManager._sortAndRender();
  },
  onPageChange(page) {
    AppState.computed.currentPage = page;
    this.renderTable(AppState.computed.sorted, page);
    this.renderPagination(AppState.computed.sorted.length, page);
    document.getElementById('view-container').scrollTop = 0;
  },
};

/* ═══════════════════════════════════════════════════════
   ThreatView — 위협 레이더 (모멘텀 스코어 기반)
═══════════════════════════════════════════════════════ */
const ThreatView = {
  // 연도별 rank 맵: Map<year, Map<univName, rank>>
  _rankMaps: null,

  // 위협 데이터 계산
  compute() {
    const rows = AppState.raw.항목데이터;
    const rankKey = AppState.computed.rankKey;
    if (!rows.length || !rankKey) return [];

    const calcRulesForItem = buildCalcRulesForItem(AppState.raw.calcRules, AppState.raw.currentItem);
    const sortAsc = getPrimaryIndicator(AppState.raw.currentItem)?.sort_asc === true;
    const currentYear = AppState.filters.연도;
    if (!currentYear) return [];

    // 최근 4개년 연도 목록 (내림차순)
    const allYears = DataService.extractYears(rows).filter(y => y <= currentYear).slice(0, 4);
    if (allYears.length < 2) return [];

    // 연도별 → 필터 조건 적용 → rank 부여
    const rankMaps = new Map();
    for (const year of allYears) {
      const agg = DataService.aggregateByUniversity(rows, year, calcRulesForItem, AppState._baseUnivMap, null, AppState._univInfoMap);
      // 현재 필터 조건 적용
      const f = AppState.filters;
      const METRO = new Set(['서울', '경기', '인천']);
      const DONGNAM = new Set(['부산', '울산', '경남']);
      const 허용대학구분 = f.대학구분그룹 === '전체' ? null
                        : f.대학구분그룹 === '교육대학포함' ? new Set(['대학교', '산업대학', '교육대학'])
                        : new Set(['대학교', '산업대학']);
      const filteredAgg = agg.filter(r => {
        if (허용대학구분 && r.대학구분 && r.대학구분 !== '미확인' && !허용대학구분.has(r.대학구분)) return false;
        if (f.설립Quick === '사립' && r.설립구분 !== '사립') return false;
        if (f.특별법제외 && ['특별법국립','특별법법인','기타'].includes(r.설립구분)) return false;
        if (f.지역그룹 === '비수도권' && METRO.has(r.지역)) return false;
        if (f.지역그룹 === '동남권' && !DONGNAM.has(r.지역)) return false;
        if (f.지역그룹 === '부산' && r.지역 !== '부산') return false;
        return true;
      });
      const sorted = [...filteredAgg].sort((a, b) => {
        const av = a[rankKey] ?? (sortAsc ? Infinity : -Infinity);
        const bv = b[rankKey] ?? (sortAsc ? Infinity : -Infinity);
        return sortAsc ? av - bv : bv - av;
      });
      const rMap = new Map();
      sorted.forEach((r, i) => rMap.set(r.기준대학명, i + 1));
      rankMaps.set(year, rMap);
    }
    this._rankMaps = rankMaps;

    // 현재 연도 rank 및 우리 대학 순위
    const curRankMap = rankMaps.get(currentYear);
    const ourRank = curRankMap?.get(OUR_UNIV) ?? null;

    // 모멘텀 스코어 계산
    const years = allYears; // 내림차순
    const result = [];
    for (const [univName] of curRankMap) {
      const ranks = years.map(y => rankMaps.get(y)?.get(univName) ?? null);
      // ranks[0]=최신, ranks[1]=1년전, ranks[2]=2년전, ranks[3]=3년전
      // Δ = rank(전년) - rank(당년): 양수=상승
      const deltas = [];
      for (let i = 0; i < ranks.length - 1; i++) {
        if (ranks[i] != null && ranks[i + 1] != null) {
          deltas.push(ranks[i + 1] - ranks[i]);
        } else {
          deltas.push(null);
        }
      }
      const weights = [3, 2, 1];
      let score = 0;
      let hasData = false;
      for (let i = 0; i < deltas.length; i++) {
        if (deltas[i] != null) { score += deltas[i] * (weights[i] ?? 1); hasData = true; }
      }
      if (!hasData) score = 0;

      // 3년 순위 변화 (최신 vs 3년 전)
      const rankNow = ranks[0];
      const rank3y = ranks[Math.min(3, ranks.length - 1)];
      const delta3y = (rankNow != null && rank3y != null) ? rank3y - rankNow : null;

      // 위협 등급
      let grade, gradeClass;
      const nearUs = ourRank != null && rankNow != null && rankNow <= ourRank + 3;
      if (score >= 4 && nearUs)       { grade = '핵심 위협'; gradeClass = 'threat-core'; }
      else if (score >= 4)            { grade = '잠재 위협'; gradeClass = 'threat-latent'; }
      else if (score >= 1)            { grade = '주시';     gradeClass = 'threat-watch'; }
      else                            { grade = '안정';     gradeClass = 'threat-stable'; }

      result.push({ 기준대학명: univName, _isOurs: univName === OUR_UNIV, 현재순위: rankNow, score, delta3y, grade, gradeClass });
    }
    result.sort((a, b) => b.score - a.score);
    return result;
  },

  render(threatRows) {
    const wrap = document.getElementById('threat-table-wrap');
    const card = document.getElementById('threat-card');
    if (!wrap || !card) return;
    if (!threatRows.length) { card.style.display = 'none'; return; }
    card.style.display = '';

    const maxAbsScore = Math.max(...threatRows.map(r => Math.abs(r.score)), 1);

    const rows = threatRows.map((r, i) => {
      const barPct = Math.min(100, (Math.abs(r.score) / maxAbsScore) * 100);
      const barClass = r.score >= 0 ? 'momentum-bar-pos' : 'momentum-bar-neg';
      const delta3Txt = r.delta3y == null ? '-'
        : r.delta3y > 0 ? `<span class="delta-up">▲${r.delta3y}위</span>`
        : r.delta3y < 0 ? `<span class="delta-down">▼${Math.abs(r.delta3y)}위</span>`
        : '<span class="delta-none">±0</span>';
      const scoreSign = r.score > 0 ? '+' : '';
      return `<tr class="${r._isOurs ? 'our-university' : ''}">
        <td>${i + 1}</td>
        <td class="td-univ"><span class="td-univ-inner">${r.기준대학명}</span>${r._isOurs ? '<span class="our-tag">우리</span>' : ''}</td>
        <td>${r.현재순위 != null ? r.현재순위 + '위' : '-'}</td>
        <td><div class="momentum-cell-inner">
          <div class="momentum-bar-wrap"><div class="momentum-bar ${barClass}" style="width:${barPct}%"></div></div>
          <span class="momentum-score">${scoreSign}${r.score.toFixed(1)}</span>
        </div></td>
        <td>${delta3Txt}</td>
        <td><span class="threat-badge ${r.gradeClass}">${r.grade}</span></td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="threat-table">
      <thead><tr>
        <th style="width:42px;">#</th>
        <th style="text-align:left;">대학</th>
        <th style="width:64px;">현재순위</th>
        <th style="width:150px;">모멘텀</th>
        <th style="width:80px;">최근 3년 변화</th>
        <th style="width:78px;">위협 등급</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  },
};

/* ═══════════════════════════════════════════════════════
   SimulatorView — 목표 시뮬레이터
═══════════════════════════════════════════════════════ */
const SimulatorView = {
  _simValue: null,

  activate() {
    const rankKey = AppState.computed.rankKey;
    const empty   = document.getElementById('sim-empty-state');
    const leftPanel  = document.getElementById('sim-left-panel');
    const rightPanel = document.getElementById('sim-right-panel');
    if (!rankKey || !AppState.computed.filtered.length) {
      empty.style.display = '';
      leftPanel.style.display = 'none';
      rightPanel.style.display = 'none';
      return;
    }
    const ourRow = AppState.computed.filtered.find(r => r._isOurs);
    this._simValue = ourRow?.[rankKey] ?? null;
    empty.style.display = 'none';
    leftPanel.style.display = '';
    rightPanel.style.display = '';
    this._render();
  },

  _render() {
    const simRanked = this._calcSimRanked();
    this._renderKpi(simRanked);
    this._renderSlider();
    this._renderTable(simRanked);
    this._fitTableHeight();
  },

  _calcSimRanked() {
    const { filtered, rankKey } = AppState.computed;
    const ind = (AppState.raw.currentItem?.indicators || []).find(i => i.id === rankKey);
    const sortAsc = ind?.sort_asc === true;
    const rows = filtered.map(r =>
      r._isOurs && this._simValue !== null ? { ...r, [rankKey]: this._simValue } : { ...r }
    );
    rows.sort((a, b) => {
      const av = a[rankKey] ?? (sortAsc ? Infinity : -Infinity);
      const bv = b[rankKey] ?? (sortAsc ? Infinity : -Infinity);
      return sortAsc ? av - bv : bv - av;
    });
    rows.forEach((r, i) => { r._simRank = i + 1; });
    return rows;
  },

  _renderKpi(simRanked) {
    const { sorted } = AppState.computed;
    const ourCur  = sorted.find(r => r._isOurs);
    const ourSim  = simRanked.find(r => r._isOurs);
    const curRank = ourCur?._rank ?? '-';
    const simRank = ourSim?._simRank ?? '-';
    const total   = simRanked.length;
    const fmtPct  = rank => typeof rank === 'number' && total
      ? '상위 ' + ((rank / total) * 100).toFixed(1) + '%' : '-';
    let changeTxt = '', changeCls = 'none';
    if (typeof curRank === 'number' && typeof simRank === 'number') {
      const diff = curRank - simRank;
      if (diff > 0)      { changeTxt = `▲ ${diff}위 상승`; changeCls = 'up'; }
      else if (diff < 0) { changeTxt = `▼ ${Math.abs(diff)}위 하락`; changeCls = 'down'; }
      else               { changeTxt = '변동 없음'; changeCls = 'none'; }
    }
    document.getElementById('sim-kpi-bar').innerHTML = `
      <div class="sim-kpi-wrap">
        <div class="sim-kpi-card">
          <div class="sim-kpi-label">현재 순위</div>
          <div class="sim-kpi-num">${curRank}<span>위</span></div>
          <div class="sim-kpi-sub">${total}개교 중 · ${fmtPct(curRank)}</div>
        </div>
        <div class="sim-kpi-card highlight">
          <div class="sim-kpi-label">시뮬레이션 순위</div>
          <div class="sim-kpi-num">${simRank}<span>위</span></div>
          <div class="sim-kpi-sub">${total}개교 중 · ${fmtPct(simRank)}</div>
          <div class="sim-kpi-divider"></div>
          <div class="sim-kpi-change ${changeCls}">${changeTxt}</div>
        </div>
      </div>`;
  },

  _renderSlider() {
    const { filtered, rankKey } = AppState.computed;
    const ind  = (AppState.raw.currentItem?.indicators || []).find(i => i.id === rankKey);
    const unit = ind?.unit || (AppState.raw.calcRules[rankKey]?.multiply > 1 ? '%' : '');
    const dec  = ind?.decimal_places ?? (AppState.raw.calcRules[rankKey]?.multiply > 1 ? 1 : 0);
    const step = dec === 0 ? 1 : Math.pow(10, -dec);
    const vals = filtered.map(r => r[rankKey]).filter(v => v != null && !isNaN(v));
    const minV = Math.floor(Math.min(...vals) * Math.pow(10, dec)) / Math.pow(10, dec);
    const maxV = Math.ceil(Math.max(...vals) * Math.pow(10, dec)) / Math.pow(10, dec);
    const cur  = this._simValue ?? 0;
    const fmt  = v => v == null ? '-' : (+v).toFixed(dec);
    const label = AppState.raw.calcRules[rankKey]?.label || rankKey;
    document.getElementById('sim-slider-card').innerHTML = `
      <div class="sim-slider-label">${label}</div>
      <div class="sim-slider-value">
        <input type="number" class="sim-value-input" id="sim-value-input"
          min="${minV}" max="${maxV}" step="${step}" value="${fmt(cur)}">
        <span>${unit}</span>
      </div>
      <input type="range" class="sim-slider" id="sim-slider"
        min="${minV}" max="${maxV}" step="${step}" value="${cur}">
      <div class="sim-slider-range">
        <span>${fmt(minV)}${unit}</span><span>${fmt(maxV)}${unit}</span>
      </div>
      <div class="sim-slider-hint">슬라이더를 움직이거나 값을 직접 입력하세요.</div>`;
    const slider = document.getElementById('sim-slider');
    const numInput = document.getElementById('sim-value-input');
    slider.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      this._simValue = v;
      numInput.value = fmt(v);
      this._render();
    });
    numInput.addEventListener('change', e => {
      let v = parseFloat(e.target.value);
      if (isNaN(v)) { numInput.value = fmt(this._simValue); return; }
      v = Math.min(maxV, Math.max(minV, v));
      this._simValue = v;
      numInput.value = fmt(v);
      slider.value = v;
      this._render();
    });
  },

  _renderTable(simRanked) {
    const { rankKey } = AppState.computed;
    const ind   = (AppState.raw.currentItem?.indicators || []).find(i => i.id === rankKey);
    const unit  = ind?.unit || (AppState.raw.calcRules[rankKey]?.multiply > 1 ? '%' : '');
    const dec   = ind?.decimal_places ?? (AppState.raw.calcRules[rankKey]?.multiply > 1 ? 1 : 0);
    const label = AppState.raw.calcRules[rankKey]?.label || rankKey;
    const fmt   = v => v == null ? '-' : (+v).toFixed(dec);
    document.getElementById('sim-thead').innerHTML = `<tr>
      <th class="num">시뮬</th>
      <th class="num">현재</th>
      <th>대학명</th>
      <th>지역</th>
      <th>설립</th>
      <th class="num">${label}${unit ? ' (' + unit + ')' : ''}</th>
      <th class="num">변동</th>
    </tr>`;
    const tbody = document.getElementById('sim-tbody');
    tbody.innerHTML = '';
    let ourTr = null;
    simRanked.forEach(row => {
      const tr = document.createElement('tr');
      if (row._isOurs) { tr.classList.add('our-university'); ourTr = tr; }
      const origRank = row._rank ?? '-';
      const simRankN = row._simRank;
      let changeTxt = '-', changeCls = 'sim-change-none';
      if (typeof origRank === 'number' && typeof simRankN === 'number') {
        const diff = origRank - simRankN;
        if (diff > 0)      { changeTxt = `▲${diff}`; changeCls = 'sim-change-up'; }
        else if (diff < 0) { changeTxt = `▼${Math.abs(diff)}`; changeCls = 'sim-change-down'; }
      }
      const val = row._isOurs && this._simValue !== null ? this._simValue : row[rankKey];
      tr.innerHTML = `
        <td class="num" style="font-weight:700;color:var(--text-primary);">${simRankN}</td>
        <td class="num" style="color:var(--text-muted);">${origRank}</td>
        <td style="white-space:nowrap;">${row.기준대학명}${row._isOurs ? '<span class="our-tag">우리</span>' : ''}</td>
        <td>${row.지역 || '-'}</td>
        <td>${row.설립구분 || '-'}</td>
        <td class="num">${fmt(val)}</td>
        <td class="num"><span class="${changeCls}">${changeTxt}</span></td>`;
      tbody.appendChild(tr);
    });
    if (ourTr) this._scrollToRow(ourTr);
  },

  _scrollToRow(tr) {
    const wrap = document.getElementById('sim-table-wrap');
    const headerH = document.getElementById('sim-thead').offsetHeight;
    const rowTop    = tr.offsetTop;
    const rowBottom = rowTop + tr.offsetHeight;
    const visTop    = wrap.scrollTop + headerH;
    const visBottom = wrap.scrollTop + wrap.clientHeight;
    if (rowTop < visTop) {
      wrap.scrollTop = rowTop - headerH;
    } else if (rowBottom > visBottom) {
      wrap.scrollTop = rowBottom - wrap.clientHeight;
    }
  },

  _fitTableHeight() {
    const wrap = document.getElementById('sim-table-wrap');
    if (!wrap) return;
    const top = wrap.getBoundingClientRect().top;
    wrap.style.maxHeight = (window.innerHeight - top - 20) + 'px';
  },
};

/* ═══════════════════════════════════════════════════════
   TrendView — 색상은 모두 CSS 변수에서 읽어옴
═══════════════════════════════════════════════════════ */
const TREND_GROUPS = {
  '전국 평균': () => true,
  '전국 사립': r => r.설립구분 === '사립',
  '비수도권':  r => r.수도권여부 === 'N',
  '동남권':    r => ['부산','울산','경남'].includes(r.지역),
  '부산':      r => r.지역 === '부산',
};

const getTrendColors = () => ({
  '전국 평균': cssVar('--trend-national'),
  '전국 사립': cssVar('--trend-private'),
  '비수도권':  cssVar('--trend-non-metro'),
  '동남권':    cssVar('--trend-dongnam'),
  '부산':      cssVar('--trend-busan'),
});
const getCustomColors = () => [
  cssVar('--series-1'), cssVar('--series-2'), cssVar('--series-3'),
  cssVar('--series-4'), cssVar('--series-5'),
];

const TrendView = {
  _chart: null,
  _lastSeries: [],
  _baseFilter(r) {
    const 국공립계열 = ['국공립','국립','공립','국립대법인'];
    return (국공립계열.includes(r.설립구분) || r.설립구분 === '사립') && ['대학교','산업대학'].includes(r.대학구분);
  },
  _groupAvg(univRows, rankKey, extraFilter) {
    const rows = univRows.filter(r => this._baseFilter(r) && extraFilter(r));
    const vals = rows.map(r => r[rankKey]).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const std  = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
    const clean = std > 0 ? vals.filter(v => Math.abs(v-mean) <= 3*std) : vals;
    return clean.length ? clean.reduce((a,b)=>a+b,0)/clean.length : null;
  },
  buildAllYears() {
    const rows = AppState.raw.항목데이터;
    if (!rows.length) return;
    const calcRulesForItem = buildCalcRulesForItem(AppState.raw.calcRules, AppState.raw.currentItem);
    const years = DataService.extractYears(rows);
    const allYears = new Map();
    for (const year of years) {
      allYears.set(year, DataService.aggregateByUniversity(rows, year, calcRulesForItem, AppState._baseUnivMap, null, AppState._univInfoMap));
    }
    AppState.trend.allYears = allYears;
  },
  updateYearChecks() {
    const allYears = AppState.trend.allYears;
    if (!allYears) return;
    const years = [...allYears.keys()].sort((a,b)=>b-a);
    const container = document.getElementById('trend-year-checks');
    if (!container) return;
    if (AppState.trend.selectedYears.size === 0) years.slice(0, 5).forEach(y => AppState.trend.selectedYears.add(y));
    container.innerHTML = years.map(y => {
      const checked = AppState.trend.selectedYears.has(y);
      return `<label class="trend-check-item${checked ? ' is-checked' : ''}" style="--dot-color:var(--sidebar-text)"><input type="checkbox" data-year="${y}"${checked ? ' checked' : ''}><span class="chk-dot"></span>${y}년</label>`;
    }).join('');
  },
  updateDatalist() {
    const allYears = AppState.trend.allYears;
    if (!allYears) return;
    const names = new Set();
    for (const univRows of allYears.values()) univRows.forEach(r => names.add(r.기준대학명));
    const dl = document.getElementById('trend-univ-list');
    if (dl) dl.innerHTML = [...names].sort().map(n => `<option value="${n}">`).join('');
  },
  render() {
    const allYears = AppState.trend.allYears;
    const chartEl = document.getElementById('trend-chart');
    if (!allYears || !chartEl) { if (chartEl) chartEl.innerHTML = '<div class="trend-empty">공시 항목을 먼저 선택하세요.</div>'; return; }
    const rankKey = AppState.computed.rankKey;
    if (!rankKey) return;
    let years = [...allYears.keys()].sort((a,b)=>a-b);
    if (AppState.trend.selectedYears.size > 0) years = years.filter(y => AppState.trend.selectedYears.has(y));
    const label = AppState.raw.calcRules[rankKey]?.label || rankKey;
    const series = [];
    const TREND_COLORS = getTrendColors();
    const CUSTOM_COLORS = getCustomColors();
    // 우리 대학
    series.push({
      name: OUR_UNIV, isOurs: true, color: cssVar('--our-color'),
      data: years.map(y => { const row = (allYears.get(y)||[]).find(r=>r.기준대학명===OUR_UNIV); const v = row?.[rankKey]; return v != null && !isNaN(v) ? +v.toFixed(2) : null; }),
    });
    // 그룹 평균
    for (const [gName, gFilter] of Object.entries(TREND_GROUPS)) {
      if (!AppState.trend.groups.has(gName)) continue;
      series.push({ name: gName, isGroup: true, color: TREND_COLORS[gName], data: years.map(y => { const avg = this._groupAvg(allYears.get(y)||[], rankKey, gFilter); return avg != null ? +avg.toFixed(2) : null; }) });
    }
    // 추가 대학
    AppState.trend.customUnivs.forEach((univName, idx) => {
      series.push({ name: univName, color: CUSTOM_COLORS[idx % CUSTOM_COLORS.length], data: years.map(y => { const row = (allYears.get(y)||[]).find(r=>r.기준대학명===univName); const v = row?.[rankKey]; return v != null && !isNaN(v) ? +v.toFixed(2) : null; }) });
    });
    const trendUnit = getPrimaryIndicator(AppState.raw.currentItem)?.unit || '%';
    this._lastSeries = series;
    if (AppState.trend.yMin === null && AppState.trend.yMax === null) this._applyAutoRange(series);
    this._renderChart(years, series, label, trendUnit);
    this._renderTable(years, series, trendUnit);
  },
  _applyAutoRange(series) {
    const vals = series.flatMap(s => s.data).filter(v => v != null && !isNaN(v));
    if (!vals.length) return;
    const dataMin = Math.min(...vals); const dataMax = Math.max(...vals);
    const span = dataMax - dataMin || dataMax * 0.2 || 10;
    const pad  = span * 0.5;
    const mag  = Math.pow(10, Math.floor(Math.log10(span)) - 1);
    AppState.trend.yMin = Math.round(Math.max(0, Math.floor((dataMin - pad) / mag) * mag));
    AppState.trend.yMax = Math.round(Math.ceil((dataMax + pad) / mag) * mag);
    document.getElementById('trend-ymin').value = AppState.trend.yMin;
    document.getElementById('trend-ymax').value = AppState.trend.yMax;
  },
  _renderChart(years, series, label, unit = '%') {
    const el = document.getElementById('trend-chart');
    if (!el) return;
    if (!this._chart) this._chart = echarts.init(el);
    const primaryInd = getPrimaryIndicator(AppState.raw.currentItem);
    const dp = primaryInd?.decimal_places ?? 2;
    const fmt = v => Utils.formatValue(+v, unit, dp);
    const ourColor = cssVar('--our-color');
    this._chart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, formatter(params) { let html = `<b>${params[0].axisValue}년</b><br>`; params.forEach(p => { if (p.value != null) html += `${p.marker}${p.seriesName}: <b>${fmt(p.value)}</b><br>`; }); return html; } },
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } },
      grid: { top: 40, right: 40, bottom: 55, left: 72 },
      toolbox: { feature: { saveAsImage: { title: '이미지 저장' } }, right: 8, top: 0 },
      xAxis: { type: 'category', data: years.map(String), axisLabel: { formatter: v => `${v}년`, fontsize: 14 } },
      yAxis: { type: 'value', name: label, nameLocation: 'middle', nameGap: 50, nameTextStyle: { fontSize: 14 }, axisLabel: { formatter: v => Utils.formatValue(Math.round(v), unit, 0) }, min: AppState.trend.yMin ?? undefined, max: AppState.trend.yMax ?? undefined, fontsize: 14 },
      series: series.map(s => ({
        name: s.name, type: 'line', data: s.data, connectNulls: false,
        lineStyle: { width: s.isOurs ? 3 : 1.5, type: s.isGroup ? 'dashed' : 'solid', color: s.color },
        itemStyle: { color: s.color },
        symbol: s.isOurs ? 'circle' : 'emptyCircle', symbolSize: s.isOurs ? 7 : 5,
        label: s.isOurs ? { show: true, position: 'top', fontSize: 14, color: ourColor, formatter: p => p.value != null ? fmt(p.value) : '' } : { show: false },
      })),
    }, true);
  },
  _renderTable(years, series, unit = '%') {
    const wrap = document.getElementById('trend-table-wrap');
    if (!wrap) return;
    const primaryInd = getPrimaryIndicator(AppState.raw.currentItem);
    const dp = primaryInd?.decimal_places ?? 2;
    const fmt = v => Utils.formatValue(+v, unit, dp);
    const headers = ['<th></th>', ...years.map(y=>`<th>${y}년</th>`)].join('');
    const rows = series.map(s => `<tr class="${s.isOurs?'our-row':''}"><td>${s.name}</td>${s.data.map(v=>`<td>${v!=null?fmt(v):'-'}</td>`).join('')}</tr>`).join('');
    wrap.innerHTML = `<table class="trend-summary-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  },
  activate() {
    if (!AppState.raw.항목데이터.length) {
      const el = document.getElementById('trend-chart');
      if (el) el.innerHTML = '<div class="trend-empty">공시 항목을 먼저 선택하세요.</div>';
      document.getElementById('trend-table-wrap').innerHTML = '';
      return;
    }
    if (!AppState.trend.allYears) this.buildAllYears();
    this.updateYearChecks();
    this.updateDatalist();
    this.render();
    if (this._chart) setTimeout(() => this._chart.resize(), 60);
  },
};

/* ═══════════════════════════════════════════════════════
   BumpView — 순위 변동 Bump Chart
═══════════════════════════════════════════════════════ */
const BumpView = {
  _chart: null,
  _labelData: null,  // graphic 레이블 재렌더에 필요한 데이터 캐시

  _fitHeight() {
    if (!this._chart) return;
    this._chart.resize();
    requestAnimationFrame(() => this._renderGraphicLabels());
  },

  // convertToPixel로 정확한 좌표에 직접 텍스트 그리기
  _renderGraphicLabels() {
    if (!this._chart || !this._labelData) return;
    const { series, firstYearIdx, lastYearIdx, firstRankMap, lastRankMap, years } = this._labelData;

    // 차트 그리드 실제 픽셀 경계 (첫·마지막 연도 X 좌표)
    const leftX  = this._chart.convertToPixel({ xAxisIndex: 0 }, String(years[firstYearIdx]));
    const rightX = this._chart.convertToPixel({ xAxisIndex: 0 }, String(years[lastYearIdx]));
    if (leftX == null || rightX == null) return;

    const GAP = 12;
    const graphics = [];

    series.forEach(s => {
      // 왼쪽 레이블 — 오른쪽 정렬 (textAlign: 'right')
      const fv = s.data[firstYearIdx];
      if (fv != null && firstRankMap.get(fv)?.name === s.name) {
        const py = this._chart.convertToPixel({ yAxisIndex: 0 }, fv);
        if (py != null) graphics.push({
          type: 'text', x: leftX - GAP, y: py, silent: true,
          style: {
            text: `${fv}. ${s.name}`,
            textAlign: 'right', textVerticalAlign: 'middle',
            fill: s.color, fontSize: 10,
            fontWeight: s.isOurs ? 700 : 400,
          },
        });
      }
      // 오른쪽 레이블 — 왼쪽 정렬 (textAlign: 'left')
      const lv = s.data[lastYearIdx];
      if (lv != null && lastRankMap.get(lv)?.name === s.name) {
        const py = this._chart.convertToPixel({ yAxisIndex: 0 }, lv);
        if (py != null) graphics.push({
          type: 'text', x: rightX + GAP, y: py, silent: true,
          style: {
            text: `${lv}. ${s.name}`,
            textAlign: 'left', textVerticalAlign: 'middle',
            fill: s.color, fontSize: 10,
            fontWeight: s.isOurs ? 700 : 400,
          },
        });
      }
    });

    this._chart.setOption({ graphic: graphics }, false);
  },

  activate() {
    const chartEl = document.getElementById('bump-chart');
    if (!AppState.raw.항목데이터.length) {
      if (chartEl) chartEl.innerHTML = '<div class="trend-empty">공시 항목을 먼저 선택하세요.</div>';
      return;
    }
    if (!AppState.trend.allYears) TrendView.buildAllYears();

    // datalist 채우기 (전체 대학명)
    const dl = document.getElementById('bump-univ-list');
    if (dl) {
      const names = [...new Set(AppState.computed.aggregated.map(r => r.기준대학명))].sort();
      dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
    }

    // 공유 연도 체크박스 렌더링 (bump용 — 전체 연도로 초기화)
    const allYearKeys = [...AppState.trend.allYears.keys()].sort((a, b) => a - b);
    if (AppState.bump.selectedYears.size === 0) {
      allYearKeys.forEach(y => AppState.bump.selectedYears.add(y));
    }
    const yearChecks = document.getElementById('trend-year-checks');
    if (yearChecks) {
      const sel = AppState.bump.selectedYears;
      yearChecks.innerHTML = allYearKeys.map(y => {
        const checked = sel.has(y);
        return `<label class="trend-check-item${checked ? ' is-checked' : ''}" style="--dot-color:var(--sidebar-text)"><input type="checkbox" data-year="${y}"${checked ? ' checked' : ''}><span class="chk-dot"></span>${y}년</label>`;
      }).join('');
    }

    // 태그 렌더링
    this._renderTags();
    this.render();
  },

  _getDisplayUnivs() {
    // 동남권 기본 대학: 현재 필터 통과 + userRemoved 제외
    const DONGNAM = new Set(['부산', '울산', '경남']);
    const years = [...(AppState.trend.allYears?.keys() || [])].sort((a, b) => a - b);
    const lastYearRows = AppState.trend.allYears?.get(years[years.length - 1]) || [];
    const defaults = lastYearRows
      .filter(r => DONGNAM.has(r.지역) && this._filterRow(r))
      .map(r => r.기준대학명)
      .filter(n => !AppState.bump.userRemoved.includes(n))
      .sort();
    // 사용자 추가 대학은 기본 목록에 없는 것만
    const extras = AppState.bump.userAdded.filter(n => !defaults.includes(n));
    return [...defaults, ...extras];
  },

  _renderTags() {
    const tags = document.getElementById('bump-univ-tags');
    if (!tags) return;
    const univs = this._getDisplayUnivs();
    tags.innerHTML = univs.map(name => {
      const isOurs = name === OUR_UNIV;
      return `<div class="trend-univ-tag${isOurs ? ' is-ours' : ''}" data-name="${name}">
        <span>${name}</span>
        <button onclick="removeBumpUniv('${name.replace(/'/g,"\\'")}')">×</button>
      </div>`;
    }).join('');
  },

  _filterRow(r) {
    // 순위보기와 동일한 공유 필터(AppState.filters) 사용
    const f = AppState.filters;
    const METRO   = new Set(['서울', '경기', '인천']);
    const DONGNAM = new Set(['부산', '울산', '경남']);
    const 허용구분 = f.대학구분그룹 === '전체' ? null
                  : f.대학구분그룹 === '교육대학포함' ? new Set(['대학교','산업대학','교육대학'])
                  : new Set(['대학교','산업대학']);
    if (허용구분 && r.대학구분 && r.대학구분 !== '미확인' && !허용구분.has(r.대학구분)) return false;
    if (f.설립Quick === '사립' && r.설립구분 !== '사립') return false;
    if (f.특별법제외 && ['특별법국립','특별법법인','기타'].includes(r.설립구분)) return false;
    if (f.지역그룹 === '비수도권' && METRO.has(r.지역)) return false;
    if (f.지역그룹 === '동남권' && !DONGNAM.has(r.지역)) return false;
    if (f.지역그룹 === '부산' && r.지역 !== '부산') return false;
    return true;
  },

  _buildRankSeries() {
    const allYears = AppState.trend.allYears;
    const rankKey = AppState.computed.rankKey;
    const sortAsc = getPrimaryIndicator(AppState.raw.currentItem)?.sort_asc === true;
    if (!allYears || !rankKey) return { years: [], series: [] };

    const selYears = AppState.bump.selectedYears;
    const years = [...allYears.keys()].sort((a, b) => a - b)
      .filter(y => selYears.size === 0 || selYears.has(y));  // size===0이면 전체(초기화 전 안전장치)

    // 연도별 필터 적용 후 rank 부여
    const yearRankMaps = new Map(); // year → Map<univName, rank>
    const univSet = new Set();

    for (const year of years) {
      const agg = allYears.get(year) || [];
      const filtered = agg.filter(r => this._filterRow(r));
      const sorted = [...filtered].sort((a, b) => {
        const av = a[rankKey] ?? (sortAsc ? Infinity : -Infinity);
        const bv = b[rankKey] ?? (sortAsc ? Infinity : -Infinity);
        return sortAsc ? av - bv : bv - av;
      });
      const rMap = new Map();
      sorted.forEach((r, i) => { rMap.set(r.기준대학명, i + 1); univSet.add(r.기준대학명); });
      yearRankMaps.set(year, rMap);
    }

    // 표시 대학: 동남권 기본(필터 적용) + 사용자 추가 - 사용자 제거
    const displayUnivs = this._getDisplayUnivs();

    const CUSTOM_COLORS = getCustomColors();
    const ourColor = cssVar('--our-color');

    const series = displayUnivs.map((name, idx) => {
      const isOurs = name === OUR_UNIV;
      const color = isOurs ? ourColor : CUSTOM_COLORS[idx % CUSTOM_COLORS.length];
      const data = years.map(y => yearRankMaps.get(y)?.get(name) ?? null);
      const firstNonNull = years.findIndex((_, i) => data[i] != null);
      const lastNonNull = years.length - 1 - [...data].reverse().findIndex(v => v != null);
      return { name, isOurs, color, data, firstNonNull, lastNonNull };
    }).filter(s => s.data.some(v => v != null));  // 데이터 없는 대학 제외

    return { years, series };
  },

  render() {
    const { years, series } = this._buildRankSeries();
    const el = document.getElementById('bump-chart');
    if (!el) return;
    if (!series.length) { el.innerHTML = '<div class="trend-empty">데이터가 없습니다.</div>'; return; }

    if (!this._chart) this._chart = echarts.init(el);

    const maxRank = Math.max(...series.flatMap(s => s.data.filter(v => v != null)));

    // 첫·마지막 연도 기준 순위→시리즈 맵 (graphic 레이블용)
    const firstYearIdx = 0;
    const lastYearIdx = years.length - 1;
    const firstRankMap = new Map();
    const lastRankMap  = new Map();
    series.forEach(s => {
      const fv = s.data[firstYearIdx];
      const lv = s.data[lastYearIdx];
      if (fv != null) firstRankMap.set(fv, s);
      if (lv != null) lastRankMap.set(lv, s);
    });

    // graphic 레이블 재렌더 시 필요한 데이터 캐시
    this._labelData = { series, firstYearIdx, lastYearIdx, firstRankMap, lastRankMap, years };

    this._chart.setOption({
      graphic: [],  // 이전 레이블 초기화
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter(params) {
          const year = params[0]?.axisValue;
          const lines = params.filter(p => p.value != null).sort((a, b) => a.value - b.value);
          let html = `<b>${year}년</b><br>`;
          lines.forEach(p => { html += `${p.marker}${p.seriesName}: <b>${p.value}위</b><br>`; });
          return html;
        },
      },
      legend: { show: false },
      grid: { top: 20, right: 160, bottom: 40, left: 160 },
      toolbox: { feature: { saveAsImage: { title: '이미지 저장' } }, right: 8, top: 0 },
      xAxis: {
        type: 'category',
        data: years.map(String),
        axisLabel: { formatter: v => `${v}년` },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        inverse: true,
        min: 1,
        max: maxRank,
        interval: 1,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
      },
      series: series.map(s => ({
        name: s.name,
        type: 'line',
        data: s.data,
        connectNulls: false,
        smooth: false,
        lineStyle: { width: s.isOurs ? 3 : 1.5, color: s.color },
        itemStyle: { color: s.color },
        symbol: s.isOurs ? 'circle' : 'emptyCircle',
        symbolSize: s.isOurs ? 8 : 5,
        z: s.isOurs ? 10 : 1,
        emphasis: { lineStyle: { width: s.isOurs ? 4 : 2 } },
        label: { show: false },  // 레이블은 graphic API로 직접 렌더
      })),
    }, true);

    // 렌더 완료 후 graphic 레이블 배치
    requestAnimationFrame(() => this._renderGraphicLabels());
  },
};

/* ═══════════════════════════════════════════════════════
   RadarView — 다지표 레이더 차트 (benchmarkCache 기반)
═══════════════════════════════════════════════════════ */
const RadarView = {
  _chart: null,

  _getIndicators() {
    const config = AppState.raw.benchmarkCache?._config;
    if (!config) {
      // config가 없으면 캐시 첫 번째 레코드에서 지표 키 추출
      const sample = (AppState.raw.benchmarkCache || [])[0];
      if (!sample) return [];
      const metaKeys = new Set(['기준대학명', '기준연도', '지역', '설립구분', '대학구분', '수도권여부']);
      return Object.keys(sample).filter(k => !metaKeys.has(k));
    }
    return config.indicators?.flatMap(i => i.indicator_ids) || [];
  },

  _filterCache() {
    const cache = AppState.raw.benchmarkCache || [];
    return cache.filter(row => {
      if (!['국공립','사립'].includes(row.설립구분)) return false;
      if (!['대학교','산업대학'].includes(row.대학구분)) return false;
      return true;
    });
  },

  _groupAvg(rows, indicators) {
    const result = {};
    for (const ind of indicators) {
      const vals = rows.map(r => r[ind]).filter(v => v != null && !isNaN(v));
      if (!vals.length) { result[ind] = null; continue; }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      const clean = std > 0 ? vals.filter(v => Math.abs(v - mean) <= 3 * std) : vals;
      result[ind] = clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
    }
    return result;
  },

  activate() {
    const cache = AppState.raw.benchmarkCache;
    const emptyEl = document.getElementById('radar-chart');
    if (!cache || !cache.length) {
      if (emptyEl) emptyEl.innerHTML = '<div class="trend-empty">벤치마크 캐시가 없습니다. 관리자 페이지에서 생성해 주세요.</div>';
      return;
    }
    // datalist 업데이트
    const dl = document.getElementById('radar-univ-list');
    if (dl) {
      const names = [...new Set(cache.map(r => r.기준대학명))].sort();
      dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
    }
    this.render();
    if (this._chart) setTimeout(() => this._chart.resize(), 60);
  },

  render() {
    const cache = AppState.raw.benchmarkCache || [];
    if (!cache.length) return;
    const indicators = this._getIndicators();
    if (!indicators.length) return;
    const filteredAll = this._filterCache();

    // min-max 계산 (전체 캐시 기준)
    const minMax = {};
    for (const ind of indicators) {
      const vals = filteredAll.map(r => r[ind]).filter(v => v != null && !isNaN(v));
      minMax[ind] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    const normalize = (val, ind) => {
      const { min, max } = minMax[ind] || { min: 0, max: 100 };
      if (max === min) return 50;
      return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    };

    const DONGNAM = new Set(['부산', '울산', '경남']);
    const series = [];
    const CUSTOM_COLORS = getCustomColors();
    const ourColor = cssVar('--our-color');

    // 우리 대학
    const ourRow = cache.find(r => r.기준대학명 === OUR_UNIV);
    if (ourRow) {
      series.push({ name: OUR_UNIV, isOurs: true, color: ourColor, values: indicators.map(ind => normalize(ourRow[ind], ind)) });
    }

    // 추가 대학
    AppState.radar.customUnivs.forEach((name, idx) => {
      const row = cache.find(r => r.기준대학명 === name);
      if (!row) return;
      series.push({ name, color: CUSTOM_COLORS[idx % CUSTOM_COLORS.length], values: indicators.map(ind => normalize(row[ind], ind)) });
    });

    // 그룹 평균
    if (AppState.radar.groups.has('동남권')) {
      const rows = filteredAll.filter(r => DONGNAM.has(r.지역));
      const avg = this._groupAvg(rows, indicators);
      series.push({ name: '동남권 평균', isDashed: true, color: cssVar('--trend-dongnam'), values: indicators.map(ind => normalize(avg[ind], ind)) });
    }
    if (AppState.radar.groups.has('전국 사립')) {
      const rows = filteredAll.filter(r => r.설립구분 === '사립');
      const avg = this._groupAvg(rows, indicators);
      series.push({ name: '전국 사립 평균', isDashed: true, color: cssVar('--trend-private'), values: indicators.map(ind => normalize(avg[ind], ind)) });
    }

    const el = document.getElementById('radar-chart');
    if (!el) return;
    if (!this._chart) this._chart = echarts.init(el);

    this._chart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } },
      radar: {
        indicator: indicators.map(ind => ({ name: AppState.raw.calcRules[ind]?.label || ind, max: 100 })),
        radius: '65%',
        axisName: { fontSize: 11, color: cssVar('--text-secondary') },
      },
      series: [{
        type: 'radar',
        data: series.map(s => ({
          name: s.name,
          value: s.values,
          lineStyle: { width: s.isOurs ? 2.5 : 1.5, type: s.isDashed ? 'dashed' : 'solid', color: s.color },
          itemStyle: { color: s.color },
          areaStyle: s.isOurs ? { color: s.color, opacity: 0.15 } : undefined,
        })),
      }],
    }, true);
  },
};

/* ═══════════════════════════════════════════════════════
   BenchmarkView — 1:1 벤치마킹 표 + 갭 분석 차트
═══════════════════════════════════════════════════════ */
const BenchmarkView = {
  _gapChart: null,

  _getIndicators() {
    const sample = (AppState.raw.benchmarkCache || [])[0];
    if (!sample) return [];
    const metaKeys = new Set(['기준대학명', '기준연도', '지역', '설립구분', '대학구분', '수도권여부']);
    return Object.keys(sample).filter(k => !metaKeys.has(k));
  },

  _baseFilter(r) {
    return ['국공립', '사립'].includes(r.설립구분) && ['대학교', '산업대학'].includes(r.대학구분);
  },

  _groupAvg(rows, indicator) {
    const vals = rows.filter(r => this._baseFilter(r)).map(r => r[indicator]).filter(v => v != null && !isNaN(v));
    if (!vals.length) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const clean = std > 0 ? vals.filter(v => Math.abs(v - mean) <= 3 * std) : vals;
    return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
  },

  // 갭 차트 필터 적용
  _filteredForGap(cache) {
    const { gapFound, gapRegion } = AppState.benchmark;
    const METRO = new Set(['서울', '경기', '인천']);
    const DONGNAM = new Set(['부산', '울산', '경남']);
    return cache.filter(r => {
      if (gapFound === '사립' && r.설립구분 !== '사립') return false;
      if (gapRegion === '비수도권' && METRO.has(r.지역)) return false;
      if (gapRegion === '동남권' && !DONGNAM.has(r.지역)) return false;
      if (gapRegion === '부산' && r.지역 !== '부산') return false;
      return true;
    });
  },

  activate() {
    const cache = AppState.raw.benchmarkCache;
    const emptyEl = document.getElementById('bench-empty-state');
    const mainRow = document.getElementById('bench-main-row');
    if (!cache || !cache.length) {
      if (emptyEl) emptyEl.style.display = '';
      if (mainRow) mainRow.style.display = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (mainRow) mainRow.style.display = '';

    // 우리 대학명 표시
    const nameEl = document.getElementById('bench-our-name');
    if (nameEl) nameEl.textContent = OUR_UNIV;

    // datalist 채우기
    const dl = document.getElementById('bench-univ-list');
    if (dl) {
      const names = [...new Set(cache.map(r => r.기준대학명))].filter(n => n !== OUR_UNIV).sort();
      dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
    }

    // 탭 없으면 초기화 (기본 탭 없음 — 선택 전)
    if (AppState.benchmark.activeTab === null && AppState.benchmark.customUnivs.length > 0) {
      AppState.benchmark.activeTab = AppState.benchmark.customUnivs[0];
    }

    this._renderTabs();
    this.render();
    if (this._gapChart) setTimeout(() => this._gapChart.resize(), 60);
  },

  _renderTabs() {
    const tabs = document.getElementById('bench-univ-tabs');
    if (!tabs) return;
    const univs = AppState.benchmark.customUnivs;
    tabs.innerHTML = univs.map(name => {
      const active = name === AppState.benchmark.activeTab ? ' active' : '';
      return `<button class="bench-tab${active}" data-name="${name}">${name}<span class="bench-tab-del" data-name="${name}">×</span></button>`;
    }).join('');
  },

  render() {
    const cache = AppState.raw.benchmarkCache || [];
    if (!cache.length) return;
    const indicators = this._getIndicators();
    const ourRow = cache.find(r => r.기준대학명 === OUR_UNIV);
    if (!ourRow) return;

    // manifest에서 indicator_id → sort_asc 맵 (한 번만 빌드)
    const sortAscMap = new Map(
      AppState.raw.manifest.flatMap(m => m.indicators || []).map(i => [i.id, i.sort_asc === true])
    );

    this._renderCompTable(indicators, ourRow, cache, sortAscMap);
    this._renderGapChart(indicators, ourRow, cache, sortAscMap);
  },

  _renderCompTable(indicators, ourRow, cache, sortAscMap = new Map()) {
    const body = document.getElementById('bench-comparison-body');
    const scoreRow = document.getElementById('bench-score-row');
    const compHeader = document.getElementById('bench-comp-header');
    if (!body) return;

    const activeTab = AppState.benchmark.activeTab;
    const compRow = activeTab ? cache.find(r => r.기준대학명 === activeTab) : null;

    if (compHeader) compHeader.textContent = activeTab || '선택 대학';

    const fmt = (v, ind) => {
      if (v == null) return '-';
      const rule = AppState.raw.calcRules[ind];
      const unit = rule?.unit || '';
      const dp = rule?.decimal_places ?? 1;
      return v.toFixed(dp) + (unit ? unit : '');
    };

    let ahead = 0, behind = 0, same = 0;
    body.innerHTML = indicators.map(ind => {
      const label = AppState.raw.calcRules[ind]?.label || ind;
      const ourVal = ourRow[ind];
      const compVal = compRow ? compRow[ind] : null;
      const sortAsc = sortAscMap.get(ind) ?? false; // true = 낮을수록 좋은 지표

      let judge = '', judgeClass = '', diff = '-';
      if (ourVal != null && compVal != null) {
        const ourBetter = sortAsc ? ourVal <= compVal : ourVal >= compVal;
        const tie = ourVal === compVal;
        if (tie) { judge = '▶ 유사'; judgeClass = 'bench-judge-same'; same++; }
        else if (ourBetter) { judge = '▲ 우위'; judgeClass = 'bench-judge-ahead'; ahead++; }
        else { judge = '▼ 열위'; judgeClass = 'bench-judge-behind'; behind++; }
        const d = ourVal - compVal;
        diff = (d > 0 ? '+' : '') + d.toFixed(1);
      }

      return `<tr>
        <td class="bench-td-item">${label}</td>
        <td class="bench-td-our">${fmt(ourVal, ind)}</td>
        <td class="bench-td-comp">${compRow ? fmt(compVal, ind) : '-'}</td>
        <td class="bench-td-judge"><span class="${judgeClass}">${judge}</span></td>
        <td class="bench-td-diff"><span class="bench-diff-bar" data-val="${ourVal != null && compVal != null ? (ourVal - compVal).toFixed(1) : ''}">${diff}</span></td>
      </tr>`;
    }).join('');

    if (scoreRow) {
      scoreRow.innerHTML = compRow
        ? `<span class="bench-score ahead"><span class="bench-score-num">${ahead}</span> 항목 우위</span>
           <span class="bench-score behind"><span class="bench-score-num">${behind}</span> 항목 열위</span>
           <span class="bench-score same"><span class="bench-score-num">${same}</span> 항목 유사</span>`
        : '';
    }
  },

  _renderGapChart(indicators, ourRow, cache, sortAscMap = new Map()) {
    const el = document.getElementById('gap-chart');
    if (!el) return;
    if (!this._gapChart) this._gapChart = echarts.init(el);

    const groupRows = this._filteredForGap(cache);
    const { gapRegion } = AppState.benchmark;
    const seriesLabel = `vs ${gapRegion} 평균`;

    const labels = indicators.map(ind => AppState.raw.calcRules[ind]?.label || ind);
    const gaps = indicators.map(ind => {
      const avg = this._groupAvg(groupRows, ind);
      if (avg == null || ourRow[ind] == null) return null;
      return +(ourRow[ind] - avg).toFixed(2);
    });

    // sort_asc=true(낮을수록 좋은 지표)는 갭이 음수일 때 우위(파랑)
    const isGood = (gap, ind) => {
      if (gap == null) return false;
      return sortAscMap.get(ind) ? gap <= 0 : gap >= 0;
    };

    const fmtGap = (v, ind) => {
      if (v == null) return '';
      const rule = AppState.raw.calcRules[ind];
      const unit = rule?.unit || '';
      return (v > 0 ? '+' : '') + v.toFixed(1) + (unit ? unit : '');
    };

    this._gapChart.setOption({
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter(params) {
          const p = params[0];
          if (p.value == null) return p.axisValue;
          return `<b>${p.axisValue}</b><br>${p.marker}${p.seriesName}: <b>${p.value > 0 ? '+' : ''}${p.value}</b>`;
        },
      },
      grid: { top: 10, right: 70, bottom: 10, left: 130, containLabel: false },
      xAxis: { type: 'value', axisLabel: { formatter: v => v > 0 ? '+' + v : String(v) } },
      yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 11, width: 120, overflow: 'truncate' } },
      series: [{
        name: seriesLabel, type: 'bar', data: gaps,
        itemStyle: { color: p => isGood(p.value, indicators[p.dataIndex]) ? '#3b82f6' : '#ef4444' },
        label: {
          show: true,
          position: p => p.value != null && p.value >= 0 ? 'right' : 'left',
          formatter: p => p.value != null ? fmtGap(p.value, indicators[p.dataIndex]) : '',
          color: '#374151', fontSize: 11,
        },
      }],
    }, true);
  },
};

/* ═══════════════════════════════════════════════════════
   HeatmapView — 상관관계 히트맵 (benchmarkCache 기반)
═══════════════════════════════════════════════════════ */
const HeatmapView = {
  _chart: null,
  _scatter: null,

  _pearson(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
    const dx = Math.sqrt(xs.reduce((acc, x) => acc + (x - mx) ** 2, 0));
    const dy = Math.sqrt(ys.reduce((acc, y) => acc + (y - my) ** 2, 0));
    return dx * dy > 0 ? num / (dx * dy) : null;
  },

  _filterCache() {
    const cache = AppState.raw.benchmarkCache || [];
    const h = AppState.heatmap;
    const METRO = new Set(['서울', '경기', '인천']);
    const DONGNAM = new Set(['부산', '울산', '경남']);
    return cache.filter(r => {
      if (!['국공립', '사립'].includes(r.설립구분)) return false;
      if (!['대학교', '산업대학'].includes(r.대학구분)) return false;
      if (h.설립 === '사립' && r.설립구분 !== '사립') return false;
      if (h.region === '비수도권' && METRO.has(r.지역)) return false;
      if (h.region === '동남권' && !DONGNAM.has(r.지역)) return false;
      return true;
    });
  },

  _getIndicators(sample) {
    const metaKeys = new Set(['기준대학명', '기준연도', '지역', '설립구분', '대학구분', '수도권여부']);
    return Object.keys(sample).filter(k => !metaKeys.has(k));
  },

  activate() {
    const cache = AppState.raw.benchmarkCache;
    const el = document.getElementById('heatmap-chart');
    if (!cache || !cache.length) {
      if (el) el.innerHTML = '<div class="trend-empty">벤치마크 캐시가 없습니다. 관리자 페이지에서 생성해 주세요.</div>';
      return;
    }
    this.render();
    if (this._chart) setTimeout(() => this._chart.resize(), 60);
  },

  render() {
    const filtered = this._filterCache();
    if (!filtered.length) return;
    const indicators = this._getIndicators(filtered[0]);
    if (indicators.length < 2) return;

    const labels = indicators.map(ind => AppState.raw.calcRules[ind]?.label || ind);

    // 상관계수 행렬 계산
    const matrix = [];
    for (let i = 0; i < indicators.length; i++) {
      for (let j = 0; j < indicators.length; j++) {
        const pairs = filtered.map(r => [r[indicators[i]], r[indicators[j]]]).filter(([x, y]) => x != null && y != null);
        const r = pairs.length >= 3 ? this._pearson(pairs.map(p => p[0]), pairs.map(p => p[1])) : null;
        matrix.push([j, i, r != null ? +r.toFixed(3) : null]);
      }
    }

    const el = document.getElementById('heatmap-chart');
    if (!el) return;
    if (!this._chart) this._chart = echarts.init(el);

    this._chart.setOption({
      tooltip: {
        formatter(p) {
          const [xi, yi, val] = p.data;
          return `${labels[yi]} × ${labels[xi]}<br>상관계수: <b>${val != null ? val : '-'}</b>`;
        },
      },
      grid: { top: 20, right: 20, bottom: 100, left: 100 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 30, fontSize: 10 } },
      yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10 } },
      visualMap: { min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#ef4444', '#f8fafc', '#2563eb'] } },
      series: [{
        type: 'heatmap',
        data: matrix,
        label: { show: true, fontSize: 9, formatter: p => p.data[2] != null ? p.data[2].toFixed(2) : '' },
        emphasis: { itemStyle: { shadowBlur: 10 } },
      }],
    }, true);

    // 셀 클릭 → 산점도
    this._chart.off('click');
    this._chart.on('click', params => {
      if (params.componentType !== 'series') return;
      const [xi, yi] = params.data;
      const xInd = indicators[xi], yInd = indicators[yi];
      if (xInd === yInd) return;
      this._renderScatter(filtered, xInd, yInd, labels[xi], labels[yi]);
    });
  },

  _renderScatter(rows, xInd, yInd, xLabel, yLabel) {
    const card = document.getElementById('scatter-card');
    const title = document.getElementById('scatter-title');
    const el = document.getElementById('scatter-chart');
    if (!card || !el) return;
    card.style.display = '';
    if (title) title.textContent = `${xLabel} × ${yLabel} 산점도`;
    if (!this._scatter) this._scatter = echarts.init(el);

    const data = rows.map(r => [r[xInd], r[yInd], r.기준대학명]).filter(([x, y]) => x != null && y != null);
    const ourPoint = data.find(d => d[2] === OUR_UNIV);

    this._scatter.setOption({
      tooltip: { formatter: p => `${p.data[2]}<br>${xLabel}: ${p.data[0]?.toFixed(1)}<br>${yLabel}: ${p.data[1]?.toFixed(1)}` },
      grid: { top: 20, right: 20, bottom: 50, left: 70 },
      xAxis: { type: 'value', name: xLabel, nameLocation: 'middle', nameGap: 30 },
      yAxis: { type: 'value', name: yLabel, nameLocation: 'middle', nameGap: 50 },
      series: [{
        type: 'scatter',
        data: data.map(d => ({ value: [d[0], d[1]], name: d[2], itemStyle: { color: d[2] === OUR_UNIV ? cssVar('--our-color') : '#94a3b8', opacity: 0.7 } })),
        symbolSize: 8,
        label: ourPoint ? { show: false } : undefined,
      }],
    }, true);
    setTimeout(() => this._scatter.resize(), 60);
  },
};

/* ═══════════════════════════════════════════════════════
   App
═══════════════════════════════════════════════════════ */
const App = {
  async init() {
    if (location.protocol === 'file:') document.getElementById('cors-warning').style.display = 'block';

    const sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (sidebarCollapsed) document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      const isCollapsed = document.getElementById('sidebar').classList.toggle('collapsed');
      localStorage.setItem('sidebar-collapsed', isCollapsed);
      if (TrendView._chart) setTimeout(() => TrendView._chart.resize(), 60);
    });

    const switchView = (viewName) => {
      document.querySelectorAll('.nav-item[data-view], .mobile-nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === viewName));
      document.getElementById('ranking-view').classList.toggle('hidden-view', viewName !== 'ranking');
      for (const v of ['trend', 'bump', 'simulator', 'radar', 'benchmark', 'heatmap']) {
        document.getElementById(`${v}-view`)?.classList.toggle('visible', viewName === v);
      }
      document.getElementById('filter-bar').classList.toggle('trend-mode', viewName === 'trend');
      document.getElementById('filter-bar').classList.toggle('simulator-mode', viewName === 'simulator');
      document.getElementById('filter-bar').classList.toggle('bump-mode', viewName === 'bump');
      document.getElementById('filter-bar').classList.toggle('benchmark-mode', ['radar','benchmark','heatmap'].includes(viewName));
      // 공유 사이드바 표시/숨김 및 모드 전환
      const sidePanel = document.getElementById('trend-side-panel');
      if (sidePanel) {
        sidePanel.classList.toggle('active', ['trend', 'bump'].includes(viewName));
        sidePanel.classList.toggle('bump-active', viewName === 'bump');
      }
      if (viewName === 'trend') TrendView.activate();
      if (viewName === 'bump') BumpView.activate();
      if (viewName === 'simulator') SimulatorView.activate();
      if (viewName === 'radar') RadarView.activate();
      if (viewName === 'benchmark') BenchmarkView.activate();
      if (viewName === 'heatmap') HeatmapView.activate();
      // 사이드바 접기 시 차트 리사이즈
      if (TrendView._chart) setTimeout(() => TrendView._chart.resize(), 60);
      setTimeout(() => {
        if (document.getElementById('bump-view')?.classList.contains('visible')) BumpView._fitHeight();
        if (RadarView._chart) RadarView._chart.resize();
        if (HeatmapView._chart) HeatmapView._chart.resize();
        if (BenchmarkView._gapChart) BenchmarkView._gapChart.resize();
      }, 60);
    };
    document.querySelectorAll('.nav-item[data-view], .mobile-nav-item[data-view]').forEach(el => el.addEventListener('click', () => switchView(el.dataset.view)));

    document.getElementById('table-search').addEventListener('input', e => {
      AppState.computed.nameQuery = e.target.value.trim().toLowerCase();
      AppState.computed.currentPage = 1;
      RankingView.renderTable(AppState.computed.sorted, 1);
      RankingView.renderPagination(AppState.computed.sorted.length, 1);
    });

    document.getElementById('btn-csv').addEventListener('click', () => {
      const { sorted } = AppState.computed;
      const calcRules = AppState.raw.calcRules;
      const metaFields = new Set(['기준대학명', '지역', '설립구분', '대학구분', '수도권여부', '기준연도']);
      const numFields = Object.keys(sorted[0] || {}).filter(k => !k.startsWith('_') && !metaFields.has(k) && typeof sorted[0][k] === 'number');
      const columns = [
        { key: '_rank', label: '순위' }, { key: '기준대학명', label: '대학명' },
        { key: '지역', label: '지역' }, { key: '설립구분', label: '설립구분' }, { key: '대학구분', label: '대학구분' },
        ...numFields.map(k => ({ key: k, label: calcRules[k]?.label || k })),
      ];
      Utils.exportCSV(sorted, columns, `순위_${AppState.filters.항목키}_${AppState.filters.연도}_${new Date().toISOString().slice(0,10)}.csv`);
    });

    // 추이 패널 — 그룹 체크박스
    document.querySelectorAll('#trend-side-panel input[type="checkbox"][data-group]').forEach(cb => {
      cb.addEventListener('change', () => {
        const g = cb.dataset.group; const item = cb.closest('.trend-check-item');
        if (cb.checked) { AppState.trend.groups.add(g); item.classList.add('is-checked'); }
        else { AppState.trend.groups.delete(g); item.classList.remove('is-checked'); }
        if (document.getElementById('trend-view').classList.contains('visible')) TrendView.render();
      });
    });

    // 공유 사이드바 — 연도 체크박스 (추이/순위변동 공용)
    document.getElementById('trend-year-checks').addEventListener('change', e => {
      const cb = e.target;
      if (cb.type !== 'checkbox' || !cb.dataset.year) return;
      const y = +cb.dataset.year;
      const item = cb.closest('.trend-check-item');
      const isBump = document.getElementById('bump-view')?.classList.contains('visible');
      if (isBump) {
        if (cb.checked) { AppState.bump.selectedYears.add(y); item?.classList.add('is-checked'); }
        else { AppState.bump.selectedYears.delete(y); item?.classList.remove('is-checked'); }
        BumpView.render();
      } else {
        if (cb.checked) { AppState.trend.selectedYears.add(y); item?.classList.add('is-checked'); }
        else { AppState.trend.selectedYears.delete(y); item?.classList.remove('is-checked'); }
        if (document.getElementById('trend-view')?.classList.contains('visible')) TrendView.render();
      }
    });

    // Y축
    document.getElementById('trend-apply-axis').addEventListener('click', () => {
      AppState.trend.yMin = parseFloat(document.getElementById('trend-ymin').value) || null;
      AppState.trend.yMax = parseFloat(document.getElementById('trend-ymax').value) || null;
      if (document.getElementById('trend-view').classList.contains('visible')) TrendView.render();
    });
    document.getElementById('trend-auto-axis').addEventListener('click', () => {
      AppState.trend.yMin = null; AppState.trend.yMax = null;
      document.getElementById('trend-ymin').value = '';
      document.getElementById('trend-ymax').value = '';
      if (document.getElementById('trend-view').classList.contains('visible')) TrendView.render();
    });

    // 대학 추가
    const univInput = document.getElementById('trend-univ-input');
    if (univInput) {
      univInput.addEventListener('change', () => {
        const name = univInput.value.trim();
        if (!name || AppState.trend.customUnivs.includes(name)) { univInput.value = ''; return; }
        AppState.trend.customUnivs.push(name);
        univInput.value = '';
        const tags = document.getElementById('trend-univ-tags');
        const tag = document.createElement('div');
        tag.className = 'trend-univ-tag'; tag.dataset.name = name;
        tag.innerHTML = `<span>${name}</span><button onclick="removeTrendUniv('${name.replace(/'/g,"\\'")}')">×</button>`;
        tags.appendChild(tag);
        if (document.getElementById('trend-view').classList.contains('visible')) TrendView.render();
      });
    }

    // Bump Chart 대학 추가 이벤트
    document.getElementById('bump-univ-input')?.addEventListener('change', () => {
      const input = document.getElementById('bump-univ-input');
      const name = input.value.trim();
      input.value = '';
      if (!name) return;
      // userRemoved에서 복원하거나 userAdded에 추가
      AppState.bump.userRemoved = AppState.bump.userRemoved.filter(n => n !== name);
      if (!AppState.bump.userAdded.includes(name)) AppState.bump.userAdded.push(name);
      if (document.getElementById('bump-view')?.classList.contains('visible')) {
        BumpView._renderTags();
        BumpView.render();
      }
    });

    // 레이더 차트 패널 이벤트
    document.getElementById('radar-univ-input')?.addEventListener('change', () => {
      const input = document.getElementById('radar-univ-input');
      const name = input.value.trim();
      if (!name || AppState.radar.customUnivs.includes(name) || AppState.radar.customUnivs.length >= 5) { input.value = ''; return; }
      AppState.radar.customUnivs.push(name);
      input.value = '';
      const tags = document.getElementById('radar-univ-tags');
      const tag = document.createElement('div');
      tag.className = 'trend-univ-tag'; tag.dataset.name = name;
      tag.innerHTML = `<span>${name}</span><button onclick="removeRadarUniv('${name.replace(/'/g,"\\'")}')">×</button>`;
      tags.appendChild(tag);
      if (document.getElementById('radar-view')?.classList.contains('visible')) RadarView.render();
    });
    document.querySelectorAll('#radar-side-panel input[type="checkbox"][data-rgroup]').forEach(cb => {
      cb.addEventListener('change', () => {
        const g = cb.dataset.rgroup; const item = cb.closest('.trend-check-item');
        if (cb.checked) { AppState.radar.groups.add(g); item.classList.add('is-checked'); }
        else { AppState.radar.groups.delete(g); item.classList.remove('is-checked'); }
        if (document.getElementById('radar-view')?.classList.contains('visible')) RadarView.render();
      });
    });
    document.getElementById('radar-norm-group')?.addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn'); if (!btn) return;
      AppState.radar.normMode = btn.dataset.val;
      document.querySelectorAll('#radar-norm-group .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === btn.dataset.val));
      if (document.getElementById('radar-view')?.classList.contains('visible')) RadarView.render();
    });

    // 벤치마킹 패널 이벤트
    const _benchAdd = () => {
      const input = document.getElementById('bench-univ-select');
      if (!input) return;
      const name = input.value.trim();
      if (!name || AppState.benchmark.customUnivs.includes(name)) { input.value = ''; return; }
      AppState.benchmark.customUnivs.push(name);
      if (!AppState.benchmark.activeTab) AppState.benchmark.activeTab = name;
      input.value = '';
      BenchmarkView._renderTabs();
      if (document.getElementById('benchmark-view')?.classList.contains('visible')) BenchmarkView.render();
    };
    document.getElementById('bench-add-btn')?.addEventListener('click', _benchAdd);
    document.getElementById('bench-univ-select')?.addEventListener('change', _benchAdd);

    // 탭 클릭/삭제 (이벤트 위임)
    document.getElementById('bench-univ-tabs')?.addEventListener('click', e => {
      const delBtn = e.target.closest('.bench-tab-del');
      const tab = e.target.closest('.bench-tab');
      if (delBtn) {
        const name = delBtn.dataset.name;
        AppState.benchmark.customUnivs = AppState.benchmark.customUnivs.filter(n => n !== name);
        if (AppState.benchmark.activeTab === name) {
          AppState.benchmark.activeTab = AppState.benchmark.customUnivs[0] || null;
        }
        BenchmarkView._renderTabs();
        if (document.getElementById('benchmark-view')?.classList.contains('visible')) BenchmarkView.render();
      } else if (tab) {
        AppState.benchmark.activeTab = tab.dataset.name;
        BenchmarkView._renderTabs();
        if (document.getElementById('benchmark-view')?.classList.contains('visible')) BenchmarkView.render();
      }
    });

    // 갭 차트 필터 토글 (이벤트 위임)
    document.getElementById('bench-gap-card')?.addEventListener('click', e => {
      const btn = e.target.closest('.seg-btn[data-bgroup]');
      if (!btn) return;
      const group = btn.dataset.bgroup;
      const val = btn.dataset.val;
      if (group === 'found') AppState.benchmark.gapFound = val;
      if (group === 'region') AppState.benchmark.gapRegion = val;
      document.querySelectorAll(`#bench-gap-card .seg-btn[data-bgroup="${group}"]`).forEach(b => b.classList.toggle('active', b.dataset.val === val));
      if (document.getElementById('benchmark-view')?.classList.contains('visible')) BenchmarkView.render();
    });

    // 히트맵 패널 이벤트
    const _hmSeg = (groupId, stateKey) => {
      document.getElementById(groupId)?.addEventListener('click', e => {
        const btn = e.target.closest('.seg-btn'); if (!btn) return;
        AppState.heatmap[stateKey] = btn.dataset.val;
        document.querySelectorAll(`#${groupId} .seg-btn`).forEach(b => b.classList.toggle('active', b.dataset.val === btn.dataset.val));
        if (document.getElementById('heatmap-view')?.classList.contains('visible')) HeatmapView.render();
      });
    };
    _hmSeg('heatmap-region-group', 'region');
    _hmSeg('heatmap-found-group', '설립');

    // 창 리사이즈
    window.addEventListener('resize', () => {
      if (document.getElementById('bump-view')?.classList.contains('visible')) BumpView._fitHeight();
      [TrendView._chart, RadarView._chart, BenchmarkView._gapChart, HeatmapView._chart, HeatmapView._scatter].forEach(c => c?.resize());
    });

    // 초기 데이터 로드
    const [manifest, 기준대학, calcRules, univInfo, benchmarkCache] = await Promise.all([
      DataService.fetchManifest(), DataService.fetchBaseUnivData(),
      DataService.fetchCalcRules(), DataService.fetchUnivInfo(),
      DataService.fetchBenchmarkCache(),
    ]);
    AppState.raw.manifest = manifest;
    AppState.raw.기준대학 = 기준대학;
    AppState.raw.benchmarkCache = benchmarkCache;
    AppState.raw.calcRules = calcRules;
    AppState._baseUnivMap = DataService.buildBaseUnivMap(기준대학);
    AppState._univInfoMap = DataService.buildUnivInfoMap(univInfo);

    FilterManager.init();
    FilterManager.renderItemSelect(manifest);
    FilterManager.renderAllMultiSelects();
    Utils.showEmptyState('no-item');
  },
};

function removeTrendUniv(name) {
  AppState.trend.customUnivs = AppState.trend.customUnivs.filter(n => n !== name);
  const tag = document.querySelector(`#trend-univ-tags .trend-univ-tag[data-name="${name}"]`);
  if (tag) tag.remove();
  if (document.getElementById('trend-view').classList.contains('visible')) TrendView.render();
}

function removeRadarUniv(name) {
  AppState.radar.customUnivs = AppState.radar.customUnivs.filter(n => n !== name);
  const tag = document.querySelector(`#radar-univ-tags .trend-univ-tag[data-name="${CSS.escape(name)}"]`);
  if (tag) tag.remove();
  if (document.getElementById('radar-view')?.classList.contains('visible')) RadarView.render();
}

function removeBumpUniv(name) {
  // userAdded에서 제거하거나 동남권 기본 대학이면 userRemoved에 추가
  AppState.bump.userAdded = AppState.bump.userAdded.filter(n => n !== name);
  if (!AppState.bump.userRemoved.includes(name)) AppState.bump.userRemoved.push(name);
  if (document.getElementById('bump-view')?.classList.contains('visible')) {
    BumpView._renderTags();
    BumpView.render();
  }
}


document.addEventListener('DOMContentLoaded', () => App.init());
