// 미래 예측 — 참고: Metaculus, Manifold, Polymarket
// YES / NO 로 걸고, 판정이 나면 적중 기록이 선구안 점수가 된다. 내 기록은 지금 브라우저에만 남는다.
import { state, esc, fmt, byNewest, mine, pageState, pageHref, ui, toast } from '../core.js';
import { api } from '../api.js';
import { blockHead, shell, card, chips, tabs, predictionRow, predictionCard, MEDALS } from '../widgets.js';

const openFirst = (a, z) => (a.status === 'open' ? 0 : 1) - (z.status === 'open' ? 0 : 1);

function myRecord(c) {
  const list = c.predictions.filter((p) => mine.get('pred', p.id));
  const judged = list.filter((p) => p.status === 'resolved');
  const hits = judged.filter((p) => mine.get('pred', p.id) === p.result).length;
  return { list, judged, hits };
}

function block(b, c) {
  const { list, hits } = myRecord(c);
  return `
    ${blockHead(b)}
    ${[...c.predictions].sort(openFirst).slice(0, b.limit).map(predictionRow).join('')}
    <div class="block-foot">내 예측 ${list.length}개${hits ? ` · 🎯 적중 ${hits}회` : ''} · 예측 기록과 선구안 점수는 계정 기능과 함께 고정 정체성에 쌓일 예정</div>`;
}

const SORTS = {
  popular: (a, z) => z.yes + z.no - (a.yes + a.no),
  deadline: (a, z) => new Date(a.deadline) - new Date(z.deadline),
  new: byNewest,
};

function page(c) {
  const ps = pageState('pred', { status: 'open', cat: '전체', sort: 'popular' });
  const cats = ['전체', ...new Set(c.predictions.map((p) => p.category))];
  const list = c.predictions
    .filter((p) => ps.status === 'all' || p.status === ps.status)
    .filter((p) => ps.cat === '전체' || p.category === ps.cat)
    .sort(SORTS[ps.sort]);
  const rec = myRecord(c);
  const seers = [...c.people].sort((a, z) => z.accuracy - a.accuracy).slice(0, 3);

  return shell('predictions', {
    desc: '미래에 일어날 일에 YES / NO로 걸어 보세요. 판정이 나면 적중 기록이 쌓여 선구안 점수가 됩니다.',
    stats: [
      ['진행 중', c.predictions.filter((p) => p.status === 'open').length],
      ['판정 완료', c.predictions.filter((p) => p.status === 'resolved').length],
      ['총 참여', fmt(c.predictions.reduce((n, p) => n + p.yes + p.no, 0))],
      ['내 예측', rec.list.length],
    ],
    main: `
      <div class="toolbar">
        ${tabs([['open', '진행 중'], ['resolved', '판정 완료'], ['all', '전체']], ps.status, { key: 'pred', field: 'status' })}
        ${tabs([['popular', '참여 많은 순'], ['deadline', '마감 순'], ['new', '최신']], ps.sort, { key: 'pred', field: 'sort' })}
      </div>
      ${chips(cats.map((x) => [x]), ps.cat, { key: 'pred', field: 'cat' })}
      <div class="pcards">${list.map(predictionCard).join('') || '<p class="empty">조건에 맞는 예측이 없어요.</p>'}</div>`,
    side:
      card('🎯 내 예측 기록', rec.list.length ? `
        ${rec.judged.length ? `<p class="accuracy"><b>${Math.round((rec.hits / rec.judged.length) * 100)}%</b> 적중 <span class="muted small">(판정 ${rec.judged.length}개 중 ${rec.hits}개)</span></p>` : '<p class="muted small">아직 판정이 난 예측이 없어요.</p>'}
        <ul class="mini-list">${rec.list.map((p) => {
          const my = mine.get('pred', p.id);
          const st = p.status !== 'resolved' ? '<span class="muted">진행 중</span>'
            : my === p.result ? '<span class="verdict-hit">적중</span>' : '<span class="verdict-miss">빗나감</span>';
          return `<li><span class="t">${esc(p.question)}</span><span class="my-pick ${my}">${my.toUpperCase()}</span>${st}</li>`;
        }).join('')}</ul>` : '<p class="empty">아직 예측한 게 없어요. 하나 골라 YES / NO를 눌러 보세요.</p>')
      + card('🏅 선구안 TOP 3', `<ul class="mini-list">${seers.map((p, i) => `
        <li><span class="t">${MEDALS[i]} @${esc(p.name)}</span><b>${p.accuracy}%</b></li>`).join('')}</ul>`,
        `<a class="more" href="${pageHref('people')}" data-link>전체 순위 ›</a>`)
      + card('예측은 이렇게 쌓여요', `
        <ul class="bullets">
          <li>마감일이 지나면 운영자가 결과를 판정해요.</li>
          <li>맞힌 예측만큼 <b>선구안 점수</b>가 올라가요. 많이 누르는 것보다 정확한 게 중요해요.</li>
          <li>지금은 이 브라우저에만 기록돼요. 계정이 생기면 프로필에 영구히 남아요.</li>
        </ul>`),
  });
}

const actions = {
  async 'pred-vote'(el) {
    const p = state.content.predictions.find((x) => x.id === el.dataset.id);
    if (!p || mine.get('pred', p.id)) return;
    Object.assign(p, await api.votePrediction(p.id, el.dataset.choice));
    mine.set('pred', p.id, el.dataset.choice);
    ui.refresh('predictions');
    toast('예측이 기록됐어요. 판정일에 결과를 알려드릴게요.');
  },
};

export default { type: 'predictions', block, page, actions };
