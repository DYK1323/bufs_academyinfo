'use strict';

/* ═══════════════════════════════════════════════════════
   DeptAnalysisView — 계열별 분석 뷰
   ▸ 순위 보기: 선택 계열의 학과 데이터를 대학 단위 합산 → 랭킹 테이블
   ▸ 추이 분석: 연도별 계열 지표 추이 → echarts 라인 차트
═══════════════════════════════════════════════════════ */
const DeptAnalysisView = {
  _trendChart: null,

  /* ── 뷰 활성화 ── */
  activate() {
    this._ensureDeptMap();
    this._renderDeptSelect();
    // 서브뷰가 trend면 사이드바 활성화
    const isTrend = AppState.dept.subView === 'trend';
    const sidePanel = document.getElementById('trend-side-panel');
    if (sidePanel) {
      sidePanel.classList.toggle('active', isTrend);
      sidePanel.classList.toggle('dept-trend-active', isTrend);
      sidePanel.classList.toggle('bump-active', false);
    }
    document.getElementById('filter-bar')?.classList.toggle('dept-trend-mode', isTrend);
    this.render();
  },

  /* 학과분류.json이 로드됐으면 Map으로 변환 */
  _ensureDeptMap() {
    const list = AppState.dept.deptClassification;
    if (!list?.length || AppState.dept.deptMap) return;
    const map = new Map();
    for (const r of list) {
      if (r.학과명) map.set(r.학과명, r.대계열 || '');
    }
    AppState.dept.deptMap = map;
    AppState.dept.계열List = [...new Set(list.map(r => r.대계열).filter(Boolean))].sort();
  },

  /* 계열 드롭다운 옵션 채우기 */
  _renderDeptSelect() {
    const sel = document.getElementById('filter-dept');
    if (!sel) return;
    const cur = AppState.dept.계열;
    sel.innerHTML = '<option value="">계열 전체</option>';
    for (const k of AppState.dept.계열List) {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = k;
      if (k === cur) opt.selected = true;
      sel.appendChild(opt);
    }
  },

  /* 서브탭 전환 */
  switchSubView(name) {
    AppState.dept.subView = name;
    document.querySelectorAll('.dept-sub-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.sub === name)
    );
    const ranking = document.getElementById('dept-ranking-panel');
    const trend   = document.getElementById('dept-trend-panel');
    if (ranking) ranking.style.display = name === 'ranking' ? '' : 'none';
    if (trend)   trend.style.display   = name === 'trend'   ? '' : 'none';

    // 추이 분석 서브탭 전환 시 사이드바 표시
    const sidePanel = document.getElementById('trend-side-panel');
    if (sidePanel) {
      sidePanel.classList.toggle('active', name === 'trend');
      sidePanel.classList.toggle('bump-active', false);
      sidePanel.classList.toggle('dept-trend-active', name === 'trend');
    }
    // 추이 서브탭에서 설립/지역 필터 비활성화
    document.getElementById('filter-bar')?.classList.toggle('dept-trend-mode', name === 'trend');

    FilterManager._showLoading();
    setTimeout(() => { this.render(); FilterManager._hideLoading(); }, 0);
  },

  /* 계열 필터 변경 시 호출 */
  onDeptChange(val) {
    AppState.dept.계열 = val;
    AppState.dept.yMin = null; AppState.dept.yMax = null;
    AppState.dept.selectedYears.clear();
    FilterManager._showLoading();
    setTimeout(() => { this.render(); FilterManager._hideLoading(); }, 0);
  },

  /* ── 학과 필드명 자동 감지 ── */
  _detectDeptField(sampleRow) {
    if (!sampleRow) return null;
    return Object.keys(sampleRow).find(k => k.includes('학과') && k.includes('모집단위'))
        || Object.keys(sampleRow).find(k => k === '학과(전공)')
        || Object.keys(sampleRow).find(k => k.startsWith('학과'));
  },

  /* ── 계열 필터 적용된 항목데이터 반환 ── */
  _getFilteredItemData() {
    const data  = AppState.raw.항목데이터;
    if (!data?.length) return [];
    const 계열  = AppState.dept.계열;
    if (!계열) return data;                    // 전체 계열: 필터 없음
    const deptMap = AppState.dept.deptMap;
    if (!deptMap) return [];                   // 계열 선택됐는데 맵 없으면 빈 배열
    const field = this._detectDeptField(data[0]);
    if (!field) return [];                     // 학과 필드 없으면 빈 배열
    return data.filter(r => deptMap.get((r[field] || '').trim()) === 계열);
  },

  /* 특정 연도의 대학별 계열 지표값 계산
   * yearSlice: 해당 연도 행만 미리 걸러서 넘기면 훨씬 빠름 (선택적) */
  _computeRows(year, filteredData, yearSlice) {
    if (!filteredData.length) return [];
    const slice = yearSlice ?? filteredData; // yearSlice 없으면 전체에서 연도 필터
    const aggregated = DataService.aggregateByUniv(slice, year, '공시연도');
    const calcRules  = AppState.raw.calcRules;
    const indicatorKey = AppState.filters.항목키;
    return aggregated.map(row => {
      const calc = applyCalcToRow(row, calcRules, slice, year);
      return { ...calc, 기준대학명: row.기준대학명, _isOurs: row.기준대학명 === OUR_UNIV };
    }).filter(r => r[indicatorKey] != null);
  },

  /* 대학 메타(지역·설립구분 등) — benchmarkCache에서 가져옴 */
  _getMetaMap(year) {
    const cache = AppState.raw.benchmarkCache;
    const m = new Map();
    if (!cache?.length) return m;
    cache.filter(r => r.공시연도 === year).forEach(r => m.set(r.기준대학명, r));
    return m;
  },

  /* ── 순위 보기 렌더 ── */
  render() {
    if (AppState.dept.subView === 'trend') this._renderTrend();
    else this._renderRanking();
  },

  _renderRanking() {
    const panel = document.getElementById('dept-ranking-panel');
    if (!panel) return;
    const indicatorKey = AppState.filters.항목키;
    const year         = AppState.filters.연도;

    if (!indicatorKey || !year) {
      panel.innerHTML = _deptEmptyState('지표와 연도를 선택하세요', '상단 필터에서 공시 항목을 먼저 선택하세요.');
      return;
    }
    if (!AppState.raw.항목데이터?.length) {
      panel.innerHTML = _deptEmptyState('데이터가 없습니다', '이 지표는 학과별 원시 데이터가 없어 계열별 분석이 불가합니다.');
      return;
    }

    const filteredData = this._getFilteredItemData();
    if (!filteredData.length) {
      panel.innerHTML = _deptEmptyState('해당 계열 데이터가 없습니다', '선택한 계열의 학과 데이터가 존재하지 않습니다.');
      return;
    }

    const yearSlice = filteredData.filter(r => String(r['공시연도'] ?? r['기준연도'] ?? r['연도']) === String(year));
    const rows     = this._computeRows(year, yearSlice, yearSlice);
    if (!rows.length) {
      panel.innerHTML = _deptEmptyState('계산된 데이터 없음', '지표 산식을 적용할 수 없습니다. 필드 구성을 확인하세요.');
      return;
    }

    const metaMap  = this._getMetaMap(year);
    const f        = AppState.filters;
    const calcRules = AppState.raw.calcRules;
    const sortAsc  = calcRules[indicatorKey]?.sort_asc === true;
    const { unit, decimal_places: dp } = getIndicatorMeta(indicatorKey);

    // 메타 머지 + 학교 단위 필터 적용
    // metaMap(benchmarkCache)은 지역·설립구분 등 메타만 제공 — 지표값은 rows(계열별 계산)가 우선
    let merged = rows.map(r => ({
      ...(metaMap.get(r.기준대학명) || {}),
      ...r,
      기준대학명: r.기준대학명,
      _isOurs: r.기준대학명 === OUR_UNIV,
    })).filter(r => FilterUtils.matchesFilters(r, f));

    // 순위 계산
    merged.sort((a, b) => sortAsc ? a[indicatorKey] - b[indicatorKey] : b[indicatorKey] - a[indicatorKey]);
    merged.forEach((r, i) => {
      r._rank = (i > 0 && merged[i][indicatorKey] === merged[i - 1][indicatorKey])
        ? merged[i - 1]._rank
        : i + 1;
    });

    const ourRow = merged.find(r => r._isOurs);
    const 계열Label = AppState.dept.계열 || '전체';

    // KPI 바
    let kpiHtml = '';
    if (ourRow) {
      const val  = Utils.formatValue(ourRow[indicatorKey], unit, dp);
      kpiHtml = `
        <div class="dept-kpi-bar">
          <div class="dept-kpi-card"><div class="dept-kpi-label">우리 대학 (${계열Label})</div><div class="dept-kpi-value">${val}</div></div>
          <div class="dept-kpi-divider"></div>
          <div class="dept-kpi-card"><div class="dept-kpi-label">순위</div><div class="dept-kpi-value">${ourRow._rank}위 / ${merged.length}개교</div></div>
        </div>`;
    }

    // manifest columns (지표값 제외한 보조 컬럼)
    const manifestCols = (AppState.raw.currentManifestItem?.columns || [])
      .filter(c => c.key !== indicatorKey);

    // 테이블 (최대 100행)
    const topRows = merged.slice(0, 100);
    const tbodyHtml = topRows.map(r => {
      const val = Utils.formatValue(r[indicatorKey], unit, dp);
      const cls = r._isOurs ? 'our-row' : '';
      const extraTds = manifestCols.map(c => {
        const v = r[c.key];
        return `<td style="text-align:right;">${v != null ? Number.isInteger(v) ? v.toLocaleString('ko-KR') : typeof v === 'number' ? v.toLocaleString('ko-KR', {maximumFractionDigits: 1}) : v : '-'}</td>`;
      }).join('');
      return `<tr class="${cls}">
        <td style="text-align:center;color:var(--text-muted);font-size:12px;">${r._rank}</td>
        <td><strong>${r.기준대학명}</strong></td>
        <td>${r.지역 || ''}</td>
        <td>${r.설립구분 || ''}</td>
        <td style="text-align:right;font-weight:600;">${val}</td>
        ${extraTds}
      </tr>`;
    }).join('');

    const extraThs = manifestCols.map(c => `<th style="text-align:right;">${c.label}</th>`).join('');

    panel.innerHTML = `
      ${kpiHtml}
      <div style="padding:10px 16px 4px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;color:var(--text-muted);">${계열Label} · ${year}년 · ${merged.length}개교${merged.length > 100 ? ' (상위 100개 표시)' : ''}</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="dept-rank-table">
          <thead><tr>
            <th style="text-align:center;width:52px;">순위</th>
            <th>대학명</th><th>지역</th><th>설립</th>
            <th style="text-align:right;">${calcRules[indicatorKey]?.label || indicatorKey}</th>
            ${extraThs}
          </tr></thead>
          <tbody>${tbodyHtml}</tbody>
        </table>
      </div>
    `;
  },

  /* ── 추이 분석 렌더 ── */
  _renderTrend() {
    const indicatorKey = AppState.filters.항목키;
    const chartEl = document.getElementById('dept-trend-chart');
    const tableEl = document.getElementById('dept-trend-table-wrap');

    if (!indicatorKey || !AppState.raw.항목데이터?.length) {
      if (chartEl) chartEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:13px;">지표를 선택하세요.</div>';
      if (tableEl) tableEl.innerHTML = '';
      return;
    }

    const filteredData = this._getFilteredItemData();
    if (!filteredData.length) {
      if (chartEl) chartEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:13px;">해당 계열의 데이터가 없습니다.</div>';
      if (tableEl) tableEl.innerHTML = '';
      return;
    }

    // filteredData를 공시연도별로 미리 분리 (연도마다 전체 순회하는 비용 제거)
    const byYear = new Map();
    for (const r of filteredData) {
      const y = r['공시연도'] ?? r['기준연도'] ?? r['연도'];
      if (y == null) continue;
      const yr = +y;
      if (!byYear.has(yr)) byYear.set(yr, []);
      byYear.get(yr).push(r);
    }
    const allYearsRaw = [...byYear.keys()].sort((a, b) => a - b);

    if (!allYearsRaw.length) {
      if (chartEl) chartEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);">연도 데이터가 없습니다.</div>';
      return;
    }

    // 연도 체크박스 렌더 (처음 진입 시 또는 데이터 변경 시)
    this._updateDeptYearChecks(allYearsRaw);

    // 선택된 연도 필터 적용 (없으면 전체)
    const selYears = AppState.dept.selectedYears;
    const years = selYears.size > 0 ? allYearsRaw.filter(y => selYears.has(y)) : allYearsRaw;

    // 연도별 merged rows 캐시 (여러 series에서 재사용)
    const yearRowsCache = new Map();
    const getRows = (year) => {
      if (!yearRowsCache.has(year)) {
        const yearSlice = byYear.get(year) || [];
        const rows = this._computeRows(year, yearSlice, yearSlice);
        const metaMap = this._getMetaMap(year);
        const merged = rows.map(r => ({
          ...(metaMap.get(r.기준대학명) || {}),
          ...r,
        }));
        yearRowsCache.set(year, merged);
      }
      return yearRowsCache.get(year);
    };

    const { unit, decimal_places: dp } = getIndicatorMeta(indicatorKey);
    const label = AppState.raw.calcRules[indicatorKey]?.label || indicatorKey;
    const 계열Label = AppState.dept.계열 || '전체';
    const fmt = v => Utils.formatValue(+v, unit, dp);
    const ourColor = cssVar('--our-color');

    // 그룹 평균 계산 헬퍼
    const groupAvg = (year, filterFn) => {
      const rows = getRows(year).filter(r => !r._isOurs && filterFn(r));
      const vals = rows.map(r => r[indicatorKey]).filter(v => v != null && !isNaN(v));
      if (!vals.length) return null;
      const clean = BenchmarkUtils.sigmaFilter(vals);
      return clean.length ? +(clean.reduce((a, b) => a + b, 0) / clean.length).toFixed(2) : null;
    };

    // 우리 대학 series
    const ourData = years.map(year => {
      const ourRow = getRows(year).find(r => r._isOurs);
      const v = ourRow?.[indicatorKey];
      return (v != null && !isNaN(v)) ? +v.toFixed(2) : null;
    });

    const series = [
      { name: OUR_UNIV, isOurs: true, color: ourColor, data: ourData },
    ];

    // 사이드바 그룹 체크박스 상태 반영
    const activeGroups = AppState.trend.groups;
    const DEPT_GROUPS = {
      '전국 평균':  { color: cssVar('--trend-national'),   filter: () => true },
      '전국 사립':  { color: cssVar('--trend-private'),    filter: r => r.설립구분 === '사립' },
      '비수도권':   { color: cssVar('--trend-non-metro'),  filter: r => r.수도권여부 === 'N' },
      '동남권':     { color: cssVar('--trend-dongnam'),    filter: r => DONGNAM.has(r.지역) },
      '부산':       { color: cssVar('--trend-busan'),      filter: r => r.지역 === '부산' },
    };

    for (const [gName, g] of Object.entries(DEPT_GROUPS)) {
      if (!activeGroups.has(gName)) continue;
      series.push({
        name: `${계열Label} ${gName}`,
        isGroup: true,
        color: g.color,
        data: years.map(year => groupAvg(year, g.filter)),
      });
    }

    // Y축 auto range
    if (AppState.dept.yMin === null && AppState.dept.yMax === null) {
      const vals = series.flatMap(s => s.data).filter(v => v != null && !isNaN(v));
      if (vals.length) {
        const dataMin = Math.min(...vals), dataMax = Math.max(...vals);
        const span = dataMax - dataMin || dataMax * 0.2 || 10;
        const pad = span * 0.5;
        const mag = Math.pow(10, Math.floor(Math.log10(span)) - 1);
        AppState.dept.yMin = Math.round(Math.max(0, Math.floor((dataMin - pad) / mag) * mag));
        AppState.dept.yMax = Math.round(Math.ceil((dataMax + pad) / mag) * mag);
        document.getElementById('trend-ymin').value = AppState.dept.yMin;
        document.getElementById('trend-ymax').value = AppState.dept.yMax;
      }
    }

    // 차트 렌더
    if (!this._trendChart && chartEl) {
      this._trendChart = echarts.init(chartEl);
    }
    if (this._trendChart) {
      this._trendChart.setOption({
        tooltip: {
          trigger: 'axis', axisPointer: { type: 'cross' },
          formatter(params) {
            let html = `<b>${params[0].axisValue}년</b><br>`;
            params.forEach(p => { if (p.value != null) html += `${p.marker}${p.seriesName}: <b>${fmt(p.value)}</b><br>`; });
            return html;
          },
        },
        legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } },
        grid: { top: 40, right: 40, bottom: 55, left: 72 },
        toolbox: { feature: { saveAsImage: { title: '이미지 저장' } }, right: 8, top: 0 },
        xAxis: { type: 'category', data: years.map(String), axisLabel: { formatter: v => `${v}년` } },
        yAxis: {
          type: 'value', name: label, nameLocation: 'middle', nameGap: 50,
          nameTextStyle: { fontSize: 13 },
          axisLabel: { formatter: v => Utils.formatValue(Math.round(v), unit, 0) },
          min: AppState.dept.yMin ?? undefined,
          max: AppState.dept.yMax ?? undefined,
        },
        series: series.map(s => ({
          name: s.name, type: 'line', data: s.data, connectNulls: false,
          lineStyle: { width: s.isOurs ? 3 : 1.5, type: s.isGroup ? 'dashed' : 'solid', color: s.color },
          itemStyle: { color: s.color },
          symbol: s.isOurs ? 'circle' : 'emptyCircle', symbolSize: s.isOurs ? 7 : 5,
          label: s.isOurs ? { show: true, position: 'top', fontSize: 12, color: ourColor, formatter: p => p.value != null ? fmt(p.value) : '' } : { show: false },
        })),
      }, true);
    }

    // 요약 테이블
    if (tableEl) {
      const headers = ['<th></th>', ...years.map(y => `<th>${y}년</th>`)].join('');
      const trows = series.map(s =>
        `<tr class="${s.isOurs ? 'our-row' : ''}"><td>${s.name}</td>${s.data.map(v => `<td>${v != null ? fmt(v) : '-'}</td>`).join('')}</tr>`
      ).join('');
      tableEl.innerHTML = `<table class="trend-summary-table" style="min-width:max-content;"><thead><tr>${headers}</tr></thead><tbody>${trows}</tbody></table>`;
    }
  },

  /* 연도 체크박스 렌더 (dept 추이 전용) */
  _updateDeptYearChecks(allYears) {
    const container = document.getElementById('trend-year-checks');
    if (!container) return;
    const sel = AppState.dept.selectedYears;
    // 처음 진입이면 전체 선택
    if (sel.size === 0) allYears.forEach(y => sel.add(y));
    container.innerHTML = [...allYears].sort((a, b) => b - a).map(y => {
      const checked = sel.has(y);
      return `<label class="trend-check-item${checked ? ' is-checked' : ''}" style="--dot-color:var(--sidebar-text)"><input type="checkbox" data-year="${y}"${checked ? ' checked' : ''}><span class="chk-dot"></span>${y}년</label>`;
    }).join('');
  },
};

/* 헬퍼 — dept 빈 상태 HTML */
function _deptEmptyState(title, desc) {
  return `<div class="empty-state" style="padding:48px 24px;">
    <div class="empty-icon">🔬</div>
    <div class="empty-title">${title}</div>
    <div class="empty-desc">${desc}</div>
  </div>`;
}
