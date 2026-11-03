// 공통: 화면 모드 · 상태 · 주소 · 유틸 · API · 브라우저 저장소

// ---------- 화면 모드 ----------

// /preview 는 Draft 구성을, 그 밖의 주소는 Published 구성을 그린다. 콘텐츠(Community Data)는 둘 다 같다.
export const IS_PREVIEW = location.pathname === '/preview' || location.pathname.startsWith('/preview/');
export const BASE = IS_PREVIEW ? '/preview' : '';
// 관리자 미리보기 칸이나 휴대폰 틀(iframe) 안에서 열린 경우
export const IS_EMBEDDED = window.self !== window.top;
export const IS_PHONE_FRAME = new URLSearchParams(location.search).get('frame') === 'phone';

// 화면 보기 전환. 휴대폰에서는 PC 화면('desktop'), PC 에서는 모바일 화면('mobile')을 고를 수 있다.
// 실제 적용(뷰포트 폭 바꾸기)은 index.html <head> 의 스크립트가 그리기 전에 한다. 기준을 그쪽과 같게 유지한다.
const SCREEN_MIN = Math.min(screen.width, screen.height);
export const IS_PHONE = SCREEN_MIN > 0 && SCREEN_MIN < 768 && matchMedia('(pointer: coarse)').matches;
export const viewMode = {
  get() {
    try { return localStorage.getItem('fb_view'); } catch { return null; }
  },
  set(v) {
    try {
      if (v) localStorage.setItem('fb_view', v);
      else localStorage.removeItem('fb_view');
    } catch { /* 저장소를 못 쓰면 전환하지 않는다 */ }
  },
};
export const FORCED_DESKTOP = !IS_EMBEDDED && IS_PHONE && viewMode.get() === 'desktop';
export const PHONE_STAGE = !IS_EMBEDDED && !IS_PHONE && viewMode.get() === 'mobile';

// ---------- 상태 ----------

export const state = {
  config: null,
  content: null,
  awayFrom: null,
  openPost: null,
  // 메인 커뮤니티 블록
  feedFilter: '전체',
  feedExtra: 0,
  // 각 페이지의 필터 · 정렬 (페이지를 떠났다 와도 유지)
  page: {},
};

// ---------- 블록 종류 ↔ 페이지 주소 ----------

export const PAGE_PATHS = {
  pulse: 'pulse',
  futureChange: 'future',
  whileAway: 'away',
  debate: 'debate',
  predictions: 'predictions',
  feed: 'community',
  prompts: 'prompts',
  challenge: 'challenge',
  people: 'people',
};
export const TYPE_BY_PATH = Object.fromEntries(Object.entries(PAGE_PATHS).map(([t, p]) => [p, t]));

export const DEFAULT_TITLES = {
  pulse: 'AI WORLD PULSE', futureChange: '오늘 인류의 미래 변화', whileAway: '내가 없는 동안', debate: '오늘의 질문',
  predictions: '미래 예측', feed: '커뮤니티', prompts: '프롬프트 라이브러리', challenge: '오늘의 AI 창작 챌린지', people: '이번 주 선구자',
};

export const ICONS = {
  pulse: '<span class="live-dot"></span>', futureChange: '🌏', whileAway: '⏱', debate: '🗳',
  predictions: '🔮', feed: '💬', prompts: '✨', challenge: '🎨', people: '🏅',
};

export const homeHref = () => BASE || '/';
export const pageHref = (type, query = '') => `${BASE}/${PAGE_PATHS[type]}${query}`;

// 지금 주소가 어느 페이지인지. 메인이면 null
export function currentPageType() {
  const path = location.pathname.slice(BASE.length).replace(/^\/+|\/+$/g, '');
  return TYPE_BY_PATH[path] || null;
}

// 페이지 제목은 관리자가 정한 블록 제목을 따른다
export function blockTitle(type) {
  const b = state.config?.blocks.find((x) => x.type === type);
  return b ? b.title : DEFAULT_TITLES[type];
}

// ---------- 유틸 ----------

export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
export const pct = (a, b) => (a + b ? Math.round((a / (a + b)) * 100) : 50);
export const ms = (iso) => new Date(iso).getTime();
export const byNewest = (a, z) => ms(z.createdAt) - ms(a.createdAt);

export function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - ms(iso));
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  const d = Math.floor(h / 24);
  return d < 30 ? d + '일 전' : new Date(iso).toLocaleDateString('ko-KR');
}

export function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

// 마감일까지 남은 날 (D-12 / D-day / 마감)
export function dday(dateStr) {
  const days = Math.ceil((new Date(dateStr + 'T23:59:59') - Date.now()) / 86400000);
  if (days < 0) return '마감';
  return days === 0 ? 'D-day' : 'D-' + fmt(days);
}

// 문자열로 정해지는 의사 난수 (같은 키워드는 늘 같은 추이선을 그린다)
export function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---------- 브라우저 저장소 ----------

export const store = {
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

// 브라우저별로 이미 누른 투표 · 추천을 기억한다 (계정 시스템 전 단계의 임시 방식)
export const mine = {
  get: (kind, id) => store.get('fb_mine', {})[kind + ':' + id],
  set(kind, id, value) {
    const all = store.get('fb_mine', {});
    all[kind + ':' + id] = value;
    store.set('fb_mine', all);
  },
};

// ---------- 서버 ----------

export async function api(path, options = {}) {
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
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export async function copyText(text) {
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

// ---------- 분류 ----------

export const CAT_COLORS = {
  '공지': '#fbbf24', '뉴스': '#60a5fa', '발견': '#f59e0b', '밈': '#f472b6', '바이브코딩': '#a78bfa',
  '프롬프트': '#22d3ee', 'AI아트': '#fb7185', '로보틱스': '#34d399', 'AGI·특이점': '#c084fc',
  '미래기술': '#38bdf8', '우주·과학': '#818cf8', 'SF': '#2dd4bf', '토론': '#fca5a5', '질문': '#a3e635',
};
export const WRITE_CATEGORIES = Object.keys(CAT_COLORS).filter((c) => c !== '공지');
