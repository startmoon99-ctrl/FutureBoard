'use strict';
// 서버 설정값과 상수. 여러 기능이 함께 쓰는 값은 이 파일에만 둔다.

// ---------- 환경 ----------

// Vercel 에서 Upstash 를 연결할 때 접두어(예: STORAGE_)를 붙였으면 변수 이름이 STORAGE_KV_REST_API_URL 처럼 바뀐다
function envBySuffix(...suffixes) {
  for (const s of suffixes) if (process.env[s]) return process.env[s];
  for (const s of suffixes) {
    const key = Object.keys(process.env).find((k) => k.endsWith('_' + s) && process.env[k]);
    if (key) return process.env[key];
  }
  return '';
}

const KV_URL = envBySuffix('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const KV_TOKEN = envBySuffix('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
const ON_VERCEL = !!process.env.VERCEL;

// 저장소 종류
//  · redis : Upstash Redis (배포본, 또는 .env.local 에 연결값을 넣은 로컬)
//  · file  : 로컬 실행. data 폴더
//  · none  : Vercel 에 저장소가 아직 연결되지 않음. 초기 데이터를 보여주기만 하고 쓰기는 거절한다
const STORAGE = KV_URL && KV_TOKEN ? 'redis' : ON_VERCEL ? 'none' : 'file';

// 저장소 키 접두어. 배포본(production)과 로컬은 'futureboard:'.
// Vercel 미리보기(preview) 배포는 같은 Upstash 를 쓰므로 키를 따로 써서 실제 데이터를 건드리지 않는다.
const VERCEL_ENV = process.env.VERCEL_ENV;
const KEY_PREFIX = VERCEL_ENV && VERCEL_ENV !== 'production' ? `futureboard-${VERCEL_ENV}:` : 'futureboard:';

module.exports = {
  KV_URL,
  KV_TOKEN,
  ON_VERCEL,
  STORAGE,
  KEY_PREFIX,
  DATA_DIR: process.env.DATA_DIR || require('path').join(__dirname, '..', 'data'),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',

  // ---------- 커뮤니티 ----------

  // public/js/core.js 의 CAT_COLORS 와 같은 목록이어야 한다 (화면 색은 그쪽에서 정한다)
  CATEGORIES: ['공지', '뉴스', '발견', '밈', '바이브코딩', '프롬프트', 'AI아트', '로보틱스', 'AGI·특이점', '미래기술', '우주·과학', 'SF', '토론', '질문'],
  ADMIN_ONLY_CATEGORIES: ['공지'],
  DEFAULT_CATEGORY: '토론',
  AI_LABELS: ['직접 작성', 'AI 보조 작성', 'AI 생성'],

  LIMITS: {
    requestBytes: 100 * 1024,
    titleMin: 2,
    title: 100,
    body: 3000,
    author: 20,
    link: 300,
    comment: 300,
    publishNote: 80,
    siteTitle: 30,
    tagline: 80,
    blockTitle: 40,
    blockItems: 20,
    keptVersions: 50,
  },

  // IP 하나가 정해진 시간(windowSec) 안에 할 수 있는 횟수. 배포본에서는 저장소에 세므로 서버 인스턴스가 여럿이어도 같이 센다.
  RATE_LIMITS: {
    post: { max: 1, windowSec: 15, message: '글은 15초에 한 번만 쓸 수 있어요' },
    comment: { max: 1, windowSec: 5, message: '댓글은 5초에 한 번만 쓸 수 있어요' },
    react: { max: 60, windowSec: 60, message: '너무 빠르게 누르고 있어요. 잠시 후 다시 시도해 주세요' },
    view: { max: 300, windowSec: 60, message: '잠시 후 다시 시도해 주세요' },
    login: { max: 10, windowSec: 15 * 60, message: '로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요' },
  },

  ADMIN_SESSION_DAYS: 30,
};
