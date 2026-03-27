'use strict';

/* ══════════════════════════════════════════
   캐시 관리
══════════════════════════════════════════ */
const CacheManager = {
  /** calc_rules(visible) + manifest(sources)로 집계 대상 자동 구성 */
  _getConfig() {
    const calcRules = State.original.calc || {};
    const manifest  = State.original.manifest || [];
    return Object.entries(calcRules)
      .filter(([, r]) => r.visible)
      .map(([key, rule]) => {
        const mItem = manifest.find(m => m.indicator === key) || {};
        // 구버전 source 문자열 호환
        const sources = mItem.sources || (mItem.source ? [mItem.source] : []);
        return {
          indicator: key,
          label:     rule.label || key,
          sources,
          split_files: mItem.split_files || null,
          union_sources: mItem.union_sources || false,
        };
      });
  },

  async init() {
    // 현재 캐시 메타 로드
    try {
      const res = await GH.getFile('data/benchmark_cache.json');
      if (Array.isArray(res.content) && res.content.length) this._updateStatusCard(res.content);
    } catch {}
    this._renderList();
  },

  _updateStatusCard(cache) {
    const univs = new Set(cache.map(r => r.기준대학명)).size;
    const years = [...new Set(cache.map(r => r.공시연도))].filter(Boolean).sort();
    document.getElementById('cache-last-updated').textContent = '저장됨';
    document.getElementById('cache-univ-count').textContent = univs + '개교';
    document.getElementById('cache-year-range').textContent = years.length ? `${years[0]}~${years[years.length-1]}년` : '-';
    document.getElementById('cache-row-count').textContent = cache.length.toLocaleString() + '행';
    document.getElementById('cache-status-card').style.display = '';
  },

  _renderList() {
    const config = this._getConfig();
    const container = document.getElementById('cache-indicator-list');
    if (!config.length) {
      container.innerHTML = '<div class="cache-empty">산식 관리 탭에서 visible 지표를 먼저 설정하세요.</div>';
      return;
    }
    container.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="border-bottom:2px solid var(--border);">
          <th style="padding:6px 8px;text-align:left;color:var(--text-muted);font-weight:600;width:30%;">지표</th>
          <th style="padding:6px 8px;text-align:left;color:var(--text-muted);font-weight:600;">소스 파일</th>
        </tr></thead>
        <tbody>${config.map(item => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px;">
              <div style="font-weight:600;">${esc(item.label)}</div>
              <div style="font-size:11px;color:var(--text-muted);">${esc(item.indicator)}</div>
            </td>
            <td style="padding:8px;${item.sources.length ? '' : 'color:#ef4444;'}">
              ${item.sources.length ? item.sources.map(s => esc(s)).join('<br>') : '⚠️ 미설정 — 공시항목 탭에서 설정'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  },

  _log(msg) {
    const el = document.getElementById('cache-progress');
    if (el) { el.innerHTML += esc(msg) + '\n'; el.scrollTop = el.scrollHeight; }
  },

  /* ── 공통 헬퍼 ── */

  _buildBaseUnivMap() {
    const map = new Map();
    for (const row of (State.original.기준대학 || []))
      if (row['대학명']) map.set(row['대학명'], row);
    return map;
  },

  _buildSplitFilesMap(valid) {
    const map = new Map();
    for (const item of valid) {
      if (!item.split_files) continue;
      if (Array.isArray(item.split_files))
        for (const src of item.sources) map.set(src, item.split_files);
      else
        for (const [src, files] of Object.entries(item.split_files)) map.set(src, files);
    }
    return map;
  },

  /** 소스 파일 목록을 fetch해 source→rows Map 반환. verbose=true면 진행 로그 출력. */
  async _loadSourceRows(allSources, splitFilesMap, verbose = false) {
    const result = new Map();
    for (const source of allSources) {
      if (verbose) this._log(`\n📥 ${source} 로드 중…`);
      const filesToLoad = splitFilesMap.get(source) || [source];
      let rows = [];
      for (const fileKey of filesToLoad) {
        try {
          const part = await DataViewer._fetchLarge(`data/${fileKey}.json`);
          if (!Array.isArray(part)) throw new Error('배열 형식이 아닙니다');
          rows = rows.concat(part);
          if (verbose && filesToLoad.length > 1) this._log(`  → ${fileKey}: ${part.length.toLocaleString()}행`);
        } catch (e) {
          if (verbose) this._log(`  ⚠️ 로드 실패: ${fileKey} — ${e.message}`);
        }
      }
      if (!rows.length) continue;
      if (verbose) this._log(`  → 합계 ${rows.length.toLocaleString()}행 로드됨`);
      result.set(source, rows);
    }
    return result;
  },

  /** 단일 지표의 소스들을 기준연도 기준으로 join한 tempMap을 빌드한다.
   *  left_join: sources[1]이 primary, 공시연도는 sources[0] 기준으로 덮어씀.
   *  union_sources: 소스 간 대학이 겹치지 않으므로 모두 primary. */
  _buildTempMap(item, rawMap, calcRules, META) {
    const leftJoin       = !!(calcRules[item.indicator]?.left_join) && item.sources.length > 1;
    const unionSources   = !!(item.union_sources);
    const primarySource  = leftJoin ? item.sources[1] : item.sources[0];
    const tempMap        = new Map();
    const orderedSources = [primarySource, ...item.sources.filter(s => s !== primarySource)];

    for (const source of orderedSources) {
      const isPrimary = unionSources || source === primarySource;
      const agg = rawMap.get(source);
      if (!agg) continue;
      for (const [baseYear, aggRows] of agg) {
        for (const row of aggRows) {
          const tempKey = `${row.기준대학명}__${baseYear}`;
          if (!tempMap.has(tempKey)) {
            if (!isPrimary) continue;
            if (row.공시연도 == null) throw new Error(`공시연도 미설정: 대학="${row.기준대학명}", 기준연도=${baseYear}`);
            tempMap.set(tempKey, {
              기준대학명: row.기준대학명, 기준연도: baseYear,
              공시연도:   row.공시연도,
              지역:       row.지역,   설립구분: row.설립구분,
              대학구분:   row.대학구분, 수도권여부: row.수도권여부,
            });
          }
          const target = tempMap.get(tempKey);
          if (leftJoin && !isPrimary) target.공시연도 = row.공시연도; // 캐시 공시연도 = sources[0] 기준
          for (const [k, v] of Object.entries(row)) {
            if (META.includes(k)) continue;
            if (target[k] === undefined) target[k] = v;
          }
        }
      }
    }
    return tempMap;
  },

  async generate() {
    if (!State.connected) { alert('먼저 GitHub에 연결하세요.'); return; }

    const config = this._getConfig();
    const valid = config.filter(c => c.sources.length > 0);
    if (!valid.length) { alert('공시항목 탭에서 소스 파일을 먼저 설정하세요.'); return; }

    const btn = document.getElementById('btn-cache-generate');
    btn.disabled = true;
    btn.textContent = '⏳ 생성 중…';

    const progressWrap = document.getElementById('cache-progress-wrap');
    progressWrap.style.display = '';
    document.getElementById('cache-progress').innerHTML = '';
    hideBanner('banner-cache');

    try {
      const baseUnivMap   = this._buildBaseUnivMap();
      const calcRules     = State.original.calc || {};
      const allSources    = new Set(valid.flatMap(c => c.sources));
      const splitFilesMap = this._buildSplitFilesMap(valid);

      // 소스 파일 로드 → raw 합산 (산식 적용 없음, 기준연도 기준 집계)
      const rawMap = new Map();
      const sourceRowsMap = await this._loadSourceRows(allSources, splitFilesMap, true);
      for (const [source, rows] of sourceRowsMap) {
        const getYear = r => parseInt(r['기준연도'] ?? r['기준년도'] ?? r['연도'], 10);
        const years = [...new Set(rows.map(getYear).filter(y => !isNaN(y)))].sort();
        this._log(`  → 연도: ${years.join(', ')}`);
        rawMap.set(source, this._aggregateRawAllYears(rows, years, baseUnivMap, calcRules));
      }

      // 같은 필드명이 다른 연도 소스에서 들어와 값이 덮어쓰이는 문제를 방지하기 위해
      // 지표마다 독립된 tempMap을 구성한다.
      const META = ['기준대학명','기준연도','공시연도','지역','설립구분','대학구분','수도권여부'];
      const mergedMap = new Map();
      // rolling_avg 규칙 목록 — 산식 적용 전 tempRow에 주입 (다년도 평균)
      const rollingRules = Object.entries(calcRules).filter(([, r]) => r.rolling_avg);

      for (const item of valid) {
        const tempMap = this._buildTempMap(item, rawMap, calcRules, META);

        // 2단계: 이 지표만 산식 계산 → mergedMap에 지표값 저장
        this._log(`\n⚙️ [${item.indicator}] 산식 적용 중…`);
        for (const tempRow of tempMap.values()) {
          // rolling_avg 주입: rawMap 전체에서 다년도 데이터를 찾아 평균 계산 후 tempRow에 삽입
          // (_applyCalc는 rolling_avg 규칙을 skip하므로 여기서 미리 값을 채워야 함)
          if (rollingRules.length > 0) {
            const univName = tempRow.기준대학명;
            const forYear  = tempRow.기준연도;
            for (const [key, rule] of rollingRules) {
              const srcField = rule.rolling_avg;
              const numYears = rule.rolling_years ?? 5;
              const vals = [];
              for (let y = forYear - numYears + 1; y <= forYear; y++) {
                for (const [, yearMap] of rawMap) {
                  const aggRows = yearMap.get(y);
                  if (!aggRows) continue;
                  const row = aggRows.find(r => r.기준대학명 === univName);
                  if (row?.[srcField] != null && typeof row[srcField] === 'number') {
                    vals.push(row[srcField]);
                    break; // 소스 하나에서 찾으면 다음 연도로
                  }
                }
              }
              tempRow[key] = vals.length > 0
                ? (vals.reduce((a, b) => a + b, 0) / vals.length) * (rule.multiply ?? 1)
                : null;
            }
          }
          const withCalc = this._applyCalc(tempRow, calcRules);
          const pubYear = tempRow.공시연도;
          const mapKey  = `${tempRow.기준대학명}__${pubYear}`;
          if (!mergedMap.has(mapKey)) {
            mergedMap.set(mapKey, {
              기준대학명: tempRow.기준대학명, 공시연도: pubYear,
              지역: tempRow.지역, 설립구분: tempRow.설립구분,
              대학구분: tempRow.대학구분, 수도권여부: tempRow.수도권여부,
            });
          }
          const target = mergedMap.get(mapKey);
          const val = withCalc[item.indicator];
          if (target[item.indicator] === undefined && (val != null || calcRules[item.indicator]?.left_join))
            target[item.indicator] = val ?? 0;
        }
        this._log(`  → 완료`);
      }

      // Coalesce 후처리: 설립구분에 따라 지표값 선택 (다른 indicator 계산 완료 후 적용)
      const coalesceRules = Object.entries(calcRules).filter(([, r]) => r.coalesce);
      if (coalesceRules.length > 0) {
        this._log(`\nCoalesce 후처리 (${coalesceRules.length}개 규칙)…`);
        for (const entry of mergedMap.values()) {
          const 설립 = entry['설립구분'];
          for (const [key, rule] of coalesceRules) {
            const sourceKey = rule.coalesce[설립];
            entry[key] = sourceKey != null ? (entry[sourceKey] ?? null) : null;
          }
        }
      }

      const cacheData = [...mergedMap.values()].sort((a, b) => {
        if (a.공시연도 !== b.공시연도) return b.공시연도 - a.공시연도;
        return a.기준대학명.localeCompare(b.기준대학명, 'ko');
      });

      this._log(`\n📊 총 ${cacheData.length}행. 저장 중…`);

      const cacheSha = await GH.getFileSha('data/benchmark_cache.json');
      await GH.putFile('data/benchmark_cache.json', cacheData, cacheSha, '벤치마크 캐시 업데이트');

      this._log('✅ benchmark_cache.json 저장 완료!');
      this._updateStatusCard(cacheData);
      document.getElementById('cache-last-updated').textContent = new Date().toLocaleString('ko-KR');
      showBanner('banner-cache', 'success', `캐시 생성 완료 — ${cacheData.length}행 저장됨`);

    } catch (e) {
      this._log(`❌ 오류: ${e.message}`);
      showBanner('banner-cache', 'error', `생성 실패: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ 캐시 생성 및 저장';
    }
  },

  /** raw 합산 전용 (산식 적용 없음) — 단일 연도, 대학별 수치 합산만 수행.
   *  calcRules 전달 시 exclude_rows 규칙의 필터링된 합산값을 __excl__{key}__{field} 형태로 함께 저장. */
  _aggregateRaw(rows, targetYear, baseUnivMap, calcRules) {
    // 기준연도 우선 — join 키와 일치시키기 위함 (공시연도는 소스마다 달라 join 키로 부적합)
    const getYear = r => parseInt(r['기준연도'] ?? r['기준년도'] ?? r['연도'], 10);
    const yearRows = rows.filter(r => getYear(r) === targetYear);

    const groups = new Map();
    for (const row of yearRows) {
      let raw = (row['대학명'] || row['학교'] || row['학교명'] || row['기준대학명'] || '(미확인)').trim();
      // ' _캠퍼스명' suffix 제거 — 학교명 필드에 '_제2캠퍼스' 등이 붙는 경우 처리
      const suffixMatch = raw.match(/^(.+?)\s+_\S/);
      if (suffixMatch && !baseUnivMap.has(raw)) {
        const trimmed = suffixMatch[1].trim();
        if (baseUnivMap.has(trimmed)) raw = trimmed;
      }
      // 기준대학.json 화이트리스트 — 미등록 대학은 캐시에서 제외
      const baseEntry = baseUnivMap.get(raw);
      if (!baseEntry) continue;
      const key = baseEntry['기준대학명'];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    // exclude_rows 규칙 목록 사전 추출
    const exclRules = calcRules
      ? Object.entries(calcRules).filter(([, r]) => r.exclude_rows && !r.min_of && !r.rolling_avg)
      : [];

    const result = [];
    for (const [univName, univRows] of groups) {
      const summed = { 기준대학명: univName };
      // 공시연도 캡처 — 캐시 출력 연도로 사용 (소스마다 공시연도가 다를 수 있음)
      const rawPubYear = parseInt(univRows[0]['공시연도'], 10);
      if (isNaN(rawPubYear)) throw new Error(`공시연도 누락: 대학="${univName}", 기준연도=${targetYear}`);
      summed['공시연도'] = rawPubYear;
      // 지역 등 메타 결정: 캠퍼스 없는 본교 행 → 캠퍼스 있는 본교 행 → 첫 행 순으로 우선
      const mainRow = univRows.find(r => r['본분교'] === '본교' && !r['캠퍼스'])
                   || univRows.find(r => r['본분교'] === '본교')
                   || univRows[0];
      const first = univRows[0];
      for (const field of Object.keys(first)) {
        if (['공시연도','기준연도','기준년도','대학명','학교'].includes(field)) continue;
        const nums = univRows.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
        summed[field] = nums.length ? nums.reduce((a, b) => a + b, 0) : first[field];
      }
      // 메타: 기준대학.json 자기매핑 항목 우선, raw 데이터 fallback
      const masterEntry = baseUnivMap.get(univName);
      const 지역 = masterEntry?.지역 || mainRow['지역'] || '미확인';
      summed['지역'] = 지역;
      const _rawSetup = masterEntry?.설립구분 || mainRow['설립구분'] || '미확인';
      summed['설립구분'] = ['국립', '공립', '국립대법인'].includes(_rawSetup) ? '국공립' : _rawSetup;
      summed['대학구분'] = masterEntry?.대학구분 || mainRow['학교종류'] || mainRow['대학구분'] || '미확인';
      summed['수도권여부'] = METRO.has(지역) ? 'Y' : 'N';

      // exclude_rows 규칙별 필터 적용 후 합산 — _applyCalc에서 우선 사용
      for (const [ruleKey, rule] of exclRules) {
        const filt = univRows.filter(r =>
          Object.entries(rule.exclude_rows).every(([f, vs]) => !vs.includes(r[f]))
        );
        const needed = [
          ...(rule.numerator || []),
          ...(Array.isArray(rule.denominator_base)
            ? rule.denominator_base.filter(f => isNaN(Number(f)))
            : (rule.denominator_base && isNaN(Number(rule.denominator_base)) ? [rule.denominator_base] : [])),
          ...(rule.denominator_exclude || []),
        ];
        for (const field of needed) {
          const nums = filt.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
          summed[`__excl__${ruleKey}__${field}`] = nums.length
            ? nums.reduce((a, b) => a + b, 0) : 0;
        }
      }

      result.push(summed);
    }
    return result;
  },

  /** raw 합산 전체 연도 — Map<year, aggRows[]> 반환 */
  _aggregateRawAllYears(rows, years, baseUnivMap, calcRules) {
    const result = new Map();
    for (const year of years) {
      result.set(year, this._aggregateRaw(rows, year, baseUnivMap, calcRules));
    }
    return result;
  },

  /** 이미 합산된 단일 row에 calc_rules 산식 적용 — 계산된 지표 포함 row 반환.
   *  exclude_rows 규칙은 _aggregateRaw에서 사전 계산된 __excl__ 접두사 필드를 우선 사용. */
  _applyCalc(summed, calcRules) {
    const res = { ...summed };

    // 1단계: numerator/denominator 산식
    for (const [key, rule] of Object.entries(calcRules)) {
      if (rule.min_of || rule.rolling_avg) continue;
      let num, den;
      const hasExcl = rule.exclude_rows &&
        res[`__excl__${key}__${(rule.numerator || [])[0]}`] !== undefined;
      const dbs = Array.isArray(rule.denominator_base) ? rule.denominator_base : (rule.denominator_base ? [rule.denominator_base] : []);
      if (hasExcl) {
        // exclude_rows 적용: _aggregateRaw에서 사전 계산된 필터링 합산값 사용
        num = (rule.numerator || []).reduce((acc, f) =>
          acc + (res[`__excl__${key}__${f}`] ?? res[f] ?? 0), 0);
        den = dbs.reduce((acc, db) => acc + (!isNaN(Number(db)) ? Number(db) :
              (res[`__excl__${key}__${db}`] ?? res[db] ?? 0)), 0);
        for (const ex of (rule.denominator_exclude || []))
          den -= (res[`__excl__${key}__${ex}`] ?? res[ex] ?? 0);
      } else {
        const numFields2 = rule.numerator || [];
        // 분자 필드가 하나라도 없으면 → non-left_join: null, left_join: 0으로 처리
        if (!rule.left_join && numFields2.some(f => res[f] == null)) { res[key] = null; continue; }
        num = numFields2.reduce((acc, f) => acc + (res[f] ?? 0), 0);
        den = dbs.reduce((acc, db) => acc + (!isNaN(Number(db)) ? Number(db) : (res[db] ?? 0)), 0);
        for (const ex of (rule.denominator_exclude || [])) den -= (res[ex] ?? 0);
      }
      res[key] = den > 0 ? (num / den) * (rule.multiply ?? 1) : null;
    }

    // 2단계: min_of
    for (const [key, rule] of Object.entries(calcRules)) {
      if (!rule.min_of) continue;
      const vals = rule.min_of.map(k => res[k]).filter(v => v != null && !isNaN(v));
      res[key] = vals.length ? Math.min(...vals) : null;
    }

    return res;
  },

  /* ── 데이터 검증 (저장 없음) ── */
  async validate() {
    if (!State.connected) { alert('먼저 GitHub에 연결하세요.'); return; }
    const config = this._getConfig();
    const valid = config.filter(c => c.sources.length > 0);
    if (!valid.length) { alert('공시항목 탭에서 소스 파일을 먼저 설정하세요.'); return; }

    const btn = document.getElementById('btn-cache-validate');
    btn.disabled = true;
    btn.textContent = '⏳ 검증 중…';
    const wrap = document.getElementById('cache-validation-wrap');
    wrap.style.display = '';
    document.getElementById('cache-validation-summary').textContent = '검증 중…';
    document.getElementById('cache-validation-report').innerHTML = '';

    try {
      const baseUnivMap   = this._buildBaseUnivMap();
      const calcRules     = State.original.calc || {};
      const META          = ['기준대학명','기준연도','공시연도','지역','설립구분','대학구분','수도권여부'];
      const allSources    = new Set(valid.flatMap(c => c.sources));
      const splitFilesMap = this._buildSplitFilesMap(valid);

      const rawMap = new Map();
      // V1: 미매칭 대학명 수집 — near-miss(공백 차이)와 완전 미등록 분리
      const baseKeyNormMap = new Map();
      for (const key of baseUnivMap.keys()) baseKeyNormMap.set(key.replace(/\s/g, ''), key);
      const nearMissNames  = new Map();
      const fullyMissNames = new Map();
      for (const source of allSources) {
        nearMissNames.set(source, []);
        fullyMissNames.set(source, []);
      }

      const sourceRowsMap = await this._loadSourceRows(allSources, splitFilesMap, false);
      for (const [source, rows] of sourceRowsMap) {
        // V1: 정확한 매칭 실패한 대학명 분류
        const seenRaw = new Set();
        for (const row of rows) {
          let raw = (row['대학명'] || row['학교'] || row['학교명'] || '').trim();
          if (!raw || seenRaw.has(raw)) continue;
          if (baseUnivMap.has(raw)) continue; // 정확 매칭 — 정상
          const suffixMatch = raw.match(/^(.+?)\s+_\S/);
          if (suffixMatch) {
            const trimmed = suffixMatch[1].trim();
            if (baseUnivMap.has(trimmed)) continue; // suffix 제거 후 매칭 — 정상
          }
          seenRaw.add(raw);
          const suggested = baseKeyNormMap.get(raw.replace(/\s/g, ''));
          if (suggested) nearMissNames.get(source).push({ raw, suggested });
          else           fullyMissNames.get(source).push(raw); // 완전 미등록 → 캐시 제외
        }

        const getYear = r => parseInt(r['기준연도'] ?? r['기준년도'] ?? r['연도'], 10);
        const years = [...new Set(rows.map(getYear).filter(y => !isNaN(y)))].sort();
        rawMap.set(source, this._aggregateRawAllYears(rows, years, baseUnivMap, calcRules));
      }

      const tempJoinMiss = {}; // indicator → [{univName, baseYear, missing:[sourceName]}]
      const indicatorPubYears = new Map(); // indicator → Map<univName, pubYear>
      const mergedRaw = new Map(); // 대학+공시연도 → 전체 raw 필드 (V4용)

      for (const item of valid) {
        tempJoinMiss[item.indicator] = [];
        indicatorPubYears.set(item.indicator, new Map());

        // V2: 소스별 기여 tempKey 집합 추적
        const sourceKeys = new Map();
        for (const source of item.sources) {
          sourceKeys.set(source, new Set());
          const agg = rawMap.get(source);
          if (!agg) continue;
          for (const [baseYear, aggRows] of agg) {
            for (const row of aggRows) {
              sourceKeys.get(source).add(`${row.기준대학명}__${baseYear}`);
            }
          }
        }
        if (item.sources.length > 1) {
          const allKeys = new Set([...sourceKeys.values()].flatMap(s => [...s]));
          for (const key of allKeys) {
            const missing = item.sources.filter(s => !sourceKeys.get(s)?.has(key));
            if (missing.length > 0 && missing.length < item.sources.length) {
              const lastDunder = key.lastIndexOf('__');
              const univName = key.slice(0, lastDunder);
              const baseYear = key.slice(lastDunder + 2);
              tempJoinMiss[item.indicator].push({ univName, baseYear, missing });
            }
          }
        }

        const tempMap = this._buildTempMap(item, rawMap, calcRules, META);
        for (const tempRow of tempMap.values()) {
          // V3: 공시연도 기록
          indicatorPubYears.get(item.indicator).set(tempRow.기준대학명, tempRow.공시연도);
          // V4: mergedRaw 누적
          const mapKey = `${tempRow.기준대학명}__${tempRow.공시연도}`;
          if (!mergedRaw.has(mapKey)) {
            mergedRaw.set(mapKey, {
              기준대학명: tempRow.기준대학명, 공시연도: tempRow.공시연도,
              지역: tempRow.지역, 설립구분: tempRow.설립구분,
              대학구분: tempRow.대학구분, 수도권여부: tempRow.수도권여부,
            });
          }
          const target = mergedRaw.get(mapKey);
          for (const [k, v] of Object.entries(tempRow)) {
            if (META.includes(k)) continue;
            if (target[k] === undefined) target[k] = v;
          }
        }
      }

      // V3: cross-indicator 공시연도 불일치 탐지 (복수 소스 지표만)
      const multiSrcIndicators = valid.filter(i => i.sources.length > 1).map(i => i.indicator);
      const crossJoinMiss = []; // [{univName, conflicts:[{indicator, pubYear}]}]
      if (multiSrcIndicators.length > 1) {
        const allUnivs = new Set(
          multiSrcIndicators.flatMap(ind => [...(indicatorPubYears.get(ind)?.keys() || [])])
        );
        for (const univName of allUnivs) {
          const yearsByInd = multiSrcIndicators
            .map(ind => ({ indicator: ind, pubYear: indicatorPubYears.get(ind)?.get(univName) }))
            .filter(x => x.pubYear != null);
          const uniqueYears = new Set(yearsByInd.map(x => x.pubYear));
          if (uniqueYears.size > 1) crossJoinMiss.push({ univName, conflicts: yearsByInd });
        }
      }

      // V4: 산식 필드 누락 수집
      // 필터용 사전 데이터 구성
      // ① numerator 소스(항상 sources[0])의 가용 공시연도 — 미가용 연도는 V4 제외
      const numSrcPubYears = new Map(); // indicator → Set<공시연도>
      for (const item of valid) {
        const rule = calcRules[item.indicator];
        if (!rule || rule.min_of || rule.rolling_avg || rule.coalesce) continue;
        const numAgg = rawMap.get(item.sources[0]);
        const availYears = new Set();
        if (numAgg) for (const rows of numAgg.values())
          for (const row of rows) if (row.공시연도) availYears.add(row.공시연도);
        numSrcPubYears.set(item.indicator, availYears);
      }
      // ② 폐교연도 맵 (기준대학명 → 폐교연도) — 폐교 이후 연도는 V4 제외
      const closedYearMap = new Map();
      for (const entry of (State.original.기준대학 || []))
        if (entry.폐교연도 && entry.대학명 === entry.기준대학명)
          closedYearMap.set(entry.기준대학명, parseInt(entry.폐교연도));

      const zeroFields = {}; // indicator → [{univName, pubYear, field, role}]
      for (const item of valid) {
        const rule = calcRules[item.indicator];
        if (!rule || rule.min_of || rule.rolling_avg || rule.coalesce) continue;
        zeroFields[item.indicator] = [];
        const availYears = numSrcPubYears.get(item.indicator);
        for (const [mapKey, rawRow] of mergedRaw) {
          // 폐교 이후 연도 제외
          const closedYear = closedYearMap.get(rawRow.기준대학명);
          if (closedYear && rawRow.공시연도 >= closedYear) continue;
          // numerator: 소스가 이 공시연도를 커버할 때만 검사
          if (!availYears || availYears.size === 0 || availYears.has(rawRow.공시연도)) {
            for (const f of (rule.numerator || [])) {
              if (rawRow[f] == null)
                zeroFields[item.indicator].push({ univName: rawRow.기준대학명, pubYear: rawRow.공시연도, field: f, role: 'numerator' });
            }
          }
          // denominator: 항상 검사 (primary 소스 기반이므로 실제 누락만 표시됨)
          const dbs = Array.isArray(rule.denominator_base) ? rule.denominator_base : (rule.denominator_base ? [rule.denominator_base] : []);
          for (const db of dbs.filter(d => isNaN(Number(d)))) {
            if (rawRow[db] == null)
              zeroFields[item.indicator].push({ univName: rawRow.기준대학명, pubYear: rawRow.공시연도, field: db, role: 'denominator' });
          }
        }
      }

      this._renderValidationReport({ nearMissNames, fullyMissNames, tempJoinMiss, crossJoinMiss, zeroFields, valid });
    } catch (e) {
      document.getElementById('cache-validation-summary').textContent = `❌ 오류: ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 데이터 검증';
    }
  },

  /** 검증 섹션 <details> HTML 반환. count>0이면 열림(❌), 0이면 닫힘(✅). */
  _renderValidationSection(count, tag, title, bodyHtml, { sectionStyle, summaryStyle, bodyStyle }) {
    const open  = count > 0 ? ' open' : '';
    const icon  = count > 0 ? '<span style="color:#ef4444;">❌</span>' : '<span style="color:#16a34a;">✅</span>';
    const badge = count > 0 ? `<span style="color:#ef4444;">${count}건</span>` : '';
    return `<details${open} style="${sectionStyle}"><summary style="${summaryStyle}">${icon} [${esc(tag)}] ${esc(title)} ${badge}</summary><div style="${bodyStyle}">${bodyHtml}</div></details>`;
  },

  _renderValidationReport({ nearMissNames, fullyMissNames, tempJoinMiss, crossJoinMiss, zeroFields, valid }) {
    this._lastZeroFields = zeroFields;
    const e = esc;

    const v1aCount = [...nearMissNames.values()].reduce((a, arr) => a + arr.length, 0);
    const v1bCount = [...fullyMissNames.values()].reduce((a, arr) => a + arr.length, 0);
    const v1Count  = v1aCount + v1bCount;
    const v2Count  = Object.values(tempJoinMiss).reduce((a, arr) => a + arr.length, 0);
    const v3Count  = crossJoinMiss.length;
    const v4Count  = Object.values(zeroFields).reduce((a, arr) => a + arr.length, 0);
    const total    = (v1Count > 0) + (v2Count > 0) + (v3Count > 0) + (v4Count > 0);

    const summaryEl = document.getElementById('cache-validation-summary');
    if (total === 0) {
      summaryEl.innerHTML = '<span style="color:#16a34a;font-weight:600;">✅ 이슈 없음 — 모든 join이 정상입니다.</span>';
    } else {
      const parts = [];
      if (v1aCount) parts.push(`V1-A: near-miss ${v1aCount}건`);
      if (v1bCount) parts.push(`V1-B: 완전 미등록 ${v1bCount}건 (캐시 제외)`);
      if (v2Count)  parts.push(`V2: 1단계 join 실패 ${v2Count}건`);
      if (v3Count)  parts.push(`V3: 공시연도 불일치 ${v3Count}건`);
      if (v4Count)  parts.push(`V4: 산식 필드 누락 ${v4Count}건`);
      summaryEl.innerHTML = `<span style="color:#ef4444;font-weight:600;">⚠ 총 ${total}개 유형 이슈</span> — ${parts.join(' &nbsp;·&nbsp; ')}`;
    }

    const styles = {
      sectionStyle: 'border-top:1px solid var(--border);',
      summaryStyle: 'padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600;list-style:none;display:flex;align-items:center;gap:8px;',
      bodyStyle:    'padding:0 16px 14px;font-size:12.5px;',
    };
    const tableStyle = 'border-collapse:collapse;width:100%;font-size:12px;';
    const thStyle = 'text-align:left;padding:5px 8px;background:var(--bg-subtle,#f8fafc);border-bottom:1px solid var(--border);color:var(--text-muted);font-weight:600;white-space:nowrap;';
    const tdStyle = 'padding:4px 8px;border-bottom:1px solid var(--border);vertical-align:top;';
    const S = styles;

    // V1-A
    let v1aBody = v1aCount === 0
      ? '<p style="color:#16a34a;margin:6px 0;">공백 차이로 인한 near-miss 없음.</p>'
      : (() => {
          let h = '<p style="font-size:12px;color:var(--text-muted);margin:6px 0 8px;">기준대학.json에 등록된 이름과 공백 차이로 매칭이 누락된 케이스입니다. 소스 파일 재정규화 또는 기준대학.json에 별칭 추가가 필요합니다.</p>';
          h += `<table style="${tableStyle}"><thead><tr><th style="${thStyle}">소스 파일</th><th style="${thStyle}">원시 대학명 (raw)</th><th style="${thStyle}">기준대학.json 예상 키</th></tr></thead><tbody>`;
          for (const [source, misses] of nearMissNames) {
            for (const { raw, suggested } of misses)
              h += `<tr><td style="${tdStyle}">${e(source)}</td><td style="${tdStyle}">${e(raw)}</td><td style="${tdStyle};color:#d97706;">${e(suggested)}</td></tr>`;
          }
          return h + '</tbody></table>';
        })();

    // V1-B
    let v1bBody = v1bCount === 0
      ? '<p style="color:#16a34a;margin:6px 0;">미등록 대학 없음 — 모든 대학이 기준대학.json에 등록되어 있습니다.</p>'
      : (() => {
          let h = '<p style="font-size:12px;color:#ef4444;font-weight:600;margin:6px 0 4px;">캐시 생성 시 아래 대학의 데이터는 제외됩니다.</p>';
          h += '<p style="font-size:12px;color:var(--text-muted);margin:0 0 8px;">기준대학 매핑 탭에서 해당 대학을 추가한 뒤 캐시를 재생성하세요.</p>';
          h += `<table style="${tableStyle}"><thead><tr><th style="${thStyle}">소스 파일</th><th style="${thStyle}">미등록 대학명</th></tr></thead><tbody>`;
          for (const [source, names] of fullyMissNames)
            for (const raw of names)
              h += `<tr><td style="${tdStyle}">${e(source)}</td><td style="${tdStyle};color:#ef4444;font-weight:500;">${e(raw)}</td></tr>`;
          return h + '</tbody></table>';
        })();

    // V2
    let v2Body = v2Count === 0
      ? '<p style="color:#16a34a;margin:6px 0;">모든 복수 소스 지표가 정상 join됩니다.</p>'
      : (() => {
          const multiOnly = valid.filter(i => i.sources.length > 1);
          if (!multiOnly.length) return '<p style="color:var(--text-muted);margin:6px 0;">복수 소스 지표 없음.</p>';
          let h = `<table style="${tableStyle}"><thead><tr><th style="${thStyle}">지표</th><th style="${thStyle}">기준연도</th><th style="${thStyle}">대학명</th><th style="${thStyle}">누락 소스</th></tr></thead><tbody>`;
          let shown = 0;
          outer: for (const item of multiOnly) {
            for (const miss of (tempJoinMiss[item.indicator] || [])) {
              if (shown >= 50) { h += `<tr><td colspan="4" style="${tdStyle}color:var(--text-muted);">이하 생략…</td></tr>`; break outer; }
              h += `<tr><td style="${tdStyle}">${e(item.indicator)}</td><td style="${tdStyle}">${e(miss.baseYear)}</td><td style="${tdStyle}">${e(miss.univName)}</td><td style="${tdStyle}">${miss.missing.map(s => e(s.split('.')[0])).join(', ')}</td></tr>`;
              shown++;
            }
          }
          return h + '</tbody></table>';
        })();

    // V3
    let v3Body = v3Count === 0
      ? '<p style="color:#16a34a;margin:6px 0;">지표 간 공시연도가 일치합니다.</p>'
      : (() => {
          let h = `<table style="${tableStyle}"><thead><tr><th style="${thStyle}">대학명</th><th style="${thStyle}">지표별 공시연도</th></tr></thead><tbody>`;
          for (const { univName, conflicts } of crossJoinMiss.slice(0, 30))
            h += `<tr><td style="${tdStyle}">${e(univName)}</td><td style="${tdStyle}">${conflicts.map(c => `${e(c.indicator)}: ${e(c.pubYear)}`).join(' / ')}</td></tr>`;
          if (crossJoinMiss.length > 30) h += `<tr><td colspan="2" style="${tdStyle}color:var(--text-muted);">외 ${crossJoinMiss.length-30}건 생략</td></tr>`;
          return h + '</tbody></table>';
        })();

    // V4
    let v4Body = v4Count === 0
      ? '<p style="color:#16a34a;margin:6px 0;">모든 산식 필드가 존재합니다.</p>'
      : (() => {
          let h = `<button class="btn btn-secondary btn-sm" style="margin-bottom:8px;" onclick="CacheManager._downloadV4Csv()">⬇ CSV 다운로드</button>`;
          h += `<table style="${tableStyle}"><thead><tr><th style="${thStyle}">지표</th><th style="${thStyle}">대학명</th><th style="${thStyle}">공시연도</th><th style="${thStyle}">누락 필드</th><th style="${thStyle}">역할</th></tr></thead><tbody>`;
          let shown = 0;
          outer: for (const [indicator, misses] of Object.entries(zeroFields)) {
            for (const m of misses) {
              if (shown >= 50) { h += `<tr><td colspan="5" style="${tdStyle}color:var(--text-muted);">이하 생략… (전체 ${v4Count}건 — CSV 다운로드로 확인)</td></tr>`; break outer; }
              h += `<tr><td style="${tdStyle}">${e(indicator)}</td><td style="${tdStyle}">${e(m.univName)}</td><td style="${tdStyle}">${e(m.pubYear)}</td><td style="${tdStyle}">${e(m.field)}</td><td style="${tdStyle}">${e(m.role)}</td></tr>`;
              shown++;
            }
          }
          return h + '</tbody></table>';
        })();

    document.getElementById('cache-validation-report').innerHTML = [
      this._renderValidationSection(v1aCount, 'V1-A', '기준대학 near-miss (공백 차이로 매칭 누락)',     v1aBody, S),
      this._renderValidationSection(v1bCount, 'V1-B', '완전 미등록 대학 (캐시 제외됨)',                  v1bBody, S),
      this._renderValidationSection(v2Count,  'V2',   '1단계 join 실패 (소스 간 기준연도 불일치)',       v2Body,  S),
      this._renderValidationSection(v3Count,  'V3',   '2단계 join 불일치 (지표 간 공시연도 차이)',       v3Body,  S),
      this._renderValidationSection(v4Count,  'V4',   '산식 필드 누락 (지표값 0 처리 위험)',             v4Body,  S),
    ].join('');
  },

  _downloadV4Csv() {
    const data = this._lastZeroFields;
    if (!data) return;
    const rows = [['지표', '대학명', '공시연도', '누락 필드', '역할']];
    for (const [indicator, misses] of Object.entries(data)) {
      for (const m of misses) {
        rows.push([indicator, m.univName, m.pubYear, m.field, m.role]);
      }
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'v4_missing_fields.csv';
    a.click();
  },
};
