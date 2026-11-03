'use strict';
// 오늘의 AI 창작 챌린지: 지금 주제 하나(challenge) · 출품작(challenge-entries, challengeId 로 연결) · 투표 수(counters).

const db = require('../db');
const { fail } = require('../http');

const K = db.KEYS;
const counterField = (entryId) => `entry:${entryId}:votes`;

async function voteEntry(id) {
  if (!(await db.hgetJson(K['challenge-entries'], id))) throw fail(404, '출품작을 찾을 수 없습니다');
  return { votes: await db.incr(counterField(id)) };
}

// 화면에 보낼 모양: 주제 + 이 주제의 출품작(투표 수 포함)
const view = (challenge, allEntries, counters) => challenge && {
  ...challenge,
  entries: Object.values(allEntries)
    .filter((e) => e.challengeId === challenge.id)
    .map((e) => ({ ...e, votes: counters[counterField(e.id)] || 0 })),
};

module.exports = { voteEntry, view };
