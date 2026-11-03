'use strict';
// 관리자용 데이터 내보내기: 저장소의 모든 데이터를 그대로 한 파일로.
// post-links(링크 색인)는 글에서 다시 만들 수 있으므로 넣지 않는다. 횟수 제한 기록도 넣지 않는다.

const db = require('../db');

const K = db.KEYS;

async function exportAll() {
  const data = await db.readMany({
    'site-config': ['doc', K['site-config']],
    posts: ['hash', K.posts],
    comments: ['hash', K.comments],
    counters: ['numbers', K.counters],
    debate: ['doc', K.debate],
    predictions: ['hash', K.predictions],
    prompts: ['hash', K.prompts],
    challenge: ['doc', K.challenge],
    'challenge-entries': ['hash', K['challenge-entries']],
    curated: ['doc', K.curated],
    schema: ['doc', K.schema],
  });
  return { exportedAt: new Date().toISOString(), storage: db.kind, data };
}

module.exports = { exportAll };
