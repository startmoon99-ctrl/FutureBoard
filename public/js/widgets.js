// 메인 블록과 페이지가 함께 쓰는 화면 조각
import { state, esc, fmt, pct, timeAgo, dday, mine, seeded, pageHref, CAT_COLORS } from './core.js';

// ---------- 막대 · 칩 ----------

// YES 비율 막대. data-bar 키가 같으면 다시 그릴 때 이전 값에서 새 값으로 움직인다 (app.js animateBars)
export const bar = (key, yesPct, cls = '') =>
  `<div class="bar ${cls}"><div class="bar-fill" data-bar="${esc(key)}" data-w="${yesPct}"></div></div>`;

export function chips(items, active, action, extra = '') {
  return `<div class="chips">${items.map(([value, label]) =>
    `<button class="filter ${value === active ? 'on' : ''}" data-action="${action}" data-value="${esc(value)}" ${extra}>${esc(label ?? value)}</button>`).join('')}</div>`;
}

export function tabs(items, active, action) {
  return `<div class="tabs" role="tablist">${items.map(([value, label]) =>
    `<button class="tab ${value === active ? 'on' : ''}" role="tab" aria-selected="${value === active}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`).join('')}</div>`;
}

export const more = (type, label = '전체 보기') => `<a class="more" href="${pageHref(type)}" data-link>${label} <span aria-hidden="true">›</span></a>`;

// ---------- 그래프 ----------

// 작은 추이선. 끝값이 오른쪽 끝에 오도록 그린다
export function sparkline(values, { w = 120, h = 32, color = 'var(--up)' } = {}) {
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
export function trendSeries(name, change) {
  const rnd = seeded(name);
  const n = 24;
  const start = Math.max(1, change * (0.08 + rnd() * 0.2));
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const curve = start + (change - start) * t ** (1.4 + rnd() * 1.2);
    return Math.max(0, curve * (1 + (rnd() - 0.5) * 0.16 * (1 - t)));
  });
}

// 날짜별 꺾은선 그래프 (Future Index)
export function lineChart(points, { h = 180 } = {}) {
  const w = 640;
  const pad = { t: 18, r: 16, b: 26, l: 32 };
  const vals = points.map((p) => p.value);
  const min = Math.floor(Math.min(...vals) - 2);
  const max = Math.ceil(Math.max(...vals) + 2);
  const x = (i) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const grid = [min, Math.round((min + max) / 2), max];
  const last = points.length - 1;
  return `<svg class="linechart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Future Index 추이">
    ${grid.map((g) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${pad.l - 6}" y="${y(g) + 4}" class="axis" text-anchor="end">${g}</text>`).join('')}
    <polyline points="${x(0)},${h - pad.b} ${line} ${x(last)},${h - pad.b}" class="area"/>
    <polyline points="${line}" class="line"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === last ? 5 : 2.6}" class="${i === last ? 'dot now' : 'dot'}"><title>${esc(p.label)} · ${p.value}</title></circle>`).join('')}
    <text x="${x(0)}" y="${h - 6}" class="axis">${esc(points[0].label)}</text>
    <text x="${x(last)}" y="${h - 6}" class="axis" text-anchor="end">${esc(points[last].label)}</text>
  </svg>`;
}

// ---------- 커뮤니티 글 ----------

export const isNewSince = (p) => state.awayFrom && new Date(p.createdAt).getTime() > state.awayFrom;

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
          </div>
        </div>` : ''}
    </article>`;
}

// 고정 공지가 먼저, 그다음 최신순
export const feedOrder = (a, z) => (z.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(z.createdAt) - new Date(a.createdAt);

// ---------- 예측 ----------

function verdictOf(p) {
  const my = mine.get('pred', p.id);
  if (p.status === 'resolved') {
    let v = `판정: <b>${p.result === 'yes' ? 'YES' : 'NO'}</b>`;
    if (my) v += my === p.result ? ' · <span class="verdict-hit">내 예측 적중!</span>' : ' · <span class="verdict-miss">내 예측 빗나감</span>';
    return v;
  }
  return my ? `내 예측: <b>${my.toUpperCase()}</b> · 진행 중` : '';
}

function predButtons(p, cls = '') {
  const my = mine.get('pred', p.id);
  if (p.status === 'resolved') return '<span class="chip">판정 완료</span>';
  return `<div class="pred-btns ${cls}">
    <button class="vote yes ${my === 'yes' ? 'mine' : ''}" data-action="pred-vote" data-id="${esc(p.id)}" data-choice="yes" ${my ? 'disabled' : ''}>YES</button>
    <button class="vote no ${my === 'no' ? 'mine' : ''}" data-action="pred-vote" data-id="${esc(p.id)}" data-choice="no" ${my ? 'disabled' : ''}>NO</button>
  </div>`;
}

// 메인 블록용 한 줄
export function predictionRow(p) {
  const y = pct(p.yes, p.no);
  const v = verdictOf(p);
  return `
    <div class="pred">
      <div class="pred-top"><span class="chip">${esc(p.category)}</span><span class="pred-q">${esc(p.question)}</span></div>
      <div class="pred-bottom">
        ${bar('pred-' + p.id, y)}
        <span class="pred-pct">YES ${y}%</span>
        ${predButtons(p)}
      </div>
      <div class="pred-meta">${fmt(p.yes + p.no)}명 예측 · 마감 ${esc(p.deadline)} ${v ? '· ' + v : ''}</div>
    </div>`;
}

// 예측 페이지용 카드 (확률을 크게)
export function predictionCard(p) {
  const y = pct(p.yes, p.no);
  const v = verdictOf(p);
  const resolved = p.status === 'resolved';
  return `
    <div class="pcard ${resolved ? 'resolved' : ''}">
      <div class="pcard-top">
        <span class="chip">${esc(p.category)}</span>
        <span class="pcard-d ${resolved ? '' : dday(p.deadline) === 'D-day' ? 'soon' : ''}">${resolved ? '판정 완료' : dday(p.deadline)}</span>
      </div>
      <p class="pcard-q">${esc(p.question)}</p>
      <div class="pcard-prob">
        <span class="big ${y >= 50 ? 'y' : 'n'}">${y}%</span>
        <span class="muted">${y >= 50 ? 'YES 쪽' : 'NO 쪽'} 우세 · ${fmt(p.yes + p.no)}명</span>
      </div>
      ${bar('pcard-' + p.id, y)}
      <div class="pcard-foot">
        <span class="muted small">마감 ${esc(p.deadline)}${v ? ' · ' + v : ''}</span>
        ${predButtons(p)}
      </div>
    </div>`;
}

// ---------- 프롬프트 ----------

// [대괄호] 부분은 채워 넣을 자리라서 강조한다
const markSlots = (text) => esc(text).replace(/\[([^\]\n]{1,30})\]/g, '<mark class="slot">[$1]</mark>');

export function promptCard(p, rank, { full = false } = {}) {
  return `
    <div class="prompt ${full ? 'full' : ''}">
      <div class="prompt-top"><span class="rank">#${rank}</span><span class="ttl">${esc(p.title)}</span><span class="chip">${esc(p.category)}</span></div>
      <pre>${full ? markSlots(p.text) : esc(p.text)}</pre>
      <div class="prompt-bottom">
        <span>@${esc(p.author)}</span><span>· ${fmt(p.copies)}회 사용됨</span>${p.copiesToday ? `<span>· 오늘 ${fmt(p.copiesToday)}</span>` : ''}
        <button class="btn btn-sm copy" data-action="copy-prompt" data-id="${esc(p.id)}">복사</button>
      </div>
    </div>`;
}

// ---------- 챌린지 ----------

const MEDALS = ['🥇', '🥈', '🥉'];

export function entryCard(e, place, voted) {
  return `
    <div class="entry">
      <div class="entry-thumb" style="background:linear-gradient(135deg, ${esc(e.colors[0])}, ${esc(e.colors[1])})">
        ${place < 3 ? `<span class="place">${MEDALS[place]} ${place + 1}위</span>` : ''}${esc(e.emoji)}
      </div>
      <div class="entry-body">
        <div class="entry-title">${esc(e.title)}</div>
        <div class="entry-meta">
          <span>@${esc(e.author)} · ${esc(e.tool)}</span>
          <button class="vote ${voted === e.id ? 'mine' : ''}" data-action="challenge-vote" data-id="${esc(e.id)}" ${voted ? 'disabled' : ''}>▲ ${fmt(e.votes)}</button>
        </div>
      </div>
    </div>`;
}

// ---------- 사람 ----------

export function personCard(p, i) {
  return `
    <div class="person">
      <div class="person-name"><span class="medal">${MEDALS[i] || '·'}</span>@${esc(p.name)}</div>
      <div class="person-rank">${esc(p.rank)}</div>
      <div class="levels">${Object.entries(p.levels).map(([k, v]) => `<span class="level">${esc(k)} Lv.${v}</span>`).join('')}</div>
      <div class="person-stats">
        <span><b>${p.accuracy}%</b>예측 정확도</span>
        <span><b>${fmt(p.firstFinds)}</b>최초 발견</span>
        <span><b>${fmt(p.promptUses)}</b>프롬프트 사용</span>
      </div>
    </div>`;
}
