'use strict';

/* ══════════════════════════════════════════
   데이터 조회
══════════════════════════════════════════ */
const DataViewer = {
  _items: [],       // manifest 항목 목록
  _raw: [],         // 로드된 원시 데이터
  _filtered: [],    // 필터 적용 후
  _cols: [],        // 표시 컬럼 키 목록
  _page: 1,
  PAGE_SIZE: 50,
  META_COLS: ['기준연도','대학명','학교','설립구분','지역','학교종류','대학구분','본분교','캠퍼스','상태'],

  init() {
    if (!State.dataFiles?.length) {
      document.getElementById('dv-body').innerHTML = '<div class="dv-empty">먼저 GitHub에 연결하세요.</div>';
      return;
    }
    // manifest에서 소스→지표 라벨 매핑 구성 (라벨 힌트용)
    const sourceToLabel = new Map();
    for (const m of (State.original.manifest || [])) {
      const src = m.sources?.[0] || m.source || '';
      if (src) sourceToLabel.set(src, State.original.calc?.[m.indicator]?.label || m.indicator);
    }
    // data/ 폴더의 모든 원시 데이터 파일을 항목으로 구성
    this._items = State.dataFiles.map(f => ({ key: f, label: sourceToLabel.get(f) || '' }));
    this._buildDropdown('');
  },

  _buildDropdown(q) {
    const dd = document.getElementById('dv-dropdown');
    const filtered = q
      ? this._items.filter(m => m.label.includes(q) || m.key.includes(q))
      : this._items;
    dd.innerHTML = filtered.map(m =>
      `<div class="dv-dd-item" onmousedown="DataViewer.selectItem('${esc(m.key)}','${esc(m.label)}')">${esc(m.key)}<span style="margin-left:6px;font-size:11px;color:var(--text-muted);">${esc(m.label)}</span></div>`
    ).join('') || '<div class="dv-dd-item" style="color:var(--text-muted)">검색 결과 없음</div>';
  },

  filterDropdown(q) { this._buildDropdown(q); this.openDropdown(); },
  openDropdown()  { document.getElementById('dv-dropdown').classList.add('open'); },
  closeDropdown() { document.getElementById('dv-dropdown').classList.remove('open'); },

  async selectItem(key, label) {
    document.getElementById('dv-item-input').value = key;
    this.closeDropdown();
    document.getElementById('dv-body').innerHTML = '<div class="dv-empty">데이터 로딩 중…</div>';
    document.getElementById('dv-count').textContent = '';
    try {
      const data = await this._fetchLarge(`data/${key}.json`);
      this._raw = Array.isArray(data) ? data : [];
      this._buildCols();
      this._buildFilterOptions();
      this.applyFilter();
    } catch(e) {
      document.getElementById('dv-body').innerHTML = `<div class="dv-empty" style="color:#dc2626;">로드 실패: ${esc(e.message)}</div>`;
    }
  },

  async _fetchLarge(path) {
    // 슬래시는 경로 구분자로 유지하고 각 세그먼트만 인코딩
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const metaRes = await fetch(
      `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encodedPath}`,
      { headers: GH.headers() }
    );
    if (!metaRes.ok) throw new Error(`${metaRes.status} — ${path}`);
    const meta = await metaRes.json();
    if (meta.content) {
      return JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\n/g,'')))));
    }
    // 1MB 초과: git blobs API (raw)
    const blobRes = await fetch(
      `https://api.github.com/repos/${GH.owner}/${GH.repo}/git/blobs/${meta.sha}`,
      { headers: { ...GH.headers(), Accept: 'application/vnd.github.raw+json' } }
    );
    if (!blobRes.ok) throw new Error(`blob ${blobRes.status}`);
    return await blobRes.json();
  },

  _buildCols() {
    if (!this._raw.length) { this._cols = []; return; }
    // 앞뒤 100개씩 샘플링 — 연도 경계의 신규 필드를 포착하면서 전체 순회 부하 방지
    const sample = this._raw.length <= 200
      ? this._raw
      : [...this._raw.slice(0, 100), ...this._raw.slice(-100)];
    const allKeys = new Set();
    for (const r of sample) for (const k of Object.keys(r)) allKeys.add(k);
    const meta = this.META_COLS.filter(c => allKeys.has(c));
    const rest = [...allKeys].filter(c => !this.META_COLS.includes(c));
    this._cols = [...meta, ...rest];
  },

  _buildFilterOptions() {
    const years  = [...new Set(this._raw.map(r => r['기준연도']).filter(Boolean))].sort((a,b)=>b-a);
    const setups = [...new Set(this._raw.map(r => r['설립구분']).filter(Boolean))].sort();
    const regions= [...new Set(this._raw.map(r => r['지역']).filter(Boolean))].sort();

    const fill = (id, vals) => {
      const el = document.getElementById(id);
      const cur = el.value;
      el.innerHTML = `<option value="">${el.options[0].text}</option>` +
        vals.map(v => `<option value="${esc(v)}"${v==cur?'selected':''}>${esc(v)}</option>`).join('');
    };
    fill('dv-flt-year',  years);
    fill('dv-flt-setup', setups);
    fill('dv-flt-region',regions);
    document.getElementById('dv-flt-univ').value = '';
  },

  applyFilter() {
    const year  = document.getElementById('dv-flt-year').value;
    const setup = document.getElementById('dv-flt-setup').value;
    const region= document.getElementById('dv-flt-region').value;
    const univ  = document.getElementById('dv-flt-univ').value.trim();

    this._filtered = this._raw.filter(r => {
      if (year   && String(r['기준연도']) !== year) return false;
      if (setup  && r['설립구분'] !== setup) return false;
      if (region && r['지역'] !== region) return false;
      if (univ) {
        const name = r['대학명'] || r['학교'] || '';
        if (!name.includes(univ)) return false;
      }
      return true;
    });
    this._page = 1;
    this._render();
  },

  _render() {
    const total = this._filtered.length;
    const totalPages = Math.ceil(total / this.PAGE_SIZE) || 1;
    this._page = Math.min(Math.max(this._page, 1), totalPages);
    document.getElementById('dv-count').textContent = total
      ? `${total.toLocaleString()}행 (${this._page}/${totalPages} 페이지)`
      : '';

    if (!total) {
      document.getElementById('dv-body').innerHTML = '<div class="dv-empty">조건에 맞는 데이터가 없습니다.</div>';
      return;
    }

    const start = (this._page - 1) * this.PAGE_SIZE;
    const pageRows = this._filtered.slice(start, start + this.PAGE_SIZE);

    const thead = this._cols.map(c => `<th>${esc(c)}</th>`).join('');
    const tbody = pageRows.map(r => {
      const isOur = (r['대학명'] || r['학교'] || '') === OUR_UNIV;
      const cells = this._cols.map(c => {
        const v = r[c];
        return `<td>${v == null ? '' : esc(String(v))}</td>`;
      }).join('');
      return `<tr${isOur ? ' class="dv-our"' : ''}>${cells}</tr>`;
    }).join('');

    // 페이지 컨트롤 생성
    const mkBtn = (p, label, cur) =>
      `<button class="dv-page-btn${cur ? ' cur' : ''}" onclick="DataViewer._goPage(${p})">${label}</button>`;
    const pageButtons = [];
    if (this._page > 1) pageButtons.push(mkBtn(this._page - 1, '‹ 이전', false));
    const lo = Math.max(1, this._page - 2), hi = Math.min(totalPages, this._page + 2);
    for (let p = lo; p <= hi; p++) pageButtons.push(mkBtn(p, p, p === this._page));
    if (this._page < totalPages) pageButtons.push(mkBtn(this._page + 1, '다음 ›', false));
    const pager = totalPages > 1
      ? `<div class="dv-pagination">${pageButtons.join('')}</div>` : '';

    document.getElementById('dv-body').innerHTML = `
      <div class="dv-table-wrap">
        <table class="dv-table">
          <thead><tr>${thead}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>${pager}`;
    const wrap = document.querySelector('#dv-body .dv-table-wrap');
    if (wrap) {
      const top = wrap.getBoundingClientRect().top;
      wrap.style.maxHeight = (window.innerHeight - top - 8) + 'px';
    }
  },

  _goPage(p) { this._page = p; this._render(); },
};
