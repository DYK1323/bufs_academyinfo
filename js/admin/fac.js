'use strict';

/* ══════════════════════════════════════════
   필드 자동완성 (소스별 그룹)
══════════════════════════════════════════ */
let _facDropdown = null;
let _facTarget   = null;

function _facItems(scope) {
  const raw = State.fieldsBySource.flatMap(g => g.fields.map(f => ({ field: f, source: g.source })));
  if (scope === 'all') {
    const calc = Object.keys(calcData).map(k => ({ field: k, source: '계산 지표' }));
    return [...calc, ...raw];
  }
  return raw;
}

function facShow(input) {
  facHide();
  const q = input.value.trim().toLowerCase();
  const scope = input.dataset.fac || 'raw';
  let items = _facItems(scope);
  if (q) items = items.filter(i => i.field.toLowerCase().includes(q) || i.source.toLowerCase().includes(q));
  if (!items.length) return;

  const dd = document.createElement('div');
  dd.className = 'fac-dropdown';

  if (q) {
    // 검색 모드: 플랫 목록 + 소스 힌트
    items.forEach(({ field, source }) => {
      const div = document.createElement('div');
      div.className = 'fac-item';
      const nameSpan = document.createElement('span');
      const idx = field.toLowerCase().indexOf(q);
      nameSpan.innerHTML = idx >= 0
        ? esc(field.slice(0, idx)) + '<mark>' + esc(field.slice(idx, idx + q.length)) + '</mark>' + esc(field.slice(idx + q.length))
        : esc(field);
      const srcSpan = document.createElement('span');
      srcSpan.className = 'fac-source-hint';
      srcSpan.textContent = source;
      div.appendChild(nameSpan);
      div.appendChild(srcSpan);
      div.addEventListener('mousedown', e => { e.preventDefault(); facSelect(input, field); });
      dd.appendChild(div);
    });
  } else {
    // 그룹 모드: 소스별 섹션
    const groups = {};
    items.forEach(({ field, source }) => { (groups[source] ??= []).push(field); });
    for (const [src, fields] of Object.entries(groups)) {
      const lbl = document.createElement('div');
      lbl.className = 'fac-group-label';
      lbl.textContent = src;
      dd.appendChild(lbl);
      fields.forEach(field => {
        const div = document.createElement('div');
        div.className = 'fac-item';
        div.textContent = field;
        div.addEventListener('mousedown', e => { e.preventDefault(); facSelect(input, field); });
        dd.appendChild(div);
      });
    }
  }

  const rect = input.getBoundingClientRect();
  dd.style.top   = (rect.bottom + 2) + 'px';
  dd.style.left  = rect.left         + 'px';
  dd.style.width = Math.max(rect.width, 300) + 'px';
  document.body.appendChild(dd);
  _facDropdown = dd;
  _facTarget   = input;
}

function facHide() {
  if (_facDropdown) { _facDropdown.remove(); _facDropdown = null; _facTarget = null; }
}

function facSelect(input, value) {
  input.value = value;
  facHide();
  if (input.closest('.chip-search-row')) {
    addChipFromSearch(input.nextElementSibling);
    return;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

document.addEventListener('focusin',  e => { if (e.target.dataset?.fac) facShow(e.target); });
document.addEventListener('input',    e => { if (e.target.dataset?.fac) facShow(e.target); });
document.addEventListener('focusout', e => { if (e.target.dataset?.fac) setTimeout(facHide, 150); });

function addChipFromSearch(btn) {
  const input = btn.previousElementSibling;
  const val = input.value.trim();
  if (!val) return;
  const zone = btn.closest('.chip-search-row').nextElementSibling;
  zone.appendChild(makeChip(val));
  input.value = '';
  input.focus();
  setDirty();
}
