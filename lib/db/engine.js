'use strict';
// Redis 명령을 메모리에서 흉내 내는 작은 엔진. 로컬 파일 저장소 · 저장소 없음 상태 · 테스트용 가짜 Upstash 가 함께 쓴다.
// 결과 형태는 Upstash REST 와 같다 (예: HGETALL 은 [필드, 값, 필드, 값, …]).
// CAS · HIT 은 lib/db/redis.js 에서 Lua 스크립트로 보내는 명령을 여기서 직접 처리한 것이다.

function createEngine(initial = {}) {
  const data = initial; // key → 문자열 또는 { 필드: 문자열 }
  const hits = new Map(); // 횟수 제한 카운터 (저장하지 않는다)

  const hash = (key, create) => {
    if (data[key] === undefined && create) data[key] = {};
    const h = data[key];
    if (h !== undefined && typeof h !== 'object') throw new Error(`WRONGTYPE ${key}`);
    return h;
  };

  const commands = {
    GET: (key) => (typeof data[key] === 'string' ? data[key] : null),
    MGET: (...keys) => keys.map((k) => (typeof data[k] === 'string' ? data[k] : null)),
    SET(key, value, flag) {
      if (flag === 'NX' && data[key] !== undefined) return null;
      data[key] = String(value);
      return 'OK';
    },
    HGETALL: (key) => Object.entries(hash(key) || {}).flat(),
    HGET: (key, field) => hash(key)?.[field] ?? null,
    HMGET: (key, ...fields) => fields.map((f) => hash(key)?.[f] ?? null),
    HSET(key, ...pairs) {
      const h = hash(key, true);
      let added = 0;
      for (let i = 0; i < pairs.length; i += 2) {
        if (h[pairs[i]] === undefined) added += 1;
        h[pairs[i]] = String(pairs[i + 1]);
      }
      return added;
    },
    HSETNX(key, field, value) {
      const h = hash(key, true);
      if (h[field] !== undefined) return 0;
      h[field] = String(value);
      return 1;
    },
    HINCRBY(key, field, by) {
      const h = hash(key, true);
      const next = Number(h[field] || 0) + Number(by);
      h[field] = String(next);
      return next;
    },
    // 버전 키가 기대한 값일 때만 문서를 바꾸고 버전을 올린다
    CAS(key, verKey, value, expected) {
      const ver = typeof data[verKey] === 'string' ? data[verKey] : '0';
      if (ver !== expected) return 0;
      data[key] = String(value);
      data[verKey] = String(Number(ver) + 1);
      return 1;
    },
    // 횟수 제한: ttl 초 동안의 호출 횟수
    HIT(key, ttl) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.until <= now) {
        hits.set(key, { n: 1, until: now + Number(ttl) * 1000 });
        return 1;
      }
      h.n += 1;
      return h.n;
    },
  };

  const WRITES = new Set(['SET', 'HSET', 'HSETNX', 'HINCRBY', 'CAS']);

  function exec([name, ...args]) {
    const fn = commands[String(name).toUpperCase()];
    if (!fn) throw new Error(`지원하지 않는 명령: ${name}`);
    return fn(...args.map(String));
  }

  return { data, exec, isWrite: (cmd) => WRITES.has(String(cmd[0]).toUpperCase()) };
}

module.exports = { createEngine };
