'use strict';

/* ══════════════════════════════════════════
   탭 전환
══════════════════════════════════════════ */
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  btn.classList.add('active');
  const noSaveBar = name === 'data' || name === 'cache';
  if (name === 'hakgwa') {
    document.getElementById('tab-기준대학').style.display = 'none';
    document.getElementById('tab-hakgwa').style.display = '';
  }
  const saveBar = document.querySelector('.save-bar');
  if (saveBar) saveBar.style.display = noSaveBar ? 'none' : '';
  const restoreBanner = document.getElementById('restore-banner');
  if (restoreBanner) restoreBanner.style.bottom = noSaveBar ? '0' : '';
  document.body.style.paddingBottom = noSaveBar ? '0' : '';
}

/* ══════════════════════════════════════════
   GitHub 연결
══════════════════════════════════════════ */
async function ghConnect() {
  const repoVal  = document.getElementById('gh-repo-input').value.trim();
  const tokenVal = document.getElementById('gh-token-input').value.trim();
  if (!repoVal || !tokenVal) { alert('저장소와 토큰을 입력하세요.'); return; }

  localStorage.setItem('gh_repo', repoVal);
  sessionStorage.setItem('gh_token', tokenVal);

  const statusEl = document.getElementById('gh-status');
  statusEl.textContent = '● 연결 중…';
  statusEl.className = 'disconnected';

  try {
    await loadAll();
    State.connected = true;
    statusEl.textContent = `● ${repoVal}`;
    statusEl.className = 'connected';
    document.getElementById('btn-save').disabled = false;
    document.getElementById('tab-nav').style.display = '';
    document.getElementById('tab-기준대학').style.display = '';
    setClean('연결 완료 — 데이터를 불러왔습니다.');

    // 저장되지 않은 초안 확인
    const draft = loadDraft();
    if (draft) {
      const ts = new Date(draft.ts).toLocaleString('ko-KR');
      document.getElementById('restore-msg').textContent =
        `저장하지 않은 초안이 있습니다 (${ts}). 복원하시겠습니까?`;
      document.getElementById('restore-banner').classList.add('show');
    }
  } catch (e) {
    statusEl.textContent = `● 오류: ${e.message}`;
    statusEl.className = 'error';
  }
}
async function loadAll() {
  // 1단계: 핵심 파일만 먼저 로드 (빠름)
  const [기준대학, calc, manifest, fieldMapping, dataFiles] = await Promise.all([
    GH.getFile('data/기준대학.json'),
    GH.getFile('calc_rules.json'),
    GH.getFile('data/manifest.json'),
    GH.getFile('field_mapping.json'),
    GH.listDataFiles(),
  ]);

  State.dataFiles = dataFiles;
  State.sha.기준대학 = 기준대학.sha;
  State.sha.calc     = calc.sha;
  State.sha.manifest = manifest.sha;
  State.original.기준대학 = JSON.parse(JSON.stringify(기준대학.content));
  State.original.calc     = JSON.parse(JSON.stringify(calc.content));
  State.original.manifest = JSON.parse(JSON.stringify(manifest.content));

  State.fieldsBySource = Object.entries(fieldMapping.content)
    .map(([src, sec]) => ({ source: src === '__shared' ? '(공통 필드)' : src, fields: Object.keys(sec) }))
    .filter(g => g.fields.length > 0);
  State.fieldKeys = [...new Set(State.fieldsBySource.flatMap(g => g.fields))].sort();

  renderMappingTable(기준대학.content);
  renderCalcRules(calc.content);
  renderManifest(manifest.content);
  refreshDatalistOptions();

  // 2단계: 학과분류는 비동기로 별도 로드 (탭 진입 전에 완료되면 충분)
  loadHakgwaAsync();
}

async function loadHakgwaAsync() {
  try {
    // GitHub Pages로 직접 fetch — Base64 변환 없음
    const res = await fetch(
      `https://${GH.owner}.github.io/${GH.repo}/data/학과분류.json`,
      { cache: 'no-store' }
    );
    if (!res.ok) throw new Error(res.status);
    const content = await res.json();

    // sha는 저장용으로만 필요 — 별도 조회
    const sha = await GH.getFileSha('data/학과분류.json');

    State.sha.hakgwa = sha;
    State.original.hakgwa = content;
    renderHakgwaTable(content || []);
  } catch (e) {
    State.sha.hakgwa = null;
    State.original.hakgwa = [];
    renderHakgwaTable([]);
    if (bannerEl) {
      bannerEl.className = 'banner error show';
      bannerEl.textContent = '학과분류.json 로드 실패 — 파일 업로드로 직접 추가하세요.';
    }
  }
}
/* ══════════════════════════════════════════
   저장
══════════════════════════════════════════ */
async function saveAll() {
  if (!State.connected) { alert('먼저 GitHub에 연결하세요.'); return; }

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = '저장 중…';

  try {
    const [newData기준대학, newDataCalc, newDataManifest, newDataHakgwa] = [
      collectMappingData(),
      collectCalcRules(),
      collectManifest(),
      collectHakgwaData(),
    ];

    const now = new Date().toISOString().slice(0,16).replace('T',' ');
    const msg = `관리자 업데이트 (${now})`;

    // 순차 저장 — 병렬 PUT 시 GitHub SHA race condition 방지
    const cur기준대학 = await GH.getFile('data/기준대학.json');
    State.sha.기준대학 = await GH.putFile('data/기준대학.json', newData기준대학, cur기준대학.sha, msg);

    const curCalc = await GH.getFile('calc_rules.json');
    State.sha.calc = await GH.putFile('calc_rules.json', newDataCalc, curCalc.sha, msg);

    const curManifest = await GH.getFile('data/manifest.json');
    State.sha.manifest = await GH.putFile('data/manifest.json', newDataManifest, curManifest.sha, msg);

    const curHakgwa = await GH.getFile('data/학과분류.json').catch(() => ({ sha: null }));
    State.sha.hakgwa = await GH.putFile('data/학과분류.json', newDataHakgwa, curHakgwa.sha, msg);

    clearDraft();
    setClean(`저장 완료 — ${now}`);
  } catch (e) {
    alert(`저장 실패: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 GitHub에 저장';
  }
}

function confirmReset() {
  if (!State.dirty || confirm('변경사항을 모두 되돌릴까요?')) {
    renderMappingTable(State.original.기준대학);
    renderCalcRules(State.original.calc);
    renderManifest(State.original.manifest);
    clearDraft();
    setClean();
  }
}

/* ══════════════════════════════════════════
   공통 datalist 갱신
══════════════════════════════════════════ */
function refreshDatalistOptions() {
  const dlFiles = document.getElementById('dl-data-files');
  if (dlFiles) dlFiles.innerHTML = State.dataFiles.map(f => `<option value="${esc(f)}">`).join('');
}

window.addEventListener('beforeunload', e => {
  if (State.dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* ── 초기화: 저장된 repo 복원 ── */
(function init() {
  const savedRepo = localStorage.getItem('gh_repo');
  if (savedRepo) document.getElementById('gh-repo-input').value = savedRepo;
})();
