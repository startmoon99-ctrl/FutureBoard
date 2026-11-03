'use strict';
// 사이트 화면이 한 번에 받는 커뮤니티 데이터(GET /api/content).
// 저장 구조와 상관없이 화면이 쓰는 모양을 유지한다: { posts, debate, predictions, prompts, challenge, future, pulse, people, … }
// 저장소에는 한 번의 요청(파이프라인)으로 읽고, 각 기능의 모양은 그 기능의 repo(view)가 만든다. 여기는 조립만 한다.

const db = require('../db');
const posts = require('./posts');
const debate = require('./debate');
const predictions = require('./predictions');
const prompts = require('./prompts');
const challenge = require('./challenge');

const K = db.KEYS;

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

  return {
    ...r.curated,
    posts: posts.view(r.posts, r.counters),
    debate: debate.view(r.debate, r.counters, r.comments),
    predictions: predictions.view(r.predictions, r.counters),
    prompts: prompts.view(r.prompts, r.counters),
    challenge: challenge.view(r.challenge, r.entries, r.counters),
  };
}

// 관리자 모드의 '숨긴 글 · 댓글' 목록 (최근에 숨긴 것부터)
async function hidden() {
  const r = await db.readMany({ posts: ['hash', K.posts], comments: ['hash', K.comments], counters: ['numbers', K.counters] });
  const byHidden = (a, z) => new Date(z.hiddenAt) - new Date(a.hiddenAt);
  return {
    posts: Object.values(r.posts).filter((p) => p.hiddenAt).sort(byHidden).map((p) => posts.withCounts(p, r.counters)),
    comments: Object.values(r.comments).filter((c) => c.hiddenAt).sort(byHidden),
  };
}

module.exports = { content, hidden };
