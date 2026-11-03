// 메인 페이지의 블록들. 블록 머리 오른쪽의 '전체 보기'는 그 블록의 페이지로 간다.
import { state, esc, fmt, pct, timeAgo, store, mine, ICONS, pageHref, WRITE_CATEGORIES, byNewest } from './core.js';
import { bar, chips, more, postRow, feedOrder, predictionRow, promptCard, entryCard, personCard } from './widgets.js';

function head(block, extra = '') {
  return `<div class="block-head">
    <span class="icon">${ICONS[block.type] || ''}</span>
    <h2><a href="${pageHref(block.type)}" data-link>${esc(block.title)}</a></h2>${extra}
    ${more(block.type)}
  </div>`;
}

// 내가 없는 동안: 기준 시각과 그 뒤에 생긴 것들
export function awaySummary(from) {
  const after = (iso) => new Date(iso).getTime() > from;
  const c = state.content;
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

export function awayTitle(since) {
  if (!since) return '처음 오셨네요! <em>최근 24시간</em> 동안';
  const hours = Math.floor((Date.now() - since) / 3600000);
  if (hours < 1) return '방금 전 이후로';
  return `내가 없는 <em>${hours >= 48 ? Math.floor(hours / 24) + '일' : hours + '시간'}</em> 동안`;
}

export const blocks = {
  pulse(b, c) {
    const trends = c.pulse.trending.slice(0, b.limit);
    const today = c.posts.filter((p) => Date.now() - new Date(p.createdAt) < 86400000).length;
    return `
      ${head(b, '<span class="chip chip-demo" title="프로토타입: 일부 수치는 시뮬레이션입니다">DEMO</span>')}
      <div class="pulse-grid">
        <div>
          <div class="pulse-label">🔥 지금 급상승</div>
          <div class="trend-list">
            ${trends.map((t, i) => `
              <a class="trend" href="${pageHref('feed', '?q=' + encodeURIComponent(t.name))}" data-link>
                <span class="rank">${i + 1}</span>
                <span class="name">${esc(t.name)}</span>
                <span class="chg" data-trend="${i}" data-base="${t.change}">↑ ${fmt(t.change)}%</span>
              </a>`).join('')}
          </div>
        </div>
        <div>
          <div class="pulse-label">⚡ 지금 이 순간</div>
          <div class="stat-list">
            <div class="stat"><div class="k">💬 지금 토론 중</div><div class="v" data-live="discussing" data-val="${c.pulse.discussing}">${fmt(c.pulse.discussing)}</div></div>
            <div class="stat"><div class="k">⚡ 최근 10분 게시물</div><div class="v" data-live="recent10m" data-val="${c.pulse.recent10m}">${fmt(c.pulse.recent10m)}</div></div>
            <div class="stat"><div class="k">📝 오늘 새 글</div><div class="v">${fmt(today)}</div></div>
            <div class="stat"><div class="k">🗳 오늘의 질문 참여</div><div class="v">${fmt(c.debate.yes + c.debate.no)}</div></div>
          </div>
        </div>
      </div>
      <div class="ticker"><span class="ticker-label">● 방금</span><span class="ticker-text" id="ticker-text"></span></div>`;
  },

  futureChange(b, c) {
    const f = c.future;
    const delta = f.index - f.indexPrev;
    const lvl = { high: ['▲▲', 'lvl-high'], mid: ['▲', 'lvl-mid'], low: ['·', 'lvl-low'] };
    return `
      ${head(b)}
      <div class="future-top">
        <div class="future-index">
          <span class="label">FUTURE INDEX</span>
          <span class="num">${f.index}</span>
          <span class="delta">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} (어제 ${f.indexPrev})</span>
        </div>
        <div class="future-mood">${delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} ${esc(f.mood)}<small>${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} · ${esc(f.summary)}</small></div>
      </div>
      <ul class="change-list">
        ${f.items.slice(0, b.limit).map((it) => `
          <li class="change">
            <span class="lvl ${lvl[it.level]?.[1] || 'lvl-low'}">${lvl[it.level]?.[0] || '·'}</span>
            <span class="t"><span class="c">${esc(it.category)}</span>${esc(it.title)}</span>
            ${it.note ? `<span class="n">${esc(it.note)}</span>` : ''}
          </li>`).join('')}
      </ul>
      <div class="block-foot">운영자 큐레이션 · Future Index 산정 방식은 추후 설계</div>`;
  },

  whileAway(b) {
    const since = state.awayFrom;
    const s = awaySummary(since || Date.now() - 86400000);
    const hot = [...s.posts].sort((a, z) => z.likes - a.likes).slice(0, b.limit);
    const stats = [
      ['새 게시글', s.posts.length], ['새 프롬프트', s.prompts.length], ['새 챌린지 작품', s.entries.length],
      ['오늘의 질문 새 댓글', s.comments.length], ['새 예측', s.predictions.length], ['최초 발견', s.finds.length],
    ];
    return `
      ${head(b)}
      <p class="away-title">${awayTitle(since)}${since ? ` <span class="muted away-since">마지막 방문 ${timeAgo(new Date(since).toISOString())}</span>` : ''}</p>
      <div class="away-grid">
        ${stats.map(([k, v]) => `<div class="away-stat"><div class="v">${fmt(v)}</div><div class="k">${k}</div></div>`).join('')}
      </div>
      ${hot.length ? `
        <div class="pulse-label">놓친 인기글</div>
        <ul class="mini-list">
          ${hot.map((p) => `<li><a class="t" href="#post-${esc(p.id)}" data-action="jump-post" data-id="${esc(p.id)}">${esc(p.title)}</a><span class="muted">♥ ${fmt(p.likes)}</span></li>`).join('')}
        </ul>` : '<p class="empty">그동안 새 글은 없었어요. 조용한 날이네요.</p>'}`;
  },

  debate(b, c) {
    const d = c.debate;
    const my = mine.get('debate', d.id);
    const p = pct(d.yes, d.no);
    const comments = [...d.comments].sort(byNewest).slice(0, b.limit);
    return `
      ${head(b)}
      <p class="debate-q">${esc(d.question)}</p>
      <div class="muted">${fmt(d.yes + d.no)}명 참여 · 투표하고 이유를 남겨주세요. 내일 새 질문이 열려요.</div>
      ${debateVote(d, my, p)}
      <ul class="comments">${comments.map(commentItem).join('')}</ul>
      ${commentForm()}`;
  },

  predictions(b, c) {
    const list = [...c.predictions].sort((a, z) => (a.status === 'open' ? 0 : 1) - (z.status === 'open' ? 0 : 1)).slice(0, b.limit);
    const myCount = c.predictions.filter((p) => mine.get('pred', p.id)).length;
    const myHits = c.predictions.filter((p) => p.status === 'resolved' && mine.get('pred', p.id) === p.result).length;
    return `
      ${head(b)}
      ${list.map(predictionRow).join('')}
      <div class="block-foot">내 예측 ${myCount}개${myHits ? ` · 🎯 적중 ${myHits}회` : ''} · 예측 기록과 선구안 점수는 계정 기능과 함께 고정 정체성에 쌓일 예정</div>`;
  },

  feed(b, c) {
    const cats = ['전체', ...WRITE_CATEGORIES.filter((cat) => c.posts.some((p) => p.category === cat))];
    const list = c.posts.filter((p) => state.feedFilter === '전체' || p.category === state.feedFilter || p.pinned).sort(feedOrder);
    const shown = list.slice(0, b.limit + state.feedExtra);
    return `
      ${head(b)}
      ${chips(cats.map((x) => [x]), state.feedFilter, 'feed-filter')}
      <div class="posts">${shown.map(postRow).join('') || '<p class="empty">아직 이 분류에는 글이 없어요. 첫 글을 남겨보세요.</p>'}</div>
      ${list.length > shown.length ? `<button class="btn more-btn" data-action="feed-more">더보기 (${fmt(list.length - shown.length)}개 남음)</button>` : ''}`;
  },

  prompts(b, c) {
    const list = [...c.prompts].sort((a, z) => z.copies - a.copies).slice(0, b.limit);
    return `
      ${head(b)}
      <div class="prompt-list">${list.map((p, i) => promptCard(p, i + 1)).join('')}</div>`;
  },

  challenge(b, c) {
    const ch = c.challenge;
    const list = [...ch.entries].sort((a, z) => z.votes - a.votes).slice(0, b.limit);
    const voted = mine.get('challenge', ch.id);
    return `
      ${head(b)}
      <p class="challenge-theme">“${esc(ch.theme)}”</p>
      <div class="muted">출품 ${fmt(ch.entries.length)}개 · ${esc(ch.rule)}</div>
      <div class="entries">${list.map((e, i) => entryCard(e, i, voted)).join('')}</div>
      <div class="block-foot">
        <button class="btn btn-sm btn-primary" data-action="join-challenge">참여하기</button>
        <span>내일의 주제: ${esc(ch.next)}</span>
      </div>`;
  },

  people(b, c) {
    return `
      ${head(b)}
      <p class="muted people-sub">활동량이 아니라 판단의 정확성으로</p>
      <div class="people">${c.people.slice(0, b.limit).map(personCard).join('')}</div>`;
  },
};

// ---------- 오늘의 질문 조각 (페이지에서도 쓴다) ----------

export function debateVote(d, my, p) {
  return `
    <div class="vote-row">
      <button class="vote yes ${my === 'yes' ? 'mine' : ''}" data-action="debate-vote" data-choice="yes" ${my ? 'disabled' : ''}>YES · ${esc(d.yesLabel)}</button>
      <button class="vote no ${my === 'no' ? 'mine' : ''}" data-action="debate-vote" data-choice="no" ${my ? 'disabled' : ''}>NO · ${esc(d.noLabel)}</button>
    </div>
    ${bar('debate', p)}
    <div class="bar-labels"><span class="y">YES ${p}% · ${fmt(d.yes)}</span><span class="n">${fmt(d.no)} · ${100 - p}% NO</span></div>`;
}

export function commentItem(x) {
  return `
    <li class="comment" data-cid="${esc(x.id)}">
      ${x.choice ? `<span class="side ${x.choice}">${x.choice.toUpperCase()}</span>` : ''}<span class="who">${esc(x.author)}</span>${esc(x.text)}<span class="when">${timeAgo(x.createdAt)}</span>
    </li>`;
}

export function commentForm() {
  return `
    <form class="inline-form" data-form="debate-comment">
      <input class="nick" name="author" maxlength="20" placeholder="닉네임" value="${esc(store.get('fb_nick', ''))}">
      <input name="text" maxlength="300" placeholder="한 줄 의견" required>
      <button class="btn btn-sm">등록</button>
    </form>`;
}
