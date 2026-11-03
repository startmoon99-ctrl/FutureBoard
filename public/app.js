(() => {
  'use strict';

  // /preview 는 Draft 구성을, / 는 Published 구성을 렌더링한다. 콘텐츠(Community Data)는 둘 다 같다.
  const IS_PREVIEW = location.pathname.startsWith('/preview');
  // 관리자 빌더의 미리보기 칸(iframe) 안에서 열린 경우. 이때 관리자 링크를 누르면 빌더 안에 빌더가 열리므로 숨긴다.
  const IS_EMBEDDED = window.self !== window.top;
  const SESSION_GAP = 30 * 60 * 1000;

  const state = {
    config: null,
    content: null,
    feedFilter: '전체',
    feedExtra: 0,
    openPost: null,
    awayFrom: null,
  };

  // ---------- 유틸 ----------

  const $ = (s, root = document) => root.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  const pct = (a, b) => (a + b ? Math.round((a / (a + b)) * 100) : 50);

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장소를 못 써도 화면은 동작 */ }
    },
  };

  // 브라우저별로 이미 누른 투표·추천을 기억한다 (계정 시스템 전 단계의 임시 방식)
  const mine = {
    get: (kind, id) => store.get('fb_mine', {})[kind + ':' + id],
    set(kind, id, value) {
      const all = store.get('fb_mine', {});
      all[kind + ':' + id] = value;
      store.set('fb_mine', all);
    },
  };

  function timeAgo(iso) {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return '방금';
    if (m < 60) return m + '분 전';
    const h = Math.floor(m / 60);
    if (h < 24) return h + '시간 전';
    const d = Math.floor(h / 24);
    return d < 30 ? d + '일 전' : new Date(iso).toLocaleDateString('ko-KR');
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || '요청에 실패했어요'), { status: res.status });
    return data;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  const CAT_COLORS = {
    '공지': '#fbbf24', '뉴스': '#60a5fa', '발견': '#f59e0b', '밈': '#f472b6', '바이브코딩': '#a78bfa',
    '프롬프트': '#22d3ee', 'AI아트': '#fb7185', '로보틱스': '#34d399', 'AGI·특이점': '#c084fc',
    '미래기술': '#38bdf8', '우주·과학': '#818cf8', 'SF': '#2dd4bf', '토론': '#fca5a5', '질문': '#a3e635',
  };
  const WRITE_CATEGORIES = Object.keys(CAT_COLORS).filter((c) => c !== '공지');

  // ---------- 방문 기록 (내가 없는 동안 / 연속 방문) ----------

  function trackVisit() {
    const now = Date.now();
    const visit = store.get('fb_visit', null);
    let awayFrom = null;

    if (visit) {
      // 30분 이상 비웠다가 들어오면 새 방문으로 보고, 마지막으로 본 시점부터 '없는 동안'을 계산한다
      awayFrom = now - visit.seen > SESSION_GAP ? visit.seen : visit.awayFrom;
    }
    state.awayFrom = awayFrom;
    if (IS_PREVIEW) return; // 미리보기는 방문 기록을 남기지 않는다

    store.set('fb_visit', { awayFrom, seen: now });

    const today = new Date().toLocaleDateString('sv-SE');
    const yesterday = new Date(now - 86400000).toLocaleDateString('sv-SE');
    const streak = store.get('fb_streak', null);
    let count = 1;
    if (streak && streak.day === today) count = streak.count;
    else if (streak && streak.day === yesterday) count = streak.count + 1;
    store.set('fb_streak', { day: today, count });

    if (count >= 2) {
      const el = $('#streak');
      el.textContent = `🔥 ${count}일 연속 방문`;
      el.hidden = false;
    }
  }

  // ---------- 블록 렌더러 ----------

  const ICONS = {
    pulse: '<span class="live-dot"></span>', futureChange: '🌏', whileAway: '⏱', debate: '🗳',
    predictions: '🔮', feed: '💬', prompts: '✨', challenge: '🎨', people: '🏅',
  };

  function head(block, meta = '', extra = '') {
    return `<div class="block-head"><span class="icon">${ICONS[block.type] || ''}</span><h2>${esc(block.title)}</h2>${extra}<span class="meta">${meta}</span></div>`;
  }

  const renderers = {
    pulse(b, c) {
      const trends = c.pulse.trending.slice(0, b.limit);
      const today = c.posts.filter((p) => Date.now() - new Date(p.createdAt) < 86400000).length;
      return `
        ${head(b, '실시간', '<span class="chip chip-demo" title="프로토타입: 일부 수치는 시뮬레이션입니다">DEMO</span>')}
        <div class="pulse-grid">
          <div>
            <div class="pulse-label">🔥 지금 급상승</div>
            <div class="trend-list">
              ${trends.map((t, i) => `
                <div class="trend">
                  <span class="rank">${i + 1}</span>
                  <span class="name">${esc(t.name)}</span>
                  <span class="chg" data-trend="${i}" data-base="${t.change}">↑ ${fmt(t.change)}%</span>
                </div>`).join('')}
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
        ${head(b, new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }))}
        <div class="future-top">
          <div class="future-index">
            <span class="label">FUTURE INDEX</span>
            <span class="num">${f.index}</span>
            <span class="delta">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} (어제 ${f.indexPrev})</span>
          </div>
          <div class="future-mood">${delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} ${esc(f.mood)}<small>${esc(f.summary)}</small></div>
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

    whileAway(b, c) {
      const since = state.awayFrom;
      const from = since || Date.now() - 86400000;
      const after = (iso) => new Date(iso).getTime() > from;
      const posts = c.posts.filter((p) => after(p.createdAt));
      const hot = [...posts].sort((a, z) => z.likes - a.likes).slice(0, b.limit);
      const stats = [
        ['새 게시글', posts.length],
        ['새 프롬프트', c.prompts.filter((p) => after(p.createdAt)).length],
        ['새 챌린지 작품', c.challenge.entries.filter((e) => after(e.createdAt)).length],
        ['오늘의 질문 새 댓글', c.debate.comments.filter((x) => after(x.createdAt)).length],
        ['새 예측', c.predictions.filter((p) => after(p.createdAt)).length],
        ['최초 발견', posts.filter((p) => p.firstDiscovery).length],
      ];
      let title;
      if (!since) title = '처음 오셨네요! <em>최근 24시간</em> 동안';
      else {
        const hours = Math.floor((Date.now() - since) / 3600000);
        title = hours >= 1 ? `내가 없는 <em>${hours >= 48 ? Math.floor(hours / 24) + '일' : hours + '시간'}</em> 동안` : '방금 전 이후로';
      }
      return `
        ${head(b, since ? '마지막 방문 ' + timeAgo(new Date(since).toISOString()) : '')}
        <p class="away-title">${title}</p>
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
      const comments = [...d.comments].sort((a, z) => new Date(z.createdAt) - new Date(a.createdAt)).slice(0, b.limit);
      return `
        ${head(b, `${fmt(d.yes + d.no)}명 참여`)}
        <p class="debate-q">${esc(d.question)}</p>
        <div class="muted">투표하고 이유를 남겨주세요. 내일 새 질문이 열려요.</div>
        <div class="vote-row">
          <button class="vote yes ${my === 'yes' ? 'mine' : ''}" data-action="debate-vote" data-choice="yes" ${my ? 'disabled' : ''}>YES · ${esc(d.yesLabel)}</button>
          <button class="vote no ${my === 'no' ? 'mine' : ''}" data-action="debate-vote" data-choice="no" ${my ? 'disabled' : ''}>NO · ${esc(d.noLabel)}</button>
        </div>
        <div class="bar"><div class="bar-fill" data-bar="debate" data-w="${p}"></div></div>
        <div class="bar-labels"><span class="y">YES ${p}% · ${fmt(d.yes)}</span><span class="n">${fmt(d.no)} · ${100 - p}% NO</span></div>
        <ul class="comments">
          ${comments.map((x) => `
            <li class="comment" data-cid="${esc(x.id)}">
              ${x.choice ? `<span class="side ${x.choice}">${x.choice.toUpperCase()}</span>` : ''}<span class="who">${esc(x.author)}</span>${esc(x.text)}<span class="when">${timeAgo(x.createdAt)}</span>
            </li>`).join('')}
        </ul>
        <form class="inline-form" data-form="debate-comment">
          <input class="nick" name="author" maxlength="20" placeholder="닉네임" value="${esc(store.get('fb_nick', ''))}">
          <input name="text" maxlength="300" placeholder="한 줄 의견" required>
          <button class="btn btn-sm">등록</button>
        </form>`;
    },

    predictions(b, c) {
      const list = [...c.predictions].sort((a, z) => (a.status === 'open' ? 0 : 1) - (z.status === 'open' ? 0 : 1)).slice(0, b.limit);
      const myCount = c.predictions.filter((p) => mine.get('pred', p.id)).length;
      const myHits = c.predictions.filter((p) => p.status === 'resolved' && mine.get('pred', p.id) === p.result).length;
      return `
        ${head(b, `내 예측 ${myCount}개`)}
        ${list.map((p) => {
          const my = mine.get('pred', p.id);
          const y = pct(p.yes, p.no);
          const resolved = p.status === 'resolved';
          let verdict = '';
          if (resolved) {
            verdict = `· 판정: <b>${p.result === 'yes' ? 'YES' : 'NO'}</b>`;
            if (my) verdict += my === p.result ? ' · <span class="verdict-hit">내 예측 적중!</span>' : ' · <span class="verdict-miss">내 예측 빗나감</span>';
          } else if (my) verdict = `· 내 예측: <b>${my.toUpperCase()}</b> · 진행 중`;
          return `
            <div class="pred">
              <div class="pred-top"><span class="chip">${esc(p.category)}</span><span class="pred-q">${esc(p.question)}</span></div>
              <div class="pred-bottom">
                <div class="bar"><div class="bar-fill" data-bar="pred-${esc(p.id)}" data-w="${y}"></div></div>
                <span class="pred-pct">YES ${y}%</span>
                ${resolved ? '<span class="chip">판정 완료</span>' : `
                  <div class="pred-btns">
                    <button class="vote yes ${my === 'yes' ? 'mine' : ''}" data-action="pred-vote" data-id="${esc(p.id)}" data-choice="yes" ${my ? 'disabled' : ''}>YES</button>
                    <button class="vote no ${my === 'no' ? 'mine' : ''}" data-action="pred-vote" data-id="${esc(p.id)}" data-choice="no" ${my ? 'disabled' : ''}>NO</button>
                  </div>`}
              </div>
              <div class="pred-meta">${fmt(p.yes + p.no)}명 예측 · 마감 ${esc(p.deadline)} ${verdict}</div>
            </div>`;
        }).join('')}
        <div class="block-foot">${myHits ? `🎯 적중 ${myHits}회 · ` : ''}예측 기록과 선구안 점수는 계정 기능과 함께 고정 정체성에 쌓일 예정</div>`;
    },

    feed(b, c) {
      const cats = ['전체', ...WRITE_CATEGORIES.filter((cat) => c.posts.some((p) => p.category === cat))];
      const list = c.posts
        .filter((p) => state.feedFilter === '전체' || p.category === state.feedFilter || p.pinned)
        .sort((a, z) => (z.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(z.createdAt) - new Date(a.createdAt));
      const shown = list.slice(0, b.limit + state.feedExtra);
      const liked = (id) => mine.get('like', id);
      const isNew = (p) => state.awayFrom && new Date(p.createdAt).getTime() > state.awayFrom;

      return `
        ${head(b, `전체 ${fmt(c.posts.length)}개`)}
        <div class="chips">
          ${cats.map((cat) => `<button class="filter ${state.feedFilter === cat ? 'on' : ''}" data-action="feed-filter" data-cat="${esc(cat)}">${esc(cat)}</button>`).join('')}
        </div>
        <div class="posts">
          ${shown.map((p) => `
            <article class="post ${p.pinned ? 'pinned' : ''}" id="post-${esc(p.id)}">
              <div class="post-row" data-action="toggle-post" data-id="${esc(p.id)}">
                <span class="cat" style="--c:${CAT_COLORS[p.category] || 'var(--muted)'}">${esc(p.category)}</span>
                <span class="title">
                  <span class="title-text">${esc(p.title)}</span>
                  ${isNew(p) ? '<span class="chip chip-new">N</span>' : ''}
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
                    <button class="btn btn-sm like ${liked(p.id) ? 'liked' : ''}" data-action="like-post" data-id="${esc(p.id)}" ${liked(p.id) ? 'disabled' : ''}>♥ 추천 ${fmt(p.likes)}</button>
                  </div>
                </div>` : ''}
            </article>`).join('') || '<p class="empty">아직 이 분류에는 글이 없어요. 첫 글을 남겨보세요.</p>'}
        </div>
        ${list.length > shown.length ? `<button class="btn more-btn" data-action="feed-more">더보기 (${fmt(list.length - shown.length)}개 남음)</button>` : ''}`;
    },

    prompts(b, c) {
      const list = [...c.prompts].sort((a, z) => z.copies - a.copies).slice(0, b.limit);
      return `
        ${head(b, '복사 수 순')}
        <div class="prompt-list">
          ${list.map((p, i) => `
            <div class="prompt">
              <div class="prompt-top"><span class="rank">#${i + 1}</span><span class="ttl">${esc(p.title)}</span><span class="chip">${esc(p.category)}</span></div>
              <pre>${esc(p.text)}</pre>
              <div class="prompt-bottom">
                <span>@${esc(p.author)}</span><span>· ${fmt(p.copies)}회 사용됨</span>${p.copiesToday ? `<span>· 오늘 ${fmt(p.copiesToday)}</span>` : ''}
                <button class="btn btn-sm copy" data-action="copy-prompt" data-id="${esc(p.id)}">복사</button>
              </div>
            </div>`).join('')}
        </div>`;
    },

    challenge(b, c) {
      const ch = c.challenge;
      const list = [...ch.entries].sort((a, z) => z.votes - a.votes).slice(0, b.limit);
      const voted = mine.get('challenge', ch.id);
      const medal = ['🥇', '🥈', '🥉'];
      return `
        ${head(b, `출품 ${fmt(ch.entries.length)}개`)}
        <p class="challenge-theme">“${esc(ch.theme)}”</p>
        <div class="muted">${esc(ch.rule)} · 하루에 한 작품만 투표할 수 있어요</div>
        <div class="entries">
          ${list.map((e, i) => `
            <div class="entry">
              <div class="entry-thumb" style="background:linear-gradient(135deg, ${esc(e.colors[0])}, ${esc(e.colors[1])})">
                ${i < 3 ? `<span class="place">${medal[i]} ${i + 1}위</span>` : ''}${esc(e.emoji)}
              </div>
              <div class="entry-body">
                <div class="entry-title">${esc(e.title)}</div>
                <div class="entry-meta">
                  <span>@${esc(e.author)} · ${esc(e.tool)}</span>
                  <button class="vote ${voted === e.id ? 'mine' : ''}" data-action="challenge-vote" data-id="${esc(e.id)}" ${voted ? 'disabled' : ''}>▲ ${fmt(e.votes)}</button>
                </div>
              </div>
            </div>`).join('')}
        </div>
        <div class="block-foot">
          <button class="btn btn-sm btn-primary" data-action="join-challenge">참여하기</button>
          <span>내일의 주제: ${esc(ch.next)}</span>
        </div>`;
    },

    people(b, c) {
      const medal = ['🥇', '🥈', '🥉'];
      return `
        ${head(b, '활동량이 아니라 판단의 정확성으로')}
        <div class="people">
          ${c.people.slice(0, b.limit).map((p, i) => `
            <div class="person">
              <div class="person-name"><span class="medal">${medal[i] || '·'}</span>@${esc(p.name)}</div>
              <div class="person-rank">${esc(p.rank)}</div>
              <div class="levels">${Object.entries(p.levels).map(([k, v]) => `<span class="level">${esc(k)} Lv.${v}</span>`).join('')}</div>
              <div class="person-stats">
                <span><b>${p.accuracy}%</b>예측 정확도</span>
                <span><b>${fmt(p.firstFinds)}</b>최초 발견</span>
                <span><b>${fmt(p.promptUses)}</b>프롬프트 사용</span>
              </div>
            </div>`).join('')}
        </div>`;
    },
  };

  // ---------- 렌더링 ----------

  function renderShell() {
    const cfg = state.config;
    document.title = IS_PREVIEW ? `[미리보기] ${cfg.siteTitle}` : cfg.siteTitle;
    $('#site-title').textContent = cfg.siteTitle;
    $('#tagline').textContent = cfg.tagline;
    $('#hero-date').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    $('#preview-banner').hidden = !IS_PREVIEW;
    if (IS_EMBEDDED) document.querySelectorAll('a[href="/admin"]').forEach((a) => { a.hidden = true; });

    const visible = cfg.blocks.filter((b) => b.visible && renderers[b.type]);
    $('#nav').innerHTML = visible.map((b) => `<a href="#block-${esc(b.id)}">${esc(b.title)}</a>`).join('');
    $('#blocks').innerHTML = visible.length
      ? visible.map((b) => `<section class="block ${b.size === 'half' ? 'half' : ''} ${b.type}" id="block-${esc(b.id)}" data-type="${esc(b.type)}"></section>`).join('')
      : '<div class="loading">표시할 블록이 없습니다. 관리자 빌더에서 블록을 켜주세요.</div>';
    visible.forEach(renderBlock);
  }

  function renderBlock(block) {
    const el = document.getElementById('block-' + block.id);
    if (!el) return;
    // 막대 그래프는 이전 값에서 새 값으로 부드럽게 움직이게 한다
    const prev = {};
    el.querySelectorAll('[data-bar]').forEach((n) => { prev[n.dataset.bar] = n.style.width; });
    el.innerHTML = renderers[block.type](block, state.content);
    el.querySelectorAll('[data-bar]').forEach((n) => {
      n.style.width = prev[n.dataset.bar] || '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => { n.style.width = n.dataset.w + '%'; }));
    });
  }

  function rerender(...types) {
    state.config.blocks.filter((b) => b.visible && types.includes(b.type)).forEach(renderBlock);
  }

  // ---------- AI World Pulse 움직임 ----------

  function startPulse() {
    let tick = 0;
    const jitter = (el, delta, min) => {
      const prev = Number(el.dataset.val);
      const next = Math.max(min, prev + delta);
      el.dataset.val = next;
      el.textContent = fmt(next);
      el.classList.remove('flash-up', 'flash-down');
      if (next !== prev) {
        void el.offsetWidth;
        el.classList.add(next > prev ? 'flash-up' : 'flash-down');
        setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 900);
      }
    };
    const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

    const rotateTicker = () => {
      const el = $('#ticker-text');
      if (!el) return;
      const recent = [...state.content.posts].sort((a, z) => new Date(z.createdAt) - new Date(a.createdAt)).slice(0, 6);
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
      const d = $('[data-live="discussing"]');
      if (d) jitter(d, rand(-14, 18), 200);
      const r = $('[data-live="recent10m"]');
      if (r && tick % 2 === 0) jitter(r, rand(-3, 4), 5);
      document.querySelectorAll('[data-trend]').forEach((el) => {
        if (Math.random() < 0.45) {
          const base = Number(el.dataset.base);
          const cur = Number(el.dataset.cur || base);
          const next = Math.max(1, Math.round(cur + rand(-4, 6)));
          el.dataset.cur = next;
          el.textContent = `↑ ${fmt(next)}%`;
          el.classList.add(next >= cur ? 'flash-up' : 'flash-down');
          setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 900);
        }
      });
      if (tick % 2 === 0) rotateTicker();
    }, 2600);
  }

  // ---------- 상호작용 ----------

  const actions = {
    async 'debate-vote'(el) {
      const d = state.content.debate;
      if (mine.get('debate', d.id)) return;
      const choice = el.dataset.choice;
      const res = await api('/api/debate/vote', { method: 'POST', body: { choice } });
      Object.assign(d, res);
      mine.set('debate', d.id, choice);
      rerender('debate');
      toast(`${choice.toUpperCase()}에 투표했어요. 이유도 한 줄 남겨볼까요?`);
    },

    async 'pred-vote'(el) {
      const p = state.content.predictions.find((x) => x.id === el.dataset.id);
      if (!p || mine.get('pred', p.id)) return;
      const res = await api(`/api/predictions/${p.id}/vote`, { method: 'POST', body: { choice: el.dataset.choice } });
      Object.assign(p, res);
      mine.set('pred', p.id, el.dataset.choice);
      rerender('predictions');
      toast('예측이 기록됐어요. 판정일에 결과를 알려드릴게요.');
    },

    'feed-filter'(el) {
      state.feedFilter = el.dataset.cat;
      state.feedExtra = 0;
      rerender('feed');
    },

    'feed-more'() {
      const block = state.config.blocks.find((b) => b.type === 'feed');
      state.feedExtra += block ? block.limit : 10;
      rerender('feed');
    },

    'toggle-post'(el) {
      const id = el.dataset.id;
      const opening = state.openPost !== id;
      state.openPost = opening ? id : null;
      if (opening) {
        const p = state.content.posts.find((x) => x.id === id);
        if (p) {
          p.views += 1;
          api(`/api/posts/${id}/view`, { method: 'POST' }).catch(() => {});
        }
      }
      rerender('feed');
    },

    'jump-post'(el, e) {
      e.preventDefault();
      const id = el.dataset.id;
      state.feedFilter = '전체';
      const feed = state.config.blocks.find((b) => b.type === 'feed' && b.visible);
      if (!feed) return;
      const p = state.content.posts.find((x) => x.id === id);
      const idx = [...state.content.posts].sort((a, z) => new Date(z.createdAt) - new Date(a.createdAt)).indexOf(p);
      state.feedExtra = Math.max(0, idx + 2 - feed.limit);
      state.openPost = id;
      rerender('feed');
      document.getElementById('post-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    async 'like-post'(el) {
      const id = el.dataset.id;
      if (mine.get('like', id)) return;
      const res = await api(`/api/posts/${id}/like`, { method: 'POST' });
      Object.assign(state.content.posts.find((x) => x.id === id), res);
      mine.set('like', id, true);
      rerender('feed', 'whileAway');
    },

    async 'copy-prompt'(el) {
      const p = state.content.prompts.find((x) => x.id === el.dataset.id);
      if (!p) return;
      await copyText(p.text);
      el.textContent = '복사됨 ✓';
      el.classList.add('done');
      const res = await api(`/api/prompts/${p.id}/copy`, { method: 'POST' });
      Object.assign(p, res);
      toast(`복사했어요 · 이 프롬프트는 지금까지 ${fmt(p.copies)}번 사용됐어요`);
      setTimeout(() => rerender('prompts'), 1200);
    },

    async 'challenge-vote'(el) {
      const ch = state.content.challenge;
      if (mine.get('challenge', ch.id)) return;
      const e = ch.entries.find((x) => x.id === el.dataset.id);
      const res = await api(`/api/challenge/${e.id}/vote`, { method: 'POST' });
      Object.assign(e, res);
      mine.set('challenge', ch.id, e.id);
      rerender('challenge');
      toast('투표 완료! 내일 우승작이 발표돼요.');
    },

    'join-challenge'() {
      openWrite({ category: 'AI아트', title: `[챌린지] ${state.content.challenge.theme} — `, aiLabel: 'AI 생성' });
    },

    'open-write'() { openWrite(); },
    'close-write'() { $('#write-dialog').close(); },
  };

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    try {
      await fn(el, e);
    } catch (err) {
      toast(err.message);
    }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (form.dataset.form !== 'debate-comment') return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      const d = state.content.debate;
      const comment = await api('/api/debate/comment', { method: 'POST', body: { ...data, choice: mine.get('debate', d.id) || null } });
      if (data.author) store.set('fb_nick', data.author);
      d.comments.push(comment);
      rerender('debate', 'whileAway');
      document.querySelector(`[data-cid="${comment.id}"]`)?.classList.add('new-flash');
    } catch (err) {
      toast(err.message);
    }
  });

  // ---------- 글쓰기 ----------

  function openWrite(prefill = {}) {
    const form = $('#write-form');
    form.reset();
    $('#write-error').hidden = true;
    $('#write-category').innerHTML = WRITE_CATEGORIES.map((c) => `<option ${c === (prefill.category || '토론') ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#write-author').value = store.get('fb_nick', '');
    if (prefill.title) $('#write-title').value = prefill.title;
    if (prefill.aiLabel) form.querySelector(`input[name="aiLabel"][value="${prefill.aiLabel}"]`).checked = true;
    $('#write-dialog').showModal();
    $('#write-title').focus();
  }

  $('#write-anon').addEventListener('change', (e) => { $('#write-author').disabled = e.target.checked; });

  $('#write-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const body = Object.fromEntries(fd);
    body.anonymous = $('#write-anon').checked;
    const err = $('#write-error');
    try {
      const { post, discovery } = await api('/api/posts', { method: 'POST', body });
      if (!body.anonymous && body.author) store.set('fb_nick', body.author);
      state.content.posts.push(post);
      state.feedFilter = '전체';
      state.feedExtra = 0;
      state.openPost = post.id;
      $('#write-dialog').close();
      rerender('feed', 'whileAway');
      document.getElementById('post-' + post.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (discovery?.first) toast('🏅 최초 발견자로 기록됐어요!');
      else if (discovery) toast(`이 링크는 @${discovery.by}님이 ${timeAgo(discovery.at)}에 먼저 발견했어요`);
      else toast('글이 올라갔어요');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  // ---------- 시작 ----------

  async function init() {
    try {
      const [config, content] = await Promise.all([
        api('/api/config?mode=' + (IS_PREVIEW ? 'draft' : 'published')),
        api('/api/content'),
      ]);
      state.config = config;
      state.content = content;
      trackVisit();
      renderShell();
      startPulse();
    } catch (err) {
      $('#blocks').innerHTML = err.status === 401
        ? '<div class="loading">Draft 미리보기는 관리자만 볼 수 있어요. <a href="/admin" style="text-decoration:underline">관리자 모드로 로그인</a></div>'
        : `<div class="loading">사이트를 불러오지 못했어요. 잠시 후 새로고침해 주세요.<br><small>${esc(err.message)}</small></div>`;
    }
  }

  init();
})();
