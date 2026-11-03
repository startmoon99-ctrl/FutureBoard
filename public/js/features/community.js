// 커뮤니티 — 참고: Hacker News(밀도), Reddit(정렬), 클리앙 · 디시(목록형 게시판)
// 글 목록 · 검색 · 분류 · 추천 · 글쓰기. 글쓰기 창(openWrite)은 다른 기능(프롬프트 · 챌린지)도 쓴다.
import { state, $, esc, fmt, ms, byNewest, store, mine, pageState, pageHref, currentPageType, ui, toast, timeAgo, DAY, WRITE_CATEGORIES } from '../core.js';
import { api } from '../api.js';
import { blockHead, shell, card, chips, tabs, searchBox, postRow, postLink, feedOrder } from '../widgets.js';

const PAGE_SIZE = 20;
const DEFAULTS = { cat: '전체', sort: 'new', q: '', page: 1 };

function block(b, c) {
  const cats = ['전체', ...WRITE_CATEGORIES.filter((cat) => c.posts.some((p) => p.category === cat))];
  const list = c.posts.filter((p) => state.feedFilter === '전체' || p.category === state.feedFilter || p.pinned).sort(feedOrder);
  const shown = list.slice(0, b.limit + state.feedExtra);
  return `
    ${blockHead(b)}
    ${chips(cats.map((x) => [x]), state.feedFilter, 'feed-filter')}
    <div class="posts">${shown.map(postRow).join('') || '<p class="empty">아직 이 분류에는 글이 없어요. 첫 글을 남겨보세요.</p>'}</div>
    ${list.length > shown.length ? `<button class="btn more-btn" data-action="feed-more">더보기 (${fmt(list.length - shown.length)}개 남음)</button>` : ''}`;
}

const SORTS = { new: feedOrder, hot: (a, z) => z.likes - a.likes, views: (a, z) => z.views - a.views };

function page(c) {
  const ps = pageState('community', DEFAULTS);
  const q = ps.q.trim().toLowerCase();
  const counts = c.posts.reduce((acc, p) => ((acc[p.category] = (acc[p.category] || 0) + 1), acc), {});
  const cats = [['전체', `전체 ${c.posts.length}`], ...WRITE_CATEGORIES.filter((x) => counts[x]).map((x) => [x, `${x} ${counts[x]}`])];
  const list = c.posts
    .filter((p) => ps.cat === '전체' || p.category === ps.cat)
    .filter((p) => !q || `${p.title} ${p.body} ${p.author} ${p.category}`.toLowerCase().includes(q))
    .sort(SORTS[ps.sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  ps.page = Math.min(ps.page, pages);
  const shown = list.slice((ps.page - 1) * PAGE_SIZE, ps.page * PAGE_SIZE);
  const weekHot = c.posts.filter((p) => Date.now() - ms(p.createdAt) < 7 * DAY && !p.pinned).sort((a, z) => z.likes - a.likes).slice(0, 5);
  const finds = c.posts.filter((p) => p.firstDiscovery).sort(byNewest).slice(0, 5);
  const f = (field) => ({ key: 'community', field });

  return shell('feed', {
    desc: '밈부터 진지한 분석까지. 새로운 걸 먼저 찾아 링크와 함께 올리면 최초 발견자로 기록돼요.',
    stats: [
      ['전체 글', fmt(c.posts.length)],
      ['오늘 새 글', fmt(c.posts.filter((p) => Date.now() - ms(p.createdAt) < DAY).length)],
      ['최초 발견', fmt(c.posts.filter((p) => p.firstDiscovery).length)],
      ['총 추천', fmt(c.posts.reduce((n, p) => n + p.likes, 0))],
    ],
    main: `
      <div class="toolbar">
        ${searchBox(f('q'), ps.q, '제목 · 내용 · 닉네임 검색')}
        ${tabs([['new', '최신'], ['hot', '추천순'], ['views', '조회순']], ps.sort, f('sort'))}
        <button class="btn btn-primary btn-sm" data-action="open-write">글쓰기</button>
      </div>
      ${chips(cats, ps.cat, f('cat'))}
      ${q ? `<p class="muted small result-note">"${esc(ps.q)}" 검색 결과 ${list.length}개 <button class="link-btn" data-action="set-filter" data-key="community" data-field="q" data-value="">검색 지우기</button></p>` : ''}
      <section class="card flush"><div class="posts">${shown.map(postRow).join('') || '<p class="empty">조건에 맞는 글이 없어요.</p>'}</div></section>
      ${pages > 1 ? `<nav class="pager" aria-label="페이지">${Array.from({ length: pages }, (_, i) => `
        <button class="${i + 1 === ps.page ? 'on' : ''}" data-action="set-filter" data-key="community" data-field="page" data-value="${i + 1}">${i + 1}</button>`).join('')}</nav>` : ''}`,
    side:
      card('🔥 이번 주 인기글', `<ol class="rank-list">${weekHot.map((p) => `<li>${postLink(p)}<span class="muted">♥ ${fmt(p.likes)}</span></li>`).join('') || '<li class="empty">아직 없어요</li>'}</ol>`)
      + card('🏅 최초 발견', `<ul class="mini-list">${finds.map((p) => `<li>${postLink(p)}<span class="muted">@${esc(p.author)}</span></li>`).join('') || '<li class="empty">링크와 함께 처음 올리면 여기에 이름이 남아요</li>'}</ul>`)
      + card('커뮤니티 규칙', `
        <ul class="bullets">
          <li>밈 환영, 드립 환영. 정보 글에는 출처를.</li>
          <li>AI가 쓴 글은 <span class="chip chip-ai">AI 생성</span> · <span class="chip chip-ai">AI 보조 작성</span> 표시.</li>
          <li>홍보 봇 · 복붙 스팸은 바로 정리해요.</li>
          <li>사람이 아니라 주장에 반대하기.</li>
        </ul>`),
  });
}

// 주소의 ?q= ?cat= ?open= 을 필터로 옮긴다 (Pulse 키워드 · 인기글 링크). 스크롤할 요소 id 를 돌려준다
function onEnter(params) {
  const ps = pageState('community', DEFAULTS);
  if (params.has('q')) Object.assign(ps, { q: params.get('q'), cat: '전체', page: 1 });
  if (params.has('cat')) Object.assign(ps, { cat: params.get('cat'), q: '', page: 1 });
  if (params.has('open')) {
    const id = params.get('open');
    const sorted = [...state.content.posts].sort(feedOrder);
    const idx = sorted.findIndex((p) => p.id === id);
    if (idx >= 0) {
      Object.assign(ps, { cat: '전체', q: '', sort: 'new', page: Math.floor(idx / PAGE_SIZE) + 1 });
      state.openPost = id;
      return 'post-' + id;
    }
  }
  return null;
}

// ---------- 글쓰기 창 ----------

export function openWrite(prefill = {}) {
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

async function submitPost(e) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  body.anonymous = $('#write-anon').checked;
  const err = $('#write-error');
  try {
    const { post, discovery } = await api.createPost(body);
    if (!body.anonymous && body.author) store.set('fb_nick', body.author);
    state.content.posts.push(post);
    state.openPost = post.id;
    $('#write-dialog').close();

    // 메인에 커뮤니티 블록이 있으면 그 자리에서, 아니면 커뮤니티 페이지에서 새 글을 펼쳐 보여준다
    const homeFeed = !currentPageType() && state.config.blocks.some((b) => b.type === 'feed' && b.visible);
    if (homeFeed) {
      state.feedFilter = '전체';
      state.feedExtra = 0;
      ui.refresh('feed', 'whileAway');
      document.getElementById('post-' + post.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      ui.navigate(pageHref('feed', '?open=' + post.id));
    }

    if (discovery?.first) toast('🏅 최초 발견자로 기록됐어요!');
    else if (discovery) toast(`이 링크는 @${discovery.by}님이 ${timeAgo(discovery.at)}에 먼저 발견했어요`);
    else toast('글이 올라갔어요');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
}

function start() {
  $('#write-anon').addEventListener('change', (e) => { $('#write-author').disabled = e.target.checked; });
  $('#write-form').addEventListener('submit', submitPost);
}

// ---------- 동작 ----------

const actions = {
  'feed-filter'(el) {
    state.feedFilter = el.dataset.value;
    state.feedExtra = 0;
    ui.refresh('feed');
  },

  'feed-more'() {
    const b = state.config.blocks.find((x) => x.type === 'feed');
    state.feedExtra += b ? b.limit : 10;
    ui.refresh('feed');
  },

  'toggle-post'(el) {
    const id = el.dataset.id;
    const opening = state.openPost !== id;
    state.openPost = opening ? id : null;
    if (opening) {
      const p = state.content.posts.find((x) => x.id === id);
      if (p) {
        p.views += 1;
        api.viewPost(id).catch(() => {});
      }
    }
    ui.refresh('feed', 'whileAway');
  },

  async 'like-post'(el) {
    const id = el.dataset.id;
    if (mine.get('like', id)) return;
    Object.assign(state.content.posts.find((x) => x.id === id), await api.likePost(id));
    mine.set('like', id, true);
    ui.refresh('feed', 'whileAway');
  },

  // 관리자: 지우지 않고 숨긴다. 관리자 모드의 '숨긴 글 · 댓글'에서 되살릴 수 있다
  async 'hide-post'(el) {
    if (!confirm('이 글을 숨길까요?\n관리자 모드에서 다시 보이게 할 수 있어요.')) return;
    const id = el.dataset.id;
    await api.admin.hidePost(id);
    state.content.posts = state.content.posts.filter((x) => x.id !== id);
    state.openPost = null;
    ui.refresh('feed', 'whileAway', 'pulse');
    toast('글을 숨겼어요');
  },

  'open-write'() { openWrite(); },
  'close-write'() { $('#write-dialog').close(); },
};

export default { type: 'feed', block, page, onEnter, start, actions };
