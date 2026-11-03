'use strict';
// Vercel 함수: /api/* 를 모두 받아 로컬 서버와 같은 처리기로 넘긴다.
const { handleApi } = require('../lib/app');

module.exports = (req, res) => handleApi(req, res);
