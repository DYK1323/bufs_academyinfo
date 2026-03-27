'use strict';

/* ══════════════════════════════════════════
   탭 3: 공시항목 (manifest.json)
══════════════════════════════════════════ */
let manifestData = [];

/* field_mapping.json(소스별 그룹) + calc_rules 키로 그룹핑된 <select> 생성 */
function buildFieldSelect(currentVal) {
  if (!State.fieldsBySource?.length) {
    // 아직 로드 전 fallback: 일반 텍스트 입력
    return `<input class="cell-input col-key" type="text" value="${esc(currentVal||'')}" oninput="setDirty()">`;
  }
  const calcKeys = Object.keys(calcData);
  const allKnown = [...State.fieldKeys, ...calcKeys];
  const isKnown = currentVal && allKnown.includes(currentVal);
  const emptyOpt = `<option value=""${!currentVal ? ' selected' : ''}>— 필드 선택 —</option>`;
  const unknownOpt = (currentVal && !isKnown)
    ? `<option value="${esc(currentVal)}" selected>${esc(currentVal)}</option>` : '';
  // fieldsBySource 소스별 optgroup — 실제 소스명이 그룹 레이블로 표시됨
  const rawOptgroups = State.fieldsBySource.map(({ source, fields }) => {
    const opts = fields.map(k =>
      `<option value="${esc(k)}"${k === currentVal ? ' selected' : ''}>${esc(k)}</option>`
    ).join('');
    return `<optgroup label="${esc(source)}">${opts}</optgroup>`;
  }).join('');
  const calcOptgroup = calcKeys.length ? `<optgroup label="── 산식 (계산 지표)">${
    calcKeys.map(k => {
      const lbl = calcData[k]?.label ? ` (${calcData[k].label})` : '';
      return `<option value="${esc(k)}"${k === currentVal ? ' selected' : ''}>${esc(k)}${esc(lbl)}</option>`;
    }).join('')
  }</optgroup>` : '';
  return `<select class="cell-input col-key" onchange="setDirty()">${emptyOpt}${unknownOpt}${rawOptgroups}${calcOptgroup}</select>`;
}

/* ──────────────────────────────────────────
   공시항목 탭 — indicator-keyed manifest
   manifest 구조: [{ indicator, source, columns }]
   indicator: calc_rules key (visible 지표만)
   source: per-item JSON 파일명 (data/*.json)
   columns: [{ key, label }] 순위 표시 컬럼
────────────────────────────────────────── */

function renderManifest(items) {
  manifestData = JSON.parse(JSON.stringify(items));
  const container = document.getElementById('manifest-list');
  container.innerHTML = '';
  // calc_rules의 visible 지표 목록 기준으로 카드 생성
  const visibleIndicators = Object.entries(calcData).filter(([, r]) => r.visible);
  if (!visibleIndicators.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:16px;">산식 관리 탭에서 visible 지표를 먼저 추가하세요.</div>';
    return;
  }
  visibleIndicators.forEach(([indicatorKey, rule], i) => {
    const existing = manifestData.find(m => m.indicator === indicatorKey) || { indicator: indicatorKey, sources: [], columns: [] };
    // 구버전 source 문자열 → sources 배열 마이그레이션
    if (existing.source !== undefined && existing.sources === undefined) {
      existing.sources = existing.source ? [existing.source] : [];
      delete existing.source;
    }
    // manifestData에 없으면 추가
    if (!manifestData.find(m => m.indicator === indicatorKey)) manifestData.push(existing);
    container.appendChild(buildManifestCard(existing, indicatorKey, rule.label || indicatorKey));
  });
}

function buildManifestCard(item, indicatorKey, indicatorLabel) {
  const card = document.createElement('div');
  card.className = 'manifest-card';
  card.dataset.indicator = indicatorKey;

  const cols = item.columns || [];
  const sources = item.sources || [];
  const isConfigured = sources.length > 0;

  card.innerHTML = `
    <div class="manifest-card-header" onclick="toggleCard(this)">
      <div style="flex:1;min-width:0;">
        <div class="manifest-label">${esc(indicatorLabel)}</div>
        <div class="manifest-key">${esc(indicatorKey)}</div>
      </div>
      <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${isConfigured?'#dcfce7':'#f1f5f9'};color:${isConfigured?'#15803d':'#94a3b8'};">
        ${isConfigured ? '설정됨 · 컬럼 '+cols.length+'개' : '미설정'}
      </span>
      <span style="font-size:12px;color:var(--text-muted);margin-left:8px;">▾</span>
    </div>
    <div class="manifest-card-body">
      <!-- 소스 파일 -->
      <div class="form-group" style="margin-bottom:12px;">
        <label>소스 파일 (data/*.json, 여러 개 가능)</label>
        <div class="mf-sources-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:4px;"></div>
        <button class="btn btn-secondary btn-sm" onclick="addSourceRow(this)">+ 소스 추가</button>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:var(--text-muted);cursor:pointer;">
          <input type="checkbox" class="manifest-union-sources" ${item.union_sources ? 'checked' : ''} onchange="setDirty()">
          union_sources — 소스 파일 간 대학이 겹치지 않음 (설립구분별 분리 파일, 예: 교육비 국공립/사립)
        </label>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
          <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;">공시연도 표시 범위</span>
          <input type="number" class="manifest-year-min cell-input" placeholder="시작" value="${item.year_range?.min ?? ''}" style="width:80px;" oninput="setDirty()">
          <span style="color:var(--text-muted);">~</span>
          <input type="number" class="manifest-year-max cell-input" placeholder="종료" value="${item.year_range?.max ?? ''}" style="width:80px;" oninput="setDirty()">
          <span style="font-size:11px;color:var(--text-muted);">(비우면 전체)</span>
        </div>
      </div>
      <!-- 표시 컬럼 -->
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">순위 표시 컬럼</div>
      <div class="table-wrap">
        <table class="col-table">
          <thead><tr><th>필드명 (key)</th><th>표시명 (label)</th><th></th></tr></thead>
          <tbody class="col-tbody">
            ${cols.map(c=>`
              <tr>
                <td>${buildFieldSelect(c.key||'')}</td>
                <td><input class="cell-input col-label" type="text" value="${esc(c.label||'')}" oninput="setDirty()"></td>
                <td style="text-align:center;width:50px;"><button class="btn btn-danger btn-sm" onclick="deleteColRow(this)">−</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
        <button class="btn btn-secondary btn-sm" onclick="addColRow(this)">+ 컬럼 추가</button>
        <button class="btn btn-primary btn-sm" onclick="applyManifestCard(this)">적용</button>
        <span class="mf-apply-msg" style="font-size:12px;color:var(--text-muted);"></span>
      </div>
    </div>
  `;

  // 소스 파일 select 요소를 DOM으로 삽입
  const sourcesList = card.querySelector('.mf-sources-list');
  for (const s of sources) {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;gap:4px;';
    div.appendChild(makeSourceSelectEl(s));
    const rmBtn = document.createElement('button');
    rmBtn.className = 'btn btn-danger btn-sm';
    rmBtn.style.whiteSpace = 'nowrap';
    rmBtn.textContent = '−';
    rmBtn.setAttribute('onclick', 'removeSourceRow(this)');
    div.appendChild(rmBtn);
    sourcesList.appendChild(div);
  }

  return card;
}

function addColRow(btn) {
  const tbody = btn.closest('.manifest-card-body').querySelector('.col-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${buildFieldSelect('')}</td>
    <td><input class="cell-input col-label" type="text" oninput="setDirty()"></td>
    <td style="text-align:center;width:50px;"><button class="btn btn-danger btn-sm" onclick="deleteColRow(this)">−</button></td>
  `;
  tbody.appendChild(tr);
  tr.querySelector('input').focus();
  setDirty();
}

function deleteColRow(btn) {
  btn.closest('tr').remove(); setDirty();
}

function makeSourceSelectEl(val) {
  const sel = document.createElement('select');
  sel.className = 'form-input mf-source-item';
  sel.style.flex = '1';
  sel.addEventListener('change', setDirty);
  const emptyOpt = document.createElement('option');
  emptyOpt.value = ''; emptyOpt.textContent = '— 소스 파일 선택 —';
  sel.appendChild(emptyOpt);
  for (const f of State.dataFiles) {
    const opt = document.createElement('option');
    opt.value = f; opt.textContent = f;
    if (f === val) opt.selected = true;
    sel.appendChild(opt);
  }
  // 기존 값이 목록에 없을 경우 추가
  if (val && !State.dataFiles.includes(val)) {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = val; opt.selected = true;
    sel.insertBefore(opt, sel.children[1]);
  }
  return sel;
}

function addSourceRow(btn) {
  const list = btn.closest('.form-group').querySelector('.mf-sources-list');
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:4px;';
  div.appendChild(makeSourceSelectEl(''));
  const rmBtn = document.createElement('button');
  rmBtn.className = 'btn btn-danger btn-sm';
  rmBtn.style.whiteSpace = 'nowrap';
  rmBtn.textContent = '−';
  rmBtn.setAttribute('onclick', 'removeSourceRow(this)');
  div.appendChild(rmBtn);
  list.appendChild(div);
  div.querySelector('select').focus();
  setDirty();
}

function removeSourceRow(btn) {
  btn.closest('div').remove();
  setDirty();
}

function applyManifestCard(btn) {
  const card = btn.closest('.manifest-card');
  const indicatorKey = card.dataset.indicator;
  const msgEl = card.querySelector('.mf-apply-msg');

  const sources = [...card.querySelectorAll('.mf-source-item')]
    .map(el => el.value.trim()).filter(Boolean);
  const cols = [];
  card.querySelectorAll('.col-tbody tr').forEach(tr => {
    const k = tr.querySelector('.col-key').value.trim();
    const l = tr.querySelector('.col-label').value.trim();
    if (k) cols.push({ key: k, label: l });
  });

  const unionSources = card.querySelector('.manifest-union-sources')?.checked || false;
  const minY = parseInt(card.querySelector('.manifest-year-min')?.value);
  const maxY = parseInt(card.querySelector('.manifest-year-max')?.value);
  const idx = manifestData.findIndex(m => m.indicator === indicatorKey);
  const existing = idx >= 0 ? manifestData[idx] : {};
  const updated = { indicator: indicatorKey, sources, columns: cols };
  if (unionSources) updated.union_sources = true;
  if (!isNaN(minY) || !isNaN(maxY)) {
    updated.year_range = {};
    if (!isNaN(minY)) updated.year_range.min = minY;
    if (!isNaN(maxY)) updated.year_range.max = maxY;
  }
  if (existing.split_files) updated.split_files = existing.split_files;
  if (idx >= 0) manifestData[idx] = updated;
  else manifestData.push(updated);

  // 헤더 배지 업데이트
  const badge = card.querySelector('.manifest-card-header span:nth-child(2)');
  if (badge) {
    badge.style.background = sources.length ? '#dcfce7' : '#f1f5f9';
    badge.style.color = sources.length ? '#15803d' : '#94a3b8';
    badge.textContent = sources.length ? `설정됨 · 컬럼 ${cols.length}개` : '미설정';
  }

  msgEl.textContent = '적용됨 ✓';
  setTimeout(() => { msgEl.textContent = ''; }, 2000);
  setDirty();
}

function collectManifest() {
  return manifestData;
}
