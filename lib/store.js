'use strict';
// 데이터 저장소. 문서는 두 개뿐이다: 'community'(Community Data)와 'site-config'(Site Configuration).
//  · file  : 로컬 실행(START.bat). data/*.json 파일에 저장한다.
//  · redis : Vercel 배포. Upstash Redis(REST)에 저장한다. 동시에 들어온 쓰기는 버전 비교로 다시 시도한다.
//  · none  : Vercel에 저장소가 아직 연결되지 않은 상태. 초기 데이터를 보여주기만 하고 쓰기는 거절한다.

const fs = require('fs');
const path = require('path');
const seeds = require('./seed');

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
const KIND = KV_URL && KV_TOKEN ? 'redis' : process.env.VERCEL ? 'none' : 'file';

const clone = (v) => JSON.parse(JSON.stringify(v));
const fail = (status, message) => Object.assign(new Error(message), { status });

// ---------- file ----------

const DATA_DIR = path.join(__dirname, '..', 'data');
const fileCache = {};

function fileRead(name) {
  if (!fileCache[name]) {
    const file = path.join(DATA_DIR, name + '.json');
    if (fs.existsSync(file)) {
      fileCache[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (seeds.upgrade(name, fileCache[name])) fileWrite(name, fileCache[name]);
    } else {
      fileCache[name] = seeds[name]();
      fileWrite(name, fileCache[name]);
      console.log(`  · 초기 데이터를 만들었습니다 (data/${name}.json)`);
    }
  }
  return fileCache[name];
}

function fileWrite(name, doc) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name + '.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(doc, null, 2), 'utf8');
  fs.renameSync(file + '.tmp', file);
}

// ---------- redis (Upstash REST) ----------

const CAS_SCRIPT = `
local v = redis.call('GET', KEYS[2]) or '0'
if v ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], tostring(tonumber(v) + 1))
return 1`;

async function redis(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw fail(502, '저장소 오류: ' + (data.error || res.status));
  return data.result;
}

const keys = (name) => ['futureboard:' + name, 'futureboard:' + name + ':ver'];

async function redisGet(name) {
  const [docKey, verKey] = keys(name);
  const [raw, ver] = await redis(['MGET', docKey, verKey]);
  const doc = raw ? JSON.parse(raw) : null;
  // 나중에 추가된 항목은 읽을 때 채우고, 다음 저장 때 함께 저장된다
  if (doc) seeds.upgrade(name, doc);
  return { doc, ver: ver || '0' };
}

async function redisCas(name, doc, ver) {
  const [docKey, verKey] = keys(name);
  return (await redis(['EVAL', CAS_SCRIPT, '2', docKey, verKey, JSON.stringify(doc), ver])) === 1;
}

async function redisRead(name) {
  for (let i = 0; i < 5; i += 1) {
    const { doc, ver } = await redisGet(name);
    if (doc) return doc;
    const seeded = seeds[name]();
    if (await redisCas(name, seeded, ver)) return seeded;
  }
  throw fail(503, '저장소가 바빠요. 잠시 후 다시 시도해 주세요');
}

// ---------- none ----------

const memory = {};
const noneRead = (name) => (memory[name] = memory[name] || seeds[name]());

// ---------- 공개 API ----------

async function read(name) {
  if (KIND === 'file') return fileRead(name);
  if (KIND === 'redis') return redisRead(name);
  return noneRead(name);
}

// fn 은 문서 사본을 고친 뒤 응답할 값을 돌려준다. fn 이 오류를 던지면 아무것도 저장하지 않는다.
async function mutate(name, fn) {
  if (KIND === 'none') throw fail(503, '아직 저장소가 연결되지 않아 저장할 수 없어요 (Vercel → Storage에서 Upstash Redis 연결)');

  if (KIND === 'file') {
    const doc = clone(fileRead(name));
    const result = fn(doc);
    fileWrite(name, doc);
    fileCache[name] = doc;
    return result;
  }

  // 다른 요청이 먼저 저장했으면 최신 문서를 다시 읽어 처음부터 다시 적용한다. 부딪힌 요청끼리 다시 부딪히지 않게 대기 시간을 흩뜨린다.
  for (let i = 0; i < 20; i += 1) {
    if (i > 0) await new Promise((r) => setTimeout(r, Math.random() * Math.min(400, 25 * 2 ** Math.min(i, 4))));
    let { doc, ver } = await redisGet(name);
    if (!doc) doc = seeds[name]();
    const result = fn(doc);
    if (await redisCas(name, doc, ver)) return result;
  }
  throw fail(503, '동시에 요청이 많아요. 잠시 후 다시 시도해 주세요');
}

module.exports = { kind: KIND, read, mutate };
