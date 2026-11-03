'use strict';
// 프롬프트 라이브러리: 복사 수 세기

const prompts = require('../repos/prompts');
const { limit } = require('../rate-limit');
const { sendJson } = require('../http');

module.exports = (route) => {
  route('POST', /^\/api\/prompts\/([\w-]+)\/copy$/, async (req, res, m) => {
    await limit(req, 'react');
    sendJson(res, 200, await prompts.copy(m[1]));
  });
};
