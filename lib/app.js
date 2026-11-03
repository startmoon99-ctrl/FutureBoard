'use strict';
// /api/* 요청 처리. 로컬 서버(server.js)와 Vercel 함수(api/[...path].js)가 같은 코드를 쓴다.
// 원칙: Community Data('community')와 Site Configuration('site-config')은 완전히 분리한다.

const store = require('./store');
const auth = require('./auth');

const CATEGORIES = ['공지', '뉴스', '발견', '밈', '바이브코딩', '프롬프트', 'AI아트', '로보틱스', 'AGI·특이점', '미래기술', '우주·과학', 'SF', '토론', '질문'];
const AI_LABELS = ['직접 작성', 'AI 보조 작성', 'AI 생성'];
const MAX_VERSIONS = 50;

const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fail = (status, message) => Object.assign(new Error(message), { status });

// ---------- 입력 정리 ----------

function cleanStr(value, fallback, max) {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  return v ? v.slice(0, max) : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// 관리자가 보낸 구성을 정리한다. 블록은 숨길 수만 있고 삭제·생성은 할 수 없다.
function sanitizeConfig(input, base) {
  const src = input && typeof input === 'object' ? input : {};
  const known = new Map(base.blocks.map((b) => [b.id, b]));
  const seen = new Set();
  const blocks = [];

  for (const b of Array.isArray(src.blocks) ? src.blocks : []) {
    const orig = b && known.get(b.id);
    if (!orig || seen.has(orig.id)) continue;
    seen.add(orig.id);
    blocks.push({
      id: orig.id,
      type: orig.type,
      title: cleanStr(b.title, orig.title, 40),
      visible: b.visible !== false,
      limit: clampInt(b.limit, 1, 20, orig.limit),
      size: b.size === 'half' ? 'half' : 'full',
    });
  }
  for (const orig of base.blocks) if (!seen.has(orig.id)) blocks.push(clone(orig));

  return {
    siteTitle: cleanStr(src.siteTitle, base.siteTitle, 30),
    tagline: cleanStr(src.tagline, base.tagline, 80),
    blocks,
  };
}

// ---------- 봇 대응(프로토타입 수준): IP별 쓰기 간격 제한 ----------
// Vercel 에서는 함수 인스턴스마다 따로 기억하므로 완벽하지 않다.

const lastWrite = new Map();
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}
function tooFast(req, key, ms) {
  const id = clientIp(req) + ':' + key;
  const t = Date.now();
  if (t - (lastWrite.get(id) || 0) < ms) return true;
  lastWrite.set(id, t);
  return false;
}

// ---------- HTTP 유틸 ----------

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  // Vercel 은 본문을 미리 읽어 req.body 로 준다. 로컬 Node 서버는 직접 읽는다.
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    return req.body || {};
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100 * 1024) {
        reject(fail(413, '요청이 너무 큽니다'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(fail(400, 'JSON 형식이 아닙니다'));
      }
    });
    req.on('error', reject);
  });
}

function requireAdmin(req) {
  const s = auth.status(req);
  if (s.locked) throw fail(503, '관리자 비밀번호(ADMIN_PASSWORD)가 설정되지 않아 관리자 모드가 잠겨 있어요');
  if (!s.authed) throw fail(401, '관리자 로그인이 필요해요');
}

const adminState = (c) => ({
  draft: c.draft,
  published: c.published,
  publishedVersion: c.publishedVersion,
  draftUpdatedAt: c.draftUpdatedAt,
  versions: c.versions,
  storage: store.kind,
});

function pushVersion(c, config, note) {
  const version = Math.max(...c.versions.map((v) => v.version), c.publishedVersion) + 1;
  c.published = clone(config);
  c.publishedVersion = version;
  c.versions.push({ version, publishedAt: nowIso(), note, config: clone(config) });
  if (c.versions.length > MAX_VERSIONS) c.versions = c.versions.slice(-MAX_VERSIONS);
  return version;
}

// ---------- 라우트 ----------

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

// 관리자 인증
route('GET', /^\/api\/admin\/session$/, (req, res) => sendJson(res, 200, { ...auth.status(req), storage: store.kind }));

route('POST', /^\/api\/admin\/login$/, async (req, res) => {
  const body = await readBody(req);
  if (tooFast(req, 'login', 1500)) throw fail(429, '잠시 후 다시 시도해 주세요');
  if (!auth.checkPassword(body.password)) throw fail(401, '비밀번호가 맞지 않아요');
  auth.setSession(req, res);
  sendJson(res, 200, { ok: true });
});

route('POST', /^\/api\/admin\/logout$/, (req, res) => {
  auth.clearSession(req, res);
  sendJson(res, 200, { ok: true });
});

// Site Configuration
route('GET', /^\/api\/config$/, async (req, res, m, url) => {
  const mode = url.searchParams.get('mode') === 'draft' ? 'draft' : 'published';
  if (mode === 'draft') requireAdmin(req);
  const c = await store.read('site-config');
  sendJson(res, 200, c[mode]);
});

route('GET', /^\/api\/admin\/state$/, async (req, res) => {
  requireAdmin(req);
  sendJson(res, 200, adminState(await store.read('site-config')));
});

route('PUT', /^\/api\/admin\/draft$/, async (req, res) => {
  requireAdmin(req);
  const body = await readBody(req);
  const state = await store.mutate('site-config', (c) => {
    c.draft = sanitizeConfig(body.config, c.draft);
    c.draftUpdatedAt = nowIso();
    return adminState(c);
  });
  sendJson(res, 200, state);
});

route('POST', /^\/api\/admin\/draft\/reset$/, async (req, res) => {
  requireAdmin(req);
  const state = await store.mutate('site-config', (c) => {
    c.draft = clone(c.published);
    c.draftUpdatedAt = nowIso();
    return adminState(c);
  });
  sendJson(res, 200, state);
});

route('POST', /^\/api\/admin\/publish$/, async (req, res) => {
  requireAdmin(req);
  const body = await readBody(req);
  const state = await store.mutate('site-config', (c) => {
    pushVersion(c, c.draft, cleanStr(body.note, '구성 변경', 80));
    return adminState(c);
  });
  console.log(`  · v${state.publishedVersion} 게시됨`);
  sendJson(res, 200, state);
});

// 롤백은 UI 구성만 되돌린다. Community Data는 건드리지 않는다.
route('POST', /^\/api\/admin\/rollback$/, async (req, res) => {
  requireAdmin(req);
  const body = await readBody(req);
  const state = await store.mutate('site-config', (c) => {
    const target = c.versions.find((v) => v.version === Number(body.version));
    if (!target) throw fail(404, '해당 버전을 찾을 수 없습니다');
    pushVersion(c, target.config, `v${target.version} 구성으로 롤백`);
    return adminState(c);
  });
  console.log(`  · v${body.version} 구성으로 롤백 → v${state.publishedVersion}`);
  sendJson(res, 200, state);
});

// Community Data
route('GET', /^\/api\/content$/, async (req, res) => sendJson(res, 200, await store.read('community')));

route('POST', /^\/api\/posts$/, async (req, res) => {
  const body = await readBody(req);
  if (body.website) throw fail(400, '잘못된 요청입니다'); // 허니팟: 사람에게는 보이지 않는 필드

  const title = cleanStr(body.title, '', 100);
  if (title.length < 2) throw fail(400, '제목을 2자 이상 입력해 주세요');
  const anonymous = body.anonymous === true;
  const link = cleanStr(body.link, '', 300);
  if (link && !/^https?:\/\//i.test(link)) throw fail(400, '링크는 http:// 또는 https:// 로 시작해야 해요');
  if (tooFast(req, 'post', 15000)) throw fail(429, '글은 15초에 한 번만 쓸 수 있어요');

  const result = await store.mutate('community', (c) => {
    const post = {
      id: newId('p'),
      category: CATEGORIES.includes(body.category) && body.category !== '공지' ? body.category : '토론',
      title,
      body: cleanStr(body.body, '', 3000),
      author: anonymous ? '익명' : cleanStr(body.author, '익명', 20),
      anonymous,
      aiLabel: AI_LABELS.includes(body.aiLabel) ? body.aiLabel : '직접 작성',
      link,
      likes: 0,
      views: 0,
      createdAt: nowIso(),
    };

    // 최초 발견자 크레딧: 같은 링크가 처음 올라온 경우에만 기록한다 (익명 글은 고정 정체성이 없으므로 제외)
    let discovery = null;
    if (link) {
      const norm = (u) => u.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
      const first = c.posts.find((p) => p.link && norm(p.link) === norm(link));
      if (first) discovery = { first: false, by: first.author, at: first.createdAt };
      else if (!anonymous) {
        post.firstDiscovery = true;
        discovery = { first: true };
      }
    }

    c.posts.push(post);
    return { post, discovery };
  });
  sendJson(res, 201, result);
});

route('POST', /^\/api\/posts\/([\w-]+)\/(like|view)$/, async (req, res, m) => {
  const result = await store.mutate('community', (c) => {
    const post = c.posts.find((p) => p.id === m[1]);
    if (!post) throw fail(404, '글을 찾을 수 없습니다');
    if (m[2] === 'like') post.likes += 1;
    else post.views += 1;
    return { likes: post.likes, views: post.views };
  });
  sendJson(res, 200, result);
});

route('POST', /^\/api\/debate\/vote$/, async (req, res) => {
  const body = await readBody(req);
  if (body.choice !== 'yes' && body.choice !== 'no') throw fail(400, '선택지가 올바르지 않습니다');
  const result = await store.mutate('community', (c) => {
    c.debate[body.choice] += 1;
    return { yes: c.debate.yes, no: c.debate.no };
  });
  sendJson(res, 200, result);
});

route('POST', /^\/api\/debate\/comment$/, async (req, res) => {
  const body = await readBody(req);
  const text = cleanStr(body.text, '', 300);
  if (!text) throw fail(400, '내용을 입력해 주세요');
  if (tooFast(req, 'comment', 5000)) throw fail(429, '댓글은 5초에 한 번만 쓸 수 있어요');
  const choice = body.choice === 'yes' || body.choice === 'no' ? body.choice : null;
  const comment = { id: newId('c'), author: cleanStr(body.author, '익명', 20), text, choice, createdAt: nowIso() };
  await store.mutate('community', (c) => {
    c.debate.comments.push(comment);
  });
  sendJson(res, 201, comment);
});

route('POST', /^\/api\/predictions\/([\w-]+)\/vote$/, async (req, res, m) => {
  const body = await readBody(req);
  if (body.choice !== 'yes' && body.choice !== 'no') throw fail(400, '선택지가 올바르지 않습니다');
  const result = await store.mutate('community', (c) => {
    const p = c.predictions.find((x) => x.id === m[1]);
    if (!p) throw fail(404, '예측을 찾을 수 없습니다');
    if (p.status !== 'open') throw fail(400, '이미 판정이 끝난 예측입니다');
    p[body.choice] += 1;
    return { yes: p.yes, no: p.no };
  });
  sendJson(res, 200, result);
});

route('POST', /^\/api\/prompts\/([\w-]+)\/copy$/, async (req, res, m) => {
  const result = await store.mutate('community', (c) => {
    const p = c.prompts.find((x) => x.id === m[1]);
    if (!p) throw fail(404, '프롬프트를 찾을 수 없습니다');
    p.copies += 1;
    p.copiesToday = (p.copiesToday || 0) + 1;
    return { copies: p.copies, copiesToday: p.copiesToday };
  });
  sendJson(res, 200, result);
});

route('POST', /^\/api\/challenge\/([\w-]+)\/vote$/, async (req, res, m) => {
  const result = await store.mutate('community', (c) => {
    const e = c.challenge.entries.find((x) => x.id === m[1]);
    if (!e) throw fail(404, '출품작을 찾을 수 없습니다');
    e.votes += 1;
    return { votes: e.votes };
  });
  sendJson(res, 200, result);
});

// ---------- 진입점 ----------

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  try {
    for (const r of routes) {
      const m = r.method === req.method && pathname.match(r.pattern);
      if (m) return await r.handler(req, res, m, url);
    }
    throw fail(404, '없는 API입니다');
  } catch (err) {
    const status = err.status || (err instanceof SyntaxError ? 400 : 500);
    if (status === 500) console.error(err);
    sendJson(res, status, { error: status === 500 ? '서버 오류가 발생했습니다' : err.message });
  }
}

module.exports = { handleApi };
