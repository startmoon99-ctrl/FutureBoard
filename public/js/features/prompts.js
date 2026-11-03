// 프롬프트 라이브러리 — 참고: PromptBase, FlowGPT, Anthropic 프롬프트 라이브러리
// 바로 복사해서 쓰는 프롬프트. 복사할 때마다 작성자의 '사용됨' 숫자가 오른다.
import { state, esc, fmt, byNewest, pageState, ui, toast, copyText } from '../core.js';
import { api } from '../api.js';
import { blockHead, shell, card, chips, tabs, searchBox, promptCard } from '../widgets.js';
import { openWrite } from './community.js';

const byCopies = (a, z) => z.copies - a.copies;

function block(b, c) {
  return `
    ${blockHead(b)}
    <div class="prompt-list">${[...c.prompts].sort(byCopies).slice(0, b.limit).map((p, i) => promptCard(p, i + 1)).join('')}</div>`;
}

const SORTS = { copies: byCopies, today: (a, z) => (z.copiesToday || 0) - (a.copiesToday || 0), new: byNewest };

function page(c) {
  const ps = pageState('prompts', { cat: '전체', sort: 'copies', q: '' });
  const q = ps.q.trim().toLowerCase();
  const cats = ['전체', ...new Set(c.prompts.map((p) => p.category))];
  const list = c.prompts
    .filter((p) => ps.cat === '전체' || p.category === ps.cat)
    .filter((p) => !q || `${p.title} ${p.text} ${p.author} ${p.category}`.toLowerCase().includes(q))
    .sort(SORTS[ps.sort]);
  const f = (field) => ({ key: 'prompts', field });

  return shell('prompts', {
    desc: '바로 복사해서 쓰는 프롬프트와 작업 방식 모음. <mark class="slot">[대괄호]</mark> 부분만 내 상황에 맞게 바꾸면 됩니다.',
    stats: [
      ['프롬프트', fmt(c.prompts.length)],
      ['누적 사용', fmt(c.prompts.reduce((n, p) => n + p.copies, 0))],
      ['오늘 복사', fmt(c.prompts.reduce((n, p) => n + (p.copiesToday || 0), 0))],
    ],
    main: `
      <div class="toolbar">
        ${searchBox(f('q'), ps.q, '프롬프트 검색')}
        ${tabs([['copies', '많이 쓰인 순'], ['today', '오늘 인기'], ['new', '최신']], ps.sort, f('sort'))}
      </div>
      ${chips(cats.map((x) => [x]), ps.cat, f('cat'))}
      <div class="prompt-grid">${list.map((p, i) => promptCard(p, i + 1, { full: true })).join('') || '<p class="empty">조건에 맞는 프롬프트가 없어요.</p>'}</div>`,
    side:
      card('🏆 누적 TOP 5', `<ol class="rank-list">${[...c.prompts].sort(byCopies).slice(0, 5).map((p) => `<li><span class="t">${esc(p.title)}</span><span class="muted">${fmt(p.copies)}회</span></li>`).join('')}</ol>`)
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
}

const actions = {
  async 'copy-prompt'(el) {
    const p = state.content.prompts.find((x) => x.id === el.dataset.id);
    if (!p) return;
    await copyText(p.text);
    el.textContent = '복사됨 ✓';
    el.classList.add('done');
    Object.assign(p, await api.copyPrompt(p.id));
    toast(`복사했어요 · 이 프롬프트는 지금까지 ${fmt(p.copies)}번 사용됐어요`);
    setTimeout(() => ui.refresh('prompts'), 1200);
  },

  'share-prompt'() {
    openWrite({ category: '프롬프트', title: '[프롬프트] ' });
  },
};

export default { type: 'prompts', block, page, actions };
