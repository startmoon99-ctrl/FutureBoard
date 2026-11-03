// 공통: 주소 · 블록 목록 · 상태 · 유틸 · 브라우저 저장소
// 서버 호출은 api.js, 화면 보기 전환(PC/모바일)은 view-mode.js 에 있다.

// ---------- 주소 ----------

// /preview 는 Draft 구성을, 그 밖의 주소는 Published 구성을 그린다. 콘텐츠(Community Data)는 둘 다 같다.
export const IS_PREVIEW = location.pathname === '/preview' || location.pathname.startsWith('/preview/');
export const BASE = IS_PREVIEW ? '/preview' : '';
// 관리자 미리보기 칸이나 휴대폰 틀(iframe) 안에서 열린 경우
export const IS_EMBEDDED = window.self !== window.top;
export const IS_PHONE_FRAME = new URLSearchParams(location.search).get('frame') === 'phone';

// ---------- 블록 목록 ----------

// 메인 블록 종류마다의 페이지 주소 · 기본 제목 · 아이콘 · 관리자 모드 표시.
// 블록을 새로 만들 때: 여기 한 줄 + public/js/features/ 에 파일 하나 + features/index.js 등록
//   + 페이지 주소를 server.js 의 SITE_PAGES · vercel.json rewrites 에 추가 + seed/site-config.json 에 블록 추가
export const BLOCKS = {
  pulse: { path: 'pulse', title: 'AI WORLD PULSE', icon: '<span class="live-dot"></span>', adminLabel: 'AI World Pulse', limitLabel: '키워드 수' },
  futureChange: { path: 'future', title: '오늘 인류의 미래 변화', icon: '🌏', adminLabel: 'Daily AI · 오늘 인류의 미래 변화', limitLabel: '항목 수' },
  whileAway: { path: 'away', title: '내가 없는 동안', icon: '⏱', adminLabel: '내가 없는 동안', limitLabel: '인기글 수' },
  debate: { path: 'debate', title: '오늘의 질문', icon: '🗳', adminLabel: 'Daily Debate · 오늘의 질문', limitLabel: '댓글 수' },
  predictions: { path: 'predictions', title: '미래 예측', icon: '🔮', adminLabel: 'Prediction · 예측', limitLabel: '예측 수' },
  feed: { path: 'community', title: '커뮤니티', icon: '💬', adminLabel: 'Community Feed · 커뮤니티', limitLabel: '글 수' },
  prompts: { path: 'prompts', title: '프롬프트 라이브러리', icon: '✨', adminLabel: 'Prompt Library · 프롬프트', limitLabel: '프롬프트 수' },
  challenge: { path: 'challenge', title: '오늘의 AI 창작 챌린지', icon: '🎨', adminLabel: 'Daily Challenge · 창작 챌린지', limitLabel: '출품작 수' },
  people: { path: 'people', title: '이번 주 선구자', icon: '🏅', adminLabel: '선구자 랭킹', limitLabel: '인원' },
};
const TYPE_BY_PATH = Object.fromEntries(Object.entries(BLOCKS).map(([t, b]) => [b.path, t]));

export const homeHref = () => BASE || '/';
export const pageHref = (type, query = '') => `${BASE}/${BLOCKS[type].path}${query}`;

// 지금 주소가 어느 페이지인지. 메인이면 null
export function currentPageType() {
  const path = location.pathname.slice(BASE.length).replace(/^\/+|\/+$/g, '');
  return TYPE_BY_PATH[path] || null;
}

// ---------- 상태 ----------

export const state = {
  config: null, // 사이트 구성 (draft 또는 published)
  content: null, // 커뮤니티 데이터 (GET /api/content)
  awayFrom: null, // '내가 없는 동안'의 기준 시각
  openPost: null, // 펼쳐 둔 글
  feedFilter: '전체', // 메인 커뮤니티 블록의 분류
  feedExtra: 0, // 메인 커뮤니티 블록에서 더보기로 늘린 개수
  page: {}, // 각 페이지의 필터 · 정렬 (페이지를 떠났다 와도 유지)
};

// 페이지의 필터 · 정렬 상태. 처음이면 defaults 로 만든다
export const pageState = (key, defaults) => (state.page[key] = state.page[key] || { ...defaults });

// 페이지 제목은 관리자가 정한 블록 제목을 따른다
export function blockTitle(type) {
  const b = state.config?.blocks.find((x) => x.type === type);
  return b ? b.title : BLOCKS[type].title;
}

// 기능 모듈이 쓰는 화면 동작. app.js 가 시작할 때 채운다 (기능 → app 으로 거꾸로 import 하지 않기 위해)
export const ui = {
  refresh: (...types) => {}, // 동작 뒤 다시 그리기: 메인이면 해당 블록, 페이지면 그 페이지
  navigate: (url) => {}, // 사이트 안 주소로 이동
};

// ---------- 유틸 ----------

export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
export const pct = (a, b) => (a + b ? Math.round((a / (a + b)) * 100) : 50);
export const ms = (iso) => new Date(iso).getTime();
export const byNewest = (a, z) => ms(z.createdAt) - ms(a.createdAt);
export const DAY = 86400000;

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
  const days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / DAY);
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export const shortDate = (iso) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

// 마감일까지 남은 날 (D-12 / D-day / 마감)
export function dday(dateStr) {
  const days = Math.ceil((new Date(dateStr + 'T23:59:59') - Date.now()) / DAY);
  if (days < 0) return '마감';
  return days === 0 ? 'D-day' : 'D-' + fmt(days);
}

// 목록을 key(item) 별로 묶어 { key: [items] }
export const groupBy = (list, key) => list.reduce((acc, x) => ((acc[key(x)] = acc[key(x)] || []).push(x), acc), {});

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

// 브라우저별로 이미 누른 투표 · 추천을 기억한다 (회원 계정 전 단계의 임시 방식 — 서버는 중복을 막지 못한다)
export const mine = {
  get: (kind, id) => store.get('fb_mine', {})[kind + ':' + id],
  set(kind, id, value) {
    const all = store.get('fb_mine', {});
    all[kind + ':' + id] = value;
    store.set('fb_mine', all);
  },
};

// ---------- 분류 ----------

// lib/config.js 의 CATEGORIES 와 같은 목록이어야 한다 (서버가 받을 수 있는 분류)
export const CAT_COLORS = {
  '공지': '#fbbf24', '뉴스': '#60a5fa', '발견': '#f59e0b', '밈': '#f472b6', '바이브코딩': '#a78bfa',
  '프롬프트': '#22d3ee', 'AI아트': '#fb7185', '로보틱스': '#34d399', 'AGI·특이점': '#c084fc',
  '미래기술': '#38bdf8', '우주·과학': '#818cf8', 'SF': '#2dd4bf', '토론': '#fca5a5', '질문': '#a3e635',
};
export const WRITE_CATEGORIES = Object.keys(CAT_COLORS).filter((c) => c !== '공지');
