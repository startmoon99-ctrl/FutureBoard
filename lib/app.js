'use strict';
// /api/* 요청의 입구. 로컬 서버(server.js)와 Vercel 함수(api/index.js)가 같은 코드를 쓴다.
//
// 구조
//   lib/routes/*   HTTP: 입력 검증 · 권한 · 횟수 제한 → repos 호출 → 응답
//   lib/repos/*    데이터 접근: 기능별 저장 · 조회 (저장소 종류는 모른다)
//   lib/db/*       저장소: 로컬 파일 · Upstash Redis · 메모리, 그리고 데이터 이전
//   lib/auth.js    인증 · 권한 (requireAdmin)
//   lib/config.js  설정값 · 상수

const db = require('./db');
const { createRouter, sendJson, fail } = require('./http');

const router = createRouter();
// 기능을 추가하면 lib/routes 에 파일을 만들고 여기에 한 줄 더한다
require('./routes/auth')(router.route);
require('./routes/site-config')(router.route);
require('./routes/community')(router.route);

const NO_STORAGE = '아직 저장소가 연결되지 않아 저장할 수 없어요 (Vercel → Storage에서 Upstash Redis 연결)';

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  try {
    const found = router.match(req.method, pathname);
    if (!found) throw fail(404, '없는 API입니다');
    await db.ready();
    if (req.method !== 'GET' && !db.writable && !found.route.options.allowReadOnly) throw fail(503, NO_STORAGE);
    await found.route.handler(req, res, found.params, url);
  } catch (err) {
    const status = err.status || (err instanceof SyntaxError ? 400 : 500);
    if (status >= 500) console.error(err);
    sendJson(res, status, { error: status === 500 ? '서버 오류가 발생했습니다' : err.message });
  }
}

module.exports = { handleApi };
