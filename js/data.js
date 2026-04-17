'use strict';

/* ═══════════════════════════════════════════════════════
   DataService
═══════════════════════════════════════════════════════ */
const DataService = {
  _itemCache: new Map(), // 메모리 캐시 (페이지 새로고침 전까지 유지)

  async fetchJSON(path, fallback) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch { return fallback; }
  },
  async fetchCalcRules()           { return this.fetchJSON('./calc_rules.json', {}); },
  async fetchBenchmarkCache()      { return this.fetchJSON(`${DATA_PATH}benchmark_cache.json`, null); },
  async fetchManifest()            { return this.fetchJSON(`${DATA_PATH}manifest.json`, []); },
  async fetchBaseUnivData()        { return this.fetchJSON(`${DATA_PATH}기준대학.json`, []); },
  async fetchDeptClassification()  { return this.fetchJSON(`${DATA_PATH}학과분류.json`, []); },

  /** 항목 데이터 fetch — 메모리 캐시 → LocalStorage 캐시 → 네트워크 순으로 조회 */
  async fetchItemData(itemKey) {
    // 1. 메모리 캐시
    if (this._itemCache.has(itemKey)) return this._itemCache.get(itemKey);

    // 2. LocalStorage 캐시
    const lsKey = `bufs_item_${itemKey}`;
    try {
      const cached = localStorage.getItem(lsKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        this._itemCache.set(itemKey, parsed);
        return parsed;
      }
    } catch { /* localStorage 접근 실패 시 무시 */ }

    // 3. 네트워크 fetch
    const data = await this.fetchJSON(`${DATA_PATH}${encodeURIComponent(itemKey)}.json`, []);

    // 캐시 저장 (5MB 초과 추정 시 LocalStorage 저장 생략)
    this._itemCache.set(itemKey, data);
    try {
      const serialized = JSON.stringify(data);
      if (serialized.length < 4 * 1024 * 1024) { // 4MB 미만만 저장
        localStorage.setItem(lsKey, serialized);
      }
    } catch { /* 저장 실패(용량 초과 등) 시 무시 */ }

    return data;
  },

  /** LocalStorage 항목 캐시 전체 삭제 */
  clearItemCache() {
    this._itemCache.clear();
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('bufs_item_')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  },

  /** 기준대학.json 로드 후 대학명→기준대학명 맵 구축 */
  buildBaseUnivMap(baseUnivList) {
    const m = new Map();
    for (const r of baseUnivList) {
      if (r.대학명 && r.기준대학명) m.set(r.대학명, r.기준대학명);
    }
    return m;
  },

  /** 학과 단위 rows를 대학(기준대학명) 단위로 합산 (수치는 sum, 문자열은 첫 값) */
  aggregateByUniv(rows, year, yearField = '기준연도') {
    const baseUnivMap = AppState.raw._baseUnivMap;
    // 연도 필드가 문자열("2016")·숫자(2016) 모두 대응
    // yearField='공시연도'이면 해당 필드로 필터, 없는 레코드는 기준연도 fallback
    const yearStr = String(year);
    const yearRows = rows.filter(r => {
      const val = r[yearField] !== undefined ? r[yearField] : r.기준연도;
      return String(val) === yearStr;
    });
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
      const SKIP = new Set(['기준연도', '기준대학명', '대학명']);
      const keys = [...new Set(univRows.flatMap(r => Object.keys(r)))].filter(k => !SKIP.has(k));
      for (const k of keys) {
        const vals = univRows.map(r => r[k]).filter(v => v != null);
        if (!vals.length) { merged[k] = null; continue; }
        if (typeof vals[0] === 'number') {
          merged[k] = vals.reduce((a, b) => a + b, 0);
        } else if (vals[0] !== '' && !isNaN(Number(vals[0]))) {
          merged[k] = vals.reduce((a, b) => {
            const nb = Number(b);
            return a + (isNaN(nb) ? 0 : nb);
          }, 0);
        } else {
          merged[k] = vals[0];
        }
      }
      result.push(merged);
    }
    return result;
  },
};
