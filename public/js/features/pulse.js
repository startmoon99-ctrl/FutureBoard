// AI WORLD PULSE — 참고: Google Trends, Exploding Topics, 증권 시세판
// 지금 AI 세계에서 무엇이 움직이는지. 상승률 · 토론 중 인원 · 추이선은 시뮬레이션(DEMO), 글 수 · 투표 수는 실제 데이터.
import { state, $, esc, fmt, timeAgo, ms, byNewest, groupBy, seeded, pageHref, DAY, CAT_COLORS } from '../core.js';
import { blockHead, shell, card, postLink } from '../widgets.js';

// ---------- 키워드 추이 그래프 ----------

// 작은 추이선. 끝값이 오른쪽 끝에 오도록 그린다
function sparkline(values, { w = 120, h = 32, color = 'var(--up)' } = {}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [((i / (values.length - 1)) * w).toFixed(1), (h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" preserveAspectRatio="none">
    <polyline points="0,${h} ${line} ${w},${h}" fill="${color}" opacity=".12" stroke="none"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="2.4" fill="${color}"/></svg>`;
}

// 키워드의 24시간 추이 (DEMO: 키워드 이름으로 정해지는 모양, 끝값이 지금 상승률)
function trendSeries(name, change) {
  const rnd = seeded(name);
  const n = 24;
  const start = Math.max(1, change * (0.08 + rnd() * 0.2));
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const curve = start + (change - start) * t ** (1.4 + rnd() * 1.2);
    return Math.max(0, curve * (1 + (rnd() - 0.5) * 0.16 * (1 - t)));
  });
}

const DEMO = '<span class="chip chip-demo" title="프로토타입: 상승률과 추이는 시뮬레이션입니다">DEMO</span>';
const todayPosts = (c) => c.posts.filter((p) => Date.now() - ms(p.createdAt) < DAY).length;

// 실시간으로 흔들리는 숫자 (start() 가 data-live · data-trend 를 찾아 움직인다)
const liveStat = (name, value) => `data-live="${name}" data-val="${value}"`;

function block(b, c) {
  return `
    ${blockHead(b, DEMO)}
    <div class="pulse-grid">
      <div>
        <div class="pulse-label">🔥 지금 급상승</div>
        <div class="trend-list">
          ${c.pulse.trending.slice(0, b.limit).map((t, i) => `
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
          <div class="stat"><div class="k">💬 지금 토론 중</div><div class="v" ${liveStat('discussing', c.pulse.discussing)}>${fmt(c.pulse.discussing)}</div></div>
          <div class="stat"><div class="k">⚡ 최근 10분 게시물</div><div class="v" ${liveStat('recent10m', c.pulse.recent10m)}>${fmt(c.pulse.recent10m)}</div></div>
          <div class="stat"><div class="k">📝 오늘 새 글</div><div class="v">${fmt(todayPosts(c))}</div></div>
          <div class="stat"><div class="k">🗳 오늘의 질문 참여</div><div class="v">${fmt(c.debate.yes + c.debate.no)}</div></div>
        </div>
      </div>
    </div>
    <div class="ticker"><span class="ticker-label">● 방금</span><span class="ticker-text" id="ticker-text"></span></div>`;
}

function page(c) {
  const week = c.posts.filter((p) => Date.now() - ms(p.createdAt) < 7 * DAY);
  const heat = Object.entries(groupBy(week, (p) => p.category)).map(([cat, list]) => [cat, list.length]).sort((a, z) => z[1] - a[1]);
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
      ['지금 토론 중', fmt(c.pulse.discussing), liveStat('discussing', c.pulse.discussing)],
      ['최근 10분 게시물', fmt(c.pulse.recent10m), liveStat('recent10m', c.pulse.recent10m)],
      ['오늘 새 글', fmt(todayPosts(c))],
      ['오늘의 질문 참여', fmt(c.debate.yes + c.debate.no)],
    ],
    main:
      card('🔥 지금 급상승', table, DEMO)
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
}

// 숫자가 살아 움직이는 느낌: 2.6초마다 흔들고, 방금 올라온 글을 돌려 보여준다
function start() {
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

export default { type: 'pulse', block, page, start };
