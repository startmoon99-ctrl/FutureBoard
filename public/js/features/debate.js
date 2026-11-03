// 오늘의 질문 — 참고: Kialo(찬반 나란히), Reddit Change My View
// 매일 하나의 질문에 YES / NO 와 한 줄 의견. 투표는 브라우저별로 한 번(회원 계정 전 임시 방식).
import { state, esc, fmt, pct, timeAgo, byNewest, dayLabel, store, mine, ui, toast } from '../core.js';
import { api } from '../api.js';
import { blockHead, shell, card, bar } from '../widgets.js';

// ---------- 조각 ----------

function voteBox(d) {
  const my = mine.get('debate', d.id);
  const p = pct(d.yes, d.no);
  return `
    <div class="vote-row">
      <button class="vote yes ${my === 'yes' ? 'mine' : ''}" data-action="debate-vote" data-choice="yes" ${my ? 'disabled' : ''}>YES · ${esc(d.yesLabel)}</button>
      <button class="vote no ${my === 'no' ? 'mine' : ''}" data-action="debate-vote" data-choice="no" ${my ? 'disabled' : ''}>NO · ${esc(d.noLabel)}</button>
    </div>
    ${bar('debate', p)}
    <div class="bar-labels"><span class="y">YES ${p}% · ${fmt(d.yes)}</span><span class="n">${fmt(d.no)} · ${100 - p}% NO</span></div>`;
}

// 내가 없는 동안 페이지도 쓴다
export function commentItem(x) {
  return `
    <li class="comment" data-cid="${esc(x.id)}">
      ${x.choice ? `<span class="side ${x.choice}">${x.choice.toUpperCase()}</span>` : ''}<span class="who">${esc(x.author)}</span>${esc(x.text)}<span class="when">${timeAgo(x.createdAt)}</span>
      ${state.admin ? `<button class="mod-link" data-action="hide-comment" data-id="${esc(x.id)}">숨기기</button>` : ''}
    </li>`;
}

const commentForm = () => `
  <form class="inline-form" data-form="debate-comment">
    <input class="nick" name="author" maxlength="20" placeholder="닉네임" value="${esc(store.get('fb_nick', ''))}">
    <input name="text" maxlength="300" placeholder="한 줄 의견" required>
    <button class="btn btn-sm">등록</button>
  </form>`;

const commentList = (list) => `<ul class="comments">${list.map(commentItem).join('') || '<li class="empty">아직 의견이 없어요</li>'}</ul>`;

// ---------- 블록 · 페이지 ----------

function block(b, c) {
  const d = c.debate;
  return `
    ${blockHead(b)}
    <p class="debate-q">${esc(d.question)}</p>
    <div class="muted">${fmt(d.yes + d.no)}명 참여 · 투표하고 이유를 남겨주세요. 내일 새 질문이 열려요.</div>
    ${voteBox(d)}
    <ul class="comments">${[...d.comments].sort(byNewest).slice(0, b.limit).map(commentItem).join('')}</ul>
    ${commentForm()}`;
}

function page(c) {
  const d = c.debate;
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
        ${voteBox(d)}
        ${commentForm()}
        ${mine.get('debate', d.id) ? '' : '<p class="muted small form-hint">투표하면 내 의견에 YES / NO 표시가 붙어요.</p>'}`, '', 'debate-hero')
      + `<div class="sides">
          ${card(`<span class="side yes">YES</span> ${esc(d.yesLabel)} <span class="muted small">${side('yes').length}</span>`, commentList(side('yes')))}
          ${card(`<span class="side no">NO</span> ${esc(d.noLabel)} <span class="muted small">${side('no').length}</span>`, commentList(side('no')))}
        </div>`
      + (neutral.length ? card('투표 전에 남긴 의견', commentList(neutral)) : '')
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
}

// ---------- 동작 ----------

const actions = {
  async 'debate-vote'(el) {
    const d = state.content.debate;
    if (mine.get('debate', d.id)) return;
    const choice = el.dataset.choice;
    Object.assign(d, await api.voteDebate(choice));
    mine.set('debate', d.id, choice);
    ui.refresh('debate');
    toast(`${choice.toUpperCase()}에 투표했어요. 이유도 한 줄 남겨볼까요?`);
  },

  // 관리자: 지우지 않고 숨긴다. 관리자 모드의 '숨긴 글 · 댓글'에서 되살릴 수 있다
  async 'hide-comment'(el) {
    if (!confirm('이 댓글을 숨길까요?\n관리자 모드에서 다시 보이게 할 수 있어요.')) return;
    await api.admin.hideComment(el.dataset.id);
    const d = state.content.debate;
    d.comments = d.comments.filter((x) => x.id !== el.dataset.id);
    ui.refresh('debate', 'whileAway');
    toast('댓글을 숨겼어요');
  },
};

const forms = {
  async 'debate-comment'(form, data) {
    const d = state.content.debate;
    const comment = await api.commentDebate({ ...data, choice: mine.get('debate', d.id) || null });
    if (data.author) store.set('fb_nick', data.author);
    d.comments.push(comment);
    ui.refresh('debate', 'whileAway');
    document.querySelector(`[data-cid="${comment.id}"]`)?.classList.add('new-flash');
  },
};

export default { type: 'debate', block, page, actions, forms };
