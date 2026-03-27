'use strict';

/* ══════════════════════════════════════════
   탭 2: 산식 관리 (calc_rules.json)
══════════════════════════════════════════ */
let calcData = {};
let _activeChipZone = null;

function setActiveChipZone(zone) {
  if (_activeChipZone && _activeChipZone !== zone) {
    _activeChipZone.classList.remove('cz-active');
  }
  _activeChipZone = zone;
  if (zone) zone.classList.add('cz-active');
}

function makeChip(fieldName) {
  const isCalc = Object.prototype.hasOwnProperty.call(calcData, fieldName);
  const span = document.createElement('span');
  span.className = 'field-chip' + (isCalc ? ' calc-chip' : '');
  span.dataset.value = fieldName;
  span.appendChild(document.createTextNode(fieldName));
  const btn = document.createElement('button');
  btn.className = 'chip-rm';
  btn.textContent = '×';
  btn.title = '제거';
  btn.addEventListener('click', e => { e.stopPropagation(); span.remove(); setDirty(); });
  span.appendChild(btn);
  return span;
}


function renderCalcRules(rules) {
  calcData = JSON.parse(JSON.stringify(rules));
  const container = document.getElementById('calc-list');
  container.innerHTML = '';
  for (const [key, rule] of Object.entries(rules)) {
    container.appendChild(buildRuleCard(key, rule));
  }
}

function buildRuleCard(key, rule) {
  const isCoalesce = !!rule.coalesce;
  const isRolling = !!rule.rolling_avg;
  const isMin = !!rule.min_of;
  const isSum = !isCoalesce && !isMin && !isRolling && String(rule.denominator_base) === '1' && (rule.multiply ?? 1) <= 1;
  const typeLabel = isCoalesce ? 'Coalesce' : (isRolling ? 'N년평균' : (isMin ? 'MIN' : (isSum ? '합계' : '비율')));
  const typeBadgeClass = isCoalesce ? 'coalesce' : (isRolling ? 'rolling' : (isMin ? 'min' : (isSum ? 'sum' : 'std')));

  const card = document.createElement('div');
  card.className = 'rule-card';
  card.dataset.key = key;

  const usedIn = rule.used_in || [];
  const usedBadge = usedIn.length
    ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#dbeafe;color:#1d4ed8;white-space:nowrap;">${usedIn.length}개 항목 사용 중</span>`
    : `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#f1f5f9;color:#94a3b8;white-space:nowrap;">미사용</span>`;

  const header = document.createElement('div');
  header.className = 'rule-card-header';
  header.innerHTML = `
    <span class="rule-type-badge ${typeBadgeClass}">${typeLabel}</span>
    <div style="flex:1;min-width:0;">
      <div class="rule-key">${esc(key)}</div>
      <div class="rule-label">${esc(rule.label || '')}</div>
    </div>
    ${usedBadge}
    <span style="font-size:12px;color:var(--text-muted);margin-left:8px;">▾</span>
  `;
  header.addEventListener('click', () => toggleCard(header));

  const body = document.createElement('div');
  body.className = 'rule-card-body';

  // 이름 행
  const nameRow = document.createElement('div');
  nameRow.className = 'rule-name-row';
  nameRow.innerHTML = `
    <div class="form-group" style="flex:2;min-width:160px;">
      <label>지표 필드명 (key)</label>
      <input class="form-input rule-field-key" type="text" value="${esc(key)}" placeholder="예: 신입생 충원율">
    </div>
    <div class="form-group" style="flex:3;min-width:180px;">
      <label>화면 표시명</label>
      <input class="form-input rule-field-label" type="text" value="${esc(rule.label || '')}" placeholder="예: 신입생 충원율(%)">
    </div>
  `;
  body.appendChild(nameRow);

  // 표시 설정 행 (visible, unit, decimal_places, sort_asc)
  const displayRow = document.createElement('div');
  displayRow.className = 'rule-name-row';
  displayRow.style.cssText = 'border-top:1px solid #f1f5f9;padding-top:10px;';
  displayRow.innerHTML = `
    <div class="form-group" style="flex:0 0 auto;min-width:100px;">
      <label>드롭다운 표시</label>
      <label style="display:flex;align-items:center;gap:6px;height:34px;cursor:pointer;">
        <input type="checkbox" class="rule-field-visible"${rule.visible ? ' checked' : ''} onchange="setDirty()">
        <span style="font-size:12.5px;">항목 선택에 표시</span>
      </label>
    </div>
    <div class="form-group" style="flex:1;min-width:80px;">
      <label>단위</label>
      <input class="form-input rule-field-unit" type="text" value="${esc(rule.unit ?? '%')}" placeholder="예: %, 명, 원">
    </div>
    <div class="form-group" style="flex:1;min-width:80px;">
      <label>소수점 자리</label>
      <input class="form-input rule-field-decimal" type="number" min="0" max="4" value="${rule.decimal_places ?? 2}" oninput="setDirty()" style="text-align:center;">
    </div>
    <div class="form-group" style="flex:2;min-width:140px;">
      <label>순위 정렬</label>
      <select class="form-input rule-field-sortasc" onchange="setDirty()">
        <option value="desc"${rule.sort_asc !== true ? ' selected' : ''}>내림차순 (높을수록 1위)</option>
        <option value="asc"${rule.sort_asc === true ? ' selected' : ''}>오름차순 (낮을수록 1위)</option>
      </select>
    </div>
    <div class="form-group" style="flex:0 0 auto;min-width:120px;">
      <label>Left join</label>
      <label style="display:flex;align-items:center;gap:6px;height:34px;cursor:pointer;" title="sources[1](분모 소스) 기준으로 join — 분자 소스에 없는 대학도 0%로 포함. 복수 소스 지표에만 유효.">
        <input type="checkbox" class="rule-field-leftjoin"${rule.left_join ? ' checked' : ''} onchange="setDirty()">
        <span style="font-size:12.5px;">분모 기준 join</span>
      </label>
    </div>
  `;
  body.appendChild(displayRow);

  // 산식 빌더
  body.appendChild(buildFormulaBuilder(card, rule, isMin, isSum, isRolling, isCoalesce));

  // 행 제외 (MIN·N년평균·Coalesce 제외)
  if (!isMin && !isRolling && !isCoalesce) {
    const exclWrap = document.createElement('div');
    exclWrap.style.cssText = 'padding: 0 14px;';
    exclWrap.appendChild(buildExclSection(rule.exclude_rows));
    body.appendChild(exclWrap);
  }

  // 액션
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.innerHTML = `
    <span class="apply-msg" style="font-size:12px;color:var(--text-muted);margin-right:auto;"></span>
    <button class="btn btn-danger btn-sm" onclick="deleteRule(this)">삭제</button>
    <button class="btn btn-primary btn-sm" onclick="applyRule(this)">적용</button>
  `;
  body.appendChild(actions);

  card.appendChild(header);
  card.appendChild(body);
  return card;
}


function buildFormulaBuilder(card, rule, isMin, isSum, isRolling, isCoalesce) {
  const type = isCoalesce ? 'coalesce' : (isRolling ? 'rolling' : (isMin ? 'min' : (isSum ? 'sum' : 'ratio')));
  const radioName = 'fb-type-' + Math.random().toString(36).slice(2, 8);
  const mulName   = 'fb-mul-'  + Math.random().toString(36).slice(2, 8);

  const panel = document.createElement('div');
  panel.className = 'fb-panel';

  // ── 유형 선택
  const typeRow = document.createElement('div');
  typeRow.className = 'fb-type-row';
  typeRow.innerHTML = `
    <span class="fb-type-label">유형</span>
    <label class="fb-type-radio-label"><input type="radio" name="${radioName}" class="fb-type-radio" value="ratio"   ${type === 'ratio'   ? 'checked' : ''}>비율 (분자÷분모)</label>
    <label class="fb-type-radio-label"><input type="radio" name="${radioName}" class="fb-type-radio" value="sum"     ${type === 'sum'     ? 'checked' : ''}>합계 (건수)</label>
    <label class="fb-type-radio-label"><input type="radio" name="${radioName}" class="fb-type-radio" value="min"     ${type === 'min'     ? 'checked' : ''}>MIN (최솟값)</label>
    <label class="fb-type-radio-label"><input type="radio" name="${radioName}" class="fb-type-radio" value="rolling"  ${type === 'rolling'  ? 'checked' : ''}>N년 평균</label>
    <label class="fb-type-radio-label"><input type="radio" name="${radioName}" class="fb-type-radio" value="coalesce" ${type === 'coalesce' ? 'checked' : ''}>Coalesce (설립구분별 지표 선택)</label>
  `;
  panel.appendChild(typeRow);

  // ── 비율/합계 영역
  const ratioSumArea = document.createElement('div');
  ratioSumArea.className = type === 'min' ? 'fb-hidden' : '';

  // 분자
  const numLabel = document.createElement('div');
  numLabel.className = 'fb-area-label';
  numLabel.textContent = '분자';
  const numSearchRow = document.createElement('div');
  numSearchRow.className = 'chip-search-row';
  numSearchRow.innerHTML = `<input type="text" data-fac="all" placeholder="필드 검색 후 추가…"><button class="btn btn-secondary btn-sm" onclick="addChipFromSearch(this)">추가</button>`;
  const numZone = document.createElement('div');
  numZone.className = 'chip-zone';
  numZone.dataset.area = 'num';
  numZone.dataset.placeholder = '+ 필드 추가';
  (rule.numerator || []).forEach(f => numZone.appendChild(makeChip(f)));
  numZone.addEventListener('click', () => setActiveChipZone(numZone));

  ratioSumArea.appendChild(numLabel);
  ratioSumArea.appendChild(numSearchRow);
  ratioSumArea.appendChild(numZone);

  // ÷ 분모 (ratio only)
  const denArea = document.createElement('div');
  denArea.className = type !== 'ratio' ? 'fb-hidden' : '';

  const divOp = document.createElement('div');
  divOp.className = 'fb-op';
  divOp.textContent = '÷';
  const denLabel = document.createElement('div');
  denLabel.className = 'fb-area-label';
  denLabel.textContent = '분모';

  const denSearchRow = document.createElement('div');
  denSearchRow.className = 'chip-search-row';
  denSearchRow.innerHTML = `<input type="text" data-fac="all" placeholder="필드 검색 후 추가…"><button class="btn btn-secondary btn-sm" onclick="addChipFromSearch(this)">추가</button>`;
  const denZone = document.createElement('div');
  denZone.className = 'chip-zone';
  denZone.dataset.area = 'den';
  denZone.dataset.placeholder = '+ 필드 추가';
  const denBases = Array.isArray(rule.denominator_base) ? rule.denominator_base
    : (rule.denominator_base && rule.denominator_base !== '1' ? [rule.denominator_base] : []);
  denBases.forEach(f => denZone.appendChild(makeChip(f)));
  denZone.addEventListener('click', () => setActiveChipZone(denZone));

  const exclLabel = document.createElement('span');
  exclLabel.style.cssText = 'font-size:12px;color:var(--text-muted);white-space:nowrap;flex-shrink:0;';
  exclLabel.textContent = '제외:';

  const denExclSearchRow = document.createElement('div');
  denExclSearchRow.className = 'chip-search-row';
  denExclSearchRow.innerHTML = `<input type="text" data-fac="all" placeholder="제외 필드 검색…"><button class="btn btn-secondary btn-sm" onclick="addChipFromSearch(this)">추가</button>`;

  const denExclZone = document.createElement('div');
  denExclZone.className = 'chip-zone';
  denExclZone.dataset.area = 'den-excl';
  denExclZone.dataset.placeholder = '+ 제외 필드';
  denExclZone.style.flex = '1';
  (rule.denominator_exclude || []).forEach(f => denExclZone.appendChild(makeChip(f)));
  denExclZone.addEventListener('click', () => setActiveChipZone(denExclZone));

  denArea.appendChild(divOp);
  denArea.appendChild(denLabel);
  denArea.appendChild(denSearchRow);
  denArea.appendChild(denZone);
  // 분모 제외 필드 (검색 입력 + 칩 존)
  const denExclWrap = document.createElement('div');
  denExclWrap.style.cssText = 'display:flex;align-items:flex-start;gap:6px;margin-top:4px;flex-wrap:wrap;';
  denExclWrap.appendChild(exclLabel);
  const denExclInner = document.createElement('div');
  denExclInner.style.flex = '1';
  denExclInner.appendChild(denExclSearchRow);
  denExclInner.appendChild(denExclZone);
  denExclWrap.appendChild(denExclInner);
  denArea.appendChild(denExclWrap);

  // × 배율 (ratio only)
  const mulArea = document.createElement('div');
  mulArea.className = type !== 'ratio' ? 'fb-hidden' : '';

  const mulOp = document.createElement('div');
  mulOp.className = 'fb-op';
  mulOp.textContent = '×';
  const mulRow = document.createElement('div');
  mulRow.className = 'fb-multiply-row';
  const mulVal = rule.multiply ?? 1;
  const isCustomMul = mulVal !== 100 && mulVal !== 1;
  mulRow.innerHTML = `
    <span class="fb-area-label" style="margin-bottom:0;">배율</span>
    <label class="fb-mul-label"><input type="radio" name="${mulName}" class="fb-mul-radio" value="100" ${mulVal === 100 ? 'checked' : ''}>100 (%)</label>
    <label class="fb-mul-label"><input type="radio" name="${mulName}" class="fb-mul-radio" value="1"   ${mulVal === 1 && !isCustomMul ? 'checked' : ''}>1 (건수)</label>
    <label class="fb-mul-label"><input type="radio" name="${mulName}" class="fb-mul-radio" value="custom" ${isCustomMul ? 'checked' : ''}>직접:
      <input class="fb-mul-custom rule-field-multiply" type="number" value="${mulVal}" ${!isCustomMul ? 'disabled' : ''}>
    </label>
  `;
  mulRow.querySelectorAll('.fb-mul-radio').forEach(r => {
    r.addEventListener('change', () => {
      mulRow.querySelector('.rule-field-multiply').disabled = r.value !== 'custom';
    });
  });
  mulArea.appendChild(mulOp);
  mulArea.appendChild(mulRow);

  ratioSumArea.appendChild(denArea);
  ratioSumArea.appendChild(mulArea);
  panel.appendChild(ratioSumArea);

  // ── MIN 영역
  const minArea = document.createElement('div');
  minArea.className = type !== 'min' ? 'fb-hidden' : '';
  const minLabel = document.createElement('div');
  minLabel.className = 'fb-area-label';
  minLabel.textContent = 'MIN 대상 지표';
  const minSearchRow = document.createElement('div');
  minSearchRow.className = 'chip-search-row';
  minSearchRow.innerHTML = `<input type="text" data-fac="all" placeholder="계산 지표 검색 후 추가…"><button class="btn btn-secondary btn-sm" onclick="addChipFromSearch(this)">추가</button>`;
  const minZone = document.createElement('div');
  minZone.className = 'chip-zone';
  minZone.dataset.area = 'min';
  minZone.dataset.placeholder = '+ 지표 추가';
  (rule.min_of || []).forEach(f => minZone.appendChild(makeChip(f)));
  minZone.addEventListener('click', () => setActiveChipZone(minZone));
  minArea.appendChild(minLabel);
  minArea.appendChild(minSearchRow);
  minArea.appendChild(minZone);
  panel.appendChild(minArea);

  // ── N년 평균 영역
  const rollingArea = document.createElement('div');
  rollingArea.className = type !== 'rolling' ? 'fb-hidden' : '';
  const srcLabel = document.createElement('div');
  srcLabel.className = 'fb-area-label';
  srcLabel.textContent = '원본 필드 (raw data)';
  const srcInput = document.createElement('input');
  srcInput.type = 'text';
  srcInput.className = 'fb-den-select rule-field-rolling-src';
  srcInput.setAttribute('data-fac', 'raw');
  srcInput.placeholder = '원본 필드 검색…';
  srcInput.value = rule.rolling_avg || '';
  srcInput.addEventListener('input', setDirty);
  const yearsLabel = document.createElement('div');
  yearsLabel.className = 'fb-area-label';
  yearsLabel.style.marginTop = '10px';
  yearsLabel.textContent = '평균 연도 수';
  const yearsRow = document.createElement('div');
  yearsRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const yearsInput = document.createElement('input');
  yearsInput.type = 'number';
  yearsInput.className = 'fb-mul-custom rule-field-rolling-years';
  yearsInput.style.width = '70px';
  yearsInput.min = '1'; yearsInput.max = '10';
  yearsInput.value = rule.rolling_years ?? 5;
  const yearsUnit = document.createElement('span');
  yearsUnit.style.cssText = 'font-size:12px;color:#64748b;';
  yearsUnit.textContent = '년 (당해 연도 포함)';
  yearsRow.appendChild(yearsInput);
  yearsRow.appendChild(yearsUnit);
  const multiplyLabel = document.createElement('div');
  multiplyLabel.className = 'fb-area-label';
  multiplyLabel.style.marginTop = '10px';
  multiplyLabel.textContent = '계수 (평균값에 곱할 배수, 기본=1)';
  const multiplyRow = document.createElement('div');
  multiplyRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const multiplyInput = document.createElement('input');
  multiplyInput.type = 'number';
  multiplyInput.className = 'fb-mul-custom rule-field-rolling-multiply';
  multiplyInput.style.width = '100px';
  multiplyInput.step = '0.0001';
  multiplyInput.value = rule.multiply ?? 1;
  const multiplyHint = document.createElement('span');
  multiplyHint.style.cssText = 'font-size:12px;color:#64748b;';
  multiplyHint.textContent = '예: 0.025 → 2.5% 반영';
  multiplyInput.addEventListener('input', setDirty);
  multiplyRow.appendChild(multiplyInput);
  multiplyRow.appendChild(multiplyHint);
  rollingArea.appendChild(srcLabel);
  rollingArea.appendChild(srcInput);
  rollingArea.appendChild(yearsLabel);
  rollingArea.appendChild(yearsRow);
  rollingArea.appendChild(multiplyLabel);
  rollingArea.appendChild(multiplyRow);
  panel.appendChild(rollingArea);

  // ── Coalesce 영역
  const coalesceArea = document.createElement('div');
  coalesceArea.className = type !== 'coalesce' ? 'fb-hidden' : '';
  const coalesceTitleLabel = document.createElement('div');
  coalesceTitleLabel.className = 'fb-area-label';
  coalesceTitleLabel.textContent = '설립구분 → 지표명 매핑';
  const coalesceHint = document.createElement('div');
  coalesceHint.style.cssText = 'font-size:11px;color:#64748b;margin-bottom:8px;';
  coalesceHint.textContent = '대학의 설립구분에 따라 사용할 계산 지표를 지정합니다. 각 대학에서 해당 지표값을 그대로 가져옵니다.';
  const coalesceRowsWrap = document.createElement('div');
  coalesceRowsWrap.className = 'coalesce-rows-wrap';
  Object.entries(rule.coalesce || {}).forEach(([설립, 지표]) => coalesceRowsWrap.appendChild(makeCoalesceRow(설립, 지표)));
  const addCoalesceBtn = document.createElement('button');
  addCoalesceBtn.className = 'btn btn-secondary btn-sm';
  addCoalesceBtn.style.marginBottom = '10px';
  addCoalesceBtn.textContent = '+ 매핑 추가';
  addCoalesceBtn.addEventListener('click', () => { coalesceRowsWrap.appendChild(makeCoalesceRow('', '')); setDirty(); });
  coalesceArea.appendChild(coalesceTitleLabel);
  coalesceArea.appendChild(coalesceHint);
  coalesceArea.appendChild(coalesceRowsWrap);
  coalesceArea.appendChild(addCoalesceBtn);
  panel.appendChild(coalesceArea);

  // 유형 라디오 변경 시 뷰 전환
  typeRow.querySelectorAll('.fb-type-radio').forEach(r => {
    r.addEventListener('change', () => {
      ratioSumArea.classList.toggle('fb-hidden', r.value === 'min' || r.value === 'rolling' || r.value === 'coalesce');
      denArea.classList.toggle('fb-hidden', r.value !== 'ratio');
      mulArea.classList.toggle('fb-hidden', r.value !== 'ratio');
      minArea.classList.toggle('fb-hidden', r.value !== 'min');
      rollingArea.classList.toggle('fb-hidden', r.value !== 'rolling');
      coalesceArea.classList.toggle('fb-hidden', r.value !== 'coalesce');
      if (r.value === 'min') setActiveChipZone(minZone);
      else if (r.value !== 'rolling' && r.value !== 'coalesce') setActiveChipZone(numZone);
    });
  });

  return panel;
}

function buildExclSection(excludeRows) {
  const wrap = document.createElement('div');
  const entries = excludeRows ? Object.entries(excludeRows) : [];

  const divider = document.createElement('div');
  divider.className = 'section-divider';
  divider.textContent = '행 제외 조건 (선택)';

  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'excl-rows-wrap';
  entries.forEach(([field, vals]) => rowsWrap.appendChild(makeExclRow(field, vals.join(', '))));

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary btn-sm';
  addBtn.style.marginBottom = '10px';
  addBtn.textContent = '+ 조건 추가';
  addBtn.addEventListener('click', () => { rowsWrap.appendChild(makeExclRow('', '')); setDirty(); });

  wrap.appendChild(divider);
  wrap.appendChild(rowsWrap);
  wrap.appendChild(addBtn);
  return wrap;
}

function makeExclRow(field, vals) {
  const div = document.createElement('div');
  div.className = 'excl-row';
  div.innerHTML = `
    <input class="form-input excl-field" type="text" data-fac="raw" value="${esc(field)}" placeholder="필드명 (예: 계열)" oninput="setDirty()">
    <input class="form-input excl-vals" type="text" value="${esc(vals)}" placeholder="제외값 (쉼표 구분)" oninput="setDirty()">
    <button class="btn btn-danger btn-sm" onclick="this.closest('.excl-row').remove();setDirty()">−</button>
  `;
  return div;
}

function makeCoalesceRow(설립구분, 지표명) {
  const div = document.createElement('div');
  div.className = 'coalesce-row';
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center;';
  const sel = document.createElement('select');
  sel.className = 'form-input coalesce-설립구분';
  sel.style.width = '120px';
  sel.addEventListener('change', setDirty);
  ['', '사립', '국공립', '특별법'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v || '설립구분 선택';
    if (v === 설립구분) opt.selected = true;
    sel.appendChild(opt);
  });
  const arrow = document.createElement('span');
  arrow.textContent = '→';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'form-input coalesce-지표명';
  inp.setAttribute('data-fac', 'all');
  inp.style.flex = '1';
  inp.placeholder = '지표명 (calc_rules 키)';
  inp.value = 지표명;
  inp.addEventListener('input', setDirty);
  const rmBtn = document.createElement('button');
  rmBtn.className = 'btn btn-danger btn-sm';
  rmBtn.textContent = '−';
  rmBtn.addEventListener('click', () => { div.remove(); setDirty(); });
  div.appendChild(sel); div.appendChild(arrow); div.appendChild(inp); div.appendChild(rmBtn);
  return div;
}

function toggleCard(header) {
  const card = header.closest('.rule-card, .manifest-card');
  card.classList.toggle('open');
  if (card.classList.contains('open') && card.classList.contains('rule-card')) {
    const firstZone = card.querySelector('.chip-zone');
    if (firstZone) setActiveChipZone(firstZone);
  }
}

function applyRule(btn) {
  const card = btn.closest('.rule-card');
  const prevKey = card.dataset.key;                                  // 원래 키
  const newKey  = card.querySelector('.rule-field-key').value.trim(); // 새 키
  const label   = card.querySelector('.rule-field-label').value.trim();

  if (!newKey) { alert('지표 필드명을 입력하세요.'); return; }

  const typeRadio = card.querySelector('.fb-type-radio:checked');
  const type = typeRadio?.value || 'ratio';

  let rule;
  if (type === 'coalesce') {
    const coalesceMap = {};
    card.querySelectorAll('.coalesce-row').forEach(row => {
      const 설립 = row.querySelector('.coalesce-설립구분').value;
      const 지표 = row.querySelector('.coalesce-지표명').value.trim();
      if (설립 && 지표) coalesceMap[설립] = 지표;
    });
    if (!Object.keys(coalesceMap).length) { alert('설립구분 → 지표명 매핑을 하나 이상 추가하세요.'); return; }
    rule = { label, coalesce: coalesceMap };
  } else if (type === 'rolling') {
    const src = card.querySelector('.rule-field-rolling-src')?.value.trim() || '';
    const years = parseInt(card.querySelector('.rule-field-rolling-years')?.value) || 5;
    const rollingMul = parseFloat(card.querySelector('.rule-field-rolling-multiply')?.value);
    if (!src) { alert('원본 필드를 선택하세요.'); return; }
    rule = { label, rolling_avg: src, rolling_years: years, multiply: isNaN(rollingMul) ? 1 : rollingMul };
  } else if (type === 'min') {
    const minOf = [...card.querySelectorAll('.chip-zone[data-area="min"] .field-chip')].map(c => c.dataset.value);
    rule = { label, min_of: minOf };
  } else if (type === 'sum') {
    const numerator = [...card.querySelectorAll('.chip-zone[data-area="num"] .field-chip')].map(c => c.dataset.value);
    rule = { label, numerator, denominator_base: '1', multiply: 1 };
  } else {
    const numerator = [...card.querySelectorAll('.chip-zone[data-area="num"] .field-chip')].map(c => c.dataset.value);
    const denBase = [...card.querySelectorAll('.chip-zone[data-area="den"] .field-chip')].map(c => c.dataset.value);
    const denExcl = [...card.querySelectorAll('.chip-zone[data-area="den-excl"] .field-chip')].map(c => c.dataset.value);
    const mulRadio = card.querySelector('.fb-mul-radio:checked');
    let multiply = 100;
    if (mulRadio?.value === '1') multiply = 1;
    else if (mulRadio?.value === 'custom') multiply = parseFloat(card.querySelector('.rule-field-multiply').value) || 1;

    const excludeRows = {};
    card.querySelectorAll('.excl-row').forEach(exRow => {
      const f = exRow.querySelector('.excl-field').value.trim();
      const vs = exRow.querySelector('.excl-vals').value.split(',').map(s => s.trim()).filter(Boolean);
      if (f && vs.length) excludeRows[f] = vs;
    });

    rule = { label, numerator, denominator_base: denBase, multiply };
    if (Object.keys(excludeRows).length) rule.exclude_rows = excludeRows;
    if (denExcl.length) rule.denominator_exclude = denExcl;
  }

  // 표시 설정 수집
  const visible = card.querySelector('.rule-field-visible')?.checked ?? false;
  const unit = card.querySelector('.rule-field-unit')?.value.trim() ?? '%';
  const decimalPlaces = parseInt(card.querySelector('.rule-field-decimal')?.value, 10);
  const sortAsc = card.querySelector('.rule-field-sortasc')?.value === 'asc';
  const leftJoin = card.querySelector('.rule-field-leftjoin')?.checked ?? false;
  if (visible) rule.visible = true; else delete rule.visible;
  rule.unit = unit;
  rule.decimal_places = isNaN(decimalPlaces) ? 2 : decimalPlaces;
  rule.sort_asc = sortAsc;
  if (leftJoin) rule.left_join = true; else delete rule.left_join;

  // used_in 보존
  const existingUsedIn = calcData[prevKey]?.used_in;
  if (existingUsedIn) rule.used_in = existingUsedIn;

  if (prevKey !== newKey) {
    // calcData 키 변경
    const entries = Object.entries(calcData);
    const idx = entries.findIndex(([k]) => k === prevKey);
    entries[idx] = [newKey, rule];
    calcData = Object.fromEntries(entries);
    card.dataset.key = newKey;
    card.querySelector('.rule-key').textContent = newKey;
    // manifest indicator 전파
    for (const m of manifestData) {
      if (m.indicator === prevKey) m.indicator = newKey;
    }
  } else {
    calcData[newKey] = rule;
  }
  card.querySelector('.rule-label').textContent = label;

  const isCoalesce = type === 'coalesce', isRolling = type === 'rolling', isMin = type === 'min', isSum = type === 'sum';
  const badge = card.querySelector('.rule-type-badge');
  badge.textContent = isCoalesce ? 'Coalesce' : (isRolling ? 'N년평균' : (isMin ? 'MIN' : (isSum ? '합계' : '비율')));
  badge.className = 'rule-type-badge ' + (isCoalesce ? 'coalesce' : (isRolling ? 'rolling' : (isMin ? 'min' : (isSum ? 'sum' : 'std'))));

  setDirty();
  refreshDatalistOptions();
  const msg = card.querySelector('.apply-msg');
  if (msg) { msg.textContent = '적용됨 ✓'; setTimeout(() => { msg.textContent = ''; }, 2000); }
}

function deleteRule(btn) {
  const card = btn.closest('.rule-card');
  const key = card.dataset.key;
  const usedIn = calcData[key]?.used_in || [];
  if (usedIn.length > 0) {
    alert(`"${key}" 산식은 다음 공시항목에서 사용 중이라 삭제할 수 없습니다:\n${usedIn.join('\n')}\n\n공시항목 탭에서 지표를 먼저 제거하세요.`);
    return;
  }
  if (!confirm(`"${key}" 산식을 삭제할까요?`)) return;
  delete calcData[key];
  card.remove();
  setDirty();
}

function addCalcRule() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:100;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.15);">
      <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:16px;">산식 유형 선택</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn btn-secondary" style="height:44px;justify-content:flex-start;gap:10px;" id="_add-ratio">
          <span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">비율</span>
          분자 ÷ 분모 × 배율
        </button>
        <button class="btn btn-secondary" style="height:44px;justify-content:flex-start;gap:10px;" id="_add-sum">
          <span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">합계</span>
          필드 합산 (건수)
        </button>
        <button class="btn btn-secondary" style="height:44px;justify-content:flex-start;gap:10px;" id="_add-min">
          <span style="background:#fce7f3;color:#9d174d;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">MIN</span>
          여러 지표 중 최솟값
        </button>
        <button class="btn btn-secondary" style="height:44px;justify-content:flex-start;gap:10px;" id="_add-rolling">
          <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">N년평균</span>
          과거 N년 rolling 평균
        </button>
        <button class="btn btn-secondary" style="height:44px;justify-content:flex-start;gap:10px;" id="_add-coalesce">
          <span style="background:#f0fdf4;color:#166534;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">Coalesce</span>
          설립구분별 지표 선택 합산
        </button>
      </div>
      <button class="btn btn-secondary btn-sm" id="_add-cancel" style="margin-top:14px;width:100%;justify-content:center;">취소</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  const doAdd = (type) => {
    close();
    const key = `새 지표 ${Date.now()}`;
    let rule;
    if (type === 'ratio')       rule = { label: '', numerator: [], denominator_base: [], multiply: 100 };
    else if (type === 'sum')    rule = { label: '', numerator: [], denominator_base: '1', multiply: 1 };
    else if (type === 'rolling')  rule = { label: '', rolling_avg: '', rolling_years: 5, multiply: 1 };
    else if (type === 'coalesce') rule = { label: '', coalesce: {} };
    else                          rule = { label: '', min_of: [] };
    calcData[key] = rule;
    const card = buildRuleCard(key, rule);
    card.classList.add('open');
    document.getElementById('calc-list').appendChild(card);
    setDirty();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => { card.querySelector('.rule-field-key')?.focus(); }, 80);
  };

  overlay.querySelector('#_add-ratio').addEventListener('click',   () => doAdd('ratio'));
  overlay.querySelector('#_add-sum').addEventListener('click',    () => doAdd('sum'));
  overlay.querySelector('#_add-min').addEventListener('click',    () => doAdd('min'));
  overlay.querySelector('#_add-rolling').addEventListener('click',   () => doAdd('rolling'));
  overlay.querySelector('#_add-coalesce').addEventListener('click', () => doAdd('coalesce'));
  overlay.querySelector('#_add-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

function collectCalcRules() {
  return calcData;
}
