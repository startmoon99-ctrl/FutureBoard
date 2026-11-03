'use strict';
// 오늘의 질문: YES / NO 투표, 한 줄 의견

const debate = require('../repos/debate');
const { limit } = require('../rate-limit');
const { authorName } = require('../auth');
const { sendJson, readBody, fail, cleanStr, yesNo } = require('../http');
const { LIMITS } = require('../config');

module.exports = (route) => {
  route('POST', /^\/api\/debate\/vote$/, async (req, res) => {
    const choice = yesNo((await readBody(req)).choice);
    await limit(req, 'react');
    sendJson(res, 200, await debate.vote(choice));
  });

  route('POST', /^\/api\/debate\/comment$/, async (req, res) => {
    const body = await readBody(req);
    const text = cleanStr(body.text, '', LIMITS.comment);
    if (!text) throw fail(400, '내용을 입력해 주세요');
    const author = authorName(req, body.author);
    await limit(req, 'comment');
    const choice = body.choice === 'yes' || body.choice === 'no' ? body.choice : null;
    sendJson(res, 201, await debate.comment({ author, text, choice }));
  });
};
