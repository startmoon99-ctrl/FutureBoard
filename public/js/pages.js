// 블록마다 하나씩 있는 전용 페이지. 메인 블록의 '전체 보기'와 상단 메뉴가 이곳으로 온다.
// 각 페이지의 필터 · 정렬은 state.page 에 두어 다른 페이지에 다녀와도 유지한다.
import {
  state, esc, fmt, pct, timeAgo, dayLabel, dday, mine, ms, byNewest,
  ICONS, PAGE_PATHS, blockTitle, homeHref, pageHref, CAT_COLORS, WRITE_CATEGORIES,
} from './core.js';
import {
  bar, chips, tabs, sparkline, trendSeries, lineChart, postRow, feedOrder,
  predictionCard, promptCard, entryCard, personCard,
} from './widgets.js';
import { awaySummary, awayTitle, debateVote, commentItem, commentForm } from './home.js';

const DAY = 86400000;
const COMMUNITY_PAGE_SIZE = 20;

// ---------- 공통 틀 ----------

function shell(type, { desc = '', stats = [], main, side = '' }) {
  const title = esc(blockTitle(type));
  return `
    <div class="page page-${PAGE_PATHS[type]}">
      <header class="page-head">
        <nav class="crumbs" aria-label="위치"><a href="${homeHref()}" data-link>홈</a><span aria-hidden="true">›</span><span>${title}</span></nav>
        <div class="page-title-row">
          <h1><span class="icon">${ICONS[type]}</span>${title}</h1>
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

const card = (title, body, extra = '', cls = '') =>
  `<section class="card ${cls}">${title ? `<div class="card-head"><h2>${title}</h2>${extra}</div>` : ''}${body}</section>`;

const pageState = (key, defaults) => (state.page[key] = state.page[key] || { ...defaults });

const shortDate = (iso) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

const postLink = (p) => `<a class="t" href="${pageHref('feed', '?open=' + p.id)}" data-link>${esc(p.title)}</a>`;

const searchBox = (id, value, placeholder) => `
  <label class="search"><span aria-hidden="true">⌕</span>
    <input type="search" id="${id}" data-input="${id}" value="${esc(value)}" placeholder="${placeholder}" autocomplete="off">
  </label>`;

// ---------- 페이지 ----------

export const pages = {
  // AI WORLD PULSE — 참고: Google Trends, Exploding Topics, 증권 시세판
  pulse(c) {
    const now = Date.now();
    const today = c.posts.filter((p) => now - ms(p.createdAt) < DAY).length;
    const week = c.posts.filter((p) => now - ms(p.createdAt) < 7 * DAY);
    const heat = Object.entries(week.reduce((acc, p) => ((acc[p.category] = (acc[p.category] || 0) + 1), acc), {}))
      .sort((a, z) => z[1] - a[1]);
    const heatMax = heat[0]?.[1] || 1;
    const related = (name) => c.posts.filter((p) => `${p.title} ${p.body} ${p.category}`.toLowerCase().includes(name.toLowerCase())).length;

    const table = `
      <div class="trend-table" role="table">
        <div class="tr th" role="row"><span>#</span><span>키워드</span><span class="hide-sm">24시간 추이</span><span class="r">상승률</span><span class="r hide-sm">관련 글</span></div>
        ${c.pulse.trending.map((t, i) => `
          <a class="tr" role="row" href="${pageHref('feed', '?q=' + encodeURIComponent(t.name))}" data-link>
            <span class="rank">${i + 1}</span>
            <span class="name">${esc(t.name)}</span>
            <span class="hide-sm">${sparkline(trendSeries(t.name, t.change))}</span>
            <span class="chg r" data-trend="${i}" data-base="${t.change}">↑ ${fmt(t.change)}%</span>
            <span class="r muted hide-sm">${fmt(related(t.name))}</span>
          </a>`).join('')}
      </div>`;

    return shell('pulse', {
      desc: 'AI 세계에서 지금 무엇이 움직이고 있는지. 키워드를 누르면 관련 글을 모아 봅니다.',
      stats: [
        ['지금 토론 중', fmt(c.pulse.discussing), `data-live="discussing" data-val="${c.pulse.discussing}"`],
        ['최근 10분 게시물', fmt(c.pulse.recent10m), `data-live="recent10m" data-val="${c.pulse.recent10m}"`],
        ['오늘 새 글', fmt(today)],
        ['오늘의 질문 참여', fmt(c.debate.yes + c.debate.no)],
      ],
      main:
        card('🔥 지금 급상승', table, '<span class="chip chip-demo" title="프로토타입: 상승률과 추이는 시뮬레이션입니다">DEMO</span>')
        + card('🌡 분야별 열기 <span class="muted small">최근 7일 글 수</span>', `
          <ul class="heat">${heat.map(([cat, n]) => `
            <li><a href="${pageHref('feed', '?cat=' + encodeURIComponent(cat))}" data-link class="heat-name">${esc(cat)}</a>
              <span class="heat-bar"><span style="width:${Math.round((n / heatMax) * 100)}%;background:${CAT_COLORS[cat] || 'var(--accent)'}"></span></span>
              <span class="heat-n">${n}</span></li>`).join('') || '<li class="empty">최근 7일 동안 글이 없어요</li>'}</ul>`),
      side:
        card('⚡ 방금 올라온 글', `
          <div class="ticker in-card"><span class="ticker-label">● LIVE</span><span class="ticker-text" id="ticker-text"></span></div>
          <ul class="mini-list">${[...c.posts].sort(byNewest).slice(0, 8).map((p) => `
            <li>${postLink(p)}<span class="muted">${timeAgo(p.createdAt)}</span></li>`).join('')}</ul>`)
        + card('Pulse 읽는 법', `
          <ul class="bullets">
            <li><b>상승률</b>은 평소 대비 언급이 얼마나 늘었는지예요.</li>
            <li><b>추이선</b>은 최근 24시간의 흐름이에요.</li>
            <li><b>분야별 열기</b>는 최근 7일 동안 글이 몰린 분야예요.</li>
          </ul>
          <p class="muted small">지금은 프로토타입이라 상승률 · 추이 · 토론 중 인원은 시뮬레이션이에요. 글 수와 투표 수는 실제 데이터예요.</p>`),
    });
  },

  // 오늘 인류의 미래 변화 — 참고: Our World in Data, 운명의 날 시계, 아침 브리핑 뉴스레터
  futureChange(c) {
    const f = c.future;
    const hist = [...(c.futureHistory || [])].sort((a, z) => ms(a.createdAt) - ms(z.createdAt));
    const points = [...hist.map((h) => ({ label: shortDate(h.createdAt), value: h.index })), { label: '오늘', value: f.index }];
    const delta = f.index - f.indexPrev;
    const levels = [['high', '▲▲ 크게 바뀐 것', 'lvl-high'], ['mid', '▲ 조금 바뀐 것', 'lvl-mid'], ['low', '· 지켜볼 것', 'lvl-low']];
    const byCat = Object.entries(f.items.reduce((acc, it) => ((acc[it.category] = (acc[it.category] || 0) + 1), acc), {}));
    const past = [...hist].reverse();

    return shell('futureChange', {
      desc: '오늘 AI와 미래기술에서 일어난 변화를 "인류의 미래가 얼마나 바뀌었나"라는 눈으로 정리합니다.',
      stats: [
        ['오늘 Future Index', `<span class="accent">${f.index}</span>`],
        ['어제 대비', `<span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}</span>`],
        ['14일 최고', Math.max(...points.map((p) => p.value))],
        ['오늘의 변화', f.items.length + '건'],
      ],
      main:
        card(`${delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} ${esc(f.mood)} <span class="muted small">${esc(f.summary)}</span>`,
          points.length > 1 ? lineChart(points) : '<p class="empty">기록이 쌓이면 그래프가 나타나요</p>')
        + card('오늘의 변화', levels.map(([lv, label, cls]) => {
          const items = f.items.filter((it) => it.level === lv);
          if (!items.length) return '';
          return `<h3 class="sub ${cls}">${label}</h3>
            <ul class="change-list big">${items.map((it) => `
              <li class="change"><span class="t"><span class="c">${esc(it.category)}</span>${esc(it.title)}</span>${it.note ? `<span class="n">${esc(it.note)}</span>` : ''}</li>`).join('')}</ul>`;
        }).join(''))
        + card('지난 기록', `
          <ul class="history">${past.map((h, i) => {
            const prev = past[i + 1];
            const d = prev ? h.index - prev.index : 0;
            return `<li>
              <span class="h-date">${dayLabel(h.createdAt)}</span>
              <span class="h-index">${h.index}</span>
              <span class="h-delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'muted'}">${prev ? (d > 0 ? '▲' : d < 0 ? '▼' : '—') + ' ' + Math.abs(d) : ''}</span>
              <span class="h-text"><b>${esc(h.mood)}</b> ${esc(h.headline)}</span>
            </li>`;
          }).join('') || '<li class="empty">아직 지난 기록이 없어요</li>'}</ul>`),
      side:
        card('Future Index란?', `
          <p>그날의 변화가 인류의 미래를 얼마나 앞당겼는지를 0~100 사이 숫자로 나타낸 지표예요.</p>
          <ul class="bullets">
            <li><b class="lvl-high">▲▲</b> 일상과 산업을 곧 바꿀 변화</li>
            <li><b class="lvl-mid">▲</b> 방향을 보여주는 의미 있는 진전</li>
            <li><b class="lvl-low">·</b> 아직은 지켜볼 신호</li>
          </ul>
          <p class="muted small">지금은 운영자가 직접 고르고 있어요. 계산 방식은 커뮤니티와 함께 정해 갈 예정이에요.</p>`)
        + card('오늘 분야별', `<ul class="mini-list">${byCat.map(([cat, n]) => `<li><span class="t">${esc(cat)}</span><span class="muted">${n}건</span></li>`).join('')}</ul>`),
    });
  },

  // 내가 없는 동안 — 참고: Slack '따라잡기', Feedly, GitHub 알림 모아보기
  whileAway(c) {
    const ps = pageState('away', { range: 'since' });
    const ranges = [['since', '마지막 방문 이후'], ['24', '24시간'], ['72', '3일'], ['168', '7일']];
    const from = ps.range === 'since' ? (state.awayFrom || Date.now() - DAY) : Date.now() - Number(ps.range) * 3600000;
    const s = awaySummary(from);
    const hot = [...s.posts].sort((a, z) => z.likes - a.likes).slice(0, 5);
    const groups = Object.entries(s.posts.reduce((acc, p) => ((acc[p.category] = acc[p.category] || []).push(p), acc), {}))
      .sort((a, z) => z[1].length - a[1].length);
    const heading = ps.range === 'since' ? awayTitle(state.awayFrom) : `최근 <em>${ranges.find((r) => r[0] === ps.range)[1]}</em> 동안`;

    return shell('whileAway', {
      desc: '자리를 비운 사이에 생긴 일을 한 번에 따라잡습니다. 다 봤으면 "모두 확인함"을 눌러 주세요.',
      stats: [['새 게시글', fmt(s.posts.length)], ['새 댓글', fmt(s.comments.length)], ['새 프롬프트', fmt(s.prompts.length)], ['최초 발견', fmt(s.finds.length)]],
      main: `
        <div class="toolbar">${chips(ranges, ps.range, 'away-range')}
          <button class="btn btn-sm" data-action="mark-seen">✓ 모두 확인함</button></div>
        <p class="away-title page-away-title">${heading}</p>`
        + card('🔥 놓친 인기글', `<div class="posts">${hot.map(postRow).join('') || '<p class="empty">이 기간에 새 글이 없어요. 조용한 날이네요.</p>'}</div>`)
        + (groups.length ? card('분야별 새 글', groups.map(([cat, list]) => `
          <details class="group" ${list.length <= 3 ? 'open' : ''}>
            <summary><span class="cat-dot" style="background:${CAT_COLORS[cat] || 'var(--muted)'}"></span>${esc(cat)} <span class="muted">${list.length}개</span></summary>
            <div class="posts">${[...list].sort(byNewest).map(postRow).join('')}</div>
          </details>`).join('')) : '')
        + card('🗳 오늘의 질문 새 의견', s.comments.length
          ? `<ul class="comments">${[...s.comments].sort(byNewest).slice(0, 8).map(commentItem).join('')}</ul>`
          : '<p class="empty">새 의견이 없어요.</p>', `<a class="more" href="${pageHref('debate')}" data-link>오늘의 질문 ›</a>`),
      side:
        card('✨ 새 프롬프트', s.prompts.length
          ? `<ul class="mini-list">${s.prompts.map((p) => `<li><a class="t" href="${pageHref('prompts')}" data-link>${esc(p.title)}</a><span class="muted">${timeAgo(p.createdAt)}</span></li>`).join('')}</ul>`
          : '<p class="empty">새 프롬프트가 없어요.</p>')
        + card('🎨 새 챌린지 작품', s.entries.length
          ? `<ul class="mini-list">${s.entries.map((e) => `<li><a class="t" href="${pageHref('challenge')}" data-link>${esc(e.emoji)} ${esc(e.title)}</a><span class="muted">▲ ${fmt(e.votes)}</span></li>`).join('')}</ul>`
          : '<p class="empty">새 작품이 없어요.</p>')
        + card('🔮 새 예측', s.predictions.length
          ? `<ul class="mini-list">${s.predictions.map((p) => `<li><a class="t" href="${pageHref('predictions')}" data-link>${esc(p.question)}</a></li>`).join('')}</ul>`
          : '<p class="empty">새 예측이 없어요.</p>'),
    });
  },

  // 오늘의 질문 — 참고: Kialo(찬반 나란히), Reddit Change My View
  debate(c) {
    const d = c.debate;
    const my = mine.get('debate', d.id);
    const p = pct(d.yes, d.no);
    const sorted = [...d.comments].sort(byNewest);
    const side = (choice) => sorted.filter((x) => x.choice === choice);
    const neutral = sorted.filter((x) => !x.choice);
    const archive = [...(c.debateArchive || [])].sort(byNewest);

    return shell('debate', {
      desc: '매일 하나의 질문에 YES / NO로 답하고 이유를 남깁니다. 결과는 실시간으로 바뀌어요.',
      stats: [['참여', fmt(d.yes + d.no) + '명'], ['의견', fmt(d.comments.length) + '개'], ['YES', p + '%'], ['NO', 100 - p + '%']],
      main:
        card('', `
          <p class="eyebrow">${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}의 질문</p>
          <p class="debate-q xl">${esc(d.question)}</p>
          ${debateVote(d, my, p)}
          ${commentForm()}
          ${my ? '' : '<p class="muted small form-hint">투표하면 내 의견에 YES / NO 표시가 붙어요.</p>'}`, '', 'debate-hero')
        + `<div class="sides">
            ${card(`<span class="side yes">YES</span> ${esc(d.yesLabel)} <span class="muted small">${side('yes').length}</span>`, `<ul class="comments">${side('yes').map(commentItem).join('') || '<li class="empty">아직 의견이 없어요</li>'}</ul>`)}
            ${card(`<span class="side no">NO</span> ${esc(d.noLabel)} <span class="muted small">${side('no').length}</span>`, `<ul class="comments">${side('no').map(commentItem).join('') || '<li class="empty">아직 의견이 없어요</li>'}</ul>`)}
          </div>`
        + (neutral.length ? card('투표 전에 남긴 의견', `<ul class="comments">${neutral.map(commentItem).join('')}</ul>`) : '')
        + card('지난 질문', `
          <ul class="archive">${archive.map((a, i) => {
            const ap = pct(a.yes, a.no);
            return `<li>
              <div class="arch-top"><span class="muted small">${dayLabel(a.createdAt)}</span><span class="arch-q">${esc(a.question)}</span></div>
              ${bar('arch-' + i, ap, 'thin')}
              <div class="bar-labels"><span class="y">${esc(a.yesLabel || 'YES')} ${ap}%</span><span class="muted">${fmt(a.yes + a.no)}명</span><span class="n">${100 - ap}% ${esc(a.noLabel || 'NO')}</span></div>
              ${a.topComment ? `<p class="arch-quote">“${esc(a.topComment.text)}” <span class="muted">— ${esc(a.topComment.author)}</span></p>` : ''}
            </li>`;
          }).join('') || '<li class="empty">지난 질문이 아직 없어요</li>'}</ul>`),
      side:
        card('토론 규칙', `
          <ul class="bullets">
            <li>사람이 아니라 <b>주장</b>에 반대해요.</li>
            <li>이유를 한 줄이라도 남기면 토론이 살아나요.</li>
            <li>농담 환영. 다만 상대 쪽 의견을 비웃지 않기.</li>
          </ul>`)
        + card('질문은 어떻게 정해지나요?', `
          <p>운영자가 그날 화제가 된 소식에서 하나를 골라요. 결과가 팽팽했던 질문은 몇 달 뒤 다시 물어서 생각이 어떻게 바뀌었는지 비교할 예정이에요.</p>`),
    });
  },

  // 미래 예측 — 참고: Metaculus, Manifold, Polymarket
  predictions(c) {
    const ps = pageState('pred', { status: 'open', cat: '전체', sort: 'popular' });
    const cats = ['전체', ...new Set(c.predictions.map((p) => p.category))];
    const sorters = {
      popular: (a, z) => z.yes + z.no - (a.yes + a.no),
      deadline: (a, z) => new Date(a.deadline) - new Date(z.deadline),
      new: byNewest,
    };
    const list = c.predictions
      .filter((p) => ps.status === 'all' || p.status === ps.status)
      .filter((p) => ps.cat === '전체' || p.category === ps.cat)
      .sort(sorters[ps.sort]);
    const mineList = c.predictions.filter((p) => mine.get('pred', p.id));
    const judged = mineList.filter((p) => p.status === 'resolved');
    const hits = judged.filter((p) => mine.get('pred', p.id) === p.result).length;
    const seers = [...c.people].sort((a, z) => z.accuracy - a.accuracy).slice(0, 3);

    return shell('predictions', {
      desc: '미래에 일어날 일에 YES / NO로 걸어 보세요. 판정이 나면 적중 기록이 쌓여 선구안 점수가 됩니다.',
      stats: [
        ['진행 중', c.predictions.filter((p) => p.status === 'open').length],
        ['판정 완료', c.predictions.filter((p) => p.status === 'resolved').length],
        ['총 참여', fmt(c.predictions.reduce((n, p) => n + p.yes + p.no, 0))],
        ['내 예측', mineList.length],
      ],
      main: `
        <div class="toolbar">
          ${tabs([['open', '진행 중'], ['resolved', '판정 완료'], ['all', '전체']], ps.status, 'pred-status')}
          ${tabs([['popular', '참여 많은 순'], ['deadline', '마감 순'], ['new', '최신']], ps.sort, 'pred-sort')}
        </div>
        ${chips(cats.map((x) => [x]), ps.cat, 'pred-cat')}
        <div class="pcards">${list.map(predictionCard).join('') || '<p class="empty">조건에 맞는 예측이 없어요.</p>'}</div>`,
      side:
        card('🎯 내 예측 기록', mineList.length ? `
          ${judged.length ? `<p class="accuracy"><b>${Math.round((hits / judged.length) * 100)}%</b> 적중 <span class="muted small">(판정 ${judged.length}개 중 ${hits}개)</span></p>` : '<p class="muted small">아직 판정이 난 예측이 없어요.</p>'}
          <ul class="mini-list">${mineList.map((p) => {
            const my = mine.get('pred', p.id);
            const st = p.status !== 'resolved' ? '<span class="muted">진행 중</span>'
              : my === p.result ? '<span class="verdict-hit">적중</span>' : '<span class="verdict-miss">빗나감</span>';
            return `<li><span class="t">${esc(p.question)}</span><span class="my-pick ${my}">${my.toUpperCase()}</span>${st}</li>`;
          }).join('')}</ul>` : '<p class="empty">아직 예측한 게 없어요. 하나 골라 YES / NO를 눌러 보세요.</p>')
        + card('🏅 선구안 TOP 3', `<ul class="mini-list">${seers.map((p, i) => `
          <li><span class="t">${['🥇', '🥈', '🥉'][i]} @${esc(p.name)}</span><b>${p.accuracy}%</b></li>`).join('')}</ul>`,
          `<a class="more" href="${pageHref('people')}" data-link>전체 순위 ›</a>`)
        + card('예측은 이렇게 쌓여요', `
          <ul class="bullets">
            <li>마감일이 지나면 운영자가 결과를 판정해요.</li>
            <li>맞힌 예측만큼 <b>선구안 점수</b>가 올라가요. 많이 누르는 것보다 정확한 게 중요해요.</li>
            <li>지금은 이 브라우저에만 기록돼요. 계정이 생기면 프로필에 영구히 남아요.</li>
          </ul>`),
    });
  },

  // 커뮤니티 — 참고: Hacker News(밀도), Reddit(정렬), 클리앙 · 디시(목록형 게시판)
  feed(c) {
    const ps = pageState('community', { cat: '전체', sort: 'new', q: '', page: 1 });
    const q = ps.q.trim().toLowerCase();
    const counts = c.posts.reduce((acc, p) => ((acc[p.category] = (acc[p.category] || 0) + 1), acc), {});
    const cats = [['전체', `전체 ${c.posts.length}`], ...WRITE_CATEGORIES.filter((x) => counts[x]).map((x) => [x, `${x} ${counts[x]}`])];
    const sorters = { new: feedOrder, hot: (a, z) => z.likes - a.likes, views: (a, z) => z.views - a.views };
    const list = c.posts
      .filter((p) => ps.cat === '전체' || p.category === ps.cat)
      .filter((p) => !q || `${p.title} ${p.body} ${p.author} ${p.category}`.toLowerCase().includes(q))
      .sort(sorters[ps.sort]);
    const pagesCount = Math.max(1, Math.ceil(list.length / COMMUNITY_PAGE_SIZE));
    ps.page = Math.min(ps.page, pagesCount);
    const shown = list.slice((ps.page - 1) * COMMUNITY_PAGE_SIZE, ps.page * COMMUNITY_PAGE_SIZE);
    const weekHot = c.posts.filter((p) => Date.now() - ms(p.createdAt) < 7 * DAY && !p.pinned).sort((a, z) => z.likes - a.likes).slice(0, 5);
    const finds = c.posts.filter((p) => p.firstDiscovery).sort(byNewest).slice(0, 5);

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
          ${searchBox('community-q', ps.q, '제목 · 내용 · 닉네임 검색')}
          ${tabs([['new', '최신'], ['hot', '추천순'], ['views', '조회순']], ps.sort, 'community-sort')}
          <button class="btn btn-primary btn-sm" data-action="open-write">글쓰기</button>
        </div>
        ${chips(cats, ps.cat, 'community-cat')}
        ${q ? `<p class="muted small result-note">"${esc(ps.q)}" 검색 결과 ${list.length}개 <button class="link-btn" data-action="community-clear">검색 지우기</button></p>` : ''}
        <section class="card flush"><div class="posts">${shown.map(postRow).join('') || '<p class="empty">조건에 맞는 글이 없어요.</p>'}</div></section>
        ${pagesCount > 1 ? `<nav class="pager" aria-label="페이지">${Array.from({ length: pagesCount }, (_, i) => `
          <button class="${i + 1 === ps.page ? 'on' : ''}" data-action="community-page" data-value="${i + 1}">${i + 1}</button>`).join('')}</nav>` : ''}`,
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
  },

  // 프롬프트 라이브러리 — 참고: PromptBase, FlowGPT, Anthropic 프롬프트 라이브러리
  prompts(c) {
    const ps = pageState('prompts', { cat: '전체', sort: 'copies', q: '' });
    const q = ps.q.trim().toLowerCase();
    const cats = ['전체', ...new Set(c.prompts.map((p) => p.category))];
    const sorters = { copies: (a, z) => z.copies - a.copies, today: (a, z) => (z.copiesToday || 0) - (a.copiesToday || 0), new: byNewest };
    const list = c.prompts
      .filter((p) => ps.cat === '전체' || p.category === ps.cat)
      .filter((p) => !q || `${p.title} ${p.text} ${p.author} ${p.category}`.toLowerCase().includes(q))
      .sort(sorters[ps.sort]);
    const top = [...c.prompts].sort((a, z) => z.copies - a.copies).slice(0, 5);

    return shell('prompts', {
      desc: '바로 복사해서 쓰는 프롬프트와 작업 방식 모음. <mark class="slot">[대괄호]</mark> 부분만 내 상황에 맞게 바꾸면 됩니다.',
      stats: [
        ['프롬프트', fmt(c.prompts.length)],
        ['누적 사용', fmt(c.prompts.reduce((n, p) => n + p.copies, 0))],
        ['오늘 복사', fmt(c.prompts.reduce((n, p) => n + (p.copiesToday || 0), 0))],
      ],
      main: `
        <div class="toolbar">
          ${searchBox('prompts-q', ps.q, '프롬프트 검색')}
          ${tabs([['copies', '많이 쓰인 순'], ['today', '오늘 인기'], ['new', '최신']], ps.sort, 'prompts-sort')}
        </div>
        ${chips(cats.map((x) => [x]), ps.cat, 'prompts-cat')}
        <div class="prompt-grid">${list.map((p, i) => promptCard(p, i + 1, { full: true })).join('') || '<p class="empty">조건에 맞는 프롬프트가 없어요.</p>'}</div>`,
      side:
        card('🏆 누적 TOP 5', `<ol class="rank-list">${top.map((p) => `<li><span class="t">${esc(p.title)}</span><span class="muted">${fmt(p.copies)}회</span></li>`).join('')}</ol>`)
        + card('좋은 프롬프트의 조건', `
          <ul class="bullets">
            <li><b>역할과 목표</b>를 먼저 말한다</li>
            <li><b>출력 형식</b>(표, 목록, 길이)을 정해 준다</li>
            <li><b>하지 말 것</b>을 적는다 — "추측하지 말고 '미정'으로"</li>
            <li>바꿔 쓸 부분은 <mark class="slot">[대괄호]</mark>로 비워 둔다</li>
          </ul>`)
        + card('내 프롬프트 공유하기', `
          <p>지금은 커뮤니티에 <b>프롬프트</b> 분류로 올려 주세요. 많이 쓰인 글은 운영자가 라이브러리에 옮겨요.</p>
          <button class="btn btn-sm btn-primary" data-action="share-prompt">프롬프트 올리기</button>`),
    });
  },

  // 오늘의 AI 창작 챌린지 — 참고: Dribbble, Product Hunt 일간 순위, r/photoshopbattles
  challenge(c) {
    const ch = c.challenge;
    const ps = pageState('challenge', { sort: 'votes' });
    const voted = mine.get('challenge', ch.id);
    const ranked = [...ch.entries].sort((a, z) => z.votes - a.votes);
    const list = ps.sort === 'votes' ? ranked : [...ch.entries].sort(byNewest);
    const placeOf = (e) => ranked.indexOf(e);
    const archive = [...(c.challengeArchive || [])].sort(byNewest);

    return shell('challenge', {
      desc: '매일 하나의 주제로 AI를 써서 무언가를 만들고, 서로 투표합니다. AI를 이야기하는 곳이 아니라 AI로 노는 곳.',
      stats: [['출품', fmt(ch.entries.length) + '개'], ['총 투표', fmt(ch.entries.reduce((n, e) => n + e.votes, 0))], ['마감까지', '—', 'data-countdown']],
      main:
        card('', `
          <p class="eyebrow">오늘의 주제</p>
          <p class="challenge-theme xl">“${esc(ch.theme)}”</p>
          <p class="muted">${esc(ch.rule)} · 투표는 하루에 한 작품만 할 수 있어요.</p>
          <div class="hero-actions">
            <button class="btn btn-primary" data-action="join-challenge">참여하기</button>
            ${voted ? '<span class="muted small">오늘 투표 완료 ✓</span>' : ''}
          </div>`, '', 'challenge-hero')
        + `<div class="toolbar">${tabs([['votes', '인기순'], ['new', '최신순']], ps.sort, 'challenge-sort')}</div>
           <div class="entries gallery">${list.map((e) => entryCard(e, placeOf(e), voted)).join('')}</div>`
        + card('🏆 지난 챌린지 우승작', `
          <div class="winners">${archive.map((a) => `
            <div class="winner">
              <div class="entry-thumb sm" style="background:linear-gradient(135deg, ${esc(a.colors[0])}, ${esc(a.colors[1])})">${esc(a.emoji)}</div>
              <div class="winner-body">
                <span class="muted small">${dayLabel(a.createdAt)} · “${esc(a.theme)}” · ${fmt(a.entries)}개 출품</span>
                <b>${esc(a.title)}</b>
                <span class="muted small">🥇 @${esc(a.author)} · ${esc(a.tool)} · ▲ ${fmt(a.votes)}</span>
              </div>
            </div>`).join('') || '<p class="empty">아직 지난 챌린지가 없어요</p>'}</div>`),
      side:
        card('내일의 주제', `<p class="next-theme">“${esc(ch.next)}”</p><p class="muted small">미리 아이디어를 굴려 보세요.</p>`)
        + card('참여 방법', `
          <ol class="steps">
            <li>주제로 AI 결과물을 만든다 (이미지 · 글 · 영상 · 코드 무엇이든)</li>
            <li><b>참여하기</b>를 눌러 올린다. 사용한 도구를 적어 주세요</li>
            <li>마음에 드는 작품에 하루 한 표</li>
            <li>자정에 1위가 우승작으로 기록돼요</li>
          </ol>
          <p class="muted small">이미지 업로드는 다음 단계에서 열려요. 지금은 글과 링크로 참여할 수 있어요.</p>`),
    });
  },

  // 이번 주 선구자 — 참고: Stack Overflow 평판, Kaggle 순위, GitHub 기여자
  people(c) {
    const ps = pageState('people', { by: 'accuracy' });
    const metrics = {
      accuracy: ['예측 정확도', (p) => p.accuracy + '%'],
      firstFinds: ['최초 발견', (p) => fmt(p.firstFinds) + '회'],
      promptUses: ['프롬프트 사용', (p) => fmt(p.promptUses) + '회'],
    };
    const [label, show] = metrics[ps.by];
    const list = [...c.people].sort((a, z) => z[ps.by] - a[ps.by]);
    const fieldTop = {};
    for (const p of c.people) {
      for (const [field, lv] of Object.entries(p.levels)) {
        if (!fieldTop[field] || fieldTop[field].lv < lv) fieldTop[field] = { name: p.name, lv };
      }
    }

    return shell('people', {
      desc: '활동량이 아니라 판단의 정확성과 발견의 가치로 순위를 매깁니다. 글을 많이 쓴다고 올라가지 않아요.',
      stats: [['선구자', c.people.length + '명'], ['최고 정확도', Math.max(...c.people.map((p) => p.accuracy)) + '%'], ['최초 발견 합계', fmt(c.people.reduce((n, p) => n + p.firstFinds, 0))]],
      main: `
        <div class="toolbar">${tabs(Object.entries(metrics).map(([k, [l]]) => [k, l]), ps.by, 'people-by')}</div>
        <div class="people podium">${list.slice(0, 3).map(personCard).join('')}</div>
        ${card(`전체 순위 <span class="muted small">${label} 기준</span>`, `
          <div class="rank-table" role="table">
            ${list.map((p, i) => `
              <div class="rt-row" role="row">
                <span class="rt-rank">${i + 1}</span>
                <span class="rt-name">@${esc(p.name)}<span class="muted small">${esc(p.rank)}</span></span>
                <span class="levels hide-sm">${Object.entries(p.levels).map(([k, v]) => `<span class="level">${esc(k)} Lv.${v}</span>`).join('')}</span>
                <span class="rt-metric">${show(p)}</span>
              </div>`).join('')}
          </div>`)}`,
      side:
        card('점수는 어떻게 쌓이나요?', `
          <ul class="bullets">
            <li><b>예측 정확도</b> — 판정이 난 예측 중 맞힌 비율 (선구안)</li>
            <li><b>최초 발견</b> — 처음 올린 링크가 나중에 화제가 된 횟수</li>
            <li><b>프롬프트 사용</b> — 내가 올린 프롬프트가 복사된 횟수</li>
            <li><b>분야 레벨</b> — 분야별로 따로 오르는 전문성. 통합 레벨은 없어요</li>
          </ul>
          <p class="muted small">지금 순위는 분위기를 보여주는 예시예요. 계정 기능이 생기면 실제 기록으로 바뀌어요.</p>`)
        + card('분야별 최고 레벨', `<ul class="mini-list">${Object.entries(fieldTop).sort((a, z) => z[1].lv - a[1].lv).map(([field, t]) => `
          <li><span class="t">${esc(field)}</span><span class="muted">@${esc(t.name)}</span><span class="level">Lv.${t.lv}</span></li>`).join('')}</ul>`),
    });
  },
};

// 페이지에 들어올 때 주소의 ?q= ?cat= ?open= 을 필터로 옮긴다 (Pulse 키워드 · 인기글 링크)
export function applyQuery(type, params) {
  if (type === 'feed') {
    const ps = pageState('community', { cat: '전체', sort: 'new', q: '', page: 1 });
    if (params.has('q')) Object.assign(ps, { q: params.get('q'), cat: '전체', page: 1 });
    if (params.has('cat')) Object.assign(ps, { cat: params.get('cat'), q: '', page: 1 });
    if (params.has('open')) {
      const id = params.get('open');
      const post = state.content.posts.find((p) => p.id === id);
      if (post) {
        Object.assign(ps, { cat: '전체', q: '', sort: 'new', page: 1 });
        const idx = [...state.content.posts].sort(feedOrder).indexOf(post);
        ps.page = Math.floor(idx / COMMUNITY_PAGE_SIZE) + 1;
        state.openPost = id;
        return 'post-' + id; // 이 글로 스크롤
      }
    }
  }
  return null;
}

export { pageState };
