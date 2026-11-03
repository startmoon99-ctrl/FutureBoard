'use strict';
// HTTP 공통: 오류 · 응답 · 요청 본문 · 입력 정리 · 라우터

const { LIMITS } = require('./config');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => new HttpError(status, message);

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
      if (size > LIMITS.requestBytes) {
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

// Vercel 은 x-real-ip 에 실제 접속 IP 를 넣는다 (사용자가 바꿀 수 없음)
function clientIp(req) {
  const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '';
  return String(ip).trim() || 'unknown';
}

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

const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback);

// ---------- 라우터 ----------

// route(method, pattern, handler, { allowReadOnly })
//  · allowReadOnly: 저장소가 없는 상태(쓰기 불가)에서도 실행해도 되는 쓰기 요청 (로그인 · 로그아웃)
function createRouter() {
  const routes = [];
  const route = (method, pattern, handler, options = {}) => routes.push({ method, pattern, handler, options });
  const match = (method, pathname) => {
    for (const r of routes) {
      const m = r.method === method && pathname.match(r.pattern);
      if (m) return { route: r, params: m };
    }
    return null;
  };
  return { route, match };
}

module.exports = { HttpError, fail, sendJson, readBody, clientIp, cleanStr, clampInt, oneOf, createRouter };
