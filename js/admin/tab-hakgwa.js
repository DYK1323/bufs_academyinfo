'use strict';

/* ══════════════════════════════════════════
   탭 6: 학과분류 CRUD
══════════════════════════════════════════ */

const _대계열_옵션 = ['', '인문계열', '사회계열', '교육계열', '공학계열', '자연계열', '의약계열', '예체능계열'];

function renderHakgwaTable(rows) {
  const tbody = document.getElementById('hk-table-body');
  tbody.innerHTML = '';
  for (const row of rows)
    appendHakgwaRow(row['학과명'] || '', row['대계열'] || '', row['중계열'] || '', row['비고'] || '');
  updateHakgwaCount();
  showHakgwaEmptyHint();
}

function appendHakgwaRow(학과명 = '', 대계열 = '', 중계열 = '', 비고 = '') {
  const tbody = document.getElementById('hk-table-body');
  const tr = document.createElement('tr');
  const opts = _대계열_옵션.map(v =>
    `<option value="${esc(v)}"${v === 대계열 ? ' selected' : ''}>${v || '(미분류)'}</option>`
  ).join('');
  tr.innerHTML = `
    <td><input class="cell-input" type="text" value="${esc(학과명)}" placeholder="예: 경영학과" oninput="setDirty()"></td>
    <td><select class="cell-input" style="padding:2px 4px;" onchange="setDirty()">${opts}</select></td>
    <td><input class="cell-input" type="text" value="${esc(중계열)}" placeholder="예: 경영·경제" style="width:110px;" oninput="setDirty()"></td>
    <td><input class="cell-input" type="text" value="${esc(비고)}" placeholder="" oninput="setDirty()"></td>
    <td class="td-actions"><button class="btn btn-danger btn-sm" onclick="deleteHakgwaRow(this)">삭제</button></td>
  `;
  tbody.appendChild(tr);
  updateHakgwaCount(); showHakgwaEmptyHint();
}

function addHakgwaRow() {
  appendHakgwaRow('', '', '', ''); setDirty();
  const rows = document.getElementById('hk-table-body').querySelectorAll('tr:not(.hidden)');
  rows[rows.length - 1]?.querySelector('input')?.focus();
}

function deleteHakgwaRow(btn) {
  btn.closest('tr').remove(); setDirty(); updateHakgwaCount(); showHakgwaEmptyHint();
}

function filterHakgwaRows() {
  const q = document.getElementById('hk-search-input').value.trim().toLowerCase();
  document.getElementById('hk-table-body').querySelectorAll('tr').forEach(tr => {
    const texts = [...tr.querySelectorAll('input, select')].map(el => (el.value || '').toLowerCase()).join(' ');
    tr.classList.toggle('hidden', q.length > 0 && !texts.includes(q));
  });
  updateHakgwaCount();
}

function updateHakgwaCount() {
  const all = document.getElementById('hk-table-body').querySelectorAll('tr').length;
  const vis = document.getElementById('hk-table-body').querySelectorAll('tr:not(.hidden)').length;
  const q = document.getElementById('hk-search-input').value.trim();
  document.getElementById('hk-row-count').textContent = q ? `${vis}/${all}건` : `총 ${all}건`;
}

function showHakgwaEmptyHint() {
  const all = document.getElementById('hk-table-body').querySelectorAll('tr').length;
  document.getElementById('hk-empty-hint').style.display = all === 0 ? '' : 'none';
}

function collectHakgwaData() {
  const rows = document.getElementById('hk-table-body').querySelectorAll('tr');
  const data = [];
  for (const tr of rows) {
    const inputs  = tr.querySelectorAll('input');
    const sel     = tr.querySelector('select');
    const 학과명  = inputs[0]?.value.trim() || '';
    const 대계열  = sel?.value.trim() || '';
    const 중계열  = inputs[1]?.value.trim() || '';
    const 비고    = inputs[2]?.value.trim() || '';
    if (!학과명) continue;
    const entry = { '학과명': 학과명, '대계열': 대계열 };
    if (중계열) entry['중계열'] = 중계열;
    if (비고)   entry['비고']   = 비고;
    data.push(entry);
  }
  return data;
}

/* ── JSON / CSV 업로드 ── */
function loadHakgwaFile() { document.getElementById('hk-file-input').click(); }

function onHakgwaFileLoad(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const text = ev.target.result;
      const data = file.name.toLowerCase().endsWith('.json')
        ? JSON.parse(text)
        : _parseHakgwaCsv(text);
      if (!data.length) throw new Error('데이터가 없습니다.');
      renderHakgwaTable(data); setDirty();
    } catch (err) { alert(`파일 오류: ${err.message}`); }
  };
  reader.readAsText(file, 'utf-8');
  e.target.value = '';
}

function _parseHakgwaCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const iName    = headers.findIndex(h => h.includes('학과명') || h === '학과');
  const i대계열  = headers.findIndex(h => h === '대계열' || (h.includes('계열') && !h.includes('중') && !h.includes('소')));
  const i중계열  = headers.findIndex(h => h === '중계열');
  if (iName < 0) throw new Error('학과명 컬럼을 찾을 수 없습니다.');
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].split(',');
    const 학과명 = (cols[iName] || '').trim();
    if (!학과명) continue;
    const entry = { '학과명': 학과명 };
    if (i대계열 >= 0) entry['대계열'] = (cols[i대계열] || '').trim();
    if (i중계열 >= 0) entry['중계열'] = (cols[i중계열] || '').trim();
    result.push(entry);
  }
  return result;
}

/* ── 검증: 원시 데이터 JSON 업로드 → 미매칭 학과명 검출 ── */
function loadValidateFile() { document.getElementById('hk-validate-input').click(); }

function onValidateFileLoad(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      _runValidation(data);
    } catch (err) { alert(`JSON 파싱 오류: ${err.message}`); }
  };
  reader.readAsText(file, 'utf-8');
  e.target.value = '';
}

function _runValidation(rawData) {
  if (!Array.isArray(rawData) || !rawData.length) {
    alert('유효한 학과별자료 JSON 파일이 아닙니다.');
    return;
  }
  const firstRow = rawData[0];
  // 학과(모집단위) 필드명 자동 감지 — 공백 유무 모두 대응
  const deptField = Object.keys(firstRow).find(k => k.includes('학과') && k.includes('모집단위'))
                 || Object.keys(firstRow).find(k => k.startsWith('학과'));
  if (!deptField) { alert('학과명 필드를 찾을 수 없습니다 (예: 학과(모집단위)).'); return; }

  const classified  = new Set(collectHakgwaData().map(r => r['학과명']));
  const uniqueDepts = [...new Set(rawData.map(r => (r[deptField] || '').trim()).filter(Boolean))].sort();
  const unmatched   = uniqueDepts.filter(d => !classified.has(d));

  const panel = document.getElementById('hk-validate-result');
  panel.style.display = '';

  if (!unmatched.length) {
    panel.innerHTML = `<div class="banner success show" style="margin-top:10px;">
      ✅ 미매칭 학과명 없음 — 총 ${uniqueDepts.length}개 학과 모두 분류됨.
    </div>`;
    return;
  }

  const listHtml = unmatched.map(d =>
    `<div class="hk-unmatched-item" data-name="${esc(d)}" style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-bottom:1px solid var(--border);font-size:12.5px;">
      <span>${esc(d)}</span>
      <button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="addHakgwaFromValidation('${esc(d).replace(/'/g,"\\'")}')">추가</button>
    </div>`
  ).join('');

  panel.innerHTML = `
    <div class="banner warning show" style="margin-top:10px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
      <span>⚠️ <strong>${unmatched.length}개</strong> 학과명이 분류표에 없습니다 (총 ${uniqueDepts.length}개 중)</span>
      <button class="btn btn-sm btn-primary" onclick="addAllUnmatched()">모두 추가</button>
    </div>
    <div id="hk-unmatched-list" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;">
      ${listHtml}
    </div>
  `;
}

function addHakgwaFromValidation(name) {
  appendHakgwaRow(name, '', '', ''); setDirty();
  const item = document.querySelector(`#hk-unmatched-list .hk-unmatched-item[data-name="${name}"]`);
  if (item) item.remove();
}

function addAllUnmatched() {
  document.querySelectorAll('#hk-unmatched-list .hk-unmatched-item').forEach(item => {
    appendHakgwaRow(item.dataset.name, '', '', '');
  });
  document.getElementById('hk-unmatched-list').innerHTML = '';
  setDirty();
  showBanner('banner-hakgwa', 'success', '미매칭 학과명을 모두 테이블에 추가했습니다. 계열을 지정하고 저장하세요.');
}
