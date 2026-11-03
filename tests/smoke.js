'use strict';
// 서버를 여러 저장 상태로 실제로 띄워서 커뮤니티 핵심 흐름을 확인한다. 외부 패키지 없음.
//   node tests/smoke.js          (npm test)
//   node tests/smoke.js <폴더>   그 폴더의 data/*.json(예전 형식)을 옮기는 것까지 확인
//
// 시나리오
//   1. file  : 빈 data 폴더에서 처음 실행
//   2. file  : 예전 형식 data/community.json 을 옮기기 (원본 파일은 그대로인지)
//   3. redis : 가짜 Upstash 에 예전 형식 문서를 두고 옮기기 + 동시 투표
//   4. none  : Vercel 인데 저장소가 없음 (읽기만)

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startMockUpstash } = require('./mock-upstash');

const ROOT = path.join(__dirname, '..');
let failures = 0;
const ok = (cond, label) => {
  if (!cond) failures += 1;
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`);
};
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function freePort() {
  return new Promise((resolve) => {
    const s = require('net').createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function startServer(env) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PORT: String(port), NO_ENV_FILE: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 50 && !log.includes('실행 중'); i += 1) await new Promise((r) => setTimeout(r, 100));
  const base = `http://127.0.0.1:${port}`;
  const call = async (p, { method = 'GET', body, cookie, ip } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (ip) headers['X-Real-IP'] = ip; // 횟수 제한을 시나리오마다 나누기 위해
    const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, cookie: res.headers.get('set-cookie'), data: await res.json().catch(() => null), text: res.headers.get('content-type') };
  };
  return { call, base, stop: () => child.kill(), log: () => log };
}

// 예전 데이터와 옮긴 뒤 화면 데이터가 같은지
function compareWithLegacy(legacy, c) {
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const posts = byId(c.posts);
  ok(c.posts.length === legacy.posts.length, `글 수 그대로 (${legacy.posts.length})`);
  ok(legacy.posts.every((p) => posts[p.id] && posts[p.id].likes === p.likes && posts[p.id].views === p.views && posts[p.id].title === p.title),
    '모든 글의 제목 · 추천 · 조회 수 그대로');
  ok(c.debate.yes === legacy.debate.yes && c.debate.no === legacy.debate.no, `오늘의 질문 투표 그대로 (${legacy.debate.yes}/${legacy.debate.no})`);
  ok(c.debate.comments.length === legacy.debate.comments.length, `오늘의 질문 의견 수 그대로 (${legacy.debate.comments.length})`);
  const preds = byId(c.predictions);
  ok(legacy.predictions.every((p) => preds[p.id] && preds[p.id].yes === p.yes && preds[p.id].no === p.no), '예측 투표 그대로');
  ok(c.predictions.map((p) => p.id).join() === legacy.predictions.map((p) => p.id).join(), '예측 순서 그대로');
  const prompts = byId(c.prompts);
  ok(legacy.prompts.every((p) => prompts[p.id] && prompts[p.id].copies === p.copies), '프롬프트 복사 수 그대로');
  const entries = byId(c.challenge.entries);
  ok(legacy.challenge.entries.every((e) => entries[e.id] && entries[e.id].votes === e.votes), '챌린지 투표 그대로');
  ok(['future', 'pulse', 'people'].every((k) => JSON.stringify(c[k]) === JSON.stringify(legacy[k])), '운영자 정리 내용(미래 변화 · Pulse · 선구자) 그대로');
}

// 커뮤니티 핵심 흐름: 조회 → 글쓰기 → 다시 조회 → 의견 → 추천 → 투표 → 관리자
async function coreFlow(s, label, { password }) {
  const ip = '10.0.' + Math.floor(Math.random() * 200) + '.' + Math.floor(Math.random() * 200);
  const before = (await s.call('/api/content')).data;
  ok(Array.isArray(before.posts) && before.debate && before.challenge, `[${label}] 콘텐츠 읽기`);

  const created = await s.call('/api/posts', { method: 'POST', ip, body: { title: '스모크 테스트 글', body: '본문', category: '질문', author: '테스터', link: 'https://example.com/smoke-' + label } });
  ok(created.status === 201 && created.data.post.id && created.data.discovery?.first === true, `[${label}] 글쓰기 + 최초 발견자`);
  ok((await s.call('/api/posts', { method: 'POST', ip, body: { title: '바로 또 쓰기' } })).status === 429, `[${label}] 연속 글쓰기 제한`);
  const dup = await s.call('/api/posts', { method: 'POST', ip: ip + '9', body: { title: '같은 링크', author: '두번째', link: 'https://example.com/smoke-' + label + '/' } });
  ok(dup.data?.discovery?.first === false && dup.data.discovery.by === '테스터', `[${label}] 같은 링크는 먼저 올린 사람이 최초 발견자`);

  const id = created.data.post.id;
  const like = await s.call(`/api/posts/${id}/like`, { method: 'POST', ip });
  const view = await s.call(`/api/posts/${id}/view`, { method: 'POST', ip });
  ok(like.data?.likes === 1 && view.data?.views === 1, `[${label}] 추천 · 조회`);
  ok((await s.call('/api/posts/nope/like', { method: 'POST', ip })).status === 404, `[${label}] 없는 글 추천 → 404`);

  const comment = await s.call('/api/debate/comment', { method: 'POST', ip, body: { author: '테스터', text: '의견', choice: 'yes' } });
  ok(comment.status === 201 && comment.data.text === '의견', `[${label}] 오늘의 질문 의견`);
  const vote = await s.call('/api/debate/vote', { method: 'POST', ip, body: { choice: 'no' } });
  ok(vote.data?.no === before.debate.no + 1, `[${label}] 오늘의 질문 투표`);
  ok((await s.call('/api/debate/vote', { method: 'POST', ip, body: { choice: 'maybe' } })).status === 400, `[${label}] 잘못된 선택지 → 400`);
  const pred = before.predictions.find((p) => p.status === 'open');
  ok((await s.call(`/api/predictions/${pred.id}/vote`, { method: 'POST', ip, body: { choice: 'yes' } })).data?.yes === pred.yes + 1, `[${label}] 예측 투표`);
  const resolved = before.predictions.find((p) => p.status === 'resolved');
  if (resolved) ok((await s.call(`/api/predictions/${resolved.id}/vote`, { method: 'POST', ip, body: { choice: 'yes' } })).status === 400, `[${label}] 판정 끝난 예측 → 400`);
  const prompt = before.prompts[0];
  ok((await s.call(`/api/prompts/${prompt.id}/copy`, { method: 'POST', ip })).data?.copies === prompt.copies + 1, `[${label}] 프롬프트 복사`);
  const entry = before.challenge.entries[0];
  ok((await s.call(`/api/challenge/${entry.id}/vote`, { method: 'POST', ip })).data?.votes === entry.votes + 1, `[${label}] 챌린지 투표`);

  const after = (await s.call('/api/content')).data;
  const mine = after.posts.find((p) => p.id === id);
  ok(after.posts.length === before.posts.length + 2 && mine?.likes === 1 && mine.firstDiscovery, `[${label}] 다시 읽어도 글 · 숫자 유지`);
  ok(after.debate.comments.length === before.debate.comments.length + 1, `[${label}] 다시 읽어도 의견 유지`);

  // 관리자: 로그인 → Draft → 게시 → 롤백 (커뮤니티 데이터는 그대로)
  ok((await s.call('/api/admin/state')).status === (password ? 401 : 200), `[${label}] 관리자 권한 확인`);
  let cookie;
  if (password) {
    ok((await s.call('/api/admin/login', { method: 'POST', ip, body: { password: 'wrong' } })).status === 401, `[${label}] 틀린 비밀번호 거절`);
    const login = await s.call('/api/admin/login', { method: 'POST', ip, body: { password } });
    cookie = login.cookie?.split(';')[0];
    ok(login.status === 200 && /HttpOnly/.test(login.cookie), `[${label}] 로그인`);
  }
  const st = (await s.call('/api/admin/state', { cookie })).data;
  const cfg = JSON.parse(JSON.stringify(st.draft));
  cfg.blocks.reverse();
  ok((await s.call('/api/admin/draft', { method: 'PUT', cookie, body: { config: cfg } })).status === 200, `[${label}] Draft 저장`);
  ok((await s.call('/api/config')).data.blocks[0].id === st.published.blocks[0].id, `[${label}] Draft 저장 뒤에도 실제 사이트 그대로`);
  const pub = await s.call('/api/admin/publish', { method: 'POST', cookie, body: { note: 'smoke' } });
  ok(pub.data?.publishedVersion === st.publishedVersion + 1 && (await s.call('/api/config')).data.blocks[0].id === cfg.blocks[0].id, `[${label}] 게시`);
  await s.call('/api/admin/rollback', { method: 'POST', cookie, body: { version: st.publishedVersion } });
  const rolled = (await s.call('/api/content')).data;
  ok((await s.call('/api/config')).data.blocks[0].id === st.published.blocks[0].id && rolled.posts.length === after.posts.length, `[${label}] 롤백 (글은 그대로)`);

  // 관리자: 글 · 댓글 숨기기 → 되살리기 (지우지 않는다)
  if (password) ok((await s.call(`/api/admin/posts/${id}/hide`, { method: 'POST', body: { hidden: true } })).status === 401, `[${label}] 로그인 없이 숨기기 → 401`);
  ok((await s.call(`/api/admin/posts/${id}/hide`, { method: 'POST', cookie, body: { hidden: true } })).status === 200, `[${label}] 글 숨기기`);
  const cid = comment.data.id;
  await s.call(`/api/admin/comments/${cid}/hide`, { method: 'POST', cookie, body: { hidden: true } });
  const hiddenView = (await s.call('/api/content')).data;
  ok(!hiddenView.posts.some((p) => p.id === id) && !hiddenView.debate.comments.some((x) => x.id === cid), `[${label}] 숨긴 글 · 댓글은 화면 데이터에서 빠짐`);
  ok((await s.call(`/api/posts/${id}/like`, { method: 'POST', ip })).status === 404, `[${label}] 숨긴 글 추천 → 404`);
  const list = (await s.call('/api/admin/hidden', { cookie })).data;
  ok(list.posts.some((p) => p.id === id && p.likes === 1) && list.comments.some((x) => x.id === cid), `[${label}] 숨긴 목록 (숫자 유지)`);
  const retake = await s.call('/api/posts', { method: 'POST', ip: ip + '8', body: { title: '같은 링크 다시', author: '세번째', link: 'https://example.com/smoke-' + label } });
  ok(retake.data?.discovery?.first === true, `[${label}] 먼저 올린 글이 숨겨지면 다음 글이 최초 발견자`);
  await s.call(`/api/admin/posts/${id}/hide`, { method: 'POST', cookie, body: { hidden: false } });
  await s.call(`/api/admin/comments/${cid}/hide`, { method: 'POST', cookie, body: { hidden: false } });
  await s.call(`/api/admin/posts/${retake.data.post.id}/hide`, { method: 'POST', cookie, body: { hidden: true } });
  const restored = (await s.call('/api/content')).data;
  const back = restored.posts.find((p) => p.id === id);
  ok(back?.likes === 1 && back.firstDiscovery === false && restored.debate.comments.some((x) => x.id === cid), `[${label}] 되살리기 (숫자 유지, 최초 발견은 넘어간 쪽)`);
  ok(restored.posts.length === after.posts.length, `[${label}] 되살린 뒤 글 수`);

  // 운영자 닉네임은 관리자만
  const fake = { method: 'POST', ip: ip + '7', body: { author: '퓨쳐보드 지기', text: '사칭' } };
  ok((await s.call('/api/debate/comment', fake)).status === (password ? 400 : 201), `[${label}] 운영자 닉네임 사칭 ${password ? '거절' : '(비밀번호 없는 로컬은 관리자라 허용)'}`);
  if (password) {
    ok((await s.call('/api/posts', { method: 'POST', ip: ip + '6', body: { title: '사칭 글', author: 'FutureBoard 관리자' } })).status === 400, `[${label}] 운영자 닉네임 글 거절`);
    ok((await s.call('/api/debate/comment', { ...fake, cookie })).status === 201, `[${label}] 관리자는 운영자 닉네임 사용`);
  }
  return after;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'futureboard-smoke-'));
  const legacyDir = process.argv[2];

  // 1. 처음 실행
  console.log('\n[1] file — 빈 data 폴더');
  {
    const dir = path.join(tmp, 'fresh');
    const s = await startServer({ DATA_DIR: dir, ADMIN_PASSWORD: 'pw-smoke' });
    await coreFlow(s, 'file', { password: 'pw-smoke' });
    for (const p of ['/', '/community', '/preview/pulse', '/admin', '/js/app.js', '/style.css']) {
      ok((await fetch(s.base + p)).status === 200, `페이지 ${p}`);
    }
    ok((await fetch(s.base + '/nope')).status === 404 && (await fetch(s.base + '/..%2fserver.js')).status !== 200, '없는 주소 · 폴더 밖 접근 차단');
    const headers = (await fetch(s.base + '/')).headers;
    ok(headers.get('x-content-type-options') === 'nosniff' && headers.get('x-frame-options') === 'SAMEORIGIN', '보안 헤더');
    s.stop();
  }

  // 2. 예전 형식 파일 옮기기
  console.log('\n[2] file — 예전 형식 data/*.json 옮기기');
  {
    const dir = path.join(tmp, 'legacy');
    fs.mkdirSync(dir, { recursive: true });
    const src = legacyDir && fs.existsSync(path.join(legacyDir, 'community.json')) ? legacyDir : null;
    const legacyCommunity = src ? JSON.parse(fs.readFileSync(path.join(src, 'community.json'), 'utf8')) : require('../lib/seed').community();
    const legacyConfig = src ? JSON.parse(fs.readFileSync(path.join(src, 'site-config.json'), 'utf8')) : require('../lib/seed')['site-config']();
    console.log(`  (예전 데이터: ${src ? src : '초기 데이터로 만든 예시'})`);
    // 옮긴 구성이 초기값이 아니라 원래 것인지 알아보기 위해 게시본 순서를 바꿔 둔다 (버전 기록도 같이)
    legacyConfig.published.blocks.reverse();
    const liveVersion = legacyConfig.versions.find((v) => v.version === legacyConfig.publishedVersion);
    if (liveVersion) liveVersion.config = JSON.parse(JSON.stringify(legacyConfig.published));
    fs.writeFileSync(path.join(dir, 'community.json'), JSON.stringify(legacyCommunity));
    fs.writeFileSync(path.join(dir, 'site-config.json'), JSON.stringify(legacyConfig));
    const hashBefore = sha(path.join(dir, 'community.json'));
    const s = await startServer({ DATA_DIR: dir });
    const c = (await s.call('/api/content')).data;
    require('../lib/seed').upgrade('community', legacyCommunity);
    compareWithLegacy(legacyCommunity, c);
    ok((await s.call('/api/config')).data.blocks[0].id === legacyConfig.published.blocks[0].id, '사이트 구성도 원래 것으로 옮김');
    ok(sha(path.join(dir, 'community.json')) === hashBefore, '예전 파일은 바뀌지 않음 (백업)');
    await coreFlow(s, 'file-legacy', { password: '' });
    s.stop();
    // 다시 켜도 다시 옮기지 않고(숫자 두 번 더해지지 않음) 그대로
    const s2 = await startServer({ DATA_DIR: dir });
    const c2 = (await s2.call('/api/content')).data;
    ok(c2.posts.length === legacyCommunity.posts.length + 2, '다시 켜도 데이터 유지 · 중복 이전 없음');
    s2.stop();
  }

  // 3. Upstash (가짜)
  console.log('\n[3] redis — 가짜 Upstash, 예전 형식 문서 옮기기 + 동시 요청');
  {
    const seed = require('../lib/seed');
    const legacy = seed.community();
    legacy.posts[0].likes = 777;
    const initial = {
      'futureboard:community': JSON.stringify(legacy),
      'futureboard:community:ver': '42',
      'futureboard:site-config': JSON.stringify(seed['site-config']()),
      'futureboard:site-config:ver': '3',
    };
    const mock = await startMockUpstash({ initial });
    const env = { KV_REST_API_URL: mock.url, KV_REST_API_TOKEN: mock.token, ADMIN_PASSWORD: 'pw-redis' };
    // 서버 두 개가 동시에 처음 요청을 받아 동시에 옮겨도 안전한지
    const [a, b] = await Promise.all([startServer(env), startServer(env)]);
    const [ca, cb] = await Promise.all([a.call('/api/content'), b.call('/api/content')]);
    compareWithLegacy(legacy, ca.data);
    ok(JSON.stringify(ca.data.posts.map((p) => [p.id, p.likes])) === JSON.stringify(cb.data.posts.map((p) => [p.id, p.likes])), '두 서버가 동시에 옮겨도 같은 결과');
    ok(mock.engine.data['futureboard:community'] === initial['futureboard:community'], '예전 문서는 바뀌지 않음 (백업)');

    // 동시 투표 40개: 서버 두 개에 나눠 보내도 하나도 잃지 않는다
    const yes0 = ca.data.debate.yes;
    const votes = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).call('/api/debate/vote', { method: 'POST', ip: '10.9.9.' + (i % 20), body: { choice: 'yes' } })));
    ok(votes.every((v) => v.status === 200), '동시 투표 40개 모두 성공');
    ok((await a.call('/api/content')).data.debate.yes === yes0 + 40, `동시 투표 수 정확 (${yes0} + 40)`);
    // 횟수 제한은 서버 인스턴스를 넘어 같이 센다
    const login = async (srv) => (await srv.call('/api/admin/login', { method: 'POST', ip: '10.7.7.7', body: { password: 'x' } })).status;
    const statuses = [];
    for (let i = 0; i < 12; i += 1) statuses.push(await login(i % 2 ? a : b));
    ok(statuses.slice(0, 10).every((x) => x === 401) && statuses.slice(10).every((x) => x === 429), '로그인 시도 제한이 서버 두 개에 걸쳐 적용');

    await coreFlow(a, 'redis', { password: 'pw-redis' });
    a.stop();
    b.stop();
    mock.server.close();
  }

  // 4. 저장소 없음
  console.log('\n[4] none — Vercel 에 저장소 미연결');
  {
    const s = await startServer({ VERCEL: '1' });
    ok((await s.call('/api/content')).status === 200, '읽기는 됨 (초기 데이터)');
    const w = await s.call('/api/debate/vote', { method: 'POST', body: { choice: 'yes' } });
    ok(w.status === 503 && /저장소/.test(w.data.error), '쓰기는 안내와 함께 거절');
    ok((await s.call('/api/admin/session')).data.locked === true, '비밀번호가 없으면 관리자 모드 잠김');
    ok((await s.call('/api/admin/state')).status === 503, '관리자 API 잠김');
    s.stop();
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n실패 ${failures}건` : '\n모두 통과');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
