'use strict';
// 댓글 데이터 접근. 어디에 달린 댓글인지는 target 으로 구분한다 ('debate:<id>', 나중에 'post:<id>' 등).
// 기능마다 댓글 저장소를 따로 만들지 않고 이 하나를 같이 쓴다.

const db = require('../db');

const K = db.KEYS;
const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function create({ target, author, text, choice = null }) {
  const comment = { id: newId(), target, author, text, choice, createdAt: new Date().toISOString() };
  await db.hsetJson(K.comments, comment.id, comment);
  return comment;
}

// all: hgetall 결과(id → 댓글). 대상 하나의 댓글을 오래된 순으로
const forTarget = (all, target) =>
  Object.values(all).filter((c) => c.target === target).sort((a, z) => new Date(a.createdAt) - new Date(z.createdAt));

module.exports = { create, forTarget };
