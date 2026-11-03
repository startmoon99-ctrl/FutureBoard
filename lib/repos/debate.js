'use strict';
// 오늘의 질문: 지금 질문 하나 · YES / NO 투표 수 · 한 줄 의견.
// 의견은 공용 댓글 저장소(comments)에 target 'debate:<id>' 로 저장한다.

const db = require('../db');
const { fail } = require('../http');
const comments = require('./comments');

const K = db.KEYS;
const counterField = (id, choice) => `debate:${id}:${choice}`;
const target = (id) => `debate:${id}`;

async function current() {
  const d = await db.getJson(K.debate);
  if (!d) throw fail(404, '오늘의 질문이 없습니다');
  return d;
}

async function vote(choice) {
  const d = await current();
  await db.incr(counterField(d.id, choice));
  const c = await db.counters([counterField(d.id, 'yes'), counterField(d.id, 'no')]);
  return { yes: c[counterField(d.id, 'yes')], no: c[counterField(d.id, 'no')] };
}

async function comment({ author, text, choice }) {
  const d = await current();
  return comments.create({ target: target(d.id), author, text, choice });
}

// 화면에 보낼 모양: 질문 + 투표 수 + 보이는 의견
const view = (d, counters, allComments) => d && {
  ...d,
  yes: counters[counterField(d.id, 'yes')] || 0,
  no: counters[counterField(d.id, 'no')] || 0,
  comments: comments.forTarget(allComments, target(d.id)),
};

module.exports = { vote, comment, view };
