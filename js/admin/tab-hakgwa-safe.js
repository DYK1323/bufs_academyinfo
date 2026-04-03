'use strict';

/* ══════════════════════════════════════════
   탭 6: 학과분류 — 페이지네이션 오버라이드
   (tab-hakgwa.js의 DOM-기반 렌더를 배열+페이지 방식으로 교체)
══════════════════════════════════════════ */

const HakgwaPager = {
  _data: [],       // 전체 데이터 배열 (raw, {학과명, 대계열, 중계열, 비고})
  _filtered: [],   // 검색 필터 적용 후
  _page: 1,
  PAGE_SIZE: 100,
  _dirty: false,   // 편집 중인 행이 있으면 true

  // ── 데이터 초기화 (파일 로드 시) ──
  load(rows) {
    this._data = Array.isArray(rows) ? rows.map(r => ({
      학과명: String(r['학과명'] || '').trim(),
      대계열: String(r['대계열'] || '').trim(),
      중계열: String(r['중계열'] || '').trim(),
      비고:   String(r['비고']   || '').trim(),
    })) : [];
    this._page = 1;
    this._applyFilter();
  },

  // ── 검색 필터 적용 ──
  _applyFilter() {
    const q = (document.getElementById('hk-search-input')?.value || '').trim().toLowerCase();
    this._filtered = q
      ? this._data.filter(r =>
          r.학과명.toLowerCase().includes(q) ||
          r.대계열.toLowerCase().includes(q) ||
          r.중계열.toLowerCase().includes(q)
        )
      : this._data;
    this._page = Math.min(this._page, Math.ceil(this._filtered.length / this.PAGE_SIZE) || 1);
    this._render();
    this._updateCount();
  },

  // ── 현재 페이지 DOM 렌더 ──
  _render() {
    const total = this._filtered.length;
    const totalPages = Math.ceil(total / this.PAGE_SIZE) || 1;
    const start = (this._page - 1) * this.PAGE_SIZE;
    const pageRows = this._filtered.slice(start, start + this.PAGE_SIZE);

    const tbody = document.getElementById('hk-table-body');
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const row of pageRows) {
      frag.appendChild(_createHkRow(row.학과명, row.대계열, row.중계열, row.비고));
    }
    tbody.appendChild(frag);

    // 페이지 컨트롤
    const pagerEl = document.getElementById('hk-pager');
    if (!pagerEl) return;
    if (totalPages <= 1) { pagerEl.innerHTML = ''; return; }

    const mkBtn = (p, label, cur) =>
      `<button class="dv-page-btn${cur ? ' cur' : ''}" onclick="HakgwaPager._goPage(${p})">${label}</button>`;
    const btns = [];
    if (this._page > 1) btns.push(mkBtn(this._page - 1, '‹ 이전', false));
    const lo = Math.max(1, this._page - 2), hi = Math.min(totalPages, this._page + 2);
    for (let p = lo; p <= hi; p++) btns.push(mkBtn(p, p, p === this._page));
    if (this._page < totalPages) btns.push(mkBtn(this._page + 1, '다음 ›', false));
    pagerEl.innerHTML = `<div class="dv-pagination">${btns.join('')}</div>`;
  },

  _goPage(p) {
    // 현재 페이지 편집 내용을 _data에 반영한 뒤 이동
    this._flushEdits();
    this._page = p;
    this._render();
    document.getElementById('hk-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // ── 현재 DOM 편집 내용 → _data 에 반영 ──
  _flushEdits() {
    const q = (document.getElementById('hk-search-input')?.value || '').trim().toLowerCase();
    const start = (this._page - 1) * this.PAGE_SIZE;
    const tbody = document.getElementById('hk-table-body');
    const trs = tbody.querySelectorAll('tr');
    trs.forEach((tr, i) => {
      const dataIdx = this._filtered[start + i] !== undefined
        ? this._data.indexOf(this._filtered[start + i])
        : -1;
      if (dataIdx < 0) return;
      const inputs = tr.querySelectorAll('input');
      const sel    = tr.querySelector('select');
      this._data[dataIdx] = {
        학과명: inputs[0]?.value.trim() || '',
        대계열: sel?.value.trim() || '',
        중계열: inputs[1]?.value.trim() || '',
        비고:   inputs[2]?.value.trim() || '',
      };
    });
    // 필터 재적용 (학과명이 변경될 수 있으므로)
    if (q) {
      this._filtered = this._data.filter(r =>
        r.학과명.toLowerCase().includes(q) ||
        r.대계열.toLowerCase().includes(q) ||
        r.중계열.toLowerCase().includes(q)
      );
    } else {
      this._filtered = this._data;
    }
  },

  // ── 행 추가 (마지막 페이지로 이동) ──
  addRow(학과명 = '', 대계열 = '', 중계열 = '', 비고 = '') {
    this._flushEdits();
    this._data.push({ 학과명, 대계열, 중계열, 비고 });
    this._applyFilter();
    // 마지막 페이지로
    const totalPages = Math.ceil(this._filtered.length / this.PAGE_SIZE) || 1;
    this._page = totalPages;
    this._render();
    this._updateCount();
    // 마지막 행 포커스
    setTimeout(() => {
      const trs = document.getElementById('hk-table-body').querySelectorAll('tr');
      trs[trs.length - 1]?.querySelector('input')?.focus();
    }, 0);
  },

  // ── 행 삭제 (DOM tr 기준으로 _data에서 제거) ──
  deleteRow(btn) {
    this._flushEdits();
    const tr = btn.closest('tr');
    const trs = [...document.getElementById('hk-table-body').querySelectorAll('tr')];
    const domIdx = trs.indexOf(tr);
    const start = (this._page - 1) * this.PAGE_SIZE;
    const dataObj = this._filtered[start + domIdx];
    if (dataObj) {
      const idx = this._data.indexOf(dataObj);
      if (idx >= 0) this._data.splice(idx, 1);
    }
    this._applyFilter();
    setDirty();
  },

  // ── 검색 ──
  filter() {
    this._flushEdits();
    this._page = 1;
    this._applyFilter();
  },

  // ── 카운트 표시 ──
  _updateCount() {
    const q = (document.getElementById('hk-search-input')?.value || '').trim();
    const total = this._data.length;
    const vis   = this._filtered.length;
    const totalPages = Math.ceil(vis / this.PAGE_SIZE) || 1;
    const countEl = document.getElementById('hk-row-count');
    if (!countEl) return;
    if (q) {
      countEl.textContent = `${vis}/${total}건 (${this._page}/${totalPages} 페이지)`;
    } else {
      countEl.textContent = totalPages > 1
        ? `총 ${total}건 (${this._page}/${totalPages} 페이지)`
        : `총 ${total}건`;
    }
    document.getElementById('hk-empty-hint').style.display = total === 0 ? '' : 'none';
  },

  // ── 전체 데이터 수집 (저장 시 호출) ──
  collect() {
    this._flushEdits();
    return this._data
      .filter(r => r.학과명)
      .map(r => {
        const entry = { '학과명': r.학과명, '대계열': r.대계열 };
        if (r.중계열) entry['중계열'] = r.중계열;
        if (r.비고)   entry['비고']   = r.비고;
        return entry;
      });
  },
};

/* ── 행 생성 헬퍼 (내부용) ── */
const _대계열_옵션_SAFE = ['', '인문계열', '사회계열', '교육계열', '공학계열', '자연계열', '의약계열', '예체능계열'];
function _createHkRow(학과명 = '', 대계열 = '', 중계열 = '', 비고 = '') {
  const tr = document.createElement('tr');
  const opts = _대계열_옵션_SAFE.map(v =>
    `<option value="${esc(v)}"${v === 대계열 ? ' selected' : ''}>${v || '(미분류)'}</option>`
  ).join('');
  tr.innerHTML = `
    <td><input class="cell-input" type="text" value="${esc(학과명)}" placeholder="예: 경영학과" oninput="setDirty()"></td>
    <td><select class="cell-input" style="padding:2px 4px;" onchange="setDirty()">${opts}</select></td>
    <td><input class="cell-input" type="text" value="${esc(중계열)}" placeholder="예: 경영·경제" style="width:110px;" oninput="setDirty()"></td>
    <td><input class="cell-input" type="text" value="${esc(비고)}" placeholder="" oninput="setDirty()"></td>
    <td class="td-actions"><button class="btn btn-danger btn-sm" onclick="HakgwaPager.deleteRow(this)">삭제</button></td>
  `;
  return tr;
}

/* ══════════════════════════════════════════
   tab-hakgwa.js 전역 함수 오버라이드
══════════════════════════════════════════ */

renderHakgwaTable = function(rows) {
  HakgwaPager.load(rows);
};

appendHakgwaRow = function(학과명 = '', 대계열 = '', 중계열 = '', 비고 = '') {
  HakgwaPager.addRow(학과명, 대계열, 중계열, 비고);
};

collectHakgwaData = function() {
  return HakgwaPager.collect();
};

filterHakgwaRows = function() {
  HakgwaPager.filter();
};

updateHakgwaCount = function() {
  HakgwaPager._updateCount();
};

deleteHakgwaRow = function(btn) {
  HakgwaPager.deleteRow(btn);
};

addHakgwaRow = function() {
  HakgwaPager.addRow('', '', '', '');
  setDirty();
};

onHakgwaFileLoad = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const text = ev.target.result;
      const data = file.name.toLowerCase().endsWith('.json')
        ? JSON.parse(text)
        : _parseHakgwaCsv(text);
      if (!data.length) throw new Error('데이터가 없습니다.');
      renderHakgwaTable(data);
      setDirty();
    } catch (err) {
      alert(`파일 오류: ${err.message}`);
    }
  };
  reader.readAsText(file, 'utf-8');
  e.target.value = '';
};
