'use strict';

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
    // 위협 레이더 (동기 계산)
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
    const { unit: rankUnit, decimal_places: rankDecimals } = getIndicatorMeta(rankKey);
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
    const manifestItem = AppState.raw.currentManifestItem;
    const columns = manifestItem?.columns
      ? manifestItem.columns.map(c => ({ key: c.key, label: c.label }))
      : (rankKey ? [{ key: rankKey, label: calcRules[rankKey]?.label || rankKey }] : []);
    const formatCell = (key, val) => {
      const rule = calcRules[key];
      // calc_rules에 있는 지표는 정의된 단위·소수점, 없으면 raw 정수 컬럼으로 처리
      const unit = rule?.unit ?? '';
      const decimal_places = rule?.decimal_places ?? 0;
      return Utils.formatValue(val, unit, decimal_places);
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
    thead.onclick = e => { const th = e.target.closest('th.sortable'); if (th) this.onHeaderClick(th.dataset.key); };
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
    pagEl.onclick = e => { const btn = e.target.closest('.page-btn:not(:disabled)'); if (btn) this.onPageChange(parseInt(btn.dataset.page)); };
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
  _rankMaps: null,

  compute() {
    const cache = AppState.raw.benchmarkCache;
    const rankKey = AppState.computed.rankKey;
    if (!cache?.length || !rankKey) return [];

    const sortAsc = AppState.raw.calcRules[rankKey]?.sort_asc === true;
    const currentYear = AppState.filters.연도;
    if (!currentYear) return [];

    // 최근 4개년 연도 목록 (내림차순)
    const allYears = [...new Set(cache.filter(r => r[rankKey] != null && (r.공시연도) <= currentYear).map(r => r.공시연도))]
      .sort((a, b) => b - a).slice(0, 4);
    if (allYears.length < 2) return [];

    // 연도별 → 필터 조건 적용 → rank 부여
    const rankMaps = new Map();
    const f = AppState.filters;
    for (const year of allYears) {
      const yearRows = cache.filter(r => (r.공시연도) === year)
        .map(r => ({ ...r, _isOurs: r.기준대학명 === OUR_UNIV }));
      const filteredAgg = yearRows.filter(r => FilterUtils.matchesFilters(r, f));
      const sorted = [...filteredAgg].sort((a, b) => {
        const av = a[rankKey] ?? (sortAsc ? Infinity : -Infinity);
        const bv = b[rankKey] ?? (sortAsc ? Infinity : -Infinity);
        return sortAsc ? av - bv : bv - av;
      });
      const rMap = new Map();
      sorted.forEach((r, i) => {
        const rank = (i > 0 && sorted[i][rankKey] === sorted[i - 1][rankKey])
          ? rMap.get(sorted[i - 1].기준대학명)
          : i + 1;
        rMap.set(r.기준대학명, rank);
      });
      rankMaps.set(year, rMap);
    }
    this._rankMaps = rankMaps;

    const curRankMap = rankMaps.get(currentYear);
    const ourRank = curRankMap?.get(OUR_UNIV) ?? null;

    // 모멘텀 스코어 계산
    const years = allYears; // 내림차순
    const result = [];
    for (const [univName] of curRankMap) {
      const ranks = years.map(y => rankMaps.get(y)?.get(univName) ?? null);
      const deltas = [];
      for (let i = 0; i < ranks.length - 1; i++) {
        deltas.push(ranks[i] != null && ranks[i + 1] != null ? ranks[i + 1] - ranks[i] : null);
      }
      const weights = [3, 2, 1];
      let score = 0, hasData = false;
      for (let i = 0; i < deltas.length; i++) {
        if (deltas[i] != null) { score += deltas[i] * (weights[i] ?? 1); hasData = true; }
      }
      if (!hasData) score = 0;

      const rankNow = ranks[0];
      const rank3y = ranks[Math.min(3, ranks.length - 1)];
      const delta3y = (rankNow != null && rank3y != null) ? rank3y - rankNow : null;

      let grade, gradeClass;
      const nearUs = ourRank != null && rankNow != null && rankNow <= ourRank + 3;
      if (score >= 4 && nearUs)  { grade = '핵심 위협'; gradeClass = 'threat-core'; }
      else if (score >= 4)       { grade = '잠재 위협'; gradeClass = 'threat-latent'; }
      else if (score >= 1)       { grade = '주시';     gradeClass = 'threat-watch'; }
      else                       { grade = '안정';     gradeClass = 'threat-stable'; }

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
