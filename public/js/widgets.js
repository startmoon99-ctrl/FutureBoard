// 여러 기능이 함께 쓰는 화면 조각: 블록 머리 · 페이지 틀 · 카드 · 필터 · 막대 · 글 목록 · 메달
// 두 기능 이상이 쓰는 것만 둔다. 한 기능에서만 쓰는 조각은 그 기능 파일(features/*.js)에 둔다.
import { state, esc, fmt, timeAgo, mine, homeHref, pageHref, blockTitle, BLOCKS, CAT_COLORS } from './core.js';

// ---------- 틀 ----------

// 메인 블록의 머리. 오른쪽 '전체 보기'는 그 블록의 페이지로 간다
export function blockHead(block, extra = '') {
  return `<div class="block-head">
    <span class="icon">${BLOCKS[block.type].icon}</span>
    <h2><a href="${pageHref(block.type)}" data-link>${esc(block.title)}</a></h2>${extra}
    ${more(block.type)}
  </div>`;
}

export const more = (type, label = '전체 보기') => `<a class="more" href="${pageHref(type)}" data-link>${label} <span aria-hidden="true">›</span></a>`;

// 페이지 공통 틀: 위치 · 제목 · 숫자 요약 · 설명 · 본문(+ 옆칸)
export function shell(type, { desc = '', stats = [], main, side = '' }) {
  const title = esc(blockTitle(type));
  return `
    <div class="page page-${BLOCKS[type].path}">
      <header class="page-head">
        <nav class="crumbs" aria-label="위치"><a href="${homeHref()}" data-link>홈</a><span aria-hidden="true">›</span><span>${title}</span></nav>
        <div class="page-title-row">
          <h1><span class="icon">${BLOCKS[type].icon}</span>${title}</h1>
          ${stats.length ? `<div class="page-stats">${stats.map(([k, v, attrs = '']) => `
            <div class="pstat"><div class="v" ${attrs}>${v}</div><div class="k">${k}</div></div>`).join('')}</div>` : ''}
        </div>
        ${desc ? `<p class="page-desc">${desc}</p>` : ''}
      </header>
      <div class="page-body ${side ? 'has-side' : ''}">
        <div class="page-main">${main}</div>
        ${side ? `<aside class="page-side">${side}</aside>` : ''}
      </div>
    </div>`;
}

export const card = (title, body, extra = '', cls = '') =>
  `<section class="card ${cls}">${title ? `<div class="card-head"><h2>${title}</h2>${extra}</div>` : ''}${body}</section>`;

// ---------- 필터 ----------

// target: 동작 이름(문자열) 또는 페이지 필터 { key, field } — 후자는 app.js 가 state.page[key][field] 를 바꾸고 다시 그린다
const filterAttrs = (target) => (typeof target === 'string'
  ? `data-action="${target}"`
  : `data-action="set-filter" data-key="${target.key}" data-field="${target.field}"`);

export function chips(items, active, target) {
  return `<div class="chips">${items.map(([value, label]) =>
    `<button class="filter ${value === active ? 'on' : ''}" ${filterAttrs(target)} data-value="${esc(value)}">${esc(label ?? value)}</button>`).join('')}</div>`;
}

export function tabs(items, active, target) {
  return `<div class="tabs" role="tablist">${items.map(([value, label]) =>
    `<button class="tab ${value === active ? 'on' : ''}" role="tab" aria-selected="${value === active}" ${filterAttrs(target)} data-value="${esc(value)}">${esc(label)}</button>`).join('')}</div>`;
}

// 입력할 때마다 state.page[key][field] 가 바뀐다 (app.js)
export const searchBox = ({ key, field }, value, placeholder) => `
  <label class="search"><span aria-hidden="true">⌕</span>
    <input type="search" id="search-${key}" data-filter-key="${key}" data-filter-field="${field}" value="${esc(value)}" placeholder="${placeholder}" autocomplete="off">
  </label>`;

// ---------- 막대 ----------

// YES 비율 막대. data-bar 키가 같으면 다시 그릴 때 이전 값에서 새 값으로 움직인다 (app.js animateBars)
export const bar = (key, yesPct, cls = '') =>
  `<div class="bar ${cls}"><div class="bar-fill" data-bar="${esc(key)}" data-w="${yesPct}"></div></div>`;

// ---------- 커뮤니티 글 (커뮤니티 · 내가 없는 동안이 함께 쓴다) ----------

export const isNewSince = (p) => state.awayFrom && new Date(p.createdAt).getTime() > state.awayFrom;

export const postLink = (p) => `<a class="t" href="${pageHref('feed', '?open=' + p.id)}" data-link>${esc(p.title)}</a>`;

export function postRow(p) {
  const liked = mine.get('like', p.id);
  return `
    <article class="post ${p.pinned ? 'pinned' : ''}" id="post-${esc(p.id)}">
      <div class="post-row" data-action="toggle-post" data-id="${esc(p.id)}">
        <span class="cat" style="--c:${CAT_COLORS[p.category] || 'var(--muted)'}">${esc(p.category)}</span>
        <span class="title">
          <span class="title-text">${esc(p.title)}</span>
          ${isNewSince(p) ? '<span class="chip chip-new">N</span>' : ''}
          ${p.aiLabel && p.aiLabel !== '직접 작성' ? `<span class="chip chip-ai">${esc(p.aiLabel)}</span>` : ''}
          ${p.firstDiscovery ? '<span class="chip chip-first">🏅 최초 발견</span>' : ''}
        </span>
        <span class="meta">
          <span class="author">${esc(p.author)}</span>
          <span>${timeAgo(p.createdAt)}</span>
          <span>조회 ${fmt(p.views)}</span>
          <span>♥ ${fmt(p.likes)}</span>
        </span>
      </div>
      ${state.openPost === p.id ? `
        <div class="post-detail">${esc(p.body) || '<span class="muted">(본문 없음)</span>'}${p.link ? `\n<a class="link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">↗ ${esc(p.link)}</a>` : ''}${p.firstDiscovery ? `\n<span class="chip chip-first">🏅 최초 발견자 @${esc(p.author)} · ${new Date(p.createdAt).toLocaleString('ko-KR')}</span>` : ''}
          <div class="post-actions">
            <button class="btn btn-sm like ${liked ? 'liked' : ''}" data-action="like-post" data-id="${esc(p.id)}" ${liked ? 'disabled' : ''}>♥ 추천 ${fmt(p.likes)}</button>
            ${state.admin ? `<button class="btn btn-sm mod-btn" data-action="hide-post" data-id="${esc(p.id)}">🚫 숨기기 (관리자)</button>` : ''}
          </div>
        </div>` : ''}
    </article>`;
}

// ---------- 메달 (예측 · 챌린지 · 선구자 순위) ----------

export const MEDALS = ['🥇', '🥈', '🥉'];

