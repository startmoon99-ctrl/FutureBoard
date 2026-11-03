'use strict';
// 미래 예측: 예측 정의는 predictions 해시에, YES / NO 투표 수는 counters 에.

const db = require('../db');
const { fail } = require('../http');

const K = db.KEYS;
const counterField = (id, choice) => `prediction:${id}:${choice}`;
const byOrder = (a, z) => (a.order ?? 0) - (z.order ?? 0) || new Date(a.createdAt) - new Date(z.createdAt);

async function vote(id, choice) {
  const p = await db.hgetJson(K.predictions, id);
  if (!p) throw fail(404, '예측을 찾을 수 없습니다');
  if (p.status !== 'open') throw fail(400, '이미 판정이 끝난 예측입니다');
  await db.incr(counterField(id, choice));
  const c = await db.counters([counterField(id, 'yes'), counterField(id, 'no')]);
  return { yes: c[counterField(id, 'yes')], no: c[counterField(id, 'no')] };
}

// 화면에 보낼 모양: 정한 순서대로, 투표 수를 붙여서
const view = (all, counters) => Object.values(all).sort(byOrder).map((p) => ({
  ...p,
  yes: counters[counterField(p.id, 'yes')] || 0,
  no: counters[counterField(p.id, 'no')] || 0,
}));

module.exports = { vote, view };
