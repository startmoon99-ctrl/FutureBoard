// 이번 주 선구자 — 참고: Stack Overflow 평판, Kaggle 순위, GitHub 기여자
// 활동량이 아니라 판단의 정확성과 발견의 가치로 순위. 지금 순위는 예시 데이터(회원 계정 전).
import { esc, fmt, pageState } from '../core.js';
import { blockHead, shell, card, tabs, personCard } from '../widgets.js';

function block(b, c) {
  return `
    ${blockHead(b)}
    <p class="muted people-sub">활동량이 아니라 판단의 정확성으로</p>
    <div class="people">${c.people.slice(0, b.limit).map(personCard).join('')}</div>`;
}

const METRICS = {
  accuracy: ['예측 정확도', (p) => p.accuracy + '%'],
  firstFinds: ['최초 발견', (p) => fmt(p.firstFinds) + '회'],
  promptUses: ['프롬프트 사용', (p) => fmt(p.promptUses) + '회'],
};

function page(c) {
  const ps = pageState('people', { by: 'accuracy' });
  const [label, show] = METRICS[ps.by];
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
      <div class="toolbar">${tabs(Object.entries(METRICS).map(([k, [l]]) => [k, l]), ps.by, { key: 'people', field: 'by' })}</div>
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
}

export default { type: 'people', block, page };
