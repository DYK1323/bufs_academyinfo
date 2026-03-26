'use strict';

/* ═══════════════════════════════════════════════════════
   Utils
═══════════════════════════════════════════════════════ */
const Utils = {
  formatNumber(n, decimals = 0) {
    if (n == null || isNaN(n)) return '-';
    return n.toLocaleString('ko-KR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  },
  formatPercent(n, decimals = 1) {
    if (n == null || isNaN(n)) return '-';
    return n.toLocaleString('ko-KR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + '%';
  },
  formatValue(n, unit, decimals) {
    if (n == null || isNaN(n)) return '-';
    if (unit === '%') {
      const d = decimals ?? 1;
      return n.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%';
    }
    if (unit === '만원' || unit === '원') return Math.round(n).toLocaleString('ko-KR') + unit;
    if (unit === '명' || unit === '개') return Math.round(n).toLocaleString('ko-KR') + unit;
    const d = decimals ?? 0;
    return n.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  },
  formatDelta(cur, prev) {
    if (cur == null || prev == null || isNaN(cur) || isNaN(prev)) return '<span class="delta-none">-</span>';
    const diff = cur - prev;
    if (diff === 0) return '<span class="delta-none">±0</span>';
    const cls = diff > 0 ? 'delta-up' : 'delta-down';
    const sign = diff > 0 ? '▲' : '▼';
    return `<span class="${cls}">${sign} ${Math.abs(diff).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</span>`;
  },
  calcTopPercent(rank, total) {
    if (!total) return '-';
    return ((rank / total) * 100).toFixed(1);
  },
  buildFilterDescription(filters) {
    const parts = [];
    const 구분라벨 = { '전체': '전체대학', '일반대학': '4년제 일반대학', '교육대학포함': '교육대학 포함' };
    parts.push(구분라벨[filters.대학구분그룹] || filters.대학구분그룹);
    if (filters.설립Quick !== '전체') parts.push(filters.설립Quick);
    if (filters.지역그룹 !== '전국') parts.push(filters.지역그룹);
    return parts.join(' · ');
  },
  showLoading() {
    const emptyEl = document.getElementById('empty-state');
    const tableCard = document.getElementById('table-card');
    const kpiBar = document.getElementById('kpi-bar');
    if (emptyEl) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><span style="font-size:13px;color:var(--sidebar-text)">데이터 불러오는 중...</span></div>';
    }
    if (tableCard) tableCard.style.display = 'none';
    if (kpiBar) kpiBar.innerHTML = '';
  },
  showEmptyState(reason) {
    const messages = {
      'no-item':    { icon: '📋', title: '공시 항목을 선택해 주세요', desc: '상단 필터에서 공시 항목을 선택하면<br>전국 대학 순위 데이터가 표시됩니다.' },
      'no-data':    { icon: '📂', title: '데이터가 없습니다', desc: '<code>normalize_gui.py</code>로 데이터를 먼저 처리해 주세요.<br>처리 후 <code>data/</code> 폴더에 JSON 파일이 생성됩니다.' },
      'fetch-error':{ icon: '⚠️', title: '데이터를 불러오지 못했습니다', desc: '로컬에서 실행 중이라면:<br><code>python -m http.server 8080</code> 실행 후<br><code>http://localhost:8080</code>으로 접속하세요.' },
      'no-results': { icon: '🔍', title: '조건에 해당하는 대학이 없습니다', desc: '필터 조건을 조정해 보세요.' },
    };
    const m = messages[reason] || messages['no-item'];
    const emptyEl = document.getElementById('empty-state');
    const tableCard = document.getElementById('table-card');
    const kpiBar = document.getElementById('kpi-bar');
    if (emptyEl) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${m.icon}</div><div class="empty-title">${m.title}</div><div class="empty-desc">${m.desc}</div></div>`;
    }
    if (tableCard) tableCard.style.display = 'none';
    if (kpiBar) kpiBar.innerHTML = '';
    const threatCard = document.getElementById('threat-card');
    if (threatCard) threatCard.style.display = 'none';
  },
  exportCSV(rows, columns, filename) {
    const BOM = '\uFEFF';
    const header = columns.map(c => c.label).join(',');
    const body = rows.map(row =>
      columns.map(c => {
        const val = (row[c.key] != null ? row[c.key] : '');
        return String(val).includes(',') ? `"${val}"` : val;
      }).join(',')
    ).join('\n');
    const blob = new Blob([BOM + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  },
};

/* ═══════════════════════════════════════════════════════
   공통 헬퍼 함수
═══════════════════════════════════════════════════════ */
// calcRules에서 지표 메타(unit, decimal_places)를 읽는 헬퍼
function getIndicatorMeta(rankKey) {
  const rule = AppState.raw.calcRules[rankKey] || {};
  return {
    unit: rule.unit ?? '%',
    decimal_places: rule.decimal_places ?? 2,
  };
}

/* ═══════════════════════════════════════════════════════
   FilterUtils — 공유 필터 로직 (FilterManager·ThreatView·BumpView 공용)
═══════════════════════════════════════════════════════ */
const METRO   = new Set(['서울', '경기', '인천']);
const DONGNAM = new Set(['부산', '울산', '경남']);

const FilterUtils = {
  /** AppState.filters 조건으로 집계 행 하나를 평가 */
  matchesFilters(r, f) {
    const 허용구분 = f.대학구분그룹 === '전체' ? null
                  : f.대학구분그룹 === '교육대학포함' ? new Set(['대학교', '산업대학', '교육대학'])
                  : new Set(['대학교', '산업대학']);
    if (허용구분 && r.대학구분 && r.대학구분 !== '미확인' && !허용구분.has(r.대학구분)) return false;
    if (f.설립Quick === '사립' && r.설립구분 !== '사립') return false;
    if (f.특별법제외 && ['특별법국립', '특별법법인', '특별법', '기타'].includes(r.설립구분)) return false;
    if (f.지역그룹 === '비수도권' && METRO.has(r.지역)) return false;
    if (f.지역그룹 === '동남권' && !DONGNAM.has(r.지역)) return false;
    if (f.지역그룹 === '부산' && r.지역 !== '부산') return false;
    return true;
  },
};

/* ═══════════════════════════════════════════════════════
   BenchmarkUtils — benchmarkCache 뷰 공용 유틸 (RadarView·BenchmarkView·HeatmapView)
═══════════════════════════════════════════════════════ */
const BENCHMARK_META_KEYS = new Set(['기준대학명', '공시연도', '지역', '설립구분', '대학구분', '수도권여부']);

const BenchmarkUtils = {
  /** benchmarkCache의 기본 대학 필터: 국공립/사립 + 대학교/산업대학
   *  설립구분은 캐시에 '국립'/'공립'/'국립대법인' 형태로 저장될 수 있으므로 모두 허용 */
  baseFilter: r => ['국공립', '국립', '공립', '국립대법인', '사립'].includes(r.설립구분) && ['대학교', '산업대학'].includes(r.대학구분),

  /** 캐시 레코드에서 지표 키 목록 추출 */
  getIndicators(sample) {
    if (!sample) return [];
    return Object.keys(sample).filter(k => !BENCHMARK_META_KEYS.has(k));
  },

  /** σ-trimming: 평균 ±3σ 범위 내 값만 추출 */
  sigmaFilter(vals) {
    if (vals.length < 2) return vals;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    return std > 0 ? vals.filter(v => Math.abs(v - mean) <= 3 * std) : vals;
  },

  /** baseFilter 적용 후 단일 지표 σ-trimming 평균 */
  groupAvg(rows, indicator) {
    const vals = rows.filter(r => this.baseFilter(r)).map(r => r[indicator]).filter(v => v != null && !isNaN(v));
    const clean = this.sigmaFilter(vals);
    return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
  },

  /** baseFilter 적용 후 다중 지표 σ-trimming 평균 (결과: {indicator: avg, ...}) */
  groupAvgMulti(rows, indicators) {
    const result = {};
    for (const ind of indicators) result[ind] = this.groupAvg(rows, ind);
    return result;
  },

  /** datalist 요소 채우기 */
  populateDatalist(dlId, names) {
    const dl = document.getElementById(dlId);
    if (dl) dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
  },
};

/**
 * 대학 단위로 합산된 row에 calc_rules 산식을 적용해 중간값·비율 지표를 추가한다.
 * exclude_rows 필터링은 dept-level 데이터가 없으므로 생략 (benchmark 값이 덮어쓰므로 무해).
 * allRows·year를 넘기면 rolling_avg도 계산한다 (다년도 원시 데이터 필요).
 */
function applyCalcToRow(summed, calcRules, allRows, year) {
  const res = { ...summed };

  // rolling_avg 주입 (allRows·year 제공 시)
  if (allRows && year != null) {
    const univName = summed.기준대학명;
    const baseUnivMap = AppState.raw._baseUnivMap;
    for (const [key, rule] of Object.entries(calcRules)) {
      if (!rule.rolling_avg) continue;
      const srcField = rule.rolling_avg;
      const numYears = rule.rolling_years ?? 5;
      const vals = [];
      for (let y = year - numYears + 1; y <= year; y++) {
        const yRows = allRows.filter(r => {
          const ry = parseInt(r['기준연도'] ?? r['기준년도'] ?? r['연도'], 10);
          if (ry !== y) return false;
          const rawName = r.기준대학명 || r.대학명;
          const mapped = (baseUnivMap && baseUnivMap.get(rawName)) || rawName;
          return mapped === univName;
        });
        if (!yRows.length) continue;
        const nums = yRows.map(r => r[srcField]).filter(v => typeof v === 'number' && !isNaN(v));
        if (nums.length) vals.push(nums.reduce((a, b) => a + b, 0));
      }
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      res[key] = avg != null ? avg * (rule.multiply ?? 1) : null;
    }
  }

  // numerator/denominator 산식 (rolling_avg·min_of 제외)
  for (const [key, rule] of Object.entries(calcRules)) {
    if (rule.min_of || rule.rolling_avg || rule.coalesce) continue;
    const dbs = Array.isArray(rule.denominator_base) ? rule.denominator_base
      : (rule.denominator_base ? [rule.denominator_base] : []);
    const numFields = rule.numerator || [];
    // 분자 필드가 하나라도 없으면(undefined/null) 기준연도 데이터 미존재 → null
    if (numFields.some(f => res[f] == null)) { res[key] = null; continue; }
    const num = numFields.reduce((acc, f) => acc + (res[f] ?? 0), 0);
    let den = dbs.reduce((acc, db) => acc + (!isNaN(Number(db)) ? Number(db) : (res[db] ?? 0)), 0);
    for (const ex of (rule.denominator_exclude || [])) den -= (res[ex] ?? 0);
    res[key] = den > 0 ? (num / den) * (rule.multiply ?? 1) : null;
  }
  for (const [key, rule] of Object.entries(calcRules)) {
    if (!rule.min_of) continue;
    const vals = rule.min_of.map(k => res[k]).filter(v => v != null && !isNaN(v));
    res[key] = vals.length ? Math.min(...vals) : null;
  }
  return res;
}
