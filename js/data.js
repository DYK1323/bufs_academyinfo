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
  async fetchManifest()        { return this.fetchJSON(`${DATA_PATH}manifest.json`, []); },
  async fetchBaseUnivData()    { return this.fetchJSON(`${DATA_PATH}기준대학.json`, []); },
  async fetchCalcRules()       { return this.fetchJSON('./calc_rules.json', {}); },
  async fetchUnivInfo()        { return this.fetchJSON(`${DATA_PATH}대학기본정보.json`, []); },
  async fetchBenchmarkCache()  { return this.fetchJSON(`${DATA_PATH}benchmark_cache.json`, null); },
  buildUnivInfoMap(rows) {
    const map = new Map();
    for (const row of rows) { if (row['학교명']) map.set(row['학교명'], row); }
    return map;
  },
  async fetchItemData(item) {
    const itemKey = typeof item === 'string' ? item : (item?.key ?? '');
    const indicators = typeof item === 'object' ? (item?.indicators || []) : [];
    const sources = indicators.length
      ? [...new Set(indicators.flatMap(ind => ind.sources?.length ? ind.sources : [itemKey]))]
      : [itemKey];
    if (sources.length === 1) return this.fetchJSON(`${DATA_PATH}${encodeURIComponent(sources[0])}.json`, null);
    const results = await Promise.all(sources.map(src => this.fetchJSON(`${DATA_PATH}${encodeURIComponent(src)}.json`, null)));
    if (results.some(r => r === null)) return null;
    const getYear = r => parseInt(r['기준연도'] ?? r['기준년도'], 10);
    const yearSets = results.map(rows => new Set(rows.map(getYear).filter(y => !isNaN(y))));
    const commonYears = yearSets.reduce((a, b) => new Set([...a].filter(y => b.has(y))));
    return results.flatMap(rows => rows.filter(r => commonYears.has(getYear(r))));
  },
  buildBaseUnivMap(rows) {
    const map = new Map();
    for (const row of rows) { const key = row['대학명']; if (key) map.set(key, row); }
    return map;
  },
  extractYears(rows) {
    const years = [...new Set(rows.map(r => {
      const y = r['기준연도'] ?? r['기준년도'];
      return y != null ? parseInt(y, 10) : null;
    }).filter(y => y != null && !isNaN(y)))];
    return years.sort((a, b) => b - a);
  },
  aggregateByUniversity(rows, targetYear, calcRules, baseUnivMap, prevYear = null, univInfoMap = new Map()) {
    const ratioKeys = new Set(Object.keys(calcRules));
    const getYear = r => parseInt(r['기준연도'] ?? r['기준년도'], 10);
    const yearRows = rows.filter(r => getYear(r) === targetYear);
    const prevRows = prevYear != null ? rows.filter(r => getYear(r) === prevYear) : [];
    const METRO_REGIONS = METRO; // utils.js에서 공유

    const groupBy = (rowSet) => {
      const groups = new Map();
      for (const row of rowSet) {
        const parsedName = row['대학명'] || row['학교'] || '(미확인)';
        const key = baseUnivMap.get(parsedName)?.['기준대학명'] || parsedName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      return groups;
    };

    const sumGroup = (groupRows) => {
      if (!groupRows.length) return {};
      const result = {};
      const firstRow = groupRows[0];
      for (const field of Object.keys(firstRow)) {
        if (ratioKeys.has(field)) continue;
        const nums = groupRows.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
        result[field] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : firstRow[field];
      }
      return result;
    };

    const sumFields = (filteredRows, fields) => {
      const result = {};
      for (const field of fields) {
        const nums = filteredRows.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
        result[field] = nums.length ? nums.reduce((a, b) => a + b, 0) : 0;
      }
      return result;
    };

    // rolling_avg 규칙: 해당 대학의 sourceField를 forYear 기준 numYears개 연도 합산 후 평균
    const computeRollingAvg = (univName, sourceField, numYears, forYear) => {
      const startYear = forYear - numYears + 1;
      const yearVals = [];
      for (let y = startYear; y <= forYear; y++) {
        const yRows = rows.filter(r => {
          if (getYear(r) !== y) return false;
          const parsedName = r['대학명'] || r['학교'] || '(미확인)';
          return (baseUnivMap.get(parsedName)?.['기준대학명'] || parsedName) === univName;
        });
        if (!yRows.length) continue;
        const nums = yRows.map(r => r[sourceField]).filter(v => typeof v === 'number' && !isNaN(v));
        if (nums.length) yearVals.push(nums.reduce((a, b) => a + b, 0));
      }
      return yearVals.length ? yearVals.reduce((a, b) => a + b, 0) / yearVals.length : null;
    };

    const applyCalcRules = (summed, rawRows) => {
      const result = { ...summed };
      for (const [key, rule] of Object.entries(calcRules)) {
        if (rule.min_of) continue;
        if (rule.rolling_avg) continue; // 이미 summed에 주입됨
        let num, den;
        if (rule.exclude_rows && rawRows) {
          const filtered = rawRows.filter(r => Object.entries(rule.exclude_rows).every(([f, vs]) => !vs.includes(r[f])));
          const needed = [...(rule.numerator || []), rule.denominator_base, ...(rule.denominator_exclude || [])];
          const fs = sumFields(filtered, needed);
          num = (rule.numerator || []).reduce((acc, f) => acc + (fs[f] ?? result[f] ?? 0), 0);
          const denBase1 = rule.denominator_base;
          den = !isNaN(Number(denBase1)) ? Number(denBase1) : (fs[denBase1] ?? result[denBase1] ?? 0);
          for (const excl of (rule.denominator_exclude || [])) den -= (fs[excl] ?? result[excl] ?? 0);
        } else {
          num = (rule.numerator || []).reduce((acc, f) => acc + (result[f] ?? summed[f] ?? 0), 0);
          const denBase2 = rule.denominator_base;
          den = !isNaN(Number(denBase2)) ? Number(denBase2) : (result[denBase2] ?? summed[denBase2] ?? 0);
          for (const excl of (rule.denominator_exclude || [])) den -= (result[excl] ?? summed[excl] ?? 0);
        }
        result[key] = den > 0 ? (num / den) * (rule.multiply ?? 1) : null;
      }
      for (const [key, rule] of Object.entries(calcRules)) {
        if (!rule.min_of) continue;
        const vals = rule.min_of.map(k => result[k]).filter(v => v != null && !isNaN(v));
        result[key] = vals.length ? Math.min(...vals) : null;
      }
      return result;
    };

    const rollingRules = Object.entries(calcRules).filter(([, r]) => r.rolling_avg);
    const injectRollingAvg = (summed, univName, forYear) => {
      for (const [key, rule] of rollingRules) {
        summed[key] = computeRollingAvg(univName, rule.rolling_avg, rule.rolling_years ?? 5, forYear);
      }
    };

    const currentGroups = groupBy(yearRows);
    const prevGroups = prevYear != null ? groupBy(prevRows) : new Map();
    const result = [];
    for (const [univName, univRows] of currentGroups) {
      const summed = sumGroup(univRows);
      injectRollingAvg(summed, univName, targetYear);
      const withRatios = applyCalcRules(summed, univRows);
      const info = univInfoMap.get(univName) || {};
      const 지역 = info['지역'] || univRows[0]['지역'] || '미확인';
      const 설립구분 = info['설립구분'] || univRows[0]['설립구분'] || '미확인';
      const 대학구분 = info['대학구분'] || univRows[0]['학교종류'] || '미확인';
      const 수도권여부 = METRO_REGIONS.has(지역) ? 'Y' : 'N';
      let prevSummed = null;
      if (prevGroups.has(univName) && prevYear != null) {
        const ps = sumGroup(prevGroups.get(univName));
        injectRollingAvg(ps, univName, prevYear);
        prevSummed = applyCalcRules(ps, prevGroups.get(univName));
      }
      result.push({ 기준대학명: univName, 지역, 설립구분, 대학구분, 수도권여부, ...withRatios, _prev: prevSummed, _isOurs: univName === OUR_UNIV });
    }
    return result;
  },
  detectPrimaryValueField(aggregated, calcRules) {
    if (!aggregated.length) return null;
    const calcKeys = Object.keys(calcRules).filter(k => !calcRules[k].rolling_avg);
    if (calcKeys.length) return calcKeys[0];
    const sample = aggregated[0];
    for (const [k, v] of Object.entries(sample)) {
      if (k.startsWith('_') || ['기준대학명','지역','설립구분','대학구분','수도권여부','기준연도'].includes(k)) continue;
      if (typeof v === 'number') return k;
    }
    return null;
  },
};
