'use strict';
// 오늘의 AI 창작 챌린지: 출품작 투표

const challenge = require('../repos/challenge');
const { limit } = require('../rate-limit');
const { sendJson } = require('../http');

module.exports = (route) => {
  route('POST', /^\/api\/challenge\/([\w-]+)\/vote$/, async (req, res, m) => {
    await limit(req, 'react');
    sendJson(res, 200, await challenge.voteEntry(m[1]));
  });
};
