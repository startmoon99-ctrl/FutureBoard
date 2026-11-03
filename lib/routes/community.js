'use strict';
// 커뮤니티: 전체 내용 읽기, 글쓰기, 추천 · 조회, 오늘의 질문 · 예측 · 프롬프트 · 챌린지 투표

const snapshot = require('../repos/snapshot');
const posts = require('../repos/posts');
const polls = require('../repos/polls');
const { limit } = require('../rate-limit');
const { sendJson, readBody, fail, cleanStr, oneOf } = require('../http');
const { CATEGORIES, ADMIN_ONLY_CATEGORIES, DEFAULT_CATEGORY, AI_LABELS, LIMITS } = require('../config');

const choiceOf = (body) => {
  if (body.choice !== 'yes' && body.choice !== 'no') throw fail(400, '선택지가 올바르지 않습니다');
  return body.choice;
};

module.exports = (route) => {
  route('GET', /^\/api\/content$/, async (req, res) => sendJson(res, 200, await snapshot.content()));

  // ---------- 게시글 ----------

  route('POST', /^\/api\/posts$/, async (req, res) => {
    const body = await readBody(req);
    if (body.website) throw fail(400, '잘못된 요청입니다'); // 허니팟: 사람에게는 보이지 않는 필드

    const title = cleanStr(body.title, '', LIMITS.title);
    if (title.length < LIMITS.titleMin) throw fail(400, `제목을 ${LIMITS.titleMin}자 이상 입력해 주세요`);
    const link = cleanStr(body.link, '', LIMITS.link);
    if (link && !/^https?:\/\//i.test(link)) throw fail(400, '링크는 http:// 또는 https:// 로 시작해야 해요');
    await limit(req, 'post');

    const anonymous = body.anonymous === true;
    const writable = CATEGORIES.filter((c) => !ADMIN_ONLY_CATEGORIES.includes(c));
    sendJson(res, 201, await posts.create({
      category: oneOf(body.category, writable, DEFAULT_CATEGORY),
      title,
      body: cleanStr(body.body, '', LIMITS.body),
      author: anonymous ? '익명' : cleanStr(body.author, '익명', LIMITS.author),
      anonymous,
      aiLabel: oneOf(body.aiLabel, AI_LABELS, AI_LABELS[0]),
      link,
    }));
  });

  route('POST', /^\/api\/posts\/([\w-]+)\/(like|view)$/, async (req, res, m) => {
    await limit(req, m[2] === 'like' ? 'react' : 'view');
    sendJson(res, 200, await posts.react(m[1], m[2] === 'like' ? 'likes' : 'views'));
  });

  // ---------- 오늘의 질문 ----------

  route('POST', /^\/api\/debate\/vote$/, async (req, res) => {
    const choice = choiceOf(await readBody(req));
    await limit(req, 'react');
    sendJson(res, 200, await polls.voteDebate(choice));
  });

  route('POST', /^\/api\/debate\/comment$/, async (req, res) => {
    const body = await readBody(req);
    const text = cleanStr(body.text, '', LIMITS.comment);
    if (!text) throw fail(400, '내용을 입력해 주세요');
    await limit(req, 'comment');
    const choice = body.choice === 'yes' || body.choice === 'no' ? body.choice : null;
    sendJson(res, 201, await polls.commentDebate({ author: cleanStr(body.author, '익명', LIMITS.author), text, choice }));
  });

  // ---------- 예측 · 프롬프트 · 챌린지 ----------

  route('POST', /^\/api\/predictions\/([\w-]+)\/vote$/, async (req, res, m) => {
    const choice = choiceOf(await readBody(req));
    await limit(req, 'react');
    sendJson(res, 200, await polls.votePrediction(m[1], choice));
  });

  route('POST', /^\/api\/prompts\/([\w-]+)\/copy$/, async (req, res, m) => {
    await limit(req, 'react');
    sendJson(res, 200, await polls.copyPrompt(m[1]));
  });

  route('POST', /^\/api\/challenge\/([\w-]+)\/vote$/, async (req, res, m) => {
    await limit(req, 'react');
    sendJson(res, 200, await polls.voteEntry(m[1]));
  });
};
