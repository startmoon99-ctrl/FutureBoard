'use strict';
// 프롬프트 라이브러리: 프롬프트는 prompts 해시에, 복사 수는 counters 에.
// '오늘 복사'는 날짜(한국 시간)마다 따로 센다. 날이 바뀌면 새 칸에서 0부터 시작한다.

const db = require('../db');
const { fail } = require('../http');

const K = db.KEYS;
const byOrder = (a, z) => (a.order ?? 0) - (z.order ?? 0) || new Date(a.createdAt) - new Date(z.createdAt);
const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const counterFields = (id) => ({ copies: `prompt:${id}:copies`, copiesToday: `prompt:${id}:copies:${kstDay()}` });

async function copy(id) {
  if (!(await db.hgetJson(K.prompts, id))) throw fail(404, '프롬프트를 찾을 수 없습니다');
  const f = counterFields(id);
  await db.batch([
    ['HINCRBY', K.counters, f.copies, '1'],
    ['HINCRBY', K.counters, f.copiesToday, '1'],
  ]);
  const c = await db.counters([f.copies, f.copiesToday]);
  return { copies: c[f.copies], copiesToday: c[f.copiesToday] };
}

// 화면에 보낼 모양: 정한 순서대로, 복사 수를 붙여서
const view = (all, counters) => Object.values(all).sort(byOrder).map((p) => {
  const f = counterFields(p.id);
  return { ...p, copies: counters[f.copies] || 0, copiesToday: counters[f.copiesToday] || 0 };
});

module.exports = { copy, view };
