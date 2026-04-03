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
    this.render();
  },

  /* 계열 필터 변경 시 호출 */
  onDeptChange(val) {
    AppState.dept.계열 = val;
    this.render();
  },

  /* ── 학과 필드명 자동 감지 ── */
  _detectDeptField(sampleRow) {
    if (!sampleRow) return null;
    return Object.keys(sampleRow).find(k => k.includes('학과') && k.includes('모집단위'))
        || Object.keys(sampleRow).find(k => k.startsWith('학과'));
  },

  /* ── 계열 필터 적용된 항목데이터 반환 ── */
  _getFilteredItemData() {
    const data  = AppState.raw.항목데이터;
    if (!data?.length) return [];
    const 계열  = AppState.dept.계열;
    if (!계열) return data;                    // 전체 계열: 필터 없음
    const deptMap = AppState.dept.deptMap;
    if (!deptMap) return data;
    const field = this._detectDeptField(data[0]);
    if (!field) return data;
    return data.filter(r => deptMap.get((r[field] || '').trim()) === 계열);
  },

  /* 특정 연도의 대학별 계열 지표값 계산 */
  _computeRows(year, filteredData) {
    if (!filteredData.length) return [];
    const aggregated = DataService.aggregateByUniv(filteredData, year);
    const calcRules  = AppState.raw.calcRules;
    const indicatorKey = AppState.filters.항목키;
    return aggregated.map(row => {
      const calc = applyCalcToRow(row, calcRules, filteredData, year);
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

    const rows     = this._computeRows(year, filteredData);
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
    let merged = rows.map(r => ({
      ...r,
      ...(metaMap.get(r.기준대학명) || {}),
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

    // 테이블 (최대 100행)
    const topRows = merged.slice(0, 100);
    const tbodyHtml = topRows.map(r => {
      const val = Utils.formatValue(r[indicatorKey], unit, dp);
      const cls = r._isOurs ? 'our-row' : '';
      return `<tr class="${cls}">
        <td style="text-align:center;color:var(--text-muted);font-size:12px;">${r._rank}</td>
        <td><strong>${r.기준대학명}</strong></td>
        <td>${r.지역 || ''}</td>
        <td>${r.설립구분 || ''}</td>
        <td style="text-align:right;font-weight:600;">${val}</td>
      </tr>`;
    }).join('');

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

    // 모든 연도 추출
    const allYearsRaw = [...new Set(filteredData.map(r => {
      const y = r['기준연도'] ?? r['공시연도'] ?? r['연도'];
      return y != null ? +y : null;
    }).filter(y => y != null))].sort((a, b) => a - b);

    if (!allYearsRaw.length) {
      if (chartEl) chartEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);">연도 데이터가 없습니다.</div>';
      return;
    }

    // 연도별 우리 대학 지표값
    const ourSeries = allYearsRaw.map(year => {
      const rows = this._computeRows(year, filteredData);
      const ourRow = rows.find(r => r.기준대학명 === OUR_UNIV);
      const v = ourRow?.[indicatorKey];
      return (v != null && !isNaN(v)) ? +v.toFixed(2) : null;
    });

    // 연도별 전국 평균 (benchmarkCache 기준 — 학교 단위)
    const cache = AppState.raw.benchmarkCache;
    const natSeries = allYearsRaw.map(year => {
      const rows = this._computeRows(year, filteredData);
      const vals = rows.filter(r => !r._isOurs).map(r => r[indicatorKey]).filter(v => v != null && !isNaN(v));
      if (!vals.length) return null;
      const clean = BenchmarkUtils.sigmaFilter(vals);
      return clean.length ? +(clean.reduce((a, b) => a + b, 0) / clean.length).toFixed(2) : null;
    });

    const { unit, decimal_places: dp } = getIndicatorMeta(indicatorKey);
    const label = AppState.raw.calcRules[indicatorKey]?.label || indicatorKey;
    const 계열Label = AppState.dept.계열 || '전체';
    const fmt = v => Utils.formatValue(+v, unit, dp);
    const ourColor = cssVar('--our-color');
    const natColor = cssVar('--trend-national');

    const series = [
      { name: OUR_UNIV,  isOurs: true, color: ourColor, data: ourSeries },
      { name: `${계열Label} 평균`, isGroup: true, color: natColor, data: natSeries },
    ];

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
        xAxis: { type: 'category', data: allYearsRaw.map(String), axisLabel: { formatter: v => `${v}년` } },
        yAxis: {
          type: 'value', name: label, nameLocation: 'middle', nameGap: 50,
          nameTextStyle: { fontSize: 13 },
          axisLabel: { formatter: v => Utils.formatValue(Math.round(v), unit, 0) },
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
      const headers = ['<th></th>', ...allYearsRaw.map(y => `<th>${y}년</th>`)].join('');
      const trows = series.map(s =>
        `<tr class="${s.isOurs ? 'our-row' : ''}"><td>${s.name}</td>${s.data.map(v => `<td>${v != null ? fmt(v) : '-'}</td>`).join('')}</tr>`
      ).join('');
      tableEl.innerHTML = `<table class="trend-summary-table" style="min-width:max-content;"><thead><tr>${headers}</tr></thead><tbody>${trows}</tbody></table>`;
    }
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
