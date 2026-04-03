'use strict';

/* ══════════════════════════════════════════
   모듈 수준 상수
══════════════════════════════════════════ */
const OUR_UNIV = '부산외국어대학교';
const METRO    = new Set(['서울', '경기', '인천']);

/* ══════════════════════════════════════════
   앱 상태
══════════════════════════════════════════ */
const State = {
  connected: false,
  sha: { 기준대학: null, calc: null, manifest: null, hakgwa: null },
  original: { 기준대학: [], calc: {}, manifest: [], hakgwa: [] },
  dirty: false,
  fieldKeys: [],        // field_mapping.json 키 목록 (연결 시 로드)
  fieldsBySource: [],   // [{ source, fields[] }] — 소스별 그룹 (자동완성용)
  dataFiles: [],        // data/ 폴더 내 항목 JSON 파일명 목록 (연결 시 로드)
};

/* ══════════════════════════════════════════
   로컬 초안 자동저장
══════════════════════════════════════════ */
const DRAFT_KEY = 'admin_draft_v2';
let _draftTimer = null;

function saveDraft() {
  if (!State.connected) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      ts: new Date().toISOString(),
      repo: localStorage.getItem('gh_repo') || '',
      calc: calcData,
      manifest: manifestData,
      기준대학: collectMappingData(),
    }));
  } catch (e) { /* quota 초과 등 무시 */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    const repo = localStorage.getItem('gh_repo') || '';
    if (draft.repo && draft.repo !== repo) return null;
    return draft;
  } catch { return null; }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  document.getElementById('restore-banner').classList.remove('show');
}

function doRestoreDraft() {
  const draft = loadDraft();
  if (!draft) return;
  renderMappingTable(draft.기준대학 || []);
  renderCalcRules(draft.calc || {});
  renderManifest(draft.manifest || []);
  clearDraft();
  setDirty();
  const ts = new Date(draft.ts).toLocaleString('ko-KR');
  showBanner('banner-기준대학', 'success', `초안 복원 완료 (${ts})`);
}

function doDismissDraft() {
  clearDraft();
}

function setDirty() {
  State.dirty = true;
  const el = document.getElementById('status-msg');
  el.textContent = '저장되지 않은 변경사항이 있습니다.';
  el.className = 'status-msg dirty';
  // 2초 debounce 후 localStorage 초안 저장
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(saveDraft, 2000);
}
function setClean(msg) {
  State.dirty = false;
  const el = document.getElementById('status-msg');
  el.textContent = msg || '변경사항 없음';
  el.className = msg ? 'status-msg saved' : 'status-msg';
}
function showBanner(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `banner ${type} show`;
  el.innerHTML = msg;
}
function hideBanner(id) {
  const el = document.getElementById(id);
  if (el) el.className = 'banner';
}
