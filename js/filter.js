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
    AppState.computed.filtered = aggregated.filter(row => FilterUtils.matchesFilters(row, f));
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
