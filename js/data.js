'use strict';

/* ═══════════════════════════════════════════════════════
   DataService
═══════════════════════════════════════════════════════ */
const DataService = {
  async fetchJSON(path, fallback) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch { return fallback; }
  },
  async fetchCalcRules()      { return this.fetchJSON('./calc_rules.json', {}); },
  async fetchBenchmarkCache() { return this.fetchJSON(`${DATA_PATH}benchmark_cache.json`, null); },
  async fetchManifest()         { return this.fetchJSON(`${DATA_PATH}manifest.json`, []); },
  async fetchBaseUnivData()     { return this.fetchJSON(`${DATA_PATH}기준대학.json`, []); },
  async fetchItemData(itemKey)  { return this.fetchJSON(`${DATA_PATH}${encodeURIComponent(itemKey)}.json`, []); },

  /** 기준대학.json 로드 후 대학명→기준대학명 맵 구축 */
  buildBaseUnivMap(baseUnivList) {
    const m = new Map();
    for (const r of baseUnivList) {
      if (r.대학명 && r.기준대학명) m.set(r.대학명, r.기준대학명);
    }
    return m;
  },

  /** 학과 단위 rows를 대학(기준대학명) 단위로 합산 (수치는 sum, 문자열은 첫 값) */
  aggregateByUniv(rows, year) {
    const baseUnivMap = AppState.raw._baseUnivMap;
    // 기준연도가 문자열("2016")·숫자(2016) 모두 대응
    const yearStr = String(year);
    const yearRows = rows.filter(r => String(r.기준연도) === yearStr);
    const groups = new Map();
    for (const row of yearRows) {
      const rawName = row.기준대학명 || row.대학명;
      if (!rawName) continue;
      // 기준대학.json 매핑으로 정규화 (없으면 원래 이름 그대로)
      const name = baseUnivMap.get(rawName) || rawName;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(row);
    }
    const result = [];
    for (const [name, univRows] of groups) {
      const merged = { 기준대학명: name };
      const keys = Object.keys(univRows[0]).filter(k => k !== '기준연도' && k !== '기준대학명' && k !== '대학명');
      for (const k of keys) {
        const vals = univRows.map(r => r[k]).filter(v => v != null);
        if (!vals.length) { merged[k] = null; continue; }
        merged[k] = typeof vals[0] === 'number' ? vals.reduce((a, b) => a + b, 0) : vals[0];
      }
      result.push(merged);
    }
    return result;
  },
};
