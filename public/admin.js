// 관리자 모드: 블록 편집 · Draft 저장 · 미리보기 · 게시 · 롤백
// 블록 이름은 사이트와 같은 목록(js/core.js BLOCKS), 서버 호출은 js/api.js 를 쓴다.
import { BLOCKS, $, esc, toast } from './js/core.js';
import { api } from './js/api.js';

(() => {
  // 빌더가 다른 화면 안(iframe)에서 열리면 전체 창으로 빼낸다
  if (window.self !== window.top) {
    window.top.location.href = '/admin';
    return;
  }

  const blockInfo = (type) => ({ label: BLOCKS[type]?.adminLabel || type, limit: BLOCKS[type]?.limitLabel || '개수' });
  const SIZE_LABEL = { full: '전체 폭', half: '절반 폭' };

  let server = null;   // 서버에 저장된 상태 (draft, published, versions …)
  let draft = null;    // 편집 중인 사본 (저장 전)
  let savedJson = '';  // 마지막으로 저장된 Draft

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const when = (iso) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // 관리자 API 호출. 로그인이 풀렸으면(401) 로그인 화면을 다시 띄운다
  async function call(request) {
    try {
      return await request;
    } catch (err) {
      if (err.status === 401) showLogin('로그인이 만료됐어요. 다시 입력하세요.');
      throw err;
    }
  }

  const isUnsaved = () => JSON.stringify(draft) !== savedJson;

  function applyServer(next, { keepEdits = false } = {}) {
    server = next;
    savedJson = JSON.stringify(server.draft);
    if (!keepEdits) draft = clone(server.draft);
    render();
  }

  // ---------- 변경 사항 계산 (게시본 대비) ----------

  function diff(from, to) {
    const out = [];
    if (from.siteTitle !== to.siteTitle) out.push(`사이트 이름: "${from.siteTitle}" → "${to.siteTitle}"`);
    if (from.tagline !== to.tagline) out.push('한 줄 소개 변경');
    if (from.blocks.map((b) => b.id).join() !== to.blocks.map((b) => b.id).join()) out.push('블록 순서 변경');
    for (const b of to.blocks) {
      const a = from.blocks.find((x) => x.id === b.id);
      if (!a) continue;
      if (a.visible !== b.visible) out.push(`"${b.title}" ${b.visible ? '표시' : '숨김'}`);
      if (a.title !== b.title) out.push(`제목: "${a.title}" → "${b.title}"`);
      if (a.limit !== b.limit) out.push(`"${b.title}" ${blockInfo(b.type).limit} ${a.limit} → ${b.limit}`);
      if (a.size !== b.size) out.push(`"${b.title}" ${SIZE_LABEL[a.size]} → ${SIZE_LABEL[b.size]}`);
    }
    return out;
  }

  function changedIds(from, to) {
    const ids = new Set();
    to.blocks.forEach((b, i) => {
      const a = from.blocks.find((x) => x.id === b.id);
      if (!a || from.blocks.indexOf(a) !== i || a.visible !== b.visible || a.title !== b.title || a.limit !== b.limit || a.size !== b.size) ids.add(b.id);
    });
    return ids;
  }

  // ---------- 렌더링 ----------

  function render() {
    $('#f-title').value = draft.siteTitle;
    $('#f-tagline').value = draft.tagline;
    renderBlocks();
    renderVersions();
    renderStatus();
  }

  function renderBlocks() {
    const n = draft.blocks.length;
    $('#block-list').innerHTML = draft.blocks.map((b, i) => {
      const info = blockInfo(b.type);
      return `
        <li class="block-row ${b.visible ? '' : 'off'}" data-idx="${i}" data-id="${esc(b.id)}">
          <span class="handle" title="끌어서 순서 변경">⋮⋮</span>
          <span class="row-type"><span class="num">${i + 1}</span><span class="lbl">${esc(info.label)}</span></span>
          <span class="row-move">
            <button type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">▲</button>
            <button type="button" data-move="1" ${i === n - 1 ? 'disabled' : ''} aria-label="아래로">▼</button>
          </span>
          <div class="row-fields">
            <label class="switch" title="표시 / 숨김"><input type="checkbox" data-field="visible" aria-label="표시" ${b.visible ? 'checked' : ''}><span></span></label>
            <input data-field="title" value="${esc(b.title)}" maxlength="40" aria-label="블록 제목">
            <input data-field="limit" type="number" min="1" max="20" value="${b.limit}" title="${esc(info.limit)}" aria-label="${esc(info.limit)}">
            <select data-field="size" aria-label="크기">
              <option value="full" ${b.size === 'full' ? 'selected' : ''}>전체 폭</option>
              <option value="half" ${b.size === 'half' ? 'selected' : ''}>절반 폭</option>
            </select>
          </div>
        </li>`;
    }).join('');
    markChangedRows();
  }

  function markChangedRows() {
    const ids = changedIds(server.published, draft);
    document.querySelectorAll('.block-row').forEach((row) => {
      row.classList.toggle('changed', ids.has(row.dataset.id));
      row.classList.toggle('off', !draft.blocks[row.dataset.idx].visible);
    });
  }

  function renderStatus() {
    const unsaved = isUnsaved();
    const changes = diff(server.published, draft);

    const save = $('#pill-save');
    save.className = 'pill ' + (unsaved ? 'pill-warn' : 'pill-ok');
    save.textContent = unsaved ? '● 저장 안 된 변경' : `✓ Draft 저장됨 · ${when(server.draftUpdatedAt)}`;

    const pub = $('#pill-publish');
    pub.className = 'pill ' + (changes.length ? 'pill-accent' : 'pill-muted');
    pub.textContent = changes.length ? `게시 대기 변경 ${changes.length}건` : '실제 사이트와 동일';

    $('#pill-version').textContent = `현재 게시본 v${server.publishedVersion}`;
    $('#btn-save').disabled = !unsaved;
    $('#btn-publish').disabled = changes.length === 0;
    markChangedRows();
  }

  function renderVersions() {
    const list = [...server.versions].reverse();
    $('#versions').innerHTML = list.map((v) => {
      const current = v.version === server.publishedVersion;
      return `
        <li class="version ${current ? 'current' : ''}">
          <span class="v">v${v.version}</span>
          <span class="info"><div class="note">${esc(v.note)}</div><div class="when">${when(v.publishedAt)}</div></span>
          ${current ? '<span class="live">● LIVE</span>' : `<button class="btn btn-sm" data-rollback="${v.version}">이 버전으로 롤백</button>`}
        </li>`;
    }).join('');
  }

  // ---------- 미리보기 ----------

  const frame = $('#frame');
  const previewPath = () => document.querySelector('input[name="pv"]:checked').value;

  function reloadFrame() {
    const path = previewPath();
    frame.src = path + (path.includes('?') ? '&' : '?') + 't=' + Date.now();
    $('#frame-wrap').classList.toggle('live', path === '/');
    $('#preview-note').textContent = path === '/' ? '사용자가 지금 보고 있는 화면입니다' : (isUnsaved() ? '저장된 Draft를 보여줍니다 — 저장하면 갱신돼요' : '저장된 Draft를 보여줍니다');
  }

  $('#preview-mode').addEventListener('change', reloadFrame);
  $('#preview-device').addEventListener('change', () => {
    $('#frame-wrap').classList.toggle('mobile', document.querySelector('input[name="dv"]:checked').value === 'mobile');
  });

  // ---------- 편집 ----------

  function onField(e) {
    const t = e.target;
    const row = t.closest('.block-row');
    if (!row || !t.dataset.field) return;
    const b = draft.blocks[row.dataset.idx];
    if (t.dataset.field === 'visible') b.visible = t.checked;
    else if (t.dataset.field === 'limit') {
      const n = Number.parseInt(t.value, 10);
      if (!Number.isNaN(n)) b.limit = Math.min(20, Math.max(1, n));
    } else b[t.dataset.field] = t.value;
    renderStatus();
  }

  const list = $('#block-list');
  list.addEventListener('input', onField);
  list.addEventListener('change', (e) => {
    onField(e);
    if (e.target.dataset.field === 'limit') e.target.value = draft.blocks[e.target.closest('.block-row').dataset.idx].limit;
    if (e.target.dataset.field === 'title' && !e.target.value.trim()) {
      const b = draft.blocks[e.target.closest('.block-row').dataset.idx];
      b.title = server.published.blocks.find((x) => x.id === b.id)?.title || b.title;
      e.target.value = b.title;
      renderStatus();
    }
  });

  function move(from, to) {
    if (to < 0 || to >= draft.blocks.length || from === to) return;
    const [b] = draft.blocks.splice(from, 1);
    draft.blocks.splice(to, 0, b);
    renderBlocks();
    renderStatus();
  }

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-move]');
    if (!btn) return;
    const idx = Number(btn.closest('.block-row').dataset.idx);
    move(idx, idx + Number(btn.dataset.move));
  });

  // 드래그 앤 드롭 (손잡이를 잡았을 때만 끌 수 있게 해서 입력칸 선택을 방해하지 않는다)
  let dragIdx = null;
  list.addEventListener('mousedown', (e) => {
    const h = e.target.closest('.handle');
    if (h) h.closest('.block-row').draggable = true;
  });
  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.block-row');
    dragIdx = Number(row.dataset.idx);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragIdx));
  });
  const clearDrop = () => list.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
  list.addEventListener('dragover', (e) => {
    if (dragIdx === null) return;
    const row = e.target.closest('.block-row');
    if (!row) return;
    e.preventDefault();
    clearDrop();
    const r = row.getBoundingClientRect();
    row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  list.addEventListener('drop', (e) => {
    const row = e.target.closest('.block-row');
    if (!row || dragIdx === null) return;
    e.preventDefault();
    let to = Number(row.dataset.idx);
    if (row.classList.contains('drop-after')) to += 1;
    if (to > dragIdx) to -= 1;
    const from = dragIdx;
    dragIdx = null;
    move(from, to);
  });
  list.addEventListener('dragend', (e) => {
    const row = e.target.closest('.block-row');
    if (row) { row.classList.remove('dragging'); row.draggable = false; }
    dragIdx = null;
    clearDrop();
  });

  $('#f-title').addEventListener('input', (e) => { draft.siteTitle = e.target.value; renderStatus(); });
  $('#f-tagline').addEventListener('input', (e) => { draft.tagline = e.target.value; renderStatus(); });

  // ---------- 저장 / 미리보기 / 게시 / 롤백 ----------

  async function saveDraft({ quiet = false } = {}) {
    const next = await call(api.admin.saveDraft(draft));
    applyServer(next);
    if (previewPath() === '/preview') reloadFrame();
    if (!quiet) toast('Draft를 저장했어요. 실제 사이트는 그대로예요.');
  }

  $('#btn-save').addEventListener('click', () => saveDraft().catch((e) => toast(e.message)));

  $('#btn-preview').addEventListener('click', async () => {
    // 팝업 차단을 피하려고 창을 먼저 연 뒤 주소를 채운다
    const win = window.open('about:blank', '_blank');
    try {
      if (isUnsaved()) await saveDraft({ quiet: true });
      if (win) win.location = '/preview';
      else location.href = '/preview';
    } catch (e) {
      if (win) win.close();
      toast(e.message);
    }
  });

  const dialog = $('#publish-dialog');
  $('#btn-publish').addEventListener('click', () => {
    const changes = diff(server.published, draft);
    $('#change-summary').innerHTML = changes.map((c) => `<li>${esc(c)}</li>`).join('');
    $('#publish-note').value = '';
    dialog.showModal();
  });
  $('#publish-cancel').addEventListener('click', () => dialog.close());
  $('#publish-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      if (isUnsaved()) await saveDraft({ quiet: true });
      const note = $('#publish-note').value.trim() || diff(server.published, draft).slice(0, 2).join(', ');
      const next = await call(api.admin.publish(note));
      dialog.close();
      applyServer(next);
      reloadFrame();
      toast(`v${next.publishedVersion} 게시 완료 — 실제 사이트에 반영됐어요`);
    } catch (err) {
      toast(err.message);
    }
  });

  $('#versions').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-rollback]');
    if (!btn) return;
    const v = Number(btn.dataset.rollback);
    if (!confirm(`실제 사이트를 v${v} 구성으로 되돌릴까요?\n\n· 커뮤니티 글·댓글·투표는 그대로 유지됩니다\n· 편집 중인 Draft는 바뀌지 않습니다`)) return;
    try {
      const next = await call(api.admin.rollback(v));
      applyServer(next, { keepEdits: true });
      reloadFrame();
      toast(`v${v} 구성으로 롤백해서 v${next.publishedVersion}로 게시했어요`);
    } catch (err) {
      toast(err.message);
    }
  });

  $('#btn-reset').addEventListener('click', async () => {
    if (!confirm('편집 중인 Draft를 버리고 현재 게시본으로 되돌릴까요?')) return;
    try {
      applyServer(await call(api.admin.resetDraft()));
      if (previewPath() === '/preview') reloadFrame();
      toast('Draft를 현재 게시본과 같게 맞췄어요');
    } catch (err) {
      toast(err.message);
    }
  });

  // ---------- 관리자 모드 종료 ----------

  let leaving = false;
  const exitAdmin = async () => {
    leaving = true;
    // 비밀번호로 들어온 경우 종료하면 로그아웃까지 한다
    if (session?.required) await api.admin.logout().catch(() => {});
    location.href = '/';
  };
  const exitDialog = $('#exit-dialog');

  $('#btn-exit').addEventListener('click', () => {
    if (draft && isUnsaved()) exitDialog.showModal();
    else exitAdmin();
  });
  $('#exit-cancel').addEventListener('click', () => exitDialog.close());
  $('#exit-discard').addEventListener('click', exitAdmin);
  $('#exit-save').addEventListener('click', async () => {
    try {
      await saveDraft({ quiet: true });
      exitAdmin();
    } catch (err) {
      exitDialog.close();
      toast(err.message);
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (!leaving && draft && isUnsaved()) e.preventDefault();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (isUnsaved()) saveDraft().catch((err) => toast(err.message));
    }
  });

  // ---------- 로그인 / 시작 ----------

  let session = null;

  function showLogin(message) {
    $('#login-message').textContent = message || '관리자 비밀번호를 입력하세요.';
    $('#login-screen').hidden = false;
    $('#login-password').value = '';
    $('#login-password').focus();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.hidden = true;
    $('#login-submit').disabled = true;
    try {
      await api.admin.login($('#login-password').value);
      session = { ...session, authed: true };
      $('#login-screen').hidden = true;
      // 이미 편집 중이었다면(로그인 만료) 편집 내용을 지키고, 처음이면 서버 상태를 불러온다
      if (!draft) applyServer(await call(api.admin.state()));
      reloadFrame();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      $('#login-submit').disabled = false;
    }
  });

  async function start() {
    try {
      session = await api.admin.session();
      if (session.locked) {
        showLogin('관리자 비밀번호(ADMIN_PASSWORD)가 설정되지 않아 관리자 모드가 잠겨 있어요. Vercel 환경 변수에 추가한 뒤 다시 배포하세요.');
        $('#login-password').hidden = true;
        $('#login-submit').hidden = true;
        return;
      }
      if (!session.authed) return showLogin();
      applyServer(await call(api.admin.state()));
      reloadFrame(); // 미리보기는 로그인한 뒤에만 불러온다 (Draft 는 관리자만 볼 수 있다)
    } catch (e) {
      if (e.status !== 401) toast('서버에 연결할 수 없어요: ' + e.message);
    }
  }

  start();
})();
