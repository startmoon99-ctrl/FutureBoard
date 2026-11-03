// 오늘 인류의 미래 변화 — 참고: Our World in Data, 운명의 날 시계, 아침 브리핑 뉴스레터
// 오늘의 변화를 "인류의 미래가 얼마나 바뀌었나"라는 눈으로. Future Index 는 지금 운영자 큐레이션.
import { esc, ms, dayLabel, shortDate, groupBy } from '../core.js';
import { blockHead, shell, card, lineChart } from '../widgets.js';

const LEVELS = { high: ['▲▲', 'lvl-high', '▲▲ 크게 바뀐 것'], mid: ['▲', 'lvl-mid', '▲ 조금 바뀐 것'], low: ['·', 'lvl-low', '· 지켜볼 것'] };
const arrow = (delta) => (delta > 0 ? '▲' : delta < 0 ? '▼' : '—');

const changeItem = (it, { showLevel }) => `
  <li class="change">
    ${showLevel ? `<span class="lvl ${LEVELS[it.level]?.[1] || 'lvl-low'}">${LEVELS[it.level]?.[0] || '·'}</span>` : ''}
    <span class="t"><span class="c">${esc(it.category)}</span>${esc(it.title)}</span>
    ${it.note ? `<span class="n">${esc(it.note)}</span>` : ''}
  </li>`;

function block(b, c) {
  const f = c.future;
  const delta = f.index - f.indexPrev;
  return `
    ${blockHead(b)}
    <div class="future-top">
      <div class="future-index">
        <span class="label">FUTURE INDEX</span>
        <span class="num">${f.index}</span>
        <span class="delta">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} (어제 ${f.indexPrev})</span>
      </div>
      <div class="future-mood">${arrow(delta)} ${esc(f.mood)}<small>${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} · ${esc(f.summary)}</small></div>
    </div>
    <ul class="change-list">${f.items.slice(0, b.limit).map((it) => changeItem(it, { showLevel: true })).join('')}</ul>
    <div class="block-foot">운영자 큐레이션 · Future Index 산정 방식은 추후 설계</div>`;
}

function page(c) {
  const f = c.future;
  const hist = [...(c.futureHistory || [])].sort((a, z) => ms(a.createdAt) - ms(z.createdAt));
  const points = [...hist.map((h) => ({ label: shortDate(h.createdAt), value: h.index })), { label: '오늘', value: f.index }];
  const delta = f.index - f.indexPrev;
  const byCat = Object.entries(groupBy(f.items, (it) => it.category));
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
      card(`${arrow(delta)} ${esc(f.mood)} <span class="muted small">${esc(f.summary)}</span>`,
        points.length > 1 ? lineChart(points, { label: 'Future Index 추이' }) : '<p class="empty">기록이 쌓이면 그래프가 나타나요</p>')
      + card('오늘의 변화', Object.entries(LEVELS).map(([lv, [, cls, label]]) => {
        const items = f.items.filter((it) => it.level === lv);
        return items.length ? `<h3 class="sub ${cls}">${label}</h3><ul class="change-list big">${items.map((it) => changeItem(it, { showLevel: false })).join('')}</ul>` : '';
      }).join(''))
      + card('지난 기록', `
        <ul class="history">${past.map((h, i) => {
          const prev = past[i + 1];
          const d = prev ? h.index - prev.index : 0;
          return `<li>
            <span class="h-date">${dayLabel(h.createdAt)}</span>
            <span class="h-index">${h.index}</span>
            <span class="h-delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'muted'}">${prev ? arrow(d) + ' ' + Math.abs(d) : ''}</span>
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
      + card('오늘 분야별', `<ul class="mini-list">${byCat.map(([cat, list]) => `<li><span class="t">${esc(cat)}</span><span class="muted">${list.length}건</span></li>`).join('')}</ul>`),
  });
}

export default { type: 'futureChange', block, page };
