// 퓨쳐보드 사이트: 주소 이동 · 화면 그리기 · 사용자 동작
import {
  IS_PREVIEW, IS_EMBEDDED, IS_PHONE_FRAME, IS_PHONE, FORCED_DESKTOP, PHONE_STAGE, viewMode,
  state, $, esc, fmt, timeAgo, store, mine, api, toast, copyText, byNewest,
  currentPageType, homeHref, pageHref, blockTitle, WRITE_CATEGORIES,
} from './core.js';
import { blocks } from './home.js';
import { pages, applyQuery } from './pages.js';

const SESSION_GAP = 30 * 60 * 1000;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// ---------- 방문 기록 (내가 없는 동안 / 연속 방문) ----------

function trackVisit() {
  const now = Date.now();
  const visit = store.get('fb_visit', null);
  let awayFrom = null;

  if (visit) {
    // 30분 이상 비웠다가 들어오면 새 방문으로 보고, 마지막으로 본 시점부터 '없는 동안'을 계산한다
    awayFrom = now - visit.seen > SESSION_GAP ? visit.seen : visit.awayFrom;
  }
  state.awayFrom = awayFrom;
  if (IS_PREVIEW) return; // 미리보기는 방문 기록을 남기지 않는다

  store.set('fb_visit', { awayFrom, seen: now });

  const today = new Date().toLocaleDateString('sv-SE');
  const yesterday = new Date(now - 86400000).toLocaleDateString('sv-SE');
  const streak = store.get('fb_streak', null);
  let count = 1;
  if (streak && streak.day === today) count = streak.count;
  else if (streak && streak.day === yesterday) count = streak.count + 1;
  store.set('fb_streak', { day: today, count });

  if (count >= 2) {
    const el = $('#streak');
    el.textContent = `🔥 ${count}일 연속 방문`;
    el.hidden = false;
  }
}

// ---------- 그리기 ----------

const visibleBlocks = () => state.config.blocks.filter((b) => b.visible && blocks[b.type]);

function renderShell() {
  const cfg = state.config;
  $('#site-title').textContent = cfg.siteTitle;
  $('#logo').setAttribute('href', homeHref());
  $('#tagline').textContent = cfg.tagline;
  $('#hero-date').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('#preview-banner').hidden = !IS_PREVIEW;

  $('#nav').innerHTML = `<a href="${homeHref()}" data-link data-nav="home">홈</a>`
    + visibleBlocks().map((b) => `<a href="${pageHref(b.type)}" data-link data-nav="${esc(b.type)}">${esc(b.title)}</a>`).join('');

  if (IS_EMBEDDED && !IS_PHONE_FRAME) document.querySelectorAll('a[href="/admin"]').forEach((a) => { a.hidden = true; });

  // 틀 안(관리자 미리보기 · 휴대폰 틀)에서는 바깥 화면이 전환 버튼을 가진다
  const toDesktop = IS_PHONE && !FORCED_DESKTOP;
  const vt = $('#view-toggle');
  vt.hidden = IS_EMBEDDED;
  vt.innerHTML = toDesktop ? '🖥 PC<span class="vt-label"> 화면</span>' : '📱 모바일<span class="vt-label"> 화면</span>';
  vt.title = toDesktop ? 'PC 화면으로 보기' : '모바일 화면으로 보기';
  $('#view-return').hidden = !FORCED_DESKTOP;
}

// 막대 그래프는 이전 값에서 새 값으로 부드럽게 움직이게 한다
function captureBars(root) {
  const prev = {};
  root.querySelectorAll('[data-bar]').forEach((n) => { prev[n.dataset.bar] = n.style.width; });
  return prev;
}
function animateBars(root, prev) {
  root.querySelectorAll('[data-bar]').forEach((n) => {
    n.style.width = prev[n.dataset.bar] || '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { n.style.width = n.dataset.w + '%'; }));
  });
}

function renderBlock(block) {
  const el = document.getElementById('block-' + block.id);
  if (!el) return;
  const prev = captureBars(el);
  el.innerHTML = blocks[block.type](block, state.content);
  animateBars(el, prev);
}

function renderHome() {
  const view = $('#view');
  const list = visibleBlocks();
  view.className = 'blocks';
  view.innerHTML = list.length
    ? list.map((b) => `<section class="block ${b.size === 'half' ? 'half' : ''} ${b.type}" id="block-${esc(b.id)}" data-type="${esc(b.type)}"></section>`).join('')
    : '<div class="loading">표시할 블록이 없습니다. 관리자 모드에서 블록을 켜주세요.</div>';
  list.forEach(renderBlock);
}

function renderPage(type) {
  const view = $('#view');
  // 검색칸에 입력 중이면 다시 그린 뒤에도 커서를 그 자리에 둔다
  const active = document.activeElement;
  const focusId = active && view.contains(active) ? active.id : null;
  const caret = focusId && typeof active.selectionStart === 'number' ? active.selectionStart : null;

  const prev = captureBars(view);
  view.className = 'page-view';
  view.innerHTML = pages[type](state.content);
  animateBars(view, prev);

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (caret != null) el.setSelectionRange(caret, caret);
    }
  }
}

function renderRoute() {
  const type = currentPageType();
  const site = state.config.siteTitle;
  $('.hero').hidden = !!type;
  if (type) renderPage(type);
  else renderHome();
  document.title = (IS_PREVIEW ? '[미리보기] ' : '') + (type ? `${blockTitle(type)} · ${site}` : site);
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === (type || 'home')));
  // 휴대폰에서 옆으로 밀리는 메뉴: 지금 페이지 탭이 보이게 한다
  const on = $('#nav a.on');
  if (on) $('#nav').scrollLeft = on.offsetLeft - 16;
  updateCountdown();
}

// 동작 뒤 다시 그리기: 메인이면 해당 블록만, 페이지면 그 페이지 전체
function refresh(...types) {
  const type = currentPageType();
  if (type) renderPage(type);
  else state.config.blocks.filter((b) => b.visible && types.includes(b.type)).forEach(renderBlock);
}

// ---------- 주소 이동 ----------

function onRoute() {
  const type = currentPageType();
  const target = type ? applyQuery(type, new URLSearchParams(location.search)) : null;
  renderRoute();
  const el = target && document.getElementById(target);
  if (el) el.scrollIntoView({ block: 'center' });
  else window.scrollTo(0, 0);
}

function navigate(url) {
  const u = new URL(url, location.href);
  if (u.pathname + u.search === location.pathname + location.search) return onRoute();
  history.pushState(null, '', u.pathname + u.search + u.hash);
  onRoute();
}

window.addEventListener('popstate', onRoute);

// ---------- AI World Pulse 움직임 · 챌린지 마감 시계 ----------

function startPulse() {
  let tick = 0;
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const flash = (el, up) => {
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(up ? 'flash-up' : 'flash-down');
    setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 900);
  };
  const jitter = (el, delta, min) => {
    const prev = Number(el.dataset.val);
    const next = Math.max(min, prev + delta);
    el.dataset.val = next;
    el.textContent = fmt(next);
    if (next !== prev) flash(el, next > prev);
  };

  const rotateTicker = () => {
    const el = $('#ticker-text');
    if (!el) return;
    const recent = [...state.content.posts].sort(byNewest).slice(0, 6);
    if (!recent.length) return;
    const p = recent[tick % recent.length];
    el.classList.add('out');
    setTimeout(() => {
      el.textContent = `[${p.category}] ${p.title} — ${p.author} · ${timeAgo(p.createdAt)}`;
      el.classList.remove('out');
    }, 250);
  };

  rotateTicker();
  setInterval(() => {
    tick += 1;
    document.querySelectorAll('[data-live="discussing"]').forEach((d) => jitter(d, rand(-14, 18), 200));
    if (tick % 2 === 0) document.querySelectorAll('[data-live="recent10m"]').forEach((r) => jitter(r, rand(-3, 4), 5));
    document.querySelectorAll('[data-trend]').forEach((el) => {
      if (Math.random() < 0.45) {
        const cur = Number(el.dataset.cur || el.dataset.base);
        const next = Math.max(1, Math.round(cur + rand(-4, 6)));
        el.dataset.cur = next;
        el.textContent = `↑ ${fmt(next)}%`;
        flash(el, next >= cur);
      }
    });
    if (tick % 2 === 0) rotateTicker();
  }, 2600);
}

function updateCountdown() {
  const els = document.querySelectorAll('[data-countdown]');
  if (!els.length) return;
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const text = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  els.forEach((el) => { el.textContent = text; });
}

// ---------- 사용자 동작 ----------

// 페이지의 필터 · 정렬 버튼: 동작 이름 → [state.page 키, 바꿀 값]
const PAGE_FILTERS = {
  'away-range': ['away', 'range'],
  'pred-status': ['pred', 'status'],
  'pred-sort': ['pred', 'sort'],
  'pred-cat': ['pred', 'cat'],
  'community-sort': ['community', 'sort'],
  'community-cat': ['community', 'cat'],
  'community-page': ['community', 'page'],
  'prompts-sort': ['prompts', 'sort'],
  'prompts-cat': ['prompts', 'cat'],
  'challenge-sort': ['challenge', 'sort'],
  'people-by': ['people', 'by'],
};

// 검색칸: data-input → [state.page 키, 바꿀 값]
const PAGE_INPUTS = { 'community-q': ['community', 'q'], 'prompts-q': ['prompts', 'q'] };

const actions = {
  async 'debate-vote'(el) {
    const d = state.content.debate;
    if (mine.get('debate', d.id)) return;
    const choice = el.dataset.choice;
    Object.assign(d, await api('/api/debate/vote', { method: 'POST', body: { choice } }));
    mine.set('debate', d.id, choice);
    refresh('debate');
    toast(`${choice.toUpperCase()}에 투표했어요. 이유도 한 줄 남겨볼까요?`);
  },

  async 'pred-vote'(el) {
    const p = state.content.predictions.find((x) => x.id === el.dataset.id);
    if (!p || mine.get('pred', p.id)) return;
    Object.assign(p, await api(`/api/predictions/${p.id}/vote`, { method: 'POST', body: { choice: el.dataset.choice } }));
    mine.set('pred', p.id, el.dataset.choice);
    refresh('predictions');
    toast('예측이 기록됐어요. 판정일에 결과를 알려드릴게요.');
  },

  'feed-filter'(el) {
    state.feedFilter = el.dataset.value;
    state.feedExtra = 0;
    refresh('feed');
  },

  'feed-more'() {
    const block = state.config.blocks.find((b) => b.type === 'feed');
    state.feedExtra += block ? block.limit : 10;
    refresh('feed');
  },

  'toggle-post'(el) {
    const id = el.dataset.id;
    const opening = state.openPost !== id;
    state.openPost = opening ? id : null;
    if (opening) {
      const p = state.content.posts.find((x) => x.id === id);
      if (p) {
        p.views += 1;
        api(`/api/posts/${id}/view`, { method: 'POST' }).catch(() => {});
      }
    }
    refresh('feed', 'whileAway');
  },

  // 메인 '내가 없는 동안'의 인기글: 메인 커뮤니티 블록에서 펼치고, 그 블록이 없으면 커뮤니티 페이지로 간다
  'jump-post'(el, e) {
    e.preventDefault();
    const id = el.dataset.id;
    const feed = state.config.blocks.find((b) => b.type === 'feed' && b.visible);
    if (!feed) return navigate(pageHref('feed', '?open=' + id));
    state.feedFilter = '전체';
    const p = state.content.posts.find((x) => x.id === id);
    const idx = [...state.content.posts].sort(byNewest).indexOf(p);
    state.feedExtra = Math.max(0, idx + 2 - feed.limit);
    state.openPost = id;
    refresh('feed');
    document.getElementById('post-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  async 'like-post'(el) {
    const id = el.dataset.id;
    if (mine.get('like', id)) return;
    Object.assign(state.content.posts.find((x) => x.id === id), await api(`/api/posts/${id}/like`, { method: 'POST' }));
    mine.set('like', id, true);
    refresh('feed', 'whileAway');
  },

  async 'copy-prompt'(el) {
    const p = state.content.prompts.find((x) => x.id === el.dataset.id);
    if (!p) return;
    await copyText(p.text);
    el.textContent = '복사됨 ✓';
    el.classList.add('done');
    Object.assign(p, await api(`/api/prompts/${p.id}/copy`, { method: 'POST' }));
    toast(`복사했어요 · 이 프롬프트는 지금까지 ${fmt(p.copies)}번 사용됐어요`);
    setTimeout(() => refresh('prompts'), 1200);
  },

  async 'challenge-vote'(el) {
    const ch = state.content.challenge;
    if (mine.get('challenge', ch.id)) return;
    const e = ch.entries.find((x) => x.id === el.dataset.id);
    Object.assign(e, await api(`/api/challenge/${e.id}/vote`, { method: 'POST' }));
    mine.set('challenge', ch.id, e.id);
    refresh('challenge');
    toast('투표 완료! 내일 우승작이 발표돼요.');
  },

  'join-challenge'() {
    openWrite({ category: 'AI아트', title: `[챌린지] ${state.content.challenge.theme} — `, aiLabel: 'AI 생성' });
  },

  'share-prompt'() {
    openWrite({ category: '프롬프트', title: '[프롬프트] ' });
  },

  // 내가 없는 동안: 지금까지 본 것으로 표시
  'mark-seen'() {
    const now = Date.now();
    if (!IS_PREVIEW) store.set('fb_visit', { awayFrom: now, seen: now });
    state.awayFrom = now;
    state.page.away.range = 'since';
    refresh('whileAway');
    toast('모두 확인했어요. 다음에 들어오면 이 시점부터 새로 모아 드릴게요.');
  },

  'community-clear'() {
    Object.assign(state.page.community, { q: '', page: 1 });
    refresh();
  },

  'toggle-view'() {
    if (IS_PHONE) viewMode.set(FORCED_DESKTOP ? null : 'desktop');
    else viewMode.set(PHONE_STAGE ? null : 'mobile');
    location.reload();
  },

  'open-write'() { openWrite(); },
  'close-write'() { $('#write-dialog').close(); },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (el) {
    if (el.disabled) return;
    const name = el.dataset.action;
    try {
      if (actions[name]) await actions[name](el, e);
      else if (PAGE_FILTERS[name]) {
        const [key, field] = PAGE_FILTERS[name];
        const ps = state.page[key];
        ps[field] = field === 'page' ? Number(el.dataset.value) : el.dataset.value;
        if (key === 'community' && field !== 'page') ps.page = 1;
        refresh();
        if (field === 'page') $('.page-main')?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  // 사이트 안 링크는 화면만 바꾼다 (새 탭 · 수정 키는 브라우저에 맡긴다)
  const link = e.target.closest('a[data-link]');
  if (link && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
    e.preventDefault();
    navigate(link.getAttribute('href'));
  }
});

let inputTimer;
document.addEventListener('input', (e) => {
  const target = PAGE_INPUTS[e.target.dataset?.input];
  if (!target) return;
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    const [key, field] = target;
    Object.assign(state.page[key], { [field]: e.target.value }, key === 'community' ? { page: 1 } : {});
    refresh();
  }, 200);
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.dataset.form !== 'debate-comment') return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    const d = state.content.debate;
    const comment = await api('/api/debate/comment', { method: 'POST', body: { ...data, choice: mine.get('debate', d.id) || null } });
    if (data.author) store.set('fb_nick', data.author);
    d.comments.push(comment);
    refresh('debate', 'whileAway');
    document.querySelector(`[data-cid="${comment.id}"]`)?.classList.add('new-flash');
  } catch (err) {
    toast(err.message);
  }
});

// ---------- 글쓰기 ----------

function openWrite(prefill = {}) {
  const form = $('#write-form');
  form.reset();
  $('#write-error').hidden = true;
  $('#write-category').innerHTML = WRITE_CATEGORIES.map((c) => `<option ${c === (prefill.category || '토론') ? 'selected' : ''}>${esc(c)}</option>`).join('');
  $('#write-author').value = store.get('fb_nick', '');
  $('#write-author').disabled = false;
  if (prefill.title) $('#write-title').value = prefill.title;
  if (prefill.aiLabel) form.querySelector(`input[name="aiLabel"][value="${prefill.aiLabel}"]`).checked = true;
  $('#write-dialog').showModal();
  $('#write-title').focus();
}

$('#write-anon').addEventListener('change', (e) => { $('#write-author').disabled = e.target.checked; });

$('#write-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  body.anonymous = $('#write-anon').checked;
  const err = $('#write-error');
  try {
    const { post, discovery } = await api('/api/posts', { method: 'POST', body });
    if (!body.anonymous && body.author) store.set('fb_nick', body.author);
    state.content.posts.push(post);
    state.openPost = post.id;
    $('#write-dialog').close();

    // 메인에 커뮤니티 블록이 있으면 그 자리에서, 아니면 커뮤니티 페이지에서 새 글을 펼쳐 보여준다
    const homeFeed = !currentPageType() && state.config.blocks.some((b) => b.type === 'feed' && b.visible);
    if (homeFeed) {
      state.feedFilter = '전체';
      state.feedExtra = 0;
      refresh('feed', 'whileAway');
      document.getElementById('post-' + post.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      navigate(pageHref('feed', '?open=' + post.id));
    }

    if (discovery?.first) toast('🏅 최초 발견자로 기록됐어요!');
    else if (discovery) toast(`이 링크는 @${discovery.by}님이 ${timeAgo(discovery.at)}에 먼저 발견했어요`);
    else toast('글이 올라갔어요');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

// ---------- PC 에서 모바일 화면 보기 ----------

// 페이지를 390px 폭의 틀(iframe) 안에 다시 띄운다. 틀 안은 진짜 좁은 화면이라 모바일 레이아웃이 그대로 적용된다.
function showPhoneStage() {
  const params = new URLSearchParams(location.search);
  params.set('frame', 'phone');
  const src = location.pathname + '?' + params + location.hash;
  document.body.className = 'phone-stage';
  document.body.innerHTML = `
    <div class="stage-bar">
      <span class="stage-label">📱 모바일 화면 보기 <span class="muted">· 390 × 844</span></span>
      <button class="btn btn-primary" data-action="toggle-view">🖥 PC 화면으로</button>
    </div>
    <div class="stage-device"><iframe src="${esc(src)}" title="모바일 화면"></iframe></div>
    <p class="stage-note">프로토타입 확인용 화면이에요. 실제 휴대폰과 글자 크기·스크롤 느낌은 조금 다를 수 있어요.</p>`;
  document.documentElement.classList.remove('stage-pending');
}

// ---------- 시작 ----------

async function init() {
  if (PHONE_STAGE) return showPhoneStage();
  try {
    const [config, content] = await Promise.all([
      api('/api/config?mode=' + (IS_PREVIEW ? 'draft' : 'published')),
      api('/api/content'),
    ]);
    state.config = config;
    state.content = content;
    trackVisit();
    renderShell();
    onRoute();
    startPulse();
    setInterval(updateCountdown, 1000);
  } catch (err) {
    $('#view').innerHTML = err.status === 401
      ? '<div class="loading">Draft 미리보기는 관리자만 볼 수 있어요. <a href="/admin" style="text-decoration:underline">관리자 모드로 로그인</a></div>'
      : `<div class="loading">사이트를 불러오지 못했어요. 잠시 후 새로고침해 주세요.<br><small>${esc(err.message)}</small></div>`;
  }
}

init();
