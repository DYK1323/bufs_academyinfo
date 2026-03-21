'use strict';

/* ═══════════════════════════════════════════════════════
   RadarView — 다지표 레이더 차트 (benchmarkCache 기반)
═══════════════════════════════════════════════════════ */
const RadarView = {
  _chart: null,

  _filterCache() {
    return (AppState.raw.benchmarkCache || []).filter(r => BenchmarkUtils.baseFilter(r));
  },

  activate() {
    const cache = AppState.raw.benchmarkCache;
    const emptyEl = document.getElementById('radar-chart');
    if (!cache || !cache.length) {
      if (emptyEl) emptyEl.innerHTML = '<div class="trend-empty">벤치마크 캐시가 없습니다. 관리자 페이지에서 생성해 주세요.</div>';
      return;
    }
    const names = [...new Set(cache.map(r => r.기준대학명))].sort();
    BenchmarkUtils.populateDatalist('radar-univ-list', names);
    this.render();
    if (this._chart) setTimeout(() => this._chart.resize(), 60);
  },

  render() {
    const cache = AppState.raw.benchmarkCache || [];
    if (!cache.length) return;
    const indicators = BenchmarkUtils.getIndicators(cache[0]);
    if (!indicators.length) return;
    const filteredAll = this._filterCache();

    // min-max 정규화
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

    const series = [];
    const CUSTOM_COLORS = getCustomColors();
    const ourColor = cssVar('--our-color');

    const ourRow = cache.find(r => r.기준대학명 === OUR_UNIV);
    if (ourRow) {
      series.push({ name: OUR_UNIV, isOurs: true, color: ourColor, values: indicators.map(ind => normalize(ourRow[ind], ind)) });
    }

    AppState.radar.customUnivs.forEach((name, idx) => {
      const row = cache.find(r => r.기준대학명 === name);
      if (!row) return;
      series.push({ name, color: CUSTOM_COLORS[idx % CUSTOM_COLORS.length], values: indicators.map(ind => normalize(row[ind], ind)) });
    });

    if (AppState.radar.groups.has('동남권')) {
      const rows = filteredAll.filter(r => DONGNAM.has(r.지역));
      const avg = BenchmarkUtils.groupAvgMulti(rows, indicators);
      series.push({ name: '동남권 평균', isDashed: true, color: cssVar('--trend-dongnam'), values: indicators.map(ind => normalize(avg[ind], ind)) });
    }
    if (AppState.radar.groups.has('전국 사립')) {
      const rows = filteredAll.filter(r => r.설립구분 === '사립');
      const avg = BenchmarkUtils.groupAvgMulti(rows, indicators);
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

  _filteredForGap(cache) {
    const { gapFound, gapRegion } = AppState.benchmark;
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

    const nameEl = document.getElementById('bench-our-name');
    if (nameEl) nameEl.textContent = OUR_UNIV;

    const names = [...new Set(cache.map(r => r.기준대학명))].filter(n => n !== OUR_UNIV).sort();
    BenchmarkUtils.populateDatalist('bench-univ-list', names);

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
    const indicators = BenchmarkUtils.getIndicators(cache[0]);
    const ourRow = cache.find(r => r.기준대학명 === OUR_UNIV);
    if (!ourRow) return;

    // calc_rules에서 indicator_id → sort_asc 맵
    const sortAscMap = new Map(
      Object.entries(AppState.raw.calcRules).map(([id, r]) => [id, r.sort_asc === true])
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
      const sortAsc = sortAscMap.get(ind) ?? false;

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
      const avg = BenchmarkUtils.groupAvg(groupRows, ind);
      if (avg == null || ourRow[ind] == null) return null;
      return +(ourRow[ind] - avg).toFixed(2);
    });

    const isGood = (gap, ind) => {
      if (gap == null) return false;
      return sortAscMap.get(ind) ? gap <= 0 : gap >= 0;
    };

    const fmtGap = (v, ind) => {
      if (v == null) return '';
      const unit = AppState.raw.calcRules[ind]?.unit || '';
      return (v > 0 ? '+' : '') + v.toFixed(1) + unit;
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
    return cache.filter(r => {
      if (!BenchmarkUtils.baseFilter(r)) return false;
      if (h.설립 === '사립' && r.설립구분 !== '사립') return false;
      if (h.region === '비수도권' && METRO.has(r.지역)) return false;
      if (h.region === '동남권' && !DONGNAM.has(r.지역)) return false;
      return true;
    });
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
    const indicators = BenchmarkUtils.getIndicators(filtered[0]);
    if (indicators.length < 2) return;

    const labels = indicators.map(ind => AppState.raw.calcRules[ind]?.label || ind);

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

    this._scatter.setOption({
      tooltip: { formatter: p => `${p.data[2]}<br>${xLabel}: ${p.data[0]?.toFixed(1)}<br>${yLabel}: ${p.data[1]?.toFixed(1)}` },
      grid: { top: 20, right: 20, bottom: 50, left: 70 },
      xAxis: { type: 'value', name: xLabel, nameLocation: 'middle', nameGap: 30 },
      yAxis: { type: 'value', name: yLabel, nameLocation: 'middle', nameGap: 50 },
      series: [{
        type: 'scatter',
        data: data.map(d => ({ value: [d[0], d[1]], name: d[2], itemStyle: { color: d[2] === OUR_UNIV ? cssVar('--our-color') : '#94a3b8', opacity: 0.7 } })),
        symbolSize: 8,
      }],
    }, true);
    setTimeout(() => this._scatter.resize(), 60);
  },
};
