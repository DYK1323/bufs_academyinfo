'use strict';

/* ═══════════════════════════════════════════════════════
   TrendView — 색상은 모두 CSS 변수에서 읽어옴
═══════════════════════════════════════════════════════ */
const TREND_GROUPS = {
  '전국 평균': () => true,
  '전국 사립': r => r.설립구분 === '사립',
  '비수도권':  r => r.수도권여부 === 'N',
  '동남권':    r => DONGNAM.has(r.지역),
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
    const clean = BenchmarkUtils.sigmaFilter(vals);
    return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
  },
  buildAllYears() {
    const cache = AppState.raw.benchmarkCache;
    const rankKey = AppState.computed.rankKey;
    if (!cache?.length || !rankKey) return;
    const years = [...new Set(cache.filter(r => r[rankKey] != null).map(r => r.기준연도))].sort((a, b) => a - b);
    const allYears = new Map();
    for (const year of years) {
      allYears.set(year, cache.filter(r => r.기준연도 === year).map(r => ({ ...r, _isOurs: r.기준대학명 === OUR_UNIV })));
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
    const trendUnit = getIndicatorMeta(rankKey).unit;
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
    const dp = getIndicatorMeta(AppState.computed.rankKey).decimal_places;
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
    const dp = getIndicatorMeta(AppState.computed.rankKey).decimal_places;
    const fmt = v => Utils.formatValue(+v, unit, dp);
    const headers = ['<th></th>', ...years.map(y=>`<th>${y}년</th>`)].join('');
    const rows = series.map(s => `<tr class="${s.isOurs?'our-row':''}"><td>${s.name}</td>${s.data.map(v=>`<td>${v!=null?fmt(v):'-'}</td>`).join('')}</tr>`).join('');
    wrap.innerHTML = `<table class="trend-summary-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  },
  activate() {
    if (!AppState.filters.항목키) {
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

  _renderGraphicLabels() {
    if (!this._chart || !this._labelData) return;
    const { series, firstYearIdx, lastYearIdx, firstRankMap, lastRankMap, years } = this._labelData;

    const leftX  = this._chart.convertToPixel({ xAxisIndex: 0 }, String(years[firstYearIdx]));
    const rightX = this._chart.convertToPixel({ xAxisIndex: 0 }, String(years[lastYearIdx]));
    if (leftX == null || rightX == null) return;

    const GAP = 12;
    const graphics = [];

    series.forEach(s => {
      const fv = s.data[firstYearIdx];
      if (fv != null && firstRankMap.get(fv)?.name === s.name) {
        const py = this._chart.convertToPixel({ yAxisIndex: 0 }, fv);
        if (py != null) graphics.push({
          type: 'text', x: leftX - GAP, y: py, silent: true,
          style: { text: `${fv}. ${s.name}`, textAlign: 'right', textVerticalAlign: 'middle', fill: s.color, fontSize: 10, fontWeight: s.isOurs ? 700 : 400 },
        });
      }
      const lv = s.data[lastYearIdx];
      if (lv != null && lastRankMap.get(lv)?.name === s.name) {
        const py = this._chart.convertToPixel({ yAxisIndex: 0 }, lv);
        if (py != null) graphics.push({
          type: 'text', x: rightX + GAP, y: py, silent: true,
          style: { text: `${lv}. ${s.name}`, textAlign: 'left', textVerticalAlign: 'middle', fill: s.color, fontSize: 10, fontWeight: s.isOurs ? 700 : 400 },
        });
      }
    });

    this._chart.setOption({ graphic: graphics }, false);
  },

  activate() {
    const chartEl = document.getElementById('bump-chart');
    if (!AppState.filters.항목키) {
      if (chartEl) chartEl.innerHTML = '<div class="trend-empty">공시 항목을 먼저 선택하세요.</div>';
      return;
    }
    if (!AppState.trend.allYears) TrendView.buildAllYears();

    // datalist 채우기 (전체 대학명)
    BenchmarkUtils.populateDatalist('bump-univ-list',
      [...new Set(AppState.computed.aggregated.map(r => r.기준대학명))].sort());

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

    this._renderTags();
    this.render();
  },

  _getDisplayUnivs() {
    // 동남권 기본 대학: 현재 필터 통과 + userRemoved 제외
    const years = [...(AppState.trend.allYears?.keys() || [])].sort((a, b) => a - b);
    const lastYearRows = AppState.trend.allYears?.get(years[years.length - 1]) || [];
    const defaults = lastYearRows
      .filter(r => DONGNAM.has(r.지역) && this._filterRow(r))
      .map(r => r.기준대학명)
      .filter(n => !AppState.bump.userRemoved.includes(n))
      .sort();
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
    return FilterUtils.matchesFilters(r, AppState.filters);
  },

  _buildRankSeries() {
    const allYears = AppState.trend.allYears;
    const rankKey = AppState.computed.rankKey;
    const sortAsc = AppState.raw.calcRules[rankKey]?.sort_asc === true;
    if (!allYears || !rankKey) return { years: [], series: [] };

    const selYears = AppState.bump.selectedYears;
    const years = [...allYears.keys()].sort((a, b) => a - b)
      .filter(y => selYears.size === 0 || selYears.has(y));

    const yearRankMaps = new Map();
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
    }).filter(s => s.data.some(v => v != null));

    return { years, series };
  },

  render() {
    const { years, series } = this._buildRankSeries();
    const el = document.getElementById('bump-chart');
    if (!el) return;
    if (!series.length) { el.innerHTML = '<div class="trend-empty">데이터가 없습니다.</div>'; return; }

    if (!this._chart) this._chart = echarts.init(el);

    const maxRank = Math.max(...series.flatMap(s => s.data.filter(v => v != null)));

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

    this._labelData = { series, firstYearIdx, lastYearIdx, firstRankMap, lastRankMap, years };

    this._chart.setOption({
      graphic: [],
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
      xAxis: { type: 'category', data: years.map(String), axisLabel: { formatter: v => `${v}년` }, boundaryGap: false },
      yAxis: { type: 'value', inverse: true, min: 1, max: maxRank, interval: 1, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
      series: series.map(s => ({
        name: s.name, type: 'line', data: s.data, connectNulls: false, smooth: false,
        lineStyle: { width: s.isOurs ? 3 : 1.5, color: s.color },
        itemStyle: { color: s.color },
        symbol: s.isOurs ? 'circle' : 'emptyCircle', symbolSize: s.isOurs ? 8 : 5,
        z: s.isOurs ? 10 : 1,
        emphasis: { lineStyle: { width: s.isOurs ? 4 : 2 } },
        label: { show: false },
      })),
    }, true);

    requestAnimationFrame(() => this._renderGraphicLabels());
  },
};
