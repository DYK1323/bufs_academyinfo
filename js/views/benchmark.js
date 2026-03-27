'use strict';


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

    // 선택 연도로 필터 — 없으면 캐시 최신 연도 사용
    const selectedYear = AppState.filters.연도;
    const years = [...new Set(cache.map(r => r.공시연도))].sort((a, b) => b - a);
    const year = selectedYear && years.includes(selectedYear) ? selectedYear : years[0];
    const yearCache = cache.filter(r => r.공시연도 === year);

    const indicators = BenchmarkUtils.getIndicators(yearCache[0] || cache[0]);
    const ourRow = yearCache.find(r => r.기준대학명 === OUR_UNIV);
    if (!ourRow) return;

    // calc_rules에서 indicator_id → sort_asc 맵
    const sortAscMap = new Map(
      Object.entries(AppState.raw.calcRules).map(([id, r]) => [id, r.sort_asc === true])
    );

    this._renderCompTable(indicators, ourRow, yearCache, sortAscMap);
    this._renderGapChart(indicators, ourRow, yearCache, sortAscMap);
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

    const validGaps = gaps.filter(v => v != null);
    const minGap = validGaps.length ? Math.min(...validGaps) : 0;
    const maxGap = validGaps.length ? Math.max(...validGaps) : 0;
    const range  = (maxGap - minGap) || 1;
    const xMin   = minGap < 0 ? minGap - range * 0.28 : undefined;
    const xMax   = maxGap > 0 ? maxGap + range * 0.22 : undefined;

    this._gapChart.setOption({
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter(params) {
          const p = params[0];
          if (p.value == null) return p.axisValue;
          return `<b>${p.axisValue}</b><br>${p.marker}${p.seriesName}: <b>${p.value > 0 ? '+' : ''}${p.value}</b>`;
        },
      },
      grid: { top: 10, right: 80, bottom: 30, left: 10, containLabel: true },
      xAxis: { type: 'value', min: xMin, max: xMax, axisLabel: { formatter: v => v > 0 ? '+' + v : String(v) } },
      yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 11, width: 120, overflow: 'truncate' } },
      series: [{
        name: seriesLabel, type: 'bar',
        data: gaps.map((value, i) => ({
          value,
          label: {
            show: true,
            position: value != null && value >= 0 ? 'right' : 'left',
            distance: 6,
            formatter: value != null ? fmtGap(value, indicators[i]) : '',
            color: '#000000', fontSize: 12, fontWeight: 'bold',
          },
        })),
        barMaxWidth: '70%',
        itemStyle: { color: p => isGood(p.value, indicators[p.dataIndex]) ? '#3b82f6' : '#ef4444' },
      }],
    }, true);
  },
};

/* ═══════════════════════════════════════════════════════
   ScatterView — 산포도 (benchmarkCache 기반)
═══════════════════════════════════════════════════════ */
const ScatterView = {
  _chart: null,

  _filterCache() {
    const cache = AppState.raw.benchmarkCache || [];
    const s = AppState.scatter;
    return cache.filter(r => {
      if (!BenchmarkUtils.baseFilter(r)) return false;
      if (s.설립 === '사립' && r.설립구분 !== '사립') return false;
      if (s.지역 === '비수도권' && METRO.has(r.지역)) return false;
      if (s.지역 === '동남권' && !DONGNAM.has(r.지역)) return false;
      if (s.지역 === '부산' && r.지역 !== '부산') return false;
      return true;
    });
  },

  activate() {
    const cache = AppState.raw.benchmarkCache;
    const el = document.getElementById('scatter-main-chart');
    if (!cache || !cache.length) {
      if (el) el.innerHTML = '<div class="trend-empty">벤치마크 캐시가 없습니다. 관리자 페이지에서 생성해 주세요.</div>';
      return;
    }

    // X/Y 셀렉트 옵션 채우기
    const calcRules = AppState.raw.calcRules;
    const opts = '<option value="">항목 선택</option>' +
      Object.entries(calcRules)
        .filter(([, r]) => r.visible)
        .map(([key, r]) => `<option value="${key}">${r.label || key}</option>`)
        .join('');
    document.getElementById('scatter-x').innerHTML = opts;
    document.getElementById('scatter-y').innerHTML = opts;

    // 연도 셀렉트 채우기
    const years = [...new Set(cache.map(r => r.공시연도))].sort((a, b) => b - a);
    document.getElementById('scatter-year').innerHTML =
      years.map(y => `<option value="${y}">${y}년</option>`).join('');

    // 기존 선택값 복원
    if (AppState.scatter.xKey) document.getElementById('scatter-x').value = AppState.scatter.xKey;
    if (AppState.scatter.yKey) document.getElementById('scatter-y').value = AppState.scatter.yKey;
    if (AppState.scatter.연도) document.getElementById('scatter-year').value = AppState.scatter.연도;
    else AppState.scatter.연도 = years[0];

    this.render();
    if (this._chart) setTimeout(() => this._chart.resize(), 60);
  },

  render() {
    const xKey = document.getElementById('scatter-x')?.value;
    const yKey = document.getElementById('scatter-y')?.value;
    const year = parseInt(document.getElementById('scatter-year')?.value);
    AppState.scatter.xKey = xKey || null;
    AppState.scatter.yKey = yKey || null;
    AppState.scatter.연도 = year || null;

    const parseRange = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? null : v; };
    AppState.scatter.xMin = parseRange('scatter-x-min');
    AppState.scatter.xMax = parseRange('scatter-x-max');
    AppState.scatter.yMin = parseRange('scatter-y-min');
    AppState.scatter.yMax = parseRange('scatter-y-max');

    const el = document.getElementById('scatter-main-chart');
    if (!el) return;

    const msgEl = document.getElementById('scatter-msg') || (() => {
    const d = document.createElement('div');
    d.id = 'scatter-msg';
    d.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;';
    el.style.position = 'relative';
    el.appendChild(d);
    return d;
    })();

    if (!xKey || !yKey) {
      msgEl.innerHTML = '<div class="trend-empty">X축과 Y축 항목을 선택하세요.</div>';
      if (this._chart) this._chart.clear();
      return;
    }
    if (xKey === yKey) {
      msgEl.innerHTML = '<div class="trend-empty">X축과 Y축에 서로 다른 항목을 선택하세요.</div>';
      if (this._chart) this._chart.clear();
      return;
    }

    // 정상 렌더 시 메시지 숨기기
    msgEl.innerHTML = '';

    const filtered = this._filterCache().filter(r => (r.공시연도) === year);
    if (!filtered.length) {
      msgEl.innerHTML = '<div class="trend-empty">조건에 해당하는 데이터가 없습니다.</div>';
      if (this._chart) this._chart.clear();
      return;
    }

    const xLabel = AppState.raw.calcRules[xKey]?.label || xKey;
    const yLabel = AppState.raw.calcRules[yKey]?.label || yKey;
    const xUnit  = AppState.raw.calcRules[xKey]?.unit || '';
    const yUnit  = AppState.raw.calcRules[yKey]?.unit || '';
    const xDp    = AppState.raw.calcRules[xKey]?.decimal_places ?? 1;
    const yDp    = AppState.raw.calcRules[yKey]?.decimal_places ?? 1;

    const data = filtered
      .map(r => [r[xKey], r[yKey], r.기준대학명, r.대학구분])
      .filter(([x, y]) => x != null && y != null);

    // 평균선 계산
    const xs = data.map(d => d[0]);
    const ys = data.map(d => d[1]);
    const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;

    if (!this._chart) this._chart = echarts.init(el);

    this._chart.setOption({
      tooltip: {
        formatter: p => {
          if (!p.data?.value) return '';
          const [x, y, name] = p.data.value;
          return `<b>${name}</b><br>${xLabel}: <b>${x?.toFixed(xDp)}${xUnit}</b><br>${yLabel}: <b>${y?.toFixed(yDp)}${yUnit}</b>`;
        },
      },
      grid: { top: 40, right: 40, bottom: 60, left: 70 },
      xAxis: {
        type: 'value', name: xLabel, nameLocation: 'middle', nameGap: 35,
        nameTextStyle: { fontSize: 11 },
        axisLabel: { formatter: v => v.toFixed(xDp) + xUnit, fontSize: 11 },
        splitLine: { lineStyle: { type: 'dashed', color: cssVar('--border') } },
        ...(AppState.scatter.xMin != null ? { min: AppState.scatter.xMin } : {}),
        ...(AppState.scatter.xMax != null ? { max: AppState.scatter.xMax } : {}),
      },
      yAxis: {
        type: 'value', name: yLabel, nameLocation: 'middle', nameGap: 50,
        nameTextStyle: { fontSize: 11 },
        axisLabel: { formatter: v => v.toFixed(yDp) + yUnit, fontSize: 11 },
        splitLine: { lineStyle: { type: 'dashed', color: cssVar('--border') } },
        ...(AppState.scatter.yMin != null ? { min: AppState.scatter.yMin } : {}),
        ...(AppState.scatter.yMax != null ? { max: AppState.scatter.yMax } : {}),
      },
      series: [
        // 일반 대학
        {
          type: 'scatter',
          data: data.filter(d => d[2] !== OUR_UNIV).map(d => ({
            value: [d[0], d[1], d[2]],
            symbolSize: 8,
            itemStyle: { color: cssVar('--text-muted'), opacity: 0.6 },
          })),
          emphasis: {
            label: { show: true, formatter: p => p.data.value[2], position: 'top', fontSize: 11 },
          },
        },
        // 우리 대학
        {
          type: 'scatter',
          data: data.filter(d => d[2] === OUR_UNIV).map(d => ({
            value: [d[0], d[1], d[2]],
            symbolSize: 13,
            itemStyle: { color: cssVar('--our-color'), borderColor: '#fff', borderWidth: 2 },
            label: {
              show: true, formatter: OUR_UNIV.replace('대학교', ''),
              position: 'top', fontSize: 12, fontWeight: 700, color: cssVar('--our-color'),
            },
          })),
          z: 10,
        },
        // X 평균선
        {
          type: 'line',
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { type: 'dashed', color: cssVar('--border-mid'), width: 1 },
            data: [{ xAxis: avgX }, { yAxis: avgY }],
            label: {
              formatter: p => p.name === 'xAxis'
                ? `평균 ${avgX.toFixed(xDp)}${xUnit}`
                : `평균 ${avgY.toFixed(yDp)}${yUnit}`,
              fontSize: 10, color: cssVar('--text-muted'),
            },
          },
          data: [],
        },
      ],
    }, true);
  },
};