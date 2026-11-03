'use strict';
// 횟수 제한 (봇 대응 원칙의 최소한). 규칙은 lib/config.js 의 RATE_LIMITS.
// 저장소에 세므로 Vercel 에서 서버 인스턴스가 여럿이어도 같은 IP 는 같이 센다.

const db = require('./db');
const { RATE_LIMITS } = require('./config');
const { fail, clientIp } = require('./http');

async function limit(req, action) {
  const rule = RATE_LIMITS[action];
  if (!rule) throw new Error(`횟수 제한 규칙이 없습니다: ${action}`);
  const n = await db.hit(`${action}:${clientIp(req)}`, rule.windowSec);
  if (n > rule.max) throw fail(429, rule.message);
}

module.exports = { limit };
