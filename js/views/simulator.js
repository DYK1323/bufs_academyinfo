'use strict';

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
