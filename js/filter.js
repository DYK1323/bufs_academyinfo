'use strict';

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
      if (AppState.filters.대학구분그룹 === btn.dataset.val) return;
      AppState.filters.대학구분그룹 = btn.dataset.val;
      document.querySelectorAll('#univ-type-group .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === btn.dataset.val));
      this._triggerRender();
    });
    document.getElementById('found-quick').addEventListener('click', e => { const btn = e.target.closest('.seg-btn'); if (btn) this.onFoundQuick(btn.dataset.val); });
    document.getElementById('chk-special-excl').addEventListener('change', e => { AppState.filters.특별법제외 = e.target.checked; this._triggerRender(); });
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
  renderItemSelect(calcRules) {
    const sel = document.getElementById('filter-item');
    sel.innerHTML = '<option value="">지표 선택</option>';
    const visible = Object.entries(calcRules).filter(([, r]) => r.visible);
    if (!visible.length) { sel.innerHTML += '<option value="" disabled>등록된 항목이 없습니다</option>'; return; }
    for (const [key, rule] of visible) {
      const opt = document.createElement('option'); opt.value = key; opt.textContent = rule.label || key;
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
    if (AppState.filters.설립Quick === val) return;
    AppState.filters.설립Quick = val;
    document.querySelectorAll('#found-quick .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.val === val));
    this._triggerRender();
  },
  onRegionGroup(val) {
    if (AppState.filters.지역그룹 === val) return;
    AppState.filters.지역그룹 = val;
    document.querySelectorAll('#region-group .seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.val === val));
    this._triggerRender();
  },
  async onItemChange(indicatorKey) {
    AppState.filters.항목키 = indicatorKey;
    AppState.trend.allYears = null;
    AppState.trend.selectedYears.clear();
    AppState.bump.userAdded = [];
    AppState.bump.userRemoved = [];
    AppState.bump.selectedYears = new Set();
    AppState.trend.yMin = null; AppState.trend.yMax = null;
    document.getElementById('trend-ymin').value = '';
    document.getElementById('trend-ymax').value = '';
    if (!indicatorKey) { Utils.showEmptyState('no-item'); return; }
    const cache = AppState.raw.benchmarkCache;
    if (!cache?.length) { Utils.showEmptyState('fetch-error'); return; }
    const years = [...new Set(cache.filter(r => r[indicatorKey] != null).map(r => r.공시연도))]
      .sort((a, b) => b - a);
    if (!years.length) { Utils.showEmptyState('no-data'); return; }
    this.renderYearSelect(years);
    // manifest에서 이 지표에 해당하는 항목 찾아 per-item JSON 로드
    const manifestItem = AppState.raw.manifest.find(m => m.indicator === indicatorKey) || null;
    AppState.raw.currentManifestItem = manifestItem;
    const sources = manifestItem?.sources || [];
    const fetched = await Promise.all(sources.map(s => DataService.fetchItemData(s)));
    AppState.raw.항목데이터 = fetched.flat();
    this._reAggregate();
  },
  onYearChange(year) { AppState.filters.연도 = year; this._reAggregate(); },
  _reAggregate() {
    const indicatorKey = AppState.filters.항목키;
    const year = AppState.filters.연도;
    if (!year || !indicatorKey) { Utils.showEmptyState('no-data'); return; }
    const cache = AppState.raw.benchmarkCache;
    const prevYear = year - 1;
    const prevMap = new Map(
      cache.filter(r => (r.공시연도) === prevYear).map(r => [r.기준대학명, r])
    );
    // per-item JSON을 대학 단위로 합산 (raw 컬럼 표시용)
    // 공시연도=selectedYear인 행들의 최솟값 기준연도를 사용해 집계
    // (예: 파견교환학생 공시연도=2025/기준연도=2024 → baseYear=2024로 집계)
    const rawAggMap = new Map();
    if (AppState.raw.항목데이터?.length) {
      const refRows = AppState.raw.항목데이터.filter(r => (r['공시연도'] ?? r['기준연도']) === year);
      const baseYears = refRows.map(r => parseInt(r['기준연도'] ?? year, 10)).filter(n => !isNaN(n));
      const baseYear = baseYears.length > 0 ? Math.min(...baseYears) : year;
      DataService.aggregateByUniv(AppState.raw.항목데이터, baseYear, '기준연도')
        .forEach(r => rawAggMap.set(r.기준대학명, r));
    }
    // benchmark_cache(지표값·메타)와 per-item raw 컬럼 머지
    AppState.computed.aggregated = cache
      .filter(r => (r.공시연도) === year)
      .map(r => ({
        ...rawAggMap.get(r.기준대학명) || {},  // raw 컬럼 (낮은 우선순위)
        ...r,                                   // benchmark 데이터 (높은 우선순위)
        _isOurs: r.기준대학명 === OUR_UNIV,
        _prev: prevMap.get(r.기준대학명) || null,
      }));
    AppState.computed.rankKey = indicatorKey;
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
    AppState.computed.filtered = aggregated.filter(row => FilterUtils.matchesFilters(row, f));
    this._sortAndRender();
  },
  _sortAndRender() {
    const { filtered, sortKey, sortDir, rankKey } = AppState.computed;
    if (rankKey) {
      const sortAsc = AppState.raw.calcRules[rankKey]?.sort_asc === true;
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
