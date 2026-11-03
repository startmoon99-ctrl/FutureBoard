'use strict';
// 데이터 접근의 유일한 입구. 기능 코드(lib/repos)는 저장소 종류를 모르고 이 함수들만 쓴다.
//
// 저장 구조 (스키마 2) — 키 이름은 KEYS 에만 있다
//   site-config        문자열(JSON)  사이트 구성: draft · published · 버전 기록   (+ site-config:ver)
//   posts              해시 id → 글
//   post-links         해시 정규화한 링크 → 처음 올린 글 id (최초 발견자)
//   comments           해시 id → 댓글 { target: 'debate:<id>' | 'post:<id>' … }
//   counters           해시 '<종류>:<id>:<항목>' → 숫자 (추천 · 조회 · 투표 · 복사)
//   debate             문자열(JSON)  지금의 오늘의 질문
//   predictions        해시 id → 예측
//   prompts            해시 id → 프롬프트
//   challenge          문자열(JSON)  지금의 챌린지 주제
//   challenge-entries  해시 id → 출품작 { challengeId }
//   curated            문자열(JSON)  운영자가 정리하는 내용 (미래 변화 · Pulse · 선구자 · 지난 기록)
//   schema             현재 스키마 번호

const { STORAGE, KEY_PREFIX } = require('../config');
const { createBackend } = require('./backends');

const backend = createBackend(STORAGE);

const NAMES = ['site-config', 'posts', 'post-links', 'comments', 'counters', 'debate', 'predictions', 'prompts', 'challenge', 'challenge-entries', 'curated', 'schema'];
const KEYS = Object.fromEntries(NAMES.map((n) => [n, KEY_PREFIX + n]));

const parse = (raw) => (raw == null ? null : JSON.parse(raw));
const pairsToObject = (r) => {
  if (!Array.isArray(r)) return r || {};
  const o = {};
  for (let i = 0; i < r.length; i += 2) o[r[i]] = r[i + 1];
  return o;
};
const mapValues = (o, fn) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)]));

const db = {
  kind: STORAGE,
  // 저장소가 없는 상태(none)는 초기 데이터를 메모리에 두고 보여주기만 한다
  writable: STORAGE !== 'none',
  KEYS,

  exec: (cmd) => backend.exec(cmd),
  batch: (cmds) => backend.batch(cmds),
  loadLegacy: (name) => backend.loadLegacy(name),

  // ---------- 문서(JSON 문자열) ----------
  async getJson(key) {
    return parse(await backend.exec(['GET', key]));
  },
  async setJson(key, value) {
    await backend.exec(['SET', key, JSON.stringify(value)]);
  },
  // 동시에 고쳐도 잃어버리지 않도록 버전을 비교하며 저장한다. fn 이 오류를 던지면 저장하지 않는다.
  async updateJson(key, fn, { fallback } = {}) {
    for (let i = 0; i < 20; i += 1) {
      if (i > 0) await new Promise((r) => setTimeout(r, Math.random() * Math.min(400, 25 * 2 ** Math.min(i, 4))));
      const [raw, ver] = await backend.batch([['GET', key], ['GET', key + ':ver']]);
      const doc = parse(raw) ?? (fallback ? fallback() : null);
      const result = fn(doc);
      if ((await backend.exec(['CAS', key, key + ':ver', JSON.stringify(doc), ver || '0'])) === 1) return result;
    }
    throw Object.assign(new Error('동시에 요청이 많아요. 잠시 후 다시 시도해 주세요'), { status: 503 });
  },

  // ---------- 해시 ----------
  async hgetJson(key, field) {
    return parse(await backend.exec(['HGET', key, field]));
  },
  async hgetallJson(key) {
    return mapValues(pairsToObject(await backend.exec(['HGETALL', key])), parse);
  },
  async hsetJson(key, field, value) {
    await backend.exec(['HSET', key, field, JSON.stringify(value)]);
  },
  // 없을 때만 넣는다. 넣었으면 true
  async hsetnx(key, field, value) {
    return Number(await backend.exec(['HSETNX', key, field, value])) === 1;
  },
  async hget(key, field) {
    return backend.exec(['HGET', key, field]);
  },
  async hset(key, field, value) {
    await backend.exec(['HSET', key, field, value]);
  },

  // ---------- 숫자 ----------
  async incr(field, by = 1) {
    return Number(await backend.exec(['HINCRBY', KEYS.counters, field, String(by)]));
  },
  async counters(fields) {
    const values = await backend.exec(['HMGET', KEYS.counters, ...fields]);
    return Object.fromEntries(fields.map((f, i) => [f, Number(values[i] || 0)]));
  },

  // 여러 해시 · 문서를 한 번에 읽는다 (Upstash 는 요청 한 번)
  async readMany(spec) {
    const entries = Object.entries(spec);
    const results = await backend.batch(entries.map(([, [type, key]]) => (type === 'doc' ? ['GET', key] : ['HGETALL', key])));
    return Object.fromEntries(entries.map(([name, [type]], i) => [
      name,
      type === 'hash' ? mapValues(pairsToObject(results[i]), parse)
        : type === 'numbers' ? mapValues(pairsToObject(results[i]), Number)
          : parse(results[i]),
    ]));
  },

  // 횟수 제한용: ttl 초 안에 몇 번째 호출인지
  async hit(name, ttlSec) {
    return Number(await backend.exec(['HIT', KEY_PREFIX + 'hit:' + name, String(ttlSec)]));
  },
};

// 첫 요청 때 한 번, 예전 형식 데이터를 새 구조로 옮긴다 (lib/db/migrate.js)
let readyPromise = null;
db.ready = function ready() {
  if (!readyPromise) {
    readyPromise = require('./migrate').migrate(db).catch((err) => {
      readyPromise = null; // 실패하면 다음 요청에서 다시 시도
      throw err;
    });
  }
  return readyPromise;
};

module.exports = db;
