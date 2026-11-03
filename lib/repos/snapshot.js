'use strict';
// 사이트 화면이 한 번에 받는 커뮤니티 데이터(GET /api/content).
// 저장 구조와 상관없이 화면이 쓰는 모양을 유지한다: { posts, debate, predictions, prompts, challenge, future, pulse, people, … }
// 저장소에는 한 번의 요청(파이프라인)으로 읽는다.

const db = require('../db');
const posts = require('./posts');
const comments = require('./comments');

const K = db.KEYS;
const byOrder = (a, z) => (a.order ?? 0) - (z.order ?? 0) || new Date(a.createdAt) - new Date(z.createdAt);

async function content() {
  const r = await db.readMany({
    posts: ['hash', K.posts],
    comments: ['hash', K.comments],
    counters: ['numbers', K.counters],
    debate: ['doc', K.debate],
    predictions: ['hash', K.predictions],
    prompts: ['hash', K.prompts],
    challenge: ['doc', K.challenge],
    entries: ['hash', K['challenge-entries']],
    curated: ['doc', K.curated],
  });
  const n = (field) => r.counters[field] || 0;

  return {
    ...r.curated,
    posts: Object.values(r.posts)
      .sort((a, z) => new Date(a.createdAt) - new Date(z.createdAt))
      .map((p) => posts.withCounts(p, r.counters)),
    debate: r.debate && {
      ...r.debate,
      yes: n(`debate:${r.debate.id}:yes`),
      no: n(`debate:${r.debate.id}:no`),
      comments: comments.forTarget(r.comments, `debate:${r.debate.id}`),
    },
    predictions: Object.values(r.predictions).sort(byOrder)
      .map((p) => ({ ...p, yes: n(`prediction:${p.id}:yes`), no: n(`prediction:${p.id}:no`) })),
    prompts: Object.values(r.prompts).sort(byOrder)
      .map((p) => ({ ...p, copies: n(`prompt:${p.id}:copies`), copiesToday: n(`prompt:${p.id}:copiesToday`) })),
    challenge: r.challenge && {
      ...r.challenge,
      entries: Object.values(r.entries)
        .filter((e) => e.challengeId === r.challenge.id)
        .map((e) => ({ ...e, votes: n(`entry:${e.id}:votes`) })),
    },
  };
}

module.exports = { content };
