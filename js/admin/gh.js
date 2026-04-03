'use strict';

/* ══════════════════════════════════════════
   GitHub API
══════════════════════════════════════════ */
const GH = {
  get token() { return sessionStorage.getItem('gh_token') || ''; },
  get owner() { return (localStorage.getItem('gh_repo') || '').split('/')[0] || ''; },
  get repo()  { return (localStorage.getItem('gh_repo') || '').split('/')[1] || ''; },

  headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  },

  async getFile(path) {
  // 대용량/한글 파일: raw + sha 병렬 조회
  const [contentRes, sha] = await Promise.all([
    fetch(
      `https://raw.githubusercontent.com/${this.owner}/${this.repo}/main/${path}`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    ),
    this.getFileSha(path),
  ]);

  if (!contentRes.ok) throw new Error(`${contentRes.status} — ${path}`);

  // Response.json()은 브라우저 내부에서 스트리밍 파싱 → atob보다 훨씬 빠름
  const content = await contentRes.json();
  return { content, sha };
},

  /** 1MB 초과 파일: raw.githubusercontent.com에서 직접 다운로드 + commit SHA 조회 */
  async _getFileLarge(path) {
    // raw content 다운로드 (GitHub API blob 제한 없음, private 저장소 대응 인증 포함)
    const contentRes = await fetch(
      `https://raw.githubusercontent.com/${this.owner}/${this.repo}/main/${path}`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    if (!contentRes.ok) throw new Error(`콘텐츠 다운로드 실패 — ${contentRes.status}`);
    const text = await contentRes.text();
    const content = JSON.parse(text);

    // commit SHA 조회 (putFile용)
    const refRes = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/refs/heads/main`,
      { headers: this.headers() }
    );
    if (!refRes.ok) throw new Error(`ref 조회 실패 — ${refRes.status}`);
    const refData = await refRes.json();
    const commitSha = refData.object.sha;

    return { content, sha: commitSha };
  },

  /** SHA만 조회 (대용량 파일도 안전 — content 디코딩 없음). 파일 없으면 null 반환. */
  async getFileSha(path) {
    const res = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
      { headers: this.headers() }
    );
    if (res.ok) {
      const data = await res.json();
      return data.sha || null;
    }
    if (res.status === 404) return null;
    // 1MB 초과 파일(403) — Git Trees API로 fallback
    try {
      const refRes = await fetch(
        `https://api.github.com/repos/${this.owner}/${this.repo}/git/refs/heads/main`,
        { headers: this.headers() }
      );
      if (!refRes.ok) return null;
      const refData = await refRes.json();
      const commitRes = await fetch(refData.object.url, { headers: this.headers() });
      if (!commitRes.ok) return null;
      const commitData = await commitRes.json();
      const treeRes = await fetch(
        `${commitData.tree.url}?recursive=1`,
        { headers: this.headers() }
      );
      if (!treeRes.ok) return null;
      const treeData = await treeRes.json();
      const file = treeData.tree.find(f => f.path === path);
      return file ? file.sha : null;
    } catch {
      return null;
    }
  },

  async putFile(path, content, sha, message) {
    const text = JSON.stringify(content, null, 2);
    const b64  = btoa(unescape(encodeURIComponent(text)));
    const res  = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(sha ? { message, content: b64, sha } : { message, content: b64 }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `${res.status}`);
    }
    const data = await res.json();
    return data.content.sha;
  },

  async listDataFiles() {
    const EXCLUDE = new Set([
      'benchmark_cache.json', 'benchmark_config.json',
      '기준대학.json', '대학기본정보.json', 'manifest.json', '학과분류.json',
    ]);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/data`,
        { headers: this.headers() }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data
        .filter(f => f.type === 'file' && f.name.endsWith('.json') && !EXCLUDE.has(f.name))
        .map(f => f.name.replace(/\.json$/, ''))
        .sort();
    } catch { return []; }
  },
};

/* ══════════════════════════════════════════
   유틸
══════════════════════════════════════════ */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
