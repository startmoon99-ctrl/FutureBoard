'use strict';
// 커뮤니티 게시글: 화면 데이터 전체 읽기, 글쓰기, 추천 · 조회

const snapshot = require('../repos/snapshot');
const posts = require('../repos/posts');
const { limit } = require('../rate-limit');
const { authorName } = require('../auth');
const { sendJson, readBody, fail, cleanStr, oneOf } = require('../http');
const { CATEGORIES, ADMIN_ONLY_CATEGORIES, DEFAULT_CATEGORY, AI_LABELS, LIMITS } = require('../config');

module.exports = (route) => {
  // 화면이 처음에 한 번에 받는 커뮤니티 데이터 (글 · 질문 · 예측 · 프롬프트 · 챌린지 · 운영자 정리 내용)
  route('GET', /^\/api\/content$/, async (req, res) => sendJson(res, 200, await snapshot.content()));

  route('POST', /^\/api\/posts$/, async (req, res) => {
    const body = await readBody(req);
    if (body.website) throw fail(400, '잘못된 요청입니다'); // 허니팟: 사람에게는 보이지 않는 필드

    const title = cleanStr(body.title, '', LIMITS.title);
    if (title.length < LIMITS.titleMin) throw fail(400, `제목을 ${LIMITS.titleMin}자 이상 입력해 주세요`);
    const link = cleanStr(body.link, '', LIMITS.link);
    if (link && !/^https?:\/\//i.test(link)) throw fail(400, '링크는 http:// 또는 https:// 로 시작해야 해요');

    const anonymous = body.anonymous === true;
    const author = anonymous ? '익명' : authorName(req, body.author);
    await limit(req, 'post');

    const writable = CATEGORIES.filter((c) => !ADMIN_ONLY_CATEGORIES.includes(c));
    sendJson(res, 201, await posts.create({
      category: oneOf(body.category, writable, DEFAULT_CATEGORY),
      title,
      body: cleanStr(body.body, '', LIMITS.body),
      author,
      anonymous,
      aiLabel: oneOf(body.aiLabel, AI_LABELS, AI_LABELS[0]),
      link,
    }));
  });

  route('POST', /^\/api\/posts\/([\w-]+)\/(like|view)$/, async (req, res, m) => {
    await limit(req, m[2] === 'like' ? 'react' : 'view');
    sendJson(res, 200, await posts.react(m[1], m[2] === 'like' ? 'likes' : 'views'));
  });
};
