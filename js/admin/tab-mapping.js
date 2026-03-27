'use strict';

/* ══════════════════════════════════════════
   탭 1: 기준대학 CRUD
══════════════════════════════════════════ */
function renderMappingTable(rows) {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';
  for (const row of rows)
    appendRow(row['대학명']||'', row['기준대학명']||'',
              row['지역']||'', row['설립구분']||'', row['대학구분']||'',
              row['폐교연도']||'', row['비고']||'');
  updateCount();
  showEmptyHint();
}

const _설립구분_옵션 = ['', '국립', '공립', '국립대법인', '사립', '특별법국립', '특별법법인', '기타'];
const _대학구분_옵션 = ['', '대학교', '산업대학', '교육대학', '기능대학', '사이버대학(대학)', '방송통신대학', '기타'];

function _makeSelect(옵션목록, 현재값) {
  const opts = 옵션목록.map(v =>
    `<option value="${esc(v)}"${v === 현재값 ? ' selected' : ''}>${v || '(없음)'}</option>`
  ).join('');
  return `<select class="cell-input" style="padding:2px 4px;" onchange="setDirty()">${opts}</select>`;
}

function appendRow(univName='', baseName='', 지역='', 설립구분='', 대학구분='', 폐교연도='', note='') {
  const tbody = document.getElementById('table-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="cell-input" type="text" value="${esc(univName)}" placeholder="예: 연세대학교(미래캠퍼스)" oninput="setDirty()"></td>
    <td><input class="cell-input" type="text" value="${esc(baseName)}" placeholder="예: 연세대학교" oninput="setDirty()"></td>
    <td><input class="cell-input" type="text" value="${esc(지역)}" placeholder="서울" style="width:60px;" oninput="setDirty()"></td>
    <td>${_makeSelect(_설립구분_옵션, 설립구분)}</td>
    <td>${_makeSelect(_대학구분_옵션, 대학구분)}</td>
    <td><input class="cell-input" type="number" min="1900" max="2100" value="${esc(폐교연도)}" placeholder="예:2024" style="width:68px;" oninput="setDirty()"></td>
    <td><input class="cell-input" type="text" value="${esc(note)}" placeholder="교명변경(2023)" oninput="setDirty()"></td>
    <td class="td-actions"><button class="btn btn-danger btn-sm" onclick="deleteRow(this)">삭제</button></td>
  `;
  tbody.appendChild(tr);
  updateCount(); showEmptyHint();
}

function addRow() {
  appendRow('',''); setDirty();
  const rows = document.getElementById('table-body').querySelectorAll('tr:not(.hidden)');
  rows[rows.length-1]?.querySelector('input')?.focus();
}

function deleteRow(btn) {
  btn.closest('tr').remove(); setDirty(); updateCount(); showEmptyHint();
}

function filterRows() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  document.getElementById('table-body').querySelectorAll('tr').forEach(tr => {
    const texts = [...tr.querySelectorAll('input')].map(i=>i.value.toLowerCase()).join(' ');
    tr.classList.toggle('hidden', q.length>0 && !texts.includes(q));
  });
  updateCount();
}

function updateCount() {
  const all = document.getElementById('table-body').querySelectorAll('tr').length;
  const vis = document.getElementById('table-body').querySelectorAll('tr:not(.hidden)').length;
  const q   = document.getElementById('search-input').value.trim();
  document.getElementById('row-count').textContent = q ? `${vis}/${all}건` : `총 ${all}건`;
}

function showEmptyHint() {
  const all = document.getElementById('table-body').querySelectorAll('tr').length;
  document.getElementById('empty-hint').style.display = all===0 ? '' : 'none';
}

function collectMappingData() {
  const rows = document.getElementById('table-body').querySelectorAll('tr');
  const data = [];
  for (const tr of rows) {
    const inputs   = tr.querySelectorAll('input');
    const selects  = tr.querySelectorAll('select');
    const univName = inputs[0].value.trim();
    const baseName = inputs[1].value.trim();
    const 지역     = inputs[2].value.trim();
    const 설립구분  = selects[0]?.value.trim() || '';
    const 대학구분  = selects[1]?.value.trim() || '';
    const 폐교연도n = parseInt(inputs[3].value);
    const note      = inputs[4].value.trim();
    if (!univName || !baseName) continue;
    const entry = { '대학명': univName, '기준대학명': baseName };
    if (지역)                          entry['지역']     = 지역;
    if (설립구분)                      entry['설립구분'] = 설립구분;
    if (대학구분)                      entry['대학구분'] = 대학구분;
    if (!isNaN(폐교연도n) && 폐교연도n > 0) entry['폐교연도'] = 폐교연도n;
    if (note)                          entry['비고']     = note;
    data.push(entry);
  }
  return data;
}

/* CSV 업로드 */
function loadCsvFile() { document.getElementById('csv-input').click(); }

function onCsvLoad(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = parseCsv(ev.target.result);
      if (!data.length) throw new Error('데이터가 없습니다.');
      renderMappingTable(data); setDirty();
    } catch(err) { alert(`CSV 오류: ${err.message}`); }
  };
  reader.readAsText(file, 'utf-8');
  e.target.value = '';
}

function parseCsv(text) {
  text = text.replace(/^\uFEFF/,'');
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(h=>h.trim());
  const findCol = (...names) => { for(const n of names){ const i=headers.findIndex(h=>h===n||h.includes(n)); if(i>=0)return i; } return -1; };
  const iUniv=findCol('대학명','이전_학교명','학교');
  const iBase=findCol('기준대학명','현재_학교명','기준대학');
  const iTime=findCol('적용시기');
  const iNote=findCol('비고','메모');
  if(iUniv<0||iBase<0) throw new Error(`헤더를 찾을 수 없습니다. 현재: ${headers.join(', ')}`);
  const result=[];
  for(let i=1;i<lines.length;i++){
    const cols=splitCsvLine(lines[i]);
    const uName=(cols[iUniv]||'').trim(), bName=(cols[iBase]||'').trim();
    if(!uName&&!bName) continue;
    const noteParts=[iTime>=0?(cols[iTime]||'').trim():'',iNote>=0?(cols[iNote]||'').trim():''].filter(Boolean);
    result.push({'대학명':uName,'기준대학명':bName,'비고':noteParts.join(' / ')});
  }
  return result;
}

function splitCsvLine(line) {
  const cols=[];let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
    else if(c===','&&!inQ){cols.push(cur);cur='';}
    else cur+=c;
  }
  cols.push(cur); return cols;
}
