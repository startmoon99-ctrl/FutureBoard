'use strict';
// 저장소 백엔드 세 가지. 모두 같은 모양의 명령 배열(['HGET', key, field] 등)을 받는다.
//  · file  : data/db.json 하나에 저장 (로컬 실행)
//  · memory: 저장하지 않음 (Vercel 에 저장소가 연결되지 않은 상태)
//  · redis : Upstash REST

const fs = require('fs');
const path = require('path');
const { createEngine } = require('./engine');
const { KV_URL, KV_TOKEN, DATA_DIR, KEY_PREFIX } = require('../config');

// ---------- file / memory ----------

function engineBackend({ persist }) {
  const file = path.join(DATA_DIR, 'db.json');
  const initial = persist && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const engine = createEngine(initial);

  const save = () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(engine.data, null, 1), 'utf8');
    fs.renameSync(file + '.tmp', file);
  };

  return {
    async exec(cmd) {
      const result = engine.exec(cmd);
      if (persist && engine.isWrite(cmd)) save();
      return result;
    },
    async batch(cmds) {
      const results = cmds.map((c) => engine.exec(c));
      if (persist && cmds.some(engine.isWrite)) save();
      return results;
    },
    // 예전 형식(문서 하나) 데이터: data/<이름>.json. 옮긴 뒤에도 지우지 않고 백업으로 둔다.
    async loadLegacy(name) {
      const legacy = path.join(DATA_DIR, name + '.json');
      return persist && fs.existsSync(legacy) ? JSON.parse(fs.readFileSync(legacy, 'utf8')) : null;
    },
  };
}

// ---------- redis (Upstash REST) ----------

// 첫 줄 주석은 테스트용 가짜 Upstash 가 스크립트를 알아보는 표시다
const SCRIPTS = {
  CAS: `--cas
local v = redis.call('GET', KEYS[2]) or '0'
if v ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], tostring(tonumber(v) + 1))
return 1`,
  HIT: `--hit
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`,
};

function toRedis([name, ...args]) {
  const upper = String(name).toUpperCase();
  if (upper === 'CAS') return ['EVAL', SCRIPTS.CAS, '2', args[0], args[1], args[2], args[3]];
  if (upper === 'HIT') return ['EVAL', SCRIPTS.HIT, '1', args[0], args[1]];
  return [upper, ...args.map(String)];
}

function redisBackend() {
  async function call(suffix, body) {
    const res = await fetch(KV_URL + suffix, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw Object.assign(new Error('저장소 오류: ' + (data.error || res.status)), { status: 502 });
    return data;
  }

  return {
    async exec(cmd) {
      return (await call('', toRedis(cmd))).result;
    },
    async batch(cmds) {
      if (!cmds.length) return [];
      const out = await call('/pipeline', cmds.map(toRedis));
      const bad = out.find((r) => r.error);
      if (bad) throw Object.assign(new Error('저장소 오류: ' + bad.error), { status: 502 });
      return out.map((r) => r.result);
    },
    async loadLegacy(name) {
      const raw = (await call('', ['GET', KEY_PREFIX + name])).result;
      return raw ? JSON.parse(raw) : null;
    },
  };
}

function createBackend(kind) {
  if (kind === 'redis') return redisBackend();
  return engineBackend({ persist: kind === 'file' });
}

module.exports = { createBackend, SCRIPTS };
