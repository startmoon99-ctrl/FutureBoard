// 퓨쳐보드 사이트의 시작점: 방문 기록 · 머리(메뉴) · 주소 이동 · 화면 그리기 · 동작 연결
// 기능별 화면과 동작은 features/*.js 에 있고, 여기는 그것들을 이어 붙이기만 한다.
import { IS_PREVIEW, state, ui, $, esc, store, toast, currentPageType, homeHref, pageHref, blockTitle } from './core.js';
import { api } from './api.js';
import { FEATURES, byType, actions, forms } from './features/index.js';
import { PHONE_STAGE, renderViewToggle, toggleView, showPhoneStage } from './view-mode.js';

const SESSION_GAP = 30 * 60 * 1000;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// ---------- 방문 기록 (내가 없는 동안 · 연속 방문) ----------

function trackVisit() {
  const now = Date.now();
  const visit = store.get('fb_visit', null);
  // 30분 이상 비웠다가 들어오면 새 방문으로 보고, 마지막으로 본 시점부터 '없는 동안'을 계산한다
  state.awayFrom = visit ? (now - visit.seen > SESSION_GAP ? visit.seen : visit.awayFrom) : null;
  if (IS_PREVIEW) return; // 미리보기는 방문 기록을 남기지 않는다

  store.set('fb_visit', { awayFrom: state.awayFrom, seen: now });

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

const visibleBlocks = () => state.config.blocks.filter((b) => b.visible && byType[b.type]);

function renderShell() {
  const cfg = state.config;
  $('#site-title').textContent = cfg.siteTitle;
  $('#logo').setAttribute('href', homeHref());
  $('#tagline').textContent = cfg.tagline;
  $('#hero-date').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('#preview-banner').hidden = !IS_PREVIEW;
  $('#nav').innerHTML = `<a href="${homeHref()}" data-link data-nav="home">홈</a>`
    + visibleBlocks().map((b) => `<a href="${pageHref(b.type)}" data-link data-nav="${esc(b.type)}">${esc(b.title)}</a>`).join('');
  renderViewToggle();
}

// 막대 그래프는 이전 값에서 새 값으로 부드럽게 움직이게 한다
function withBarAnimation(root, draw) {
  const prev = {};
  root.querySelectorAll('[data-bar]').forEach((n) => { prev[n.dataset.bar] = n.style.width; });
  draw();
  root.querySelectorAll('[data-bar]').forEach((n) => {
    n.style.width = prev[n.dataset.bar] || '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { n.style.width = n.dataset.w + '%'; }));
  });
}

function renderBlock(block) {
  const el = document.getElementById('block-' + block.id);
  if (el) withBarAnimation(el, () => { el.innerHTML = byType[block.type].block(block, state.content); });
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

  view.className = 'page-view';
  withBarAnimation(view, () => { view.innerHTML = byType[type].page(state.content); });

  const el = focusId && document.getElementById(focusId);
  if (el) {
    el.focus();
    if (caret != null) el.setSelectionRange(caret, caret);
  }
}

function afterRender() {
  FEATURES.forEach((f) => f.afterRender?.());
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
  const nav = $('#nav');
  const on = $('#nav a.on');
  if (on) nav.scrollLeft = on.offsetLeft - nav.offsetLeft - 12;
  afterRender();
}

// 동작 뒤 다시 그리기: 메인이면 해당 블록만, 페이지면 그 페이지 전체
ui.refresh = (...types) => {
  const type = currentPageType();
  if (type) renderPage(type);
  else state.config.blocks.filter((b) => b.visible && types.includes(b.type)).forEach(renderBlock);
  afterRender();
};

// ---------- 주소 이동 (새로고침 없이 화면만 바꾼다) ----------

function onRoute() {
  const type = currentPageType();
  const target = type ? byType[type].onEnter?.(new URLSearchParams(location.search)) : null;
  renderRoute();
  const el = target && document.getElementById(target);
  if (el) el.scrollIntoView({ block: 'center' });
  else window.scrollTo(0, 0);
}

ui.navigate = (url) => {
  const u = new URL(url, location.href);
  if (u.pathname + u.search !== location.pathname + location.search) history.pushState(null, '', u.pathname + u.search + u.hash);
  onRoute();
};

window.addEventListener('popstate', onRoute);

// ---------- 동작 연결 ----------

// 페이지 필터 · 정렬: data-key · data-field · data-value 로 state.page[key][field] 를 바꾼다.
// 그 페이지에 page(쪽 번호)가 있으면 다른 필터를 바꿀 때 1쪽으로 돌아간다.
function setFilter(key, field, value) {
  const ps = state.page[key];
  if (!ps) return;
  ps[field] = field === 'page' ? Number(value) : value;
  if (field !== 'page' && 'page' in ps) ps.page = 1;
  ui.refresh();
}

const appActions = {
  'set-filter'(el) {
    setFilter(el.dataset.key, el.dataset.field, el.dataset.value);
    if (el.dataset.field === 'page') $('.page-main')?.scrollIntoView({ behavior: 'smooth' });
  },
  'toggle-view': toggleView,
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (el) {
    if (el.disabled) return;
    const fn = appActions[el.dataset.action] || actions[el.dataset.action];
    try {
      if (fn) await fn(el, e);
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  // 사이트 안 링크는 화면만 바꾼다 (새 탭 · 수정 키는 브라우저에 맡긴다)
  const link = e.target.closest('a[data-link]');
  if (link && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
    e.preventDefault();
    ui.navigate(link.getAttribute('href'));
  }
});

let inputTimer;
document.addEventListener('input', (e) => {
  const { filterKey, filterField } = e.target.dataset || {};
  if (!filterKey) return;
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => setFilter(filterKey, filterField, e.target.value), 200);
});

document.addEventListener('submit', async (e) => {
  const fn = forms[e.target.dataset.form];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(e.target, Object.fromEntries(new FormData(e.target)));
  } catch (err) {
    toast(err.message);
  }
});

// ---------- 시작 ----------

async function init() {
  if (PHONE_STAGE) return showPhoneStage();
  try {
    const [config, content] = await Promise.all([api.config(IS_PREVIEW ? 'draft' : 'published'), api.content()]);
    state.config = config;
    state.content = content;
    trackVisit();
    renderShell();
    onRoute();
    FEATURES.forEach((f) => f.start?.());
  } catch (err) {
    $('#view').innerHTML = err.status === 401
      ? '<div class="loading">Draft 미리보기는 관리자만 볼 수 있어요. <a href="/admin" style="text-decoration:underline">관리자 모드로 로그인</a></div>'
      : `<div class="loading">사이트를 불러오지 못했어요. 잠시 후 새로고침해 주세요.<br><small>${esc(err.message)}</small></div>`;
  }
}

init();
