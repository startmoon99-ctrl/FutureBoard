'use strict';
// 관리자: 글 · 댓글 숨기기 · 되살리기. 지우지 않고 숨김 표시만 하므로 언제든 되돌릴 수 있다.

const posts = require('../repos/posts');
const comments = require('../repos/comments');
const snapshot = require('../repos/snapshot');
const { requireAdmin } = require('../auth');
const { sendJson, readBody } = require('../http');

module.exports = (route) => {
  route('GET', /^\/api\/admin\/hidden$/, async (req, res) => {
    requireAdmin(req);
    sendJson(res, 200, await snapshot.hidden());
  });

  route('POST', /^\/api\/admin\/posts\/([\w-]+)\/hide$/, async (req, res, m) => {
    requireAdmin(req);
    const hidden = (await readBody(req)).hidden !== false;
    const post = await posts.setHidden(m[1], hidden);
    console.log(`  · 글 ${hidden ? '숨김' : '되살림'}: ${post.id} "${post.title}"`);
    sendJson(res, 200, { id: post.id, hidden });
  });

  route('POST', /^\/api\/admin\/comments\/([\w-]+)\/hide$/, async (req, res, m) => {
    requireAdmin(req);
    const hidden = (await readBody(req)).hidden !== false;
    const comment = await comments.setHidden(m[1], hidden);
    console.log(`  · 댓글 ${hidden ? '숨김' : '되살림'}: ${comment.id}`);
    sendJson(res, 200, { id: comment.id, hidden });
  });
};
