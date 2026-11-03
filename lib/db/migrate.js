'use strict';
// 예전 형식(커뮤니티 전체가 문서 하나 'community')을 스키마 2(글 · 댓글 · 숫자를 따로 저장)로 옮긴다.
//
// 안전 장치
//  · 예전 문서는 읽기만 하고 지우거나 고치지 않는다 (백업으로 남는다)
//  · 모든 쓰기가 "없을 때만 넣기"(HSETNX · SET NX)라서 여러 서버가 동시에 실행해도, 중간에 끊겨 다시 실행해도 안전하다
//  · 다 옮긴 뒤에만 스키마 번호를 남긴다. 그 전에는 어떤 요청도 새 구조에 쓰지 않는다 (db.ready() 를 먼저 기다린다)
//  · 처음 설치(예전 데이터 없음)도 같은 길로 초기 데이터를 넣는다

const seeds = require('../seed');

const SCHEMA_VERSION = '2';

// 예전 문서 하나를 새 구조에 넣는 명령 목록
function commandsFor(legacy, K) {
  const cmds = [];
  const put = (key, field, value) => cmds.push(['HSETNX', key, field, JSON.stringify(value)]);
  const count = (field, value) => cmds.push(['HSETNX', K.counters, field, String(value || 0)]);
  const doc = (key, value) => cmds.push(['SET', key, JSON.stringify(value), 'NX']);

  // 글: 숫자(추천 · 조회)는 counters 로, 링크는 최초 발견자 색인으로 (먼저 올린 글이 이긴다)
  const norm = require('../repos/posts').normalizeLink;
  [...legacy.posts].sort((a, z) => new Date(a.createdAt) - new Date(z.createdAt)).forEach((p) => {
    const { likes, views, ...post } = p;
    put(K.posts, p.id, post);
    count(`post:${p.id}:likes`, likes);
    count(`post:${p.id}:views`, views);
    if (p.link) cmds.push(['HSETNX', K['post-links'], norm(p.link), p.id]);
  });

  // 오늘의 질문: 투표 수는 counters, 의견은 공용 댓글로
  const { yes, no, comments = [], ...debate } = legacy.debate;
  doc(K.debate, debate);
  count(`debate:${debate.id}:yes`, yes);
  count(`debate:${debate.id}:no`, no);
  comments.forEach((c) => put(K.comments, c.id, { ...c, target: `debate:${debate.id}` }));

  // 예측 · 프롬프트: 원래 순서를 order 로 남긴다
  legacy.predictions.forEach((p, i) => {
    const { yes: y, no: n, ...prediction } = p;
    put(K.predictions, p.id, { ...prediction, order: i });
    count(`prediction:${p.id}:yes`, y);
    count(`prediction:${p.id}:no`, n);
  });
  legacy.prompts.forEach((p, i) => {
    const { copies, copiesToday, ...prompt } = p;
    put(K.prompts, p.id, { ...prompt, order: i });
    count(`prompt:${p.id}:copies`, copies);
    count(`prompt:${p.id}:copiesToday`, copiesToday);
  });

  // 챌린지: 주제와 출품작을 나눈다
  const { entries = [], ...challenge } = legacy.challenge;
  doc(K.challenge, challenge);
  entries.forEach((e) => {
    const { votes, ...entry } = e;
    put(K['challenge-entries'], e.id, { ...entry, challengeId: challenge.id });
    count(`entry:${e.id}:votes`, votes);
  });

  // 운영자가 정리하는 내용
  doc(K.curated, {
    future: legacy.future,
    pulse: legacy.pulse,
    people: legacy.people,
    futureHistory: legacy.futureHistory,
    debateArchive: legacy.debateArchive,
    challengeArchive: legacy.challengeArchive,
  });
  return cmds;
}

async function migrate(db) {
  const K = db.KEYS;
  if ((await db.exec(['GET', K.schema])) === SCHEMA_VERSION) return;

  // 사이트 구성: Upstash 는 키가 그대로라 옮길 게 없다. 로컬은 data/site-config.json 에서 가져온다.
  if ((await db.exec(['GET', K['site-config']])) == null) {
    const legacyConfig = await db.loadLegacy('site-config');
    await db.exec(['SET', K['site-config'], JSON.stringify(legacyConfig || seeds['site-config']()), 'NX']);
  }

  const legacy = (await db.loadLegacy('community')) || seeds.community();
  seeds.upgrade('community', legacy); // 지난 기록 등 나중에 생긴 항목 채우기

  const cmds = commandsFor(legacy, K);
  for (let i = 0; i < cmds.length; i += 200) await db.batch(cmds.slice(i, i + 200));
  await db.exec(['SET', K.schema, SCHEMA_VERSION]);
  if (db.kind !== 'none') console.log(`  · 데이터를 스키마 ${SCHEMA_VERSION} 로 옮겼습니다 (글 ${legacy.posts.length}개, 예전 데이터는 그대로 보관)`);
}

module.exports = { migrate, SCHEMA_VERSION };
