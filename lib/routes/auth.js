'use strict';
// 관리자 로그인 · 로그아웃 · 세션 확인

const auth = require('../auth');
const db = require('../db');
const { limit } = require('../rate-limit');
const { sendJson, readBody, fail } = require('../http');

module.exports = (route) => {
  route('GET', /^\/api\/admin\/session$/, (req, res) => sendJson(res, 200, { ...auth.status(req), storage: db.kind }));

  route('POST', /^\/api\/admin\/login$/, async (req, res) => {
    const body = await readBody(req);
    await limit(req, 'login');
    if (!auth.checkPassword(body.password)) throw fail(401, '비밀번호가 맞지 않아요');
    auth.setSession(req, res);
    sendJson(res, 200, { ok: true });
  }, { allowReadOnly: true });

  route('POST', /^\/api\/admin\/logout$/, (req, res) => {
    auth.clearSession(req, res);
    sendJson(res, 200, { ok: true });
  }, { allowReadOnly: true });
};
