// 내가 없는 동안 — 참고: Slack '따라잡기', Feedly, GitHub 알림 모아보기
// 기준 시각(state.awayFrom: 마지막으로 본 때)부터 생긴 것을 모아 보여준다. 기준 시각은 app.js 의 방문 기록이 정한다.
import { state, esc, fmt, timeAgo, byNewest, groupBy, store, pageState, pageHref, ui, toast, IS_PREVIEW, DAY, CAT_COLORS } from '../core.js';
import { blockHead, shell, card, chips, postRow } from '../widgets.js';
import { commentItem } from './debate.js';

// from(밀리초) 뒤에 생긴 것들
function summary(c, from) {
  const after = (iso) => new Date(iso).getTime() > from;
  const posts = c.posts.filter((p) => after(p.createdAt));
  return {
    posts,
    prompts: c.prompts.filter((p) => after(p.createdAt)),
    entries: c.challenge.entries.filter((e) => after(e.createdAt)),
    comments: c.debate.comments.filter((x) => after(x.createdAt)),
    predictions: c.predictions.filter((p) => after(p.createdAt)),
    finds: posts.filter((p) => p.firstDiscovery),
  };
}

function title(since) {
  if (!since) return '처음 오셨네요! <em>최근 24시간</em> 동안';
  const hours = Math.floor((Date.now() - since) / 3600000);
  if (hours < 1) return '방금 전 이후로';
  return `내가 없는 <em>${hours >= 48 ? Math.floor(hours / 24) + '일' : hours + '시간'}</em> 동안`;
}

const hottest = (posts, n) => [...posts].sort((a, z) => z.likes - a.likes).slice(0, n);

function block(b, c) {
  const since = state.awayFrom;
  const s = summary(c, since || Date.now() - DAY);
  const hot = hottest(s.posts, b.limit);
  const stats = [
    ['새 게시글', s.posts.length], ['새 프롬프트', s.prompts.length], ['새 챌린지 작품', s.entries.length],
    ['오늘의 질문 새 댓글', s.comments.length], ['새 예측', s.predictions.length], ['최초 발견', s.finds.length],
  ];
  return `
    ${blockHead(b)}
    <p class="away-title">${title(since)}${since ? ` <span class="muted away-since">마지막 방문 ${timeAgo(new Date(since).toISOString())}</span>` : ''}</p>
    <div class="away-grid">
      ${stats.map(([k, v]) => `<div class="away-stat"><div class="v">${fmt(v)}</div><div class="k">${k}</div></div>`).join('')}
    </div>
    ${hot.length ? `
      <div class="pulse-label">놓친 인기글</div>
      <ul class="mini-list">
        ${hot.map((p) => `<li><a class="t" href="#post-${esc(p.id)}" data-action="jump-post" data-id="${esc(p.id)}">${esc(p.title)}</a><span class="muted">♥ ${fmt(p.likes)}</span></li>`).join('')}
      </ul>` : '<p class="empty">그동안 새 글은 없었어요. 조용한 날이네요.</p>'}`;
}

const RANGES = [['since', '마지막 방문 이후'], ['24', '24시간'], ['72', '3일'], ['168', '7일']];

function page(c) {
  const ps = pageState('away', { range: 'since' });
  const from = ps.range === 'since' ? (state.awayFrom || Date.now() - DAY) : Date.now() - Number(ps.range) * 3600000;
  const s = summary(c, from);
  const groups = Object.entries(groupBy(s.posts, (p) => p.category)).sort((a, z) => z[1].length - a[1].length);
  const heading = ps.range === 'since' ? title(state.awayFrom) : `최근 <em>${RANGES.find((r) => r[0] === ps.range)[1]}</em> 동안`;
  const sideList = (items, render, empty) => (items.length ? `<ul class="mini-list">${items.map(render).join('')}</ul>` : `<p class="empty">${empty}</p>`);

  return shell('whileAway', {
    desc: '자리를 비운 사이에 생긴 일을 한 번에 따라잡습니다. 다 봤으면 "모두 확인함"을 눌러 주세요.',
    stats: [['새 게시글', fmt(s.posts.length)], ['새 댓글', fmt(s.comments.length)], ['새 프롬프트', fmt(s.prompts.length)], ['최초 발견', fmt(s.finds.length)]],
    main: `
      <div class="toolbar">${chips(RANGES, ps.range, { key: 'away', field: 'range' })}
        <button class="btn btn-sm" data-action="mark-seen">✓ 모두 확인함</button></div>
      <p class="away-title page-away-title">${heading}</p>`
      + card('🔥 놓친 인기글', `<div class="posts">${hottest(s.posts, 5).map(postRow).join('') || '<p class="empty">이 기간에 새 글이 없어요. 조용한 날이네요.</p>'}</div>`)
      + (groups.length ? card('분야별 새 글', groups.map(([cat, list]) => `
        <details class="group" ${list.length <= 3 ? 'open' : ''}>
          <summary><span class="cat-dot" style="background:${CAT_COLORS[cat] || 'var(--muted)'}"></span>${esc(cat)} <span class="muted">${list.length}개</span></summary>
          <div class="posts">${[...list].sort(byNewest).map(postRow).join('')}</div>
        </details>`).join('')) : '')
      + card('🗳 오늘의 질문 새 의견', s.comments.length
        ? `<ul class="comments">${[...s.comments].sort(byNewest).slice(0, 8).map(commentItem).join('')}</ul>`
        : '<p class="empty">새 의견이 없어요.</p>', `<a class="more" href="${pageHref('debate')}" data-link>오늘의 질문 ›</a>`),
    side:
      card('✨ 새 프롬프트', sideList(s.prompts, (p) => `<li><a class="t" href="${pageHref('prompts')}" data-link>${esc(p.title)}</a><span class="muted">${timeAgo(p.createdAt)}</span></li>`, '새 프롬프트가 없어요.'))
      + card('🎨 새 챌린지 작품', sideList(s.entries, (e) => `<li><a class="t" href="${pageHref('challenge')}" data-link>${esc(e.emoji)} ${esc(e.title)}</a><span class="muted">▲ ${fmt(e.votes)}</span></li>`, '새 작품이 없어요.'))
      + card('🔮 새 예측', sideList(s.predictions, (p) => `<li><a class="t" href="${pageHref('predictions')}" data-link>${esc(p.question)}</a></li>`, '새 예측이 없어요.')),
  });
}

const actions = {
  // 지금까지 본 것으로 표시
  'mark-seen'() {
    const now = Date.now();
    if (!IS_PREVIEW) store.set('fb_visit', { awayFrom: now, seen: now });
    state.awayFrom = now;
    pageState('away', { range: 'since' }).range = 'since';
    ui.refresh('whileAway');
    toast('모두 확인했어요. 다음에 들어오면 이 시점부터 새로 모아 드릴게요.');
  },

  // 메인 블록의 인기글: 메인 커뮤니티 블록에서 펼치고, 그 블록이 없으면 커뮤니티 페이지로 간다
  'jump-post'(el, e) {
    e.preventDefault();
    const id = el.dataset.id;
    const feed = state.config.blocks.find((b) => b.type === 'feed' && b.visible);
    if (!feed) return ui.navigate(pageHref('feed', '?open=' + id));
    state.feedFilter = '전체';
    const idx = [...state.content.posts].sort(byNewest).findIndex((p) => p.id === id);
    state.feedExtra = Math.max(0, idx + 2 - feed.limit);
    state.openPost = id;
    ui.refresh('feed');
    document.getElementById('post-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
};

export default { type: 'whileAway', block, page, actions };
