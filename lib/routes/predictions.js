'use strict';
// 미래 예측: YES / NO 투표

const predictions = require('../repos/predictions');
const { limit } = require('../rate-limit');
const { sendJson, readBody, yesNo } = require('../http');

module.exports = (route) => {
  route('POST', /^\/api\/predictions\/([\w-]+)\/vote$/, async (req, res, m) => {
    const choice = yesNo((await readBody(req)).choice);
    await limit(req, 'react');
    sendJson(res, 200, await predictions.vote(m[1], choice));
  });
};
