// 오늘의 AI 창작 챌린지 — 참고: Dribbble, Product Hunt 일간 순위, r/photoshopbattles
// 매일 하나의 주제로 AI 결과물을 만들고 하루 한 표씩 투표한다.
import { state, esc, fmt, byNewest, dayLabel, mine, pageState, ui, toast } from '../core.js';
import { api } from '../api.js';
import { blockHead, shell, card, tabs, entryCard } from '../widgets.js';
import { openWrite } from './community.js';

const byVotes = (a, z) => z.votes - a.votes;

function block(b, c) {
  const ch = c.challenge;
  const voted = mine.get('challenge', ch.id);
  return `
    ${blockHead(b)}
    <p class="challenge-theme">“${esc(ch.theme)}”</p>
    <div class="muted">출품 ${fmt(ch.entries.length)}개 · ${esc(ch.rule)}</div>
    <div class="entries">${[...ch.entries].sort(byVotes).slice(0, b.limit).map((e, i) => entryCard(e, i, voted)).join('')}</div>
    <div class="block-foot">
      <button class="btn btn-sm btn-primary" data-action="join-challenge">참여하기</button>
      <span>내일의 주제: ${esc(ch.next)}</span>
    </div>`;
}

function page(c) {
  const ch = c.challenge;
  const ps = pageState('challenge', { sort: 'votes' });
  const voted = mine.get('challenge', ch.id);
  const ranked = [...ch.entries].sort(byVotes);
  const list = ps.sort === 'votes' ? ranked : [...ch.entries].sort(byNewest);
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
      + `<div class="toolbar">${tabs([['votes', '인기순'], ['new', '최신순']], ps.sort, { key: 'challenge', field: 'sort' })}</div>
         <div class="entries gallery">${list.map((e) => entryCard(e, ranked.indexOf(e), voted)).join('')}</div>`
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
}

// 자정까지 남은 시간 (data-countdown)
function updateCountdown() {
  const els = document.querySelectorAll('[data-countdown]');
  if (!els.length) return;
  const end = new Date();
  end.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const text = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  els.forEach((el) => { el.textContent = text; });
}

const actions = {
  async 'challenge-vote'(el) {
    const ch = state.content.challenge;
    if (mine.get('challenge', ch.id)) return;
    const e = ch.entries.find((x) => x.id === el.dataset.id);
    Object.assign(e, await api.voteEntry(e.id));
    mine.set('challenge', ch.id, e.id);
    ui.refresh('challenge');
    toast('투표 완료! 내일 우승작이 발표돼요.');
  },

  'join-challenge'() {
    openWrite({ category: 'AI아트', title: `[챌린지] ${state.content.challenge.theme} — `, aiLabel: 'AI 생성' });
  },
};

export default {
  type: 'challenge',
  block,
  page,
  actions,
  start: () => setInterval(updateCountdown, 1000),
  afterRender: updateCountdown,
};
