'use strict';

/* ═══════════════════════════════════════════════════════
   App — 초기화 및 이벤트 바인딩
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
      for (const v of ['trend', 'bump', 'simulator', 'benchmark', 'scatter', 'dept']) {
        document.getElementById(`${v}-view`)?.classList.toggle('visible', viewName === v);
      }
      document.getElementById('filter-bar').classList.toggle('trend-mode', viewName === 'trend');
      document.getElementById('filter-bar').classList.toggle('simulator-mode', viewName === 'simulator');
      document.getElementById('filter-bar').classList.toggle('bump-mode', viewName === 'bump');
      document.getElementById('filter-bar').classList.toggle('benchmark-mode', ['benchmark'].includes(viewName));
      document.getElementById('filter-bar').classList.toggle('scatter-mode', viewName === 'scatter');
      document.getElementById('filter-bar').classList.toggle('dept-mode', viewName === 'dept');
      if (viewName !== 'dept') document.getElementById('filter-bar').classList.remove('dept-trend-mode');

      // 공유 사이드바 표시/숨김 및 모드 전환
      const sidePanel = document.getElementById('trend-side-panel');
      if (sidePanel) {
        const isDeptTrend = viewName === 'dept' && AppState.dept.subView === 'trend';
        sidePanel.classList.toggle('active', ['trend', 'bump'].includes(viewName) || isDeptTrend);
        sidePanel.classList.toggle('bump-active', viewName === 'bump');
        sidePanel.classList.toggle('dept-trend-active', isDeptTrend);
      }
      if (viewName === 'trend') TrendView.activate();
      if (viewName === 'bump') BumpView.activate();
      if (viewName === 'simulator') SimulatorView.activate();
      if (viewName === 'benchmark') BenchmarkView.activate();
      if (viewName === 'scatter') ScatterView.activate();
      if (viewName === 'dept') {
        // 지표를 취업률로 고정
        const itemSel = document.getElementById('filter-item');
        if (itemSel && itemSel.value !== '취업률') {
          itemSel.value = '취업률';
          FilterManager.onItemChange('취업률');
        }
        DeptAnalysisView.activate();
      }
      if (TrendView._chart) setTimeout(() => TrendView._chart.resize(), 60);
      setTimeout(() => {
        if (document.getElementById('bump-view')?.classList.contains('visible')) BumpView._fitHeight();
        if (ScatterView._chart) ScatterView._chart.resize();
        if (BenchmarkView._gapChart) BenchmarkView._gapChart.resize();
        if (DeptAnalysisView._trendChart) DeptAnalysisView._trendChart.resize();
      }, 60);
    };
    document.querySelectorAll('.nav-item[data-view], .mobile-nav-item[data-view]').forEach(el => el.addEventListener('click', () => switchView(el.dataset.view)));

    document.getElementById('table-search').addEventListener('input', e => {
      AppState.computed.nameQuery = e.target.value.trim().toLowerCase();
      AppState.computed.currentPage = 1;
      RankingView.renderTable(AppState.computed.sorted, 1);
      RankingView.renderPagination(AppState.computed.sorted.length, 1);
    });

    document.getElementById('btn-trend-csv')?.addEventListener('click', () => TrendView.exportCSV());

    document.getElementById('btn-csv').addEventListener('click', () => {
      const { sorted } = AppState.computed;
      const calcRules = AppState.raw.calcRules;
      const metaFields = new Set(['기준대학명', '지역', '설립구분', '대학구분', '수도권여부', '공시연도']);
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
        // dept 추이 분석에서도 그룹 변경 반영
        const deptView = document.getElementById('dept-view');
        if (deptView?.classList.contains('visible') && AppState.dept.subView === 'trend') DeptAnalysisView._renderTrend();
      });
    });

    // 공유 사이드바 — 연도 체크박스 (추이/순위변동/계열별추이 공용)
    const _isDeptTrend = () => document.getElementById('dept-view')?.classList.contains('visible') && AppState.dept.subView === 'trend';
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
      } else if (_isDeptTrend()) {
        if (cb.checked) { AppState.dept.selectedYears.add(y); item?.classList.add('is-checked'); }
        else { AppState.dept.selectedYears.delete(y); item?.classList.remove('is-checked'); }
        DeptAnalysisView._renderTrend();
      } else {
        if (cb.checked) { AppState.trend.selectedYears.add(y); item?.classList.add('is-checked'); }
        else { AppState.trend.selectedYears.delete(y); item?.classList.remove('is-checked'); }
        if (document.getElementById('trend-view')?.classList.contains('visible')) TrendView.render();
      }
    });

    // Y축
    document.getElementById('trend-apply-axis').addEventListener('click', () => {
      if (_isDeptTrend()) {
        AppState.dept.yMin = parseFloat(document.getElementById('trend-ymin').value) || null;
        AppState.dept.yMax = parseFloat(document.getElementById('trend-ymax').value) || null;
        DeptAnalysisView._renderTrend();
      } else {
        AppState.trend.yMin = parseFloat(document.getElementById('trend-ymin').value) || null;
        AppState.trend.yMax = parseFloat(document.getElementById('trend-ymax').value) || null;
        if (document.getElementById('trend-view').classList.contains('visible')) TrendView.render();
      }
    });
    document.getElementById('trend-auto-axis').addEventListener('click', () => {
      document.getElementById('trend-ymin').value = '';
      document.getElementById('trend-ymax').value = '';
      if (_isDeptTrend()) {
        AppState.dept.yMin = null; AppState.dept.yMax = null;
        DeptAnalysisView._renderTrend();
      } else {
        AppState.trend.yMin = null; AppState.trend.yMax = null;
        if (document.getElementById('trend-view').classList.contains('visible')) TrendView.render();
      }
    });

    // 추이 대학 추가
    const univInput = document.getElementById('trend-univ-input');
    if (univInput) {
      univInput.addEventListener('change', () => {
        if (!_assertValidUniv(univInput)) return;
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

    // Bump Chart 대학 추가
    document.getElementById('bump-univ-input')?.addEventListener('change', () => {
      const input = document.getElementById('bump-univ-input');
      if (!_assertValidUniv(input)) return;
      const name = input.value.trim();
      input.value = '';
      if (!name) return;
      AppState.bump.userRemoved = AppState.bump.userRemoved.filter(n => n !== name);
      if (!AppState.bump.userAdded.includes(name)) AppState.bump.userAdded.push(name);
      if (document.getElementById('bump-view')?.classList.contains('visible')) {
        BumpView._renderTags();
        BumpView.render();
      }
    });

    // 벤치마킹 패널
    const _benchAdd = () => {
      const input = document.getElementById('bench-univ-select');
      if (!input) return;
      if (!_assertValidUniv(input)) return;
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

    // 갭 차트 필터 토글
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

    // 히트맵 패널
    // 기존 _hmSeg 블록 전체 삭제하고 아래로 교체
      document.getElementById('scatter-x')?.addEventListener('change', () => ScatterView.render());
      document.getElementById('scatter-y')?.addEventListener('change', () => ScatterView.render());
      document.getElementById('scatter-year')?.addEventListener('change', () => ScatterView.render());
      for (const id of ['scatter-x-min', 'scatter-x-max', 'scatter-y-min', 'scatter-y-max']) {
        document.getElementById(id)?.addEventListener('input', () => ScatterView.render());
      }
      document.getElementById('scatter-x-auto')?.addEventListener('click', () => {
        document.getElementById('scatter-x-min').value = '';
        document.getElementById('scatter-x-max').value = '';
        ScatterView.render();
      });
      document.getElementById('scatter-y-auto')?.addEventListener('click', () => {
        document.getElementById('scatter-y-min').value = '';
        document.getElementById('scatter-y-max').value = '';
        ScatterView.render();
      });

      document.getElementById('scatter-found-group')?.addEventListener('click', e => {
        const btn = e.target.closest('.seg-btn'); if (!btn) return;
        AppState.scatter.설립 = btn.dataset.val;
        document.querySelectorAll('#scatter-found-group .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === btn.dataset.val));
        ScatterView.render();
      });
      document.getElementById('scatter-region-group')?.addEventListener('click', e => {
        const btn = e.target.closest('.seg-btn'); if (!btn) return;
        AppState.scatter.지역 = btn.dataset.val;
        document.querySelectorAll('#scatter-region-group .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.val === btn.dataset.val));
        ScatterView.render();
      });

    // 창 리사이즈
    window.addEventListener('resize', () => {
      if (document.getElementById('bump-view')?.classList.contains('visible')) BumpView._fitHeight();
      [TrendView._chart, BenchmarkView._gapChart, ScatterView._chart, DeptAnalysisView._trendChart].forEach(c => c?.resize());
    });

    // 계열 드롭다운 이벤트
    document.getElementById('filter-dept')?.addEventListener('change', e => {
      DeptAnalysisView.onDeptChange(e.target.value);
    });

    // 초기 데이터 로드
    const [calcRules, benchmarkCache, manifest, baseUnivData, deptClassification] = await Promise.all([
      DataService.fetchCalcRules(),
      DataService.fetchBenchmarkCache(),
      DataService.fetchManifest(),
      DataService.fetchBaseUnivData(),
      DataService.fetchDeptClassification(),
    ]);
    AppState.raw.calcRules = calcRules;
    AppState.raw.benchmarkCache = benchmarkCache || [];
    AppState.raw.manifest = manifest || [];
    AppState.raw._baseUnivMap = DataService.buildBaseUnivMap(baseUnivData || []);
    AppState.dept.deptClassification = deptClassification || [];

    FilterManager.init();
    FilterManager.renderItemSelect(calcRules);
    FilterManager.renderAllMultiSelects();
    Utils.showEmptyState('no-item');

    // 툴팁 초기화
    document.getElementById('tooltip-select-item')?.classList.add('visible');
    document.getElementById('tooltip-filter-close')?.addEventListener('click', () => {
      document.getElementById('tooltip-filter-guide')?.classList.remove('visible');
    });
  },
};

/* ═══════════════════════════════════════════════════════
   전역 헬퍼 — innerHTML onclick 핸들러용 (글로벌 스코프 필요)
═══════════════════════════════════════════════════════ */

/** datalist 연결된 input에서 입력값이 유효한 대학명인지 검증.
 *  유효하지 않으면 input 아래에 경고 메시지를 2초간 표시하고 false 반환. */
function _assertValidUniv(inputEl) {
  const val = inputEl.value.trim();
  const dlId = inputEl.getAttribute('list');
  const dl = dlId ? document.getElementById(dlId) : null;
  if (!dl) return true; // datalist 없으면 통과
  const valid = Array.from(dl.options).some(opt => opt.value === val);
  if (!valid) {
    // 기존 경고 제거
    const prev = inputEl.parentElement.querySelector('.univ-input-warn');
    if (prev) prev.remove();
    const msg = document.createElement('div');
    msg.className = 'univ-input-warn';
    msg.textContent = '대학을 선택하세요';
    msg.style.cssText = 'font-size:11px;color:var(--error,#d32f2f);margin-top:3px;';
    inputEl.after(msg);
    setTimeout(() => msg.remove(), 2000);
    inputEl.value = '';
  }
  return valid;
}
function removeTrendUniv(name) {
  AppState.trend.customUnivs = AppState.trend.customUnivs.filter(n => n !== name);
  const tag = document.querySelector(`#trend-univ-tags .trend-univ-tag[data-name="${name}"]`);
  if (tag) tag.remove();
  if (document.getElementById('trend-view').classList.contains('visible')) TrendView.render();
}
function removeBumpUniv(name) {
  AppState.bump.userAdded = AppState.bump.userAdded.filter(n => n !== name);
  if (!AppState.bump.userRemoved.includes(name)) AppState.bump.userRemoved.push(name);
  if (document.getElementById('bump-view')?.classList.contains('visible')) {
    BumpView._renderTags();
    BumpView.render();
  }
}

document.addEventListener('DOMContentLoaded', () => App.init());
